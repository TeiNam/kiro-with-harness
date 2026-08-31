# Model Routing

The harness assigns each agent a model by **capability tier**, not by hand-picking a model per file. This is a **3-tier** policy and the tiers are **provider-agnostic**: the same tiers map to Claude identifiers (the default) and to the OpenAI GPT-5.6 identifiers. A third install-time pattern, **`mixed`**, combines the families role-wise — Claude Fable for orchestration, GPT-5.6 Sol for every other role (see [Mixed pattern](#mixed-pattern-fable-orchestration--sol-subagents)). The single source of truth is [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js).

**Opus 5 is the ceiling.** There is no tier above it. When a task needs more than the top tier is producing, escalate in two directions only — **inward** (raise effort within the tier) and **sideways** (a different model family). See [Above the ceiling](#above-the-ceiling-effort-then-cross-family).

## Capability Tiers

| Tier | Claude (default) | OpenAI | Use for |
|------|------------------|--------|---------|
| **deep-reasoning** (ceiling) | `claude-opus-5` | `gpt-5.6-sol` | Orchestration, architecture, security judgment, root-cause analysis, research synthesis, complex data modeling, long-horizon autonomous runs |
| **balanced** | `claude-sonnet-5` | `gpt-5.6-terra` | High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation |
| **cost-optimized** | `claude-haiku-4.5` | `gpt-5.6-luna` | Simple, high-throughput, low-judgment work: translation, classification, basic content |

The design principle: **Opus 5 orchestrates and reasons, Sonnet does the coding volume, Haiku handles cheap high-throughput work.** `balanced` (Sonnet 5) is the default tier — most agents are coding agents, so any role not explicitly listed falls to balanced.

## Per-Agent Assignment

| Tier | Agents |
|------|--------|
| **deep-reasoning** (`claude-opus-5`, ceiling) | kiro-cli (orchestrator), architect, security-reviewer, deep-researcher, devops, peer-reviewer |
| **balanced** (`claude-sonnet-5`) | code-reviewer, refactor-cleaner, all language reviewers (python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, all build-resolvers (build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, doc agents (tech-doc-writer, tech-writer-monolith, doc-clarity-reviewer, doc-quality-detector, tech-fidelity-auditor) |
| **cost-optimized** (`claude-haiku-4.5`) | translator-docs, article-writer, content-creator |

Why these splits:
- **kiro-cli sits at the ceiling, not above it** — the orchestrator runs `claude-opus-5`, the same tier as the reasoning agents. Long-horizon autonomous work, wide parallel sub-agent delegation, and self-verification are what this tier is for. Earlier revisions of this policy put the orchestrator on a separate frontier tier above Opus; that tier is gone. The orchestrator is still the highest-leverage seat, but the lever is **effort** (it runs at `max`), not a more expensive model.
- **security-reviewer stays on Opus** while the generic **code-reviewer moves to Sonnet** — security judgment benefits from deeper reasoning; routine quality review is Sonnet's sweet spot and far higher volume.
- **peer-reviewer stays on Opus** — it coordinates a cross-model second opinion (Claude Code `claude -p` + Codex `codex`, a Kiro + Claude + Codex 3-way), which should come from the strongest tier to be worth the round-trip.

## Above the ceiling: effort, then cross-family

Opus 5 is the top tier the harness routes to. Instead of looking for something above it, escalate in two directions.

### 1) Inward — raise effort inside the tier

Same model, larger reasoning budget. Cheaper than a tier jump, and Kiro supports it directly. The field path differs by family:

```bash
# Claude
kiro-cli settings chat.modelDefaults \
  '{"claude-opus-5":{"output_config":{"effort":"max"}}}'

# GPT-5.6
kiro-cli settings chat.modelDefaults \
  '{"gpt-5.6-sol":{"reasoning":{"effort":"max"}}}'

# Either family, per session
kiro-cli chat --effort max
```

The shared ladder is `low` → `medium` → `high` → `xhigh` → `max`; GPT-5.6 also supports `none`. **The default is `max`** (`DEFAULT_EFFORT` in `model-policy.js`): reasoning models and reasoning-heavy work get the full budget by design, and the harness compensates by keeping its guardrails minimal and security-centric (the two deterministic gates) rather than by throttling the model. The ladder therefore works downward — `ROLE_EFFORT` only lists the mechanical exceptions:

| Role | Effort | Why |
|------|--------|-----|
| every reasoning/judgment role (orchestrator, architect, reviewers, researchers, build-resolvers, …) | `max` (default) | Reasoning budget is the point — there is no tier above, so start at the top of the ladder |
| refactor-cleaner, translator-docs | `low` | Mechanical work needs no reasoning budget |

Note that `effort` is **not** an agent-config field — Kiro's agent schema has only `model`. It is a session/settings knob, so the installer prints the exact command rather than writing it for you.

### 2) Sideways — a different model family

At `max` there is nothing above. The remaining axis is a different model family, because re-prompting the same family cannot break correlated blind spots — same training, same failure modes. Kiro surfaces this through the `peer-reviewer` agent (terminal `claude -p` + `codex`) and, with `--review-backend cross`, the on-demand `bash .kiro/hooks/cross-review.sh`. The installed provider profile sets the independent backend first: Anthropic → Codex; OpenAI → Claude Code. The other CLI is labeled same-family corroboration rather than an independent vote.

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

## Installing and Switching Providers

Choose the family when installing. The source fleet stays Anthropic-first; only the installed JSON/Markdown agents are transformed.

```bash
# Claude profile (default)
node install.js cli --scope global --provider=anthropic

# GPT-5.6 profile
node install.js cli --scope global --provider=openai
node install.js ide --provider=openai --dev=frontend

# Mixed profile — Fable orchestration + Sol subagents
node install.js cli --scope global --provider=mixed
```

The provider profile changes four things together:

1. Role-tier model IDs (`Opus/Sonnet/Haiku`, `Sol/Terra/Luna`, or `Fable` + all-`Sol` for mixed).
2. The printed `chat.modelDefaults` field path, resolved from the **orchestrator model's family** (`output_config.effort` for Claude/Fable, `reasoning.effort` for GPT).
3. A concise operating note injected into every installed agent, keyed to **that agent's model family** — not the global flag. Claude-family agents get plan/self-verification and 1M-context guidance; GPT-family agents get batched-tool and earlier-compaction guidance for the 272K context. Under `mixed` the two note kinds coexist in one install.
4. Cross-family priority. Anthropic runs Codex first; OpenAI runs Claude Code first; mixed runs Codex first (versus the Fable-authored side) with Claude Code covering the Sol-authored side.

The manifest records `provider`, and `node install.js --status` shows it. Re-run the installer with another provider to switch a workspace. Global and workspace installs may use different providers; content-based deduplication keeps a provider-specific workspace copy when it differs from the global one.

### Mixed pattern (Fable orchestration + Sol subagents)

`--provider=mixed` is a role-wise combination, not a fourth tier column:

- **Orchestrator (`kiro-cli`) → `claude-fable-5`** via `ROLE_MODEL_OVERRIDES` — Claude drives planning, delegation, and convergence.
- **Every other role → `gpt-5.6-sol`**, regardless of tier. Subagent work is deliberately flattened to OpenAI's ceiling model rather than Terra/Luna: the point of the pattern is Fable-quality orchestration over uniformly strong Sol workers.

**Fable availability fallback.** Kiro falls back to `chat.defaultModel` (with a warning) whenever an agent pins a model that is not served in your environment. The installer therefore prints the two commands that make **`claude-opus-5` at effort `max`** the substitute orchestrator wherever `claude-fable-5` is unavailable (`MIXED_ORCHESTRATOR_FALLBACK` in `model-policy.js`):

```bash
kiro-cli settings chat.defaultModel claude-opus-5
kiro-cli settings chat.modelDefaults '{"claude-opus-5":{"output_config":{"effort":"max"}}}'
```

Subagents are unaffected by the fallback — they pin `gpt-5.6-sol` directly.

`scripts/apply-model-policy.js` remains a maintenance tool for deliberately repinning repository source assets. It is not the normal provider switch, because source validation intentionally expects the Anthropic-first baseline.

Validate source consistency any time:

```bash
node scripts/validate-models.js   # or: npm run validate:models
```

## Model Identifier Caveat (read before pinning)

Kiro validates the `model` value against the IDs its model service returns. **An unknown ID silently falls back to the default model with a warning** — so a wrong string means an agent quietly runs on the wrong model.

- The harness uses **dotted** identifiers: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4.5`; the mixed pattern additionally pins `claude-fable-5` for the orchestrator.
- Anthropic's canonical API/Bedrock IDs use **hyphens** for minor versions: `claude-haiku-4-5`. `claude-opus-5` and `claude-sonnet-5` are major-only releases, so both conventions collapse to the same string (no ambiguity there).
- OpenAI's Kiro identifiers are `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- **Confirm each identifier with `/model` in an active Kiro session before relying on it.** If your Kiro build expects the hyphenated minor-version form, update `TIERS` in `model-policy.js` and re-run the applier. If `claude-fable-5` is not listed, use the printed opus-5 `max` fallback (see the mixed pattern above).

## Kiro Availability (matters because `balanced` is the default tier)

Availability still matters because an unknown or unavailable identifier can fall back to the session default. As of the Kiro model docs updated 2026-08-04:

| Model family | Kiro status | Context / region note |
|--------------|-------------|-----------------------|
| `claude-opus-5` | Experimental | 1M context; us-east-1 and eu-central-1 with cross-region inference |
| `claude-sonnet-5` | Active | 1M context |
| `claude-haiku-4.5` | Active | Broadly available |
| GPT-5.6 Sol / Terra / Luna | Experimental | 272K context; us-east-1 and eu-central-1 with cross-region inference |

Experimental models may change and have region constraints. Confirm the installed IDs with `/model`, especially after a Kiro update.

## Hook → Tier Guidance

IDE hooks (`.kiro/hooks/*.json`, v1 format) trigger agent actions via `askAgent` prompts. The v1 hook schema has **no per-hook model field**, so a hook-triggered action runs under the current session's model. Choose the session model with the hook workload in mind:

| Hook | Nature | Suits |
|------|--------|-------|
| pre-write-guard | size / secret / doc-location checks | cost-optimized or balanced |
| git-pipeline-guard | default-branch push gate | cost-optimized or balanced |

For heavyweight review that must run on a specific tier regardless of the session model, delegate from the hook prompt to a named agent (e.g., `security-reviewer` for a security pass) rather than relying on the session model.

## OpenAI GPT-5.6 (selectable now)

All three GPT-5.6 variants are selectable in Kiro:

- **Sol** (`gpt-5.6-sol`, 2.4x credits): hardest long-horizon reasoning, refactors, and terminal workflows.
- **Terra** (`gpt-5.6-terra`, 1.0x): routine multi-step development and the balanced workhorse.
- **Luna** (`gpt-5.6-luna`, 0.1x): high-frequency, speed- and credit-sensitive work.

All three have a 272K context window and support `reasoning.effort` from `none` through `max`. Install with `--provider=openai`; do not run the source policy applier for normal workspace switching.
