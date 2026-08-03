# Model Routing

The harness assigns each agent a model by **capability tier**, not by hand-picking a model per file. This is a **3-tier** policy and the tiers are **provider-agnostic**: the same tiers map to Claude identifiers (the default) and to the OpenAI GPT-5.6 identifiers. The single source of truth is [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js).

**Opus 5 is the ceiling.** There is no tier above it. When a task needs more than the top tier is producing, escalate in two directions only — **inward** (raise effort within the tier) and **sideways** (a different model family). See [Above the ceiling](#above-the-ceiling-effort-then-cross-family).

## Capability Tiers

| Tier | Claude (default) | OpenAI | Use for |
|------|------------------|--------|---------|
| **deep-reasoning** (ceiling) | `claude-opus-5` | `gpt-5.6` | Orchestration, architecture, security judgment, root-cause analysis, research synthesis, complex data modeling, long-horizon autonomous runs |
| **balanced** | `claude-sonnet-5` | `gpt-5.6-mini` | High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation |
| **cost-optimized** | `claude-haiku-4.5` | `gpt-5.6-nano` | Simple, high-throughput, low-judgment work: translation, classification, basic content |

The design principle: **Opus 5 orchestrates and reasons, Sonnet does the coding volume, Haiku handles cheap high-throughput work.** `balanced` (Sonnet 5) is the default tier — most agents are coding agents, so any role not explicitly listed falls to balanced.

## Per-Agent Assignment

| Tier | Agents |
|------|--------|
| **deep-reasoning** (`claude-opus-5`, ceiling) | kiro-cli (orchestrator), architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler |
| **balanced** (`claude-sonnet-5`) | code-reviewer, refactor-cleaner, all language reviewers (python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, all build-resolvers (build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, doc agents (tech-doc-writer, tech-writer-monolith, doc-clarity-reviewer, doc-quality-detector, tech-fidelity-auditor) |
| **cost-optimized** (`claude-haiku-4.5`) | translator-docs, article-writer, content-creator |

Why these splits:
- **kiro-cli sits at the ceiling, not above it** — the orchestrator runs `claude-opus-5`, the same tier as the reasoning agents. Long-horizon autonomous work, wide parallel sub-agent delegation, and self-verification are what this tier is for. Earlier revisions of this policy put the orchestrator on a separate frontier tier above Opus; that tier is gone. The orchestrator is still the highest-leverage seat, but the lever is **effort** (it runs at `max`), not a more expensive model.
- **security-reviewer stays on Opus** while the generic **code-reviewer moves to Sonnet** — security judgment benefits from deeper reasoning; routine quality review is Sonnet's sweet spot and far higher volume.
- **rdbms-data-modeler stays on Opus** — 3NF normalization and physical-schema trade-offs are genuine reasoning, unlike per-language review.
- **peer-reviewer stays on Opus** — it coordinates a cross-model second opinion (Claude Code `claude -p` + Codex `codex`, a Kiro + Claude + Codex 3-way), which should come from the strongest tier to be worth the round-trip.

## Above the ceiling: effort, then cross-family

Opus 5 is the top tier the harness routes to. Instead of looking for something above it, escalate in two directions.

### 1) Inward — raise effort inside the tier

Same model, larger reasoning budget. Cheaper than a tier jump, and Kiro supports it directly:

```bash
kiro-cli chat --effort max                                  # per session
kiro-cli settings chat.modelDefaults \
  '{"claude-opus-5":{"output_config":{"effort":"max"}}}'    # per-model default
```

The ladder is `low` → `medium` → `high` → `xhigh` → `max`. Recommended per role (`ROLE_EFFORT` in `model-policy.js`):

| Role | Effort | Why |
|------|--------|-----|
| kiro-cli (orchestrator) | `max` | Long-horizon autonomous runs — top of the ladder |
| architect, security-reviewer, peer-reviewer | `xhigh` | Highest cost of being wrong |
| refactor-cleaner, translator-docs | `low` | Mechanical work needs no reasoning budget |
| everything else | `high` | Kiro's sensible default |

Note that `effort` is **not** an agent-config field — Kiro's agent schema has only `model`. It is a session/settings knob, so the installer prints the exact command rather than writing it for you.

### 2) Sideways — a different model family

At `max` there is nothing above. The remaining axis is a different model family, because re-prompting the same family cannot break correlated blind spots — same training, same failure modes. Kiro surfaces this through the `peer-reviewer` agent (terminal `claude -p` + `codex`) and, with `--review-backend cross`, the on-demand `bash .kiro/hooks/cross-review.sh`.

Hand work to another family when **independence** or **grind** is the value:

| Situation | Why another family beats another same-family sub-agent |
|-----------|--------------------------------------------------------|
| Adversarial review of code this fleet wrote | Same-family review shares blind spots; changing family is the only way to break the correlation |
| Tie-break after two attempts disagree | A third same-family opinion correlates with the first two |
| Large mechanical edits (rename across N files, codemod) | Offloads grind without spending ceiling-tier context; verify the diff after |
| Second diagnosis when stuck in a loop | Fresh framing beats re-prompting the model that got stuck |

Keep it in the harness when the task needs steering rules, skills, workload tags, project conventions, tool orchestration (MCP / hooks / sub-agent DAGs), or Korean-language output — an external CLI starts cold on all of it.

**The rule that makes this pay off: never let an external family be the *only* reader of something that matters.** A finding only it reports still needs confirmation against the actual code; findings both families flag independently are the high-confidence ones. `cross-review.sh` prints this rule at the end of every run.

### Blast radius (what the diff doesn't say)

Before handing a change to either axis, `cross-review.sh` extracts the **blast radius** — files that did not change but should be reviewed anyway. Two axes, no index to go stale:

- **(a) Reverse references** — files that `require`/`import` a changed module.
- **(b) Co-change** — files that historically appear in the same commits, which catches coupling with no import edge at all (e.g. a counter in a doc and the file it counts).

Two failure modes to know about, both measured: `rg` must be given a path argument and `</dev/null`, or it swallows the loop's stdin and silently processes only the first file; and `git log --name-only -- <path>` filters the *file list* to the pathspec too, so co-change must be computed by collecting commit hashes first and then reading each commit's full file set with `git show`.

The classic catch is **counter/catalog consistency**: if a diff changes a number or a list, open the file that number comes from. `scripts/validate-counts.js` now catches that class mechanically.

## Applying and Switching Providers

The `model` field in each agent file is written by the policy applier:

```bash
# Preview (no writes)
node scripts/apply-model-policy.js --dry-run

# Apply the Claude (anthropic) mapping — the default
node scripts/apply-model-policy.js

# Retarget every agent to the OpenAI (GPT-5.6) tier identifiers
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

- The harness uses **dotted** identifiers: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4.5`.
- Anthropic's canonical API/Bedrock IDs use **hyphens** for minor versions: `claude-haiku-4-5`. `claude-opus-5` and `claude-sonnet-5` are major-only releases, so both conventions collapse to the same string (no ambiguity there).
- OpenAI uses **dot** notation natively: `gpt-5.6`, `gpt-5.6-mini`, `gpt-5.6-nano`.
- **Confirm each identifier with `/model` in an active Kiro session before relying on it.** If your Kiro build expects the hyphenated minor-version form, update `TIERS` in `model-policy.js` and re-run the applier.

## Kiro Availability (matters because `balanced` is the default tier)

The tier values are Anthropic model names; their **availability inside Kiro** differs, and an unavailable model silently falls back to the session default. As of 2026-07-26 ([kiro.dev/docs/models](https://kiro.dev/docs/models)):

| Model | Kiro status | Regions | Plans |
|-------|-------------|---------|-------|
| `claude-opus-5` | Active | us-east-1, eu-central-1 | Pro / Pro+ / Power |
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

## OpenAI GPT-5.6 (selectable now)

All three GPT-5.6 variants (`gpt-5.6`, `gpt-5.6-mini`, `gpt-5.6-nano`) are selectable in Kiro. To retarget the fleet:

1. Confirm the exact identifiers with `/model` (naming may differ per Kiro build).
2. If they differ from `gpt-5.6` / `gpt-5.6-mini` / `gpt-5.6-nano`, update the `openai` column in `TIERS` (`model-policy.js`).
3. Run `node scripts/apply-model-policy.js --provider=openai` to retarget all agents, or run it per project to mix providers across workspaces.
4. The mapping: `deep-reasoning → gpt-5.6`, `balanced → gpt-5.6-mini`, `cost-optimized → gpt-5.6-nano`.

Mixing is intentional: because routing is per-agent, you can keep orchestration/security on Claude (Opus 5) while running the high-volume `balanced` coding agents on GPT-5.6-mini (or vice versa) — whatever the benchmarks and pricing favor at the time.
