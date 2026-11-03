# Kiro Harness

[한국어](README-KR.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Harness engineering for Kiro IDE. Tier-based installer (CLI / IDE) with workload and model-provider selection, deploying curated steering rules, hooks, agents, skills, and MCP configs into Kiro workspaces. The CLI tier targets the **Kiro CLI V3 engine** (V3-native agents with tag-based `tools` and capability `permissions`, standalone hook files). The installer optimizes the same role tiers for three model-usage patterns — Claude (default: Opus 5.5 / Sonnet 5.5 / Haiku 5.5), GPT-5.6, or **mixed** (Claude Opus 5.5 orchestration + GPT-5.6 Sol subagents) — without duplicating the asset fleet: it writes provider-specific model IDs, effort guidance, operating notes, and cross-family review priority into the installed output. The ceiling tier escalates by **effort** rather than by another tier, then sideways to a different model family, with role-based model routing, DAG-style parallel delegation, an enforced git pipeline, and a shared agent collaboration guide (AGENTS.md).

## Quick Start

The installer uses a **tier × category tree** model: choose `cli` or `ide`, then select categories.

```bash
# Interactive install (guided prompts: tier, scope, provider, categories, review backend, MCP proxy)
node install.js              # or: node install.js -i

# CLI tier: install global baseline (orchestrator agents, skills → ~/.kiro)
node install.js cli --scope global

# Same fleet optimized for OpenAI GPT-5.6 Sol / Terra / Luna
node install.js cli --scope global --provider=openai

# Mixed: Claude Opus 5.5 orchestrates, GPT-5.6 Sol runs every subagent
node install.js cli --scope global --provider=mixed

# Claude is the default; provider selection also works for IDE/workspace installs
node install.js ide --provider=anthropic --dev=frontend
node install.js cli --scope workspace --dev=rust,python

# Frontend development (React/TypeScript)
node install.js ide --dev=frontend

# iOS/macOS development (Apple ecosystem)
node install.js cli --scope workspace --dev=apple

# Cloud infrastructure work (AWS DevOps/IaC/FinOps)
node install.js cli --scope global --category=cloud

# LLM + agent building
node install.js ide --ai=llm,agent

# Data engineering: analytics + AWS lakehouse
node install.js cli --scope workspace --data=aws-analytics,dynamodb

# View the category tree
node install.js --list

# Low-level: install by workload keys directly (legacy surface, merged with categories)
node install.js cli --scope global --workload rust,mongodb

# Check installation status
node install.js --status
node install.js --status --scope global

# Preview without writing (works with any command)
node install.js cli --scope workspace --dev=rust --dry-run
```

> **Defaults:** CLI installs globally by default (~/.kiro); IDE installs workspace by default (project .kiro).
> **Category selection:** `--category=dev,cloud` selects entire categories; `--dev=rust` picks sub-categories; `--writing-social=voice` drills into detail options (only `writing.social` has them). Unselected levels default to all sub-options.

## Installation Tiers

### CLI Tier (`kiro-cli chat`)

Installs V3-native JSON agents (tag-based `tools` + capability `permissions`), the two gate hooks as standalone `hooks/*.json` files, and skills as progressive `skill://` resources. Requires the Kiro CLI V3 engine (`kiro-cli settings chat.agentEngine v3`, or `kiro-cli --v3` for one session).

**Global** (`~/.kiro/agents`, `~/.kiro/skills/`):
- Orchestration agents: kiro-cli, architect, deep-researcher, devops, peer-reviewer
- Review agents: code-reviewer, security-reviewer, translator-docs
- Steering: AGENTS.md (agent collaboration guide)
- Skills: progressive `skill://` load by orchestrator

**Workspace** (`.kiro/agents/`):
- Language reviewers, build-resolvers (per workload)
- e2e-runner, database-reviewer (NoSQL — MongoDB/DynamoDB)
- Article-writer, content-creator

### IDE Tier (Kiro IDE)

Installs Markdown agents and separate hook files; skills convert to steering (manual inclusion).

**Workspace** (`.kiro/agents/`, `.kiro/hooks/`, `.kiro/steering/`):
- Agents: same roles as CLI, in Markdown format
- Hooks: pre-write-guard, git-pipeline-guard (2 deterministic gates, symmetric with the CLI tier)
- Steering: language rules (fileMatch), core rules (always), manual skills
- MCP: `.kiro/settings/mcp.json`

## Installation Categories (3-Tier Category Tree)

The installer now organizes installation through a **category tree** (major category → sub-category → detail option), with a legacy low-level workload surface maintained for backward compatibility.

**Major categories:** dev, cloud, ai, data, research, writing.

| Category | Sub-Category | Detail | Mapped Workloads | Purpose |
|----------|--------------|--------|------------------|---------|
| **dev** | frontend | — | frontend, typescript | React / Next / Vite / TypeScript |
| | python | — | python | Django / FastAPI |
| | rust | — | rust | Rust backend |
| | nodejs | — | node, javascript | Node.js / Bun / Prisma |
| | go | — | go | Go backend |
| | java | — | java | Java / Spring / JPA |
| | kotlin | — | kotlin | Kotlin / Ktor / Exposed |
| | cpp | — | cpp | C/C++ system |
| | csharp | — | csharp | C# backend |
| | php | — | php | PHP / Laravel |
| | perl | — | perl | Perl scripting |
| | apple | — | swift | iOS/macOS (Swift/SwiftUI) |
| | mobile | — | mobile | Android / Compose / Multiplatform |
| | architecture | — | architecture | API design / ADR / blueprint |
| | domain | — | domain | Business domains (logistics, manufacturing, energy) |
| | obsidian | — | obsidian, frontend | Obsidian plugins |
| | chrome | — | frontend | Chrome extensions (reserved) |
| | claude | — | ai-agent | Claude Code plugins (reserved) |
| **cloud** | infra | — | cloud | IaC · EKS · ECS · Lambda · observability |
| | finops | — | finops | Billing · Pricing |
| | integration | — | cloud | SNS · SQS · MQ · Step Functions |
| **ai** | llm | — | ai | LLM use (Bedrock · Claude API · pytorch) |
| | agent | — | ai-agent | Agent/harness building (eval · mcp · prompt) |
| **data** | duckdb | — | python-data | DuckDB analysis |
| | python-data | — | python-data, ai | Python analytics (pandas / pytorch / MLE) |
| | aws-analytics | — | cloud, python-data | AWS analytics (Glue · Athena · S3 Tables · Iceberg) |
| | mongodb | — | mongodb | MongoDB schema design |
| | dynamodb | — | dynamodb | DynamoDB design |
| **research** | websearch | — | research | Web search · research (exa · brave · deep-research) |
| | report | — | report | Tech report writing · verification |
| **writing** | general | — | writing | General writing (blogging · PPT · creative · translation) |
| | social | voice / content / visual | writing | Social content (LinkedIn, etc.) |

**Usage:** `--category=dev,cloud` selects entire major categories; `--dev=rust,python` picks sub-categories (auto-enables dev); `--writing-social=voice` picks detail options where a sub-category has them. Unselected levels default to **all** sub-options. Combine with `--review-backend` and `--mcp-proxy` (IDE) as needed.

**Cloud workload details:** The `cloud` category spans AWS DevOps (IaC, containerization, observability) and integration (messaging); FinOps (Billing/Pricing MCP, cost tracking) is a separate `finops` workload selected via `--cloud=finops` (included automatically with `--category=cloud`). The cloud suite also includes **data engineering**: S3 Tables / Iceberg / Athena lakehouse, DMS/Glue/Kinesis/MSK/Flink ETL & CDC, RDBMS→S3/OpenSearch log offloading, EKS/MSK version-currency checks, Terraform deployment (see [aws-cloud](skills/aws-cloud/SKILL.md), [aws-lakehouse](skills/aws-lakehouse/SKILL.md), [aws-etl-cdc](skills/aws-etl-cdc/SKILL.md), [log-data-offloading](skills/log-data-offloading/SKILL.md), [terraform-deployment](skills/terraform-deployment/SKILL.md)).

**Legacy workload surface:** `--workload=<key,...>|all` remains available for direct low-level workload key specification. It merges with category selections (union). There is no hidden/isolated workload key — every workload is reachable from the category tree, and `scripts/lib/categories.js` has a coverage test that fails if one isn't.

## Review Backend Toggle

Control how code review agents are installed with `--review-backend`:

- `--review-backend claude` (default): Exclude native reviewers; route review through the `peer-reviewer` agent, which calls terminal Claude Code (`claude -p`) for a cross-model second opinion (Kiro + Claude, 2-way)
- `--review-backend cross`: Same routing as `claude`, but `peer-reviewer` gathers opinions from **both** Claude Code (`claude -p`) and Codex CLI (`codex`), synthesized into a **Kiro + Claude + Codex 3-way** review. Also installs an on-demand `cross-review.sh` (`bash .kiro/hooks/cross-review.sh` to cross-check uncommitted changes). Each external CLI degrades gracefully when unavailable. Not every review needs 3-way — the script is opt-in, **not** an automatic hook.
- `--review-backend kiro`: Install native Kiro reviewer agents (code-reviewer, security-reviewer, language reviewers)

Build agents (build-error-resolver, language build-resolvers, e2e-runner, kiro-cli) are always native regardless of this toggle.

## Models

Agent model assignments are role-based, organized into three **provider-agnostic capability tiers**. The `model` field in each agent definition is the single source of truth, written from [`scripts/lib/model-policy.js`](scripts/lib/model-policy.js). The harness is **tuned for three Kiro models** — **`claude-opus-5.5`** (deep reasoning, the ceiling), **`claude-sonnet-5.5`** (balanced, the default coding tier), and **`claude-haiku-5.5`** (cost-optimized; Experimental in Kiro). The `kiro-cli` orchestrator (set as the default agent on install) runs at the ceiling tier alongside the reasoning agents; the high-volume coding agents use `claude-sonnet-5.5`; cost-sensitive roles use `claude-haiku-5.5`.

| Tier | Model | Agents |
|------|-------|--------|
| Deep reasoning (ceiling) | `claude-opus-5.5` | kiro-cli (orchestrator), architect, security-reviewer, deep-researcher, devops, peer-reviewer, tech-fidelity-auditor, doc-clarity-reviewer |
| Balanced (default) | `claude-sonnet-5.5` | code-reviewer, refactor-cleaner, language reviewers, build-resolvers, database-reviewer, e2e-runner, doc-quality-detector, tech-doc-writer, tech-writer-monolith |
| Cost-optimized | `claude-haiku-5.5` | translator-docs, article-writer, content-creator |

The design principle: **Opus 5.5 orchestrates and reasons, Sonnet 5.5 does the coding volume, Haiku 5.5 handles cheap high-throughput work.** In the tech-writing pipeline the split is per stage: detection and drafting stay on Sonnet, while the fidelity and clarity verdicts (open-ended judgments) run on Opus. The same capability tiers map to OpenAI as `deep-reasoning → gpt-5.6-sol`, `balanced → gpt-5.6-terra`, and `cost-optimized → gpt-5.6-luna`. Choose with `--provider=anthropic|openai|mixed`; the installer changes only the installed output, leaving the Anthropic-first source assets untouched. It also injects a concise operating note into every installed agent, keyed to **that agent's model family** (not the global flag): Claude-family agents get plan/self-verification and 1M-context guidance, GPT-family agents get batched-tool guidance plus the 272K-token pricing boundary (the window is 1M, requests above 272K bill at 2x), and Haiku 5.5 agents also get its 100K-token pricing boundary (0.06x below, 0.3x above). Full details, hook→tier guidance, and provider switching: [Model routing](docs/en/model-routing.md).

**The `mixed` pattern (Opus 5.5 orchestration + Sol subagents).** `--provider=mixed` pins only the `kiro-cli` orchestrator to `claude-opus-5.5` and routes **every other role, regardless of tier, to `gpt-5.6-sol`** — Claude does the orchestration, GPT-5.6 Sol does all delegated work at OpenAI's ceiling tier. Each agent still receives the operating note of its own family, and `cross-review.sh` runs Codex first (cross-family versus the Opus-authored changes) with Claude Code covering the Sol-authored side. Earlier versions pinned the orchestrator to Claude Fable with a fallback; that is gone — Fable 5.1 is Enterprise-only, and CLI V3 fails the request instead of falling back to `chat.defaultModel`.

### Opus 5.5 is the ceiling — escalate inward, then sideways

There is no tier above `claude-opus-5.5`. When a task needs more than the top tier is producing, the harness escalates in two directions instead of reaching for a bigger model:

1. **Inward — raise effort within the tier.** `low` → `medium` → `high` → `xhigh` → `max`. Same model, larger reasoning budget, cheaper than a tier jump. Kiro exposes this as `kiro-cli chat --effort <level>` (per session; V3 does not save it as a default) and `kiro-cli settings chat.modelDefaults '<json>'`. Kiro applies effort **per model**, not per agent, and that setting replaces the whole object — so the installer prints one command covering every model the provider uses. **Opus 5.5 and Sonnet 5.5 run at `max`; Haiku 5.5 runs at its default `medium`.** No tier uses `low`: the 5.5 prompting guidance says low effort skips searches and checks and stops early on long agent prompts. The guardrails stay minimal and security-centric (the two deterministic gates) so the model's reasoning budget, not the harness, does the work.
2. **Sideways — a different model family.** At `max` there is nothing above. Re-prompting the same family cannot break correlated blind spots (same training, same failure modes), so the remaining axis is a different family: the `peer-reviewer` agent (terminal `claude -p` + `codex`) and, with `--review-backend cross`, `bash .kiro/hooks/cross-review.sh`. The selected provider determines priority: an Anthropic-hosted fleet calls Codex first; an OpenAI-hosted fleet calls Claude Code first. The other backend remains same-family corroboration. Hand off where **independence** or **grind** is the value — adversarial review of code this fleet wrote, tie-breaking two disagreeing attempts, large mechanical edits, a second diagnosis when stuck. Keep in the harness anything needing steering rules, skills, workload tags, tool orchestration, or Korean output.

> **The rule that makes the sideways axis pay off:** never let an external family be the *only* reader of something that matters. A finding only it reports still needs confirmation against the actual code; findings both families flag independently are the high-confidence ones. `cross-review.sh` prints this at the end of every run and, before the review, extracts the **blast radius** — files that did *not* change but should be reviewed anyway, via reverse `require`/`import` references and historical co-change.

> **Model availability:** in CLI V3 an agent pinned to an unavailable model **does not fall back** — its first request fails and Kiro restores the model that was active before the pin. Confirm IDs with `kiro-cli chat --list-models` before pinning. Opus 5.5 and Sonnet 5.5 are GA; Haiku 5.5 is Experimental. Claude Fable 5.1 is Enterprise-only, and Kiro does not serve OpenAI GPT-6.x (only GPT-5.6 Sol/Terra/Luna), so the harness pins neither. The Codex cross-review axis uses your local Codex CLI's default model, which can be a GPT-6.x model.

## Kiro Version Compatibility (CLI V3 / IDE 1.0)

- **CLI V3 only.** The CLI tier installs V3-native agents: tag-based `tools` (`read`/`write`/`shell`/`web`), capability `permissions` (converted from the old per-tool regex rules with `kiro-cli agent upgrade`, then reviewed), and no CLI 2.x fields (`allowedTools`, `toolsSettings`, `toolAliases`). V3 skips 2.x-only profiles, so the old format would silently fall back to another agent. The two gate hooks install as standalone `~/.kiro/hooks/*.json` (v1 schema, `PreToolUse`, matchers `write`/`shell`), which V3 runs for every agent and sub-agent session. `--cli-version 2` is rejected; the last 2.x-format harness is commit `6d85d08` (v3.4.0). Enable V3 with `kiro-cli settings chat.agentEngine v3` (or `kiro-cli --v3` for one session).
- **V3 tools that no longer exist** were removed from every agent: `use_aws` (devops now uses the `aws` CLI, whose read-only subcommands are pre-approved and whose mutations ask), `thinking`, `todo_list`, and `report_issue`.
- **Sub-agent permissions (V3):** a sub-agent's tool call runs without a prompt only when the parent session also allows it. The orchestrator therefore carries the read-only rules its delegations need (web research, devops' read-only MCP servers, `codex review --uncommitted`/`--base`, and the installed `cross-review.sh` at its fixed path), auto-starts only sub-agents without write tools (plus `peer-reviewer` and `translator-docs`), and leaves writes and infrastructure mutations to ask. Raw `claude` and `codex exec` calls ask too, because they accept any prompt and flags.
- **Shell rules (V3):** a shell glob matches the whole command, so `aws * get-*` would also pass a mutation that carries `get-` in an argument. Agents that pre-approve `aws` reads therefore add `ask` rules (ask outranks allow) for AWS mutation verbs, `aws s3 cp/mv/rm/sync`, and secret reads such as `secretsmanager get-secret-value`. The orchestrator also asks before `sed -i` and `tee`, which write files without passing the `write` gate hook. Force pushes, `reset --hard`, `clean -f`, and `branch -D` are denied in their `git -C` and trailing-flag forms too, and so are the permission-bypass flags of external CLIs (`--dangerously-*`, `codex -c`). Workspace agents with write tools may write only inside the workspace (`./**`).
- **IDE hooks use the v1 JSON format** (`.kiro/hooks/*.json`), introduced in IDE 1.0 and replacing the legacy `.kiro.hook` format. Legacy hooks do not execute until migrated. The installer emits v1 JSON directly. See `docs/en/hook-reference.md`.
- **Default resource inheritance (CLI 2.7+):** custom agents automatically inherit global steering, skills, and `AGENTS.md` in addition to their own `resources`. To keep installs strictly workload-scoped (no global pull-in), disable it: `kiro-cli settings chat.disableInheritingDefaultResources true` (add `--workspace` to scope per project). Built-in agents always inherit regardless.
- **Hot-reload (CLI 2.10+):** edits to `~/.kiro/agents/*` and `mcp.json` apply at the next idle boundary without restarting the session — reinstalling the harness takes effect without losing chat context.
- **Sessions (IDE 1.0):** IDE 1.0 uses a new session storage format; 0.x sessions need migrating (each shows a **Migrate** button, or opening one migrates it automatically). This is independent of the harness — it installs assets, not sessions — and hot-reload means re-running the installer keeps the active session.
- **Agent Focus Mode (IDE 1.0, experimental):** a chat-first layout with multiple parallel sessions and a workflow picker (Spec/Plan/Bug Fix/Quick Spec), running over the same `.kiro/` assets. See `docs/en/agent-focus-mode.md` for how it maps to the harness agent fleet and DAG orchestration.

## What Gets Installed

### Agents

**CLI tier** installs JSON agents under `agents/cli/`:
- Global (`~/.kiro/agents/`): orchestration (kiro-cli, architect, deep-researcher, devops, peer-reviewer), review agents (code-reviewer, security-reviewer, translator-docs)
- Workspace (`.kiro/agents/`): language reviewers, build-resolvers, database agents, e2e-runner, content agents

**IDE tier** installs Markdown agents under `.kiro/agents/` with the same roles.

**Ponytail injection:** The lazy senior dev principle (from `rules/common/ponytail.md`) is pre-injected into **every** agent definition in this repo — into the `prompt` field for CLI agents and the body for IDE agents — so installs carry it verbatim. This is unconditional: the harness keeps ponytail as its single organizing principle with no counter-logic, so all roles (including subagents) inherit it even when global resource inheritance is disabled (`kiro-cli settings chat.disableInheritingDefaultResources true` — recommended for isolated workspaces), which is precisely when steering-only delivery fails to reach subagents. Roles whose deliverable is exhaustive or procedural (security audit, e2e coverage, research citations) resolve the tension inside the principle itself: the injected brief ends with a review-lens clause (consolidated findings, not omitted ones) and "Never lazy about … anything explicitly requested", which forbids skipping mandated procedure. The injection is idempotent; `node scripts/apply-ponytail.js --list` shows the applied roles (the exempt list is empty by policy). To reapply after editing the wording, reset the agent files and re-run. The SSOT is `scripts/apply-ponytail.js` (`BRIEF`, plus an intentionally empty `EXEMPT`); `test/ponytail.test.js` enforces both the full coverage and the empty exempt table.

### Hooks

**CLI tier** (`~/.kiro/hooks/`): 2 standalone V3 hook files (`pre-write-guard.json`, `pre-push-guard.json` — v1 schema, `PreToolUse`) backed by 2 deterministic gate scripts — `pre-write-guard.sh` (`write` tag: secrets, oversized writes) and `pre-push-guard.sh` (`shell` tag: any `git push` in the command that updates or deletes the default branch, judged in the `git -C`/`cd`/`cwd` directory; bypass only when the user launches kiro-cli with `KIRO_ALLOW_MAIN_PUSH=1`). `cross-review.sh` is an on-demand script, not a hook.

**IDE tier** (`.kiro/hooks/`): 2 deterministic gates, symmetric with the CLI tier:
- pre-write-guard: size limit, secret detection, doc-location check
- git-pipeline-guard: block `git push` to the default branch and spell out branch → commit → push → PR → merge

Per-event agent automations (review-on-stop, capture-lessons, changelog-on-commit) were removed in v2 — reviews are on-demand (code-reviewer, `cross-review.sh`), and lessons/CHANGELOG live in skills and repo conventions.

### Steering

**CLI tier**: global steering = AGENTS.md (agent collaboration guide) + minimal-core (compact always-on digest incl. the AWS/Terraform gate) + ponytail; agents reference skills via `skill://`.

**IDE tier** (`.kiro/steering/`):
- Always-on (v2 minimal): minimal-core (compact digest — working style, security, git pipeline, AWS/Terraform gate) + ponytail
- FileMatch: language-specific rules loaded per file type
- Manual: skills loaded on demand (135 total; workload-tagged for selective inclusion)

### Skills

135 skill packages under `skills/`, tagged by workload. Shared skills are kept in sync with the companion Claude Code harness ([my_harness_for_claude_code](https://github.com/TeiNam/my_harness_for_claude_code)) and adapted to Kiro tool names and paths. Installation selects only skills matching active workloads.
- Core: context budget, strategic compact, agentic engineering, lessons learned, git workflow, verification loop
- Infrastructure: Docker, deployment, backend patterns
- Databases (NoSQL): MongoDB, DynamoDB (+ mongodb-patterns) — RDBMS design/migration skills moved to the separate easy-rdbms plugin
- Cloud / Data: aws-cloud, aws-sdk-patterns (boto3/JS v3/CLI v2), aws-lakehouse (S3 Tables/Iceberg/Athena/Spark), aws-etl-cdc (DMS/Glue/Kinesis/MSK/Flink), log-data-offloading (RDBMS→S3/OpenSearch), infra-version-currency (EKS/MSK latest-version checks), terraform-deployment
- Backend: Django, Spring Boot, Laravel, FastAPI
- Frontend: Next.js, Nuxt4, Vite, Bun
- Mobile: Android, Compose, SwiftUI, Swift concurrency
- AI/LLM: Claude API, cost-aware pipelines, PyTorch, mle-workflow
- Architecture: API design, ADRs, blueprint, MCP patterns + builder
- Writing: articles, content, research, crossposting, humanize-writing
- Documents: PDF, PPTX, DOCX, XLSX generation, brand guidelines

### MCP

Curated MCP server catalog installed to `.kiro/settings/mcp.json` (or `~/.kiro/settings/mcp.json` for CLI global).

**Cloud workload** includes: terraform, aws-documentation, cloudwatch, aws-ecs, aws-iam (DevOps); aws-pricing, aws-billing-cost-management (FinOps). These run as **on-demand stdio processes** — see below.

Full catalog (general / DevOps / FinOps / opt-in incl. brave-search, sentry, time) and config notes: `docs/en/mcp-reference.md`.

**DevOps MCP is on-demand, not resident.** The terraform + AWS servers run as stdio processes the client starts when a tool is actually used, and they exit with the session — nothing shows up in `docker ps` when you are not using them, and there is no HTTP endpoint to secure. Backends are the official AWS `awslabs` servers via host `uvx` at pinned versions, plus terraform via `docker run -i --rm` on a pinned image. Requires `uv` on the host (`brew install uv`); Docker is needed only for terraform.

This replaced an earlier resident proxy on `:9092`, which existed only to dodge a cold start rather than fix one. The original failure was that **every** devops MCP server died at once: each was a client-spawned `docker run` on an unpinned image, and the first pull took 14–20s — past the MCP initialization timeout. Pinning versions and moving to host `uvx` removes the pull, so warm-cache handshake is **0.5–4.9s** per server and no proxy is needed. There is deliberately no general-purpose AWS API server either: `awslabs.core-mcp-server` was yanked upstream, and its replacement would add a second mutation path next to the `aws` CLI (Kiro CLI V3 has no built-in `use_aws`).

**General proxy (`--mcp-proxy`, IDE tier).** The general servers can optionally be centralized in one local [mcp-proxy](mcp-proxy/README.md) container so multiple clients don't each spawn duplicates, turning `mcp.json` entries into `{"type":"http","url":"http://localhost:9090/<server>/mcp"}`. The installer auto-provisions it: it checks `docker ps`, runs `docker compose up -d mcp-proxy` when absent, skips when already running, and generates a **workload-filtered `config.generated.json`** so the proxy serves only the backends your active workloads need. It binds to `127.0.0.1` only and is unauthenticated, so don't widen the binding. No Docker → it tells you to install Docker and re-run; daemon down → start it and re-run; `--dry-run` and failures degrade gracefully. Details: [`mcp-proxy/README.md`](mcp-proxy/README.md), [MCP reference](docs/en/mcp-reference.md).

## Project Structure

```
├── install.js                  # Tier × workload installer
├── scripts/lib/
│   ├── categories.js           # Category tree (3-tier) and CLI flag parser
│   ├── workloads.js            # Workload catalog and classification
│   ├── select-assets.js        # Asset selection engine + review-backend filter
│   ├── tiers.js                # CLI/IDE install planners
│   └── tag-assets.js           # Workload tagging
├── rules/                      # Steering source (common + per-language)
├── agents/
│   ├── cli/                    # CLI agents (global + workspace)
│   ├── ide/                    # IDE agents (Markdown)
│   └── AGENTS.md               # Shared agent collaboration guide
├── skills/                     # 135 skill packages (workload-tagged)
├── plugins/
│   ├── catalog.json            # Claude-plugin → Kiro asset bridge catalog (SSOT)
│   └── README.md               # Per-plugin verdicts and porting rules
├── mcp-configs/                # MCP server configurations
├── scripts/                    # Validation utilities (validate-agents.js, validate-models.js, validate-counts.js)
├── docs/                       # Guides (English + Korean)
└── .kiro/                      # This project's own Kiro config
```

## CLI Reference

```
node install.js <tier> [options]

Tiers:
  cli                Install for kiro-cli chat
  ide                Install for Kiro IDE

Options:
  -i, --interactive              Guided interactive install (also the default with no args on a TTY)
  --scope <global|workspace>     Installation scope (default: global for CLI, workspace for IDE)
  --category <list>              Major categories: dev, cloud, ai, data, research, writing (comma-separated; unselected = all)
  --<category>= <list>           Sub-category selection (e.g., --dev=frontend,python; unselected = all subs)
  --<category>-<sub>= <list>     Detail option (e.g., --writing-social=voice; for subs with drill-down only)
  --workload <list|all>          Low-level: comma-separated workload keys or 'all' (legacy surface, merges with categories via union)
  --provider <anthropic|openai|mixed> Model-usage pattern (default: anthropic); writes role models, effort guidance, per-family operating notes, and cross-family priority into installed agents. mixed = Claude Opus 5.5 orchestration + GPT-5.6 Sol for every other role
  --cli-version 3                Accepted for compatibility; the CLI tier is V3-only (2 is rejected)
  --review-backend <kiro|claude|cross> Code review routing (default: claude; cross = Claude+Codex 3-way + cross-review.sh)
  --mcp-proxy                    IDE only: route mcp.json through the general mcp-proxy (:9090) and auto-start that container if not already running
                                 (devops/AWS MCP is unaffected — it runs as on-demand stdio, no container)
  --target <path>                Install to specified directory
  --dry-run                      Preview changes without writing
  --list                         Show category tree
  --status                       Show installation status (installed version + outdated check)
```

## Documentation

Full guides live under `docs/` — English in `docs/en/`, Korean in `docs/kr/`.

| Doc | Covers |
|-----|--------|
| [Workload guide](docs/en/profile-guide.md) | Tier × workload model, install flags, profile migration |
| [Hook reference](docs/en/hook-reference.md) | v1 JSON hook format (IDE 1.0 / CLI V3), triggers, the installed hook set |
| [Agent Focus Mode](docs/en/agent-focus-mode.md) | IDE 1.0 Agent Focus Mode (experimental) — parallel sessions & workflow picker mapped to harness agents/orchestration |
| [Kiro Crew](docs/en/crew-integration.md) | `kiro-cli crew`, the Crew Gateway, and the shared `~/.kiro/agents/` directory — asset mapping, work division, security |
| [Plugins](plugins/README.md) | Claude Code plugins mapped onto Kiro (bridge / external-cli / native / incompatible) |
| [MCP reference](docs/en/mcp-reference.md) | Curated MCP catalog (built-in / general / DevOps / FinOps / opt-in) |
| [Model routing](docs/en/model-routing.md) | 3-tier model policy (Opus/Sonnet/Haiku 5.5), the Opus-5.5 ceiling + effort/cross-family escalation, per-agent assignment, hook→tier guidance, OpenAI GPT-5.6 provider switch |
| [Skill catalog](docs/en/skill-catalog.md) | The 135 skills by domain |
| [Creating skills](docs/en/creating-skills.md) | Authoring + registering a skill via `workloads:` frontmatter |
| [Claude vs Kiro](docs/en/claude-vs-kiro.md) | Claude Code vs Kiro CLI vs Kiro IDE — feature-by-feature differences (official-docs-based) |
| [Migration from Claude](docs/en/migration-from-claude.md) | Converting a Claude Code setup to Kiro |
| [Eval harness](docs/en/eval-harness.md) | Eval-driven development workflow |
| [Prompt templates](docs/en/prompt-templates.md) | Reusable prompt templates |

Korean translations of each live in `docs/kr/`.

## Acknowledgments

This project was heavily inspired by [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code). Many of the rules, agent patterns, and skill structures originated from ECC and were adapted for Kiro IDE's native format (steering, hooks, skills).

The `ponytail` steering rule (lazy senior dev mode) is adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail); it is applied to reduce token usage by favoring minimal code over boilerplate (write less, delete more).

The central MCP proxy is [tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy) (MIT License, © TBXark), used as an **unmodified public Docker image** (`ghcr.io/tbxark/mcp-proxy`, pinned to `v0.43.2`). The harness bundles only a compose file, config, and docs — not the proxy source.
