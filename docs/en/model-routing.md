# Model Routing

The harness assigns each agent a model by **capability tier**, not by hand-picking a model per file. Tiers are **provider-agnostic**: the same tiers map to Claude identifiers today and to OpenAI GPT identifiers when they land in Kiro. The single source of truth is [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js).

## Capability Tiers

| Tier | Claude (default) | OpenAI (forward-looking) | Use for |
|------|------------------|--------------------------|---------|
| **frontier** | `claude-fable-5` | `gpt-5.5` | Frontier long-horizon agentic work: multi-day autonomous orchestration, wide parallel sub-agent delegation, self-verification (Mythos-class, above Opus). Orchestrator only |
| **deep-reasoning** | `claude-opus-4.8` | `gpt-5.5` | Orchestration, architecture, security judgment, root-cause analysis, research synthesis, complex data modeling |
| **balanced** | `claude-sonnet-5` | `gpt-5.4` | High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation |
| **cost-optimized** | `claude-haiku-4.5` | `gpt-5.4` | Simple, high-throughput, low-judgment work: translation, classification, basic content |

The design principle: **Fable orchestrates the long-horizon DAG, Opus reasons, Sonnet does the coding volume, Haiku handles cheap high-throughput work.** `balanced` (Sonnet 5) is the default tier — most agents are coding agents, so any role not explicitly listed falls to balanced.

## Per-Agent Assignment

| Tier | Agents |
|------|--------|
| **frontier** (`claude-fable-5`) | kiro-cli (orchestrator) |
| **deep-reasoning** (`claude-opus-4.8`) | architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler |
| **balanced** (`claude-sonnet-5`) | code-reviewer, refactor-cleaner, all language reviewers (python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, all build-resolvers (build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, doc agents (tech-doc-writer, tech-writer-monolith, doc-clarity-reviewer, doc-quality-detector, tech-fidelity-auditor) |
| **cost-optimized** (`claude-haiku-4.5`) | translator-docs, article-writer, content-creator |

Why these splits:
- **kiro-cli moves to Fable 5 (frontier)** — the orchestrator's job is exactly what the Mythos-class model is built for: long-horizon autonomous work, wide parallel sub-agent delegation, and self-verification. It is the single highest-leverage seat in the harness; every other agent's output flows through it. Fable 5 (`claude-fable-5`, GA 2026-06-09) sits above Opus and is the only tier occupant, so the premium applies to one agent, not the fleet.
- **security-reviewer stays on Opus** while the generic **code-reviewer moves to Sonnet** — security judgment benefits from deeper reasoning; routine quality review is Sonnet's sweet spot and far higher volume.
- **rdbms-data-modeler stays on Opus** — 3NF normalization and physical-schema trade-offs are genuine reasoning, unlike per-language review.
- **peer-reviewer stays on Opus** — it coordinates a cross-model second opinion (Claude Code `claude -p` + Codex `codex`, a Kiro + Claude + Codex 3-way), which should come from the strongest tier to be worth the round-trip.

## Applying and Switching Providers

The `model` field in each agent file is written by the policy applier:

```bash
# Preview (no writes)
node scripts/apply-model-policy.js --dry-run

# Apply the Claude (anthropic) mapping — the default
node scripts/apply-model-policy.js

# Forward-looking: retarget every agent to the OpenAI tier identifiers
node scripts/apply-model-policy.js --provider=openai --dry-run
node scripts/apply-model-policy.js --provider=openai
```

The applier edits only the `model` value (line-preserving — indentation, key order, and body are untouched) and validates JSON after each edit. To change what a tier points to, edit `TIERS` in `model-policy.js` and re-run.

Validate consistency any time:

```bash
node scripts/validate-models.js   # or: npm run validate:models
```

## Model Identifier Caveat (read before pinning)

Kiro validates the `model` value against the IDs its model service returns. **An unknown ID silently falls back to the default model with a warning** — so a wrong string means an agent quietly runs on the wrong model.

- The harness uses **dotted** identifiers: `claude-opus-4.8`, `claude-sonnet-5`, `claude-haiku-4.5`.
- Anthropic's canonical API/Bedrock IDs use **hyphens** for minor versions: `claude-opus-4-8`, `claude-haiku-4-5`. `claude-sonnet-5` is a major-only release, so both conventions collapse to the same string (no ambiguity there).
- OpenAI uses **dot** notation natively: `gpt-5.5`, `gpt-5.4`.
- **Confirm each identifier with `/model` in an active Kiro session before relying on it.** If your Kiro build expects the hyphenated minor-version form, update `TIERS` in `model-policy.js` and re-run the applier.

## Kiro Availability (matters because `balanced` is the default tier)

The tier values are Anthropic model names; their **availability inside Kiro** differs, and an unavailable model silently falls back to the session default. As of 2026-07-11 ([kiro.dev/docs/models](https://kiro.dev/docs/models)):

| Model | Kiro status | Regions | Plans |
|-------|-------------|---------|-------|
| `claude-opus-4.8` | Active | us-east-1, eu-central-1 | Pro / Pro+ / Power |
| `claude-sonnet-5` | **Experimental** | **us-east-1 only** | Pro / Pro+ / Power (not Free) |
| `claude-haiku-4.5` | Active | us-east-1, eu-central-1 | broad |

**This bites hardest on `balanced` (Sonnet 5), because it is the default tier covering most agents.** On the Anthropic API Sonnet 5 is GA, but **in Kiro it is Experimental and us-east-1-only**. If you install the harness while on eu-central-1 or the Free tier, the majority of agents silently fall back to the default model. In that case, point `balanced` at an available model in `TIERS` (`model-policy.js`) and re-run the applier — then confirm with `/model`. (Sonnet 5 also removed manual extended thinking and defaults to adaptive thinking; effort levels low→max are supported at the API level, with high/xhigh best for coding/agentic work.)

## Hook → Tier Guidance

IDE hooks (`.kiro/hooks/*.json`, v1 format) trigger agent actions via `askAgent` prompts. The v1 hook schema has **no per-hook model field**, so a hook-triggered action runs under the current session's model. Choose the session model with the hook workload in mind:

| Hook | Nature | Suits |
|------|--------|-------|
| pre-write-guard | size / secret / doc-location checks | cost-optimized or balanced |
| review-on-stop | post-task code review | balanced (deep-reasoning if the change is security-critical) |
| capture-lessons | summarize repeated corrections | cost-optimized |
| changelog-on-commit | mechanical CHANGELOG/README update | cost-optimized or balanced |

For heavyweight review that must run on a specific tier regardless of the session model, delegate from the hook prompt to a named agent (e.g., `security-reviewer` for a security pass) rather than relying on the session model.

## OpenAI GPT-5.5 / GPT-5.4 Forward Plan

When GPT-5.5 and GPT-5.4 become selectable in Kiro:

1. Confirm the exact identifiers with `/model`.
2. If they differ from `gpt-5.5` / `gpt-5.4`, update the `openai` column in `TIERS` (`model-policy.js`).
3. Run `node scripts/apply-model-policy.js --provider=openai` to retarget all agents, or run it per project to mix providers across workspaces.
4. `deep-reasoning → gpt-5.5`, `balanced → gpt-5.4`. `cost-optimized` reuses `gpt-5.4` until a lighter GPT-5.x tier is published; swap that one line when it is.

Mixing is intentional: because routing is per-agent, you can keep orchestration/security on Claude Opus while running the high-volume `balanced` coding agents on GPT-5.4 (or vice versa) — whatever the benchmarks and pricing favor at the time.
