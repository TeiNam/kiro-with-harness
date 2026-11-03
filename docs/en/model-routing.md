# Model Routing

The harness assigns each agent a model by **capability tier**, not by hand-picking a model per file. This is a **3-tier** policy and the tiers are **provider-agnostic**: the same tiers map to Claude identifiers (the default) and to the OpenAI GPT-5.6 identifiers. A third install-time pattern, **`mixed`**, combines the families by function: Claude models orchestrate and author, and GPT-5.6 runs the review and audit roles (see [Mixed pattern](#mixed-pattern-claude-authors-gpt-56-reviews)). The single source of truth is [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js).

**Opus 5.5 is the ceiling.** There is no tier above it. When a task needs more than the top tier is producing, escalate in two directions only — **inward** (raise effort within the tier) and **sideways** (a different model family). See [Above the ceiling](#above-the-ceiling-effort-then-cross-family).

## Capability Tiers

| Tier | Claude (default) | OpenAI | Use for |
|------|------------------|--------|---------|
| **deep-reasoning** (ceiling) | `claude-opus-5.5` | `gpt-5.6-sol` | Orchestration, architecture, security judgment, root-cause analysis, research synthesis, complex data modeling, long-horizon autonomous runs, open-ended verdicts |
| **balanced** | `claude-sonnet-5.5` | `gpt-5.6-terra` | High-volume coding workhorse: code/language review, build-error resolution, refactor, e2e, documentation |
| **cost-optimized** | `claude-haiku-5.5` | `gpt-5.6-luna` | Simple, high-throughput, low-judgment work: translation, classification, basic content |

The design principle: **Opus 5.5 orchestrates and reasons, Sonnet 5.5 does the coding volume, Haiku 5.5 handles cheap high-throughput work.** `balanced` (Sonnet 5.5) is the default tier — most agents are coding agents, so any role not explicitly listed falls to balanced.

## Per-Agent Assignment

| Tier | Agents |
|------|--------|
| **deep-reasoning** (`claude-opus-5.5`, ceiling) | kiro-cli (orchestrator), architect, security-reviewer, deep-researcher, devops, peer-reviewer, tech-fidelity-auditor, doc-clarity-reviewer |
| **balanced** (`claude-sonnet-5.5`) | code-reviewer, refactor-cleaner, all language reviewers (python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, all build-resolvers (build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, doc agents (doc-quality-detector, tech-doc-writer, tech-writer-monolith) |
| **cost-optimized** (`claude-haiku-5.5`) | translator-docs, article-writer, content-creator |

Why these splits:
- **kiro-cli sits at the ceiling, not above it** — the orchestrator runs `claude-opus-5.5`, the same tier as the reasoning agents. Long-horizon autonomous work, wide parallel sub-agent delegation, and self-verification are what this tier is for. Earlier revisions of this policy put the orchestrator on a separate frontier tier above Opus; that tier is gone. The orchestrator is still the highest-leverage seat, but the lever is **effort** (it runs at `max`), not a more expensive model.
- **security-reviewer stays on Opus** while the generic **code-reviewer moves to Sonnet** — security judgment benefits from deeper reasoning; routine quality review is Sonnet's sweet spot and far higher volume.
- **peer-reviewer stays on Opus** — it coordinates a cross-model second opinion (Claude Code `claude -p` + Codex `codex`, a Kiro + Claude + Codex 3-way), which should come from the strongest tier to be worth the round-trip.
- **The tech-writing pipeline splits by stage, not by pipeline** — detection (`doc-quality-detector`) and drafting (`tech-doc-writer`, `tech-writer-monolith`) work against a fixed taxonomy or a detection report, so they stay on Sonnet. The fidelity verdict (`tech-fidelity-auditor`: did a code sample, number, or signature get damaged or invented?) and the clarity verdict (`doc-clarity-reviewer`: defects the taxonomy does not cover, over-editing) are open-ended judgments whose misses are hard to recover from, so they run on Opus. This matches the companion Claude Code harness.

## Above the ceiling: effort, then cross-family

Opus 5.5 is the top tier the harness routes to. Instead of looking for something above it, escalate in two directions.

### 1) Inward — raise effort inside the tier

Same model, larger reasoning budget. Cheaper than a tier jump, and Kiro supports it directly. The field path differs by family:

```bash
# Claude (one object for every model — the setting replaces the whole object)
kiro-cli settings chat.modelDefaults \
  '{"claude-opus-5.5":{"output_config":{"effort":"max"}},"claude-sonnet-5.5":{"output_config":{"effort":"max"}},"claude-haiku-5.5":{"output_config":{"effort":"medium"}}}'

# GPT-5.6
kiro-cli settings chat.modelDefaults \
  '{"gpt-5.6-sol":{"reasoning":{"effort":"max"}},"gpt-5.6-terra":{"reasoning":{"effort":"max"}},"gpt-5.6-luna":{"reasoning":{"effort":"medium"}}}'

# Either family, per session (V3 does not save it as a default)
kiro-cli chat --effort max
```

The shared ladder is `low` → `medium` → `high` → `xhigh` → `max`; GPT-5.6 also supports `none`. Kiro applies effort **per model** through `chat.modelDefaults`, not per agent, so the single source is the tier (`TIER_EFFORT` in `model-policy.js`) and every role on a model gets that model's effort:

| Tier | Effort | Why |
|------|--------|-----|
| deep-reasoning, balanced | `max` | Reasoning budget is the point — there is no tier above, so start at the top of the ladder. The harness keeps its guardrails minimal and security-centric (the two deterministic gates) instead of throttling the model |
| cost-optimized (Haiku 5.5 / Luna) | `medium` | Haiku 5.5's default. The 5.5 prompting guidance says `low` skips searches and checks and stops early on long agent prompts, so no tier uses `low` |

Note that `effort` is **not** an agent-config field — Kiro's agent schema has only `model`. It is a session/settings knob, so the installer prints the exact command rather than writing it for you. `kiro-cli settings chat.modelDefaults` replaces the existing object, so the printed command covers every model the provider uses (`modelEffortDefaults`).

### 2) Sideways — a different model family

At `max` there is nothing above. The remaining axis is a different model family, because re-prompting the same family cannot break correlated blind spots — same training, same failure modes. Kiro surfaces this through the `peer-reviewer` agent (terminal `claude -p` + `codex`) and, with `--review-backend cross`, the on-demand `bash .kiro/hooks/cross-review.sh`. The installed provider profile sets the independent backend first: Anthropic and mixed → Codex; OpenAI → Claude Code. The other CLI is labeled same-family corroboration rather than an independent vote. Under `mixed`, the native reviewers already run on GPT-5.6, so the in-harness review is cross-family as well.

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

# Mixed profile — Claude authors, GPT-5.6 reviews (native reviewers need --review-backend=kiro)
node install.js cli --scope global --provider=mixed --review-backend=kiro
```

The provider profile changes four things together:

1. Role-tier model IDs (`Opus/Sonnet/Haiku 5.5`, `Sol/Terra/Luna`, or for mixed the Claude tiers with the review and audit roles on `Sol`/`Terra`).
2. The printed `chat.modelDefaults` object, one entry per model the provider uses, each with its family's field path (`output_config.effort` for Claude, `reasoning.effort` for GPT).
3. A concise operating note injected into every installed agent, keyed to **that agent's model** — not the global flag. Claude-family agents get plan/self-verification and 1M-context guidance; GPT-family agents get batched-tool guidance plus the 272K-token pricing boundary (1M window, 2x rate above 272K); Haiku 5.5 agents also get the 100K-token boundary (0.06x below, 0.3x above). Under `mixed` the note kinds coexist in one install.
4. Cross-family priority. Anthropic and mixed run Codex first, because Claude authors the changes; OpenAI runs Claude Code first.

The manifest records `provider`, and `node install.js --status` shows it. Re-run the installer with another provider to switch a workspace. Global and workspace installs may use different providers; content-based deduplication keeps a provider-specific workspace copy when it differs from the global one.

### Mixed pattern (Claude authors, GPT-5.6 reviews)

`--provider=mixed` splits the fleet by function, not by a fourth tier column:

- **Roles that produce or change artifacts keep their Claude tier.** Orchestration, architecture, research, infrastructure, coding, build fixes, refactors, e2e, drafting, and translation run exactly as in the default install (Opus 5.5 / Sonnet 5.5 / Haiku 5.5).
- **Review and audit roles run on the GPT-5.6 model of the same tier** (`REVIEW_ROLES` and `ROLE_MODEL_OVERRIDES` in `model-policy.js`):

| Tier | Review / audit roles | Model under mixed |
|------|----------------------|-------------------|
| deep-reasoning | security-reviewer, tech-fidelity-auditor, doc-clarity-reviewer | `gpt-5.6-sol` |
| balanced | code-reviewer, database-reviewer, all language reviewers (python, rust, go, java, kotlin, cpp, typescript, flutter) | `gpt-5.6-terra` |

A reviewer from the author's family shares the author's blind spots. Running the reviewers on GPT-5.6 inside Kiro breaks that correlation and keeps the steering rules, skills, MCP servers, and hooks that an external CLI would start without.

Two roles stay on Claude on purpose. `peer-reviewer` coordinates external opinions rather than issuing a verdict, and it already gets the GPT side through Codex. `doc-quality-detector` scans the input document before drafting, so it belongs to the authoring side. A test fails if a new `*-reviewer` or `*-auditor` agent is missing from `REVIEW_ROLES`.

The native `*-reviewer` agents are installed only with `--review-backend kiro`. With `claude` or `cross`, reviews go through `peer-reviewer` instead, and the installer prints a note saying so. `tech-fidelity-auditor` is not a `*-reviewer`, so it runs on Sol under any backend.

Cost compared with the default Anthropic install: the balanced reviewers move from Sonnet 5.5 (1.3x credits) to Terra (2.2x), and the Opus-tier judges move from 2.0x to Sol (4.4x). Every other role keeps its Claude rate. The previous `mixed` ran every subagent on Sol (4.4x).

Earlier versions pinned the orchestrator to Claude Fable and printed a `chat.defaultModel` fallback. Both are gone: Fable 5.1 is available only to Kiro Enterprise organizations, and CLI V3 does not fall back from an unavailable pin — the request fails — so a Fable pin would stop the orchestrator on any other account.

`scripts/apply-model-policy.js` remains a maintenance tool for deliberately repinning repository source assets. It is not the normal provider switch, because source validation intentionally expects the Anthropic-first baseline.

Validate source consistency any time:

```bash
node scripts/validate-models.js   # or: npm run validate:models
```

## Model Identifier Caveat (read before pinning)

Kiro checks the `model` value against the IDs its model service returns. In **CLI V3 an unavailable ID does not fall back** — the agent's first request fails and Kiro restores the model that was active before the pin. A wrong string therefore breaks the agent instead of quietly running it on another model.

- The harness uses Kiro's **dotted** identifiers: `claude-opus-5.5`, `claude-sonnet-5.5`, `claude-haiku-5.5`.
- Anthropic's API IDs use **hyphens**: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` (dateless pinned snapshots); on Bedrock, Sonnet 5.5 and Haiku 5.5 are called through `us.`/`eu.`/`global.` inference profiles. Those IDs belong in application code (see the `claude-api` and `aws-bedrock` skills), not in Kiro agent files.
- OpenAI's Kiro identifiers are `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-5.6-luna`.
- **Confirm each identifier with `kiro-cli chat --list-models` (or `/model`) before relying on it.** To change a tier, update `TIERS` in `model-policy.js` and re-run the applier.

## Kiro Availability (matters because `balanced` is the default tier)

Availability matters because an unavailable identifier makes the agent's requests fail in CLI V3. As of the Kiro model docs and `kiro-cli chat --list-models` checked 2026-11-03:

| Model | Kiro status | Context / credits |
|-------|-------------|-------------------|
| `claude-opus-5.5` | Active | 1M context; 2.0x credits |
| `claude-sonnet-5.5` | Active | 1M context; 1.3x credits; adaptive thinking on by default |
| `claude-haiku-5.5` | Experimental | 1M context; 0.06x up to 100K tokens, 0.3x above |
| GPT-5.6 Sol / Terra / Luna | Active | 1M context; 4.4x / 2.2x / 0.6x up to 272K tokens, double above |
| Claude Fable 5.1 | Active (Enterprise only) | not pinned by the harness |

Kiro does not serve OpenAI GPT-6.x models. If you need one, the sideways axis can still reach it: the Codex CLI used by `peer-reviewer` and `cross-review.sh` runs your local Codex default model. Experimental models may change; confirm the installed IDs after a Kiro update.

## Hook → Tier Guidance

IDE hooks (`.kiro/hooks/*.json`, v1 format) trigger agent actions via `askAgent` prompts. The v1 hook schema has **no per-hook model field**, so a hook-triggered action runs under the current session's model. Choose the session model with the hook workload in mind:

| Hook | Nature | Suits |
|------|--------|-------|
| pre-write-guard | size / secret / doc-location checks | cost-optimized or balanced |
| git-pipeline-guard | default-branch push gate | cost-optimized or balanced |

For heavyweight review that must run on a specific tier regardless of the session model, delegate from the hook prompt to a named agent (e.g., `security-reviewer` for a security pass) rather than relying on the session model.

## OpenAI GPT-5.6 (selectable now)

All three GPT-5.6 variants are selectable in Kiro:

- **Sol** (`gpt-5.6-sol`, 4.4x credits): hardest long-horizon reasoning, refactors, and terminal workflows.
- **Terra** (`gpt-5.6-terra`, 2.2x): routine multi-step development and the balanced workhorse.
- **Luna** (`gpt-5.6-luna`, 0.6x): high-frequency, speed- and credit-sensitive work.

All three have a 1M context window (requests above 272K tokens bill at double the rate) and support `reasoning.effort` from `none` through `max`; the default is `high`. Install with `--provider=openai`; do not run the source policy applier for normal workspace switching.
