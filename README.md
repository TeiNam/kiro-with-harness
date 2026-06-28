# Kiro Harness

[한국어](README-KR.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Harness engineering for Kiro IDE. Tier-based installer (CLI / IDE) with workload selection, deploying curated steering rules, hooks, agents, skills, and MCP configs into Kiro workspaces. Tuned for Claude Opus 4.8 — role-based model routing, DAG-style parallel delegation, and a shared agent collaboration guide (AGENTS.md).

## Quick Start

The installer uses a **tier × workload** model: choose `cli` or `ide`, then select workloads.

```bash
# CLI tier: install global baseline (orchestrator agents, skills → ~/.kiro)
node install.js cli --scope global --workload core

# CLI tier: install workspace config (language reviewers, build resolvers → project .kiro)
node install.js cli --scope workspace --workload rust,python

# IDE tier: install project config (agents, hooks, steering → project .kiro)
node install.js ide --workload typescript,frontend

# Install multiple workloads
node install.js cli --scope global --workload cloud,rust,go

# Install all workloads (excluding lab)
node install.js cli --scope global --workload all

# List available workloads
node install.js --list

# Check installation status
node install.js --status
node install.js --status --scope global

# Preview without writing (works with any command)
node install.js cli --scope global --workload core --dry-run
```

> **Defaults:** CLI installs globally by default (~/.kiro); IDE installs workspace by default (project .kiro).

## Installation Tiers

### CLI Tier (`kiro-cli chat`)

Installs JSON agents with embedded hooks; skills as progressive `skill://` resources.

**Global** (`~/.kiro/agents`, `~/.kiro/skills/`):
- Orchestration agents: kiro-cli, architect, deep-researcher, devops, peer-reviewer
- Review agents: code-reviewer, security-reviewer, translator-docs
- Steering: AGENTS.md (agent collaboration guide)
- Skills: progressive `skill://` load by orchestrator

**Workspace** (`.kiro/agents/`):
- Language reviewers, build-resolvers (per workload)
- e2e-runner, database-reviewer, rdbms-data-modeler
- Article-writer, content-creator

### IDE Tier (Kiro IDE)

Installs Markdown agents and separate hook files; skills convert to steering (manual inclusion).

**Workspace** (`.kiro/agents/`, `.kiro/hooks/`, `.kiro/steering/`):
- Agents: same roles as CLI, in Markdown format
- Hooks: pre-write-guard, review-on-stop, capture-lessons, changelog-on-commit (optimized set)
- Steering: language rules (fileMatch), core rules (always), manual skills
- MCP: `.kiro/settings/mcp.json`

## Workloads (29 Total)

All installs include **core** (universal rules, base agents). Select additional workloads by name.

| Category | Workload | Purpose |
|----------|----------|---------|
| **Languages** | python, rust, go, java, javascript, typescript, node, kotlin, cpp, csharp, php, perl, swift | Per-language rules, reviewers, build resolvers (select only needed languages) |
| **Specialized** | ai-agent, ai, cloud, frontend, mobile, python-data | Agent/harness building; LLM/ML use; DevOps/FinOps/Terraform/AWS/Docker/K8s; React/Next/Nuxt; Android/Swift/Compose; DuckDB/pandas/ClickHouse |
| **Databases** | postgres, mysql, mongodb, dynamodb | DB-specific rules and reviewers |
| **Other** | architecture, writing, domain, obsidian | API design/ADRs; articles/research; business domains; Obsidian integration |
| **Special** | lab | Hidden; opt-in via `--workload lab` |

Example: `--workload core,rust,postgres,cloud` installs Rust, PostgreSQL, and cloud (DevOps/FinOps) support.

## Review Backend Toggle

Control how code review agents are installed with `--review-backend`:

- `--review-backend claude` (default): Exclude native reviewers; route review through `peer-reviewer` agent (calls terminal Claude Code for cross-model second opinion)
- `--review-backend kiro`: Install native Kiro reviewer agents (code-reviewer, security-reviewer, language reviewers)

Build agents (build-error-resolver, language build-resolvers, e2e-runner, kiro-cli) are always native regardless of this toggle.

## Models

Agent model assignments are role-based. The `model` field in each agent definition is the single source of truth. The harness is **tuned for three Kiro models** — **`claude-opus-4.8` (default)**, `claude-sonnet-4.6`, and `claude-haiku-4.5`. The `kiro-cli` orchestrator (set as the default agent on install) and all reasoning agents are pinned to `claude-opus-4.8`; cost-sensitive roles use `claude-haiku-4.5`. (Kiro offers other models too; these three are what the harness is optimized around.)

| Role | Model | Agents |
|------|-------|--------|
| Reasoning | `claude-opus-4.8` | architect, code-reviewer, security-reviewer, deep-researcher, devops, refactor-cleaner, language reviewers, build-resolvers |
| Cost-optimized | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |
| General | inherited | Agents without explicit `model` inherit the model selected in chat |

> **Opus 4.8 availability:** `claude-opus-4.8` is **experimental** and available only in **us-east-1** and **eu-central-1**. It requires **Kiro CLI v2.5.0+**. Agents pinned to `claude-opus-4.8` will fail on older CLI versions or unsupported regions — upgrade Kiro CLI to avoid silent failures.

> **Model ID format:** Kiro validates `model` against the IDs its model service returns; an unknown ID silently falls back to the default model with a warning. Confirm the exact identifier with `/model` in an active chat session before pinning.

## Kiro Version Compatibility (CLI 2.10 / IDE 1.0)

- **IDE hooks use the v1 JSON format** (`.kiro/hooks/*.json`), introduced in IDE 1.0 and replacing the legacy `.kiro.hook` format. Legacy hooks do not execute until migrated. The installer emits v1 JSON directly. See `docs/en/hook-reference.md`.
- **Default resource inheritance (CLI 2.7+):** custom agents automatically inherit global steering, skills, and `AGENTS.md` in addition to their own `resources`. To keep installs strictly workload-scoped (no global pull-in), disable it: `kiro-cli settings chat.disableInheritingDefaultResources true` (add `--workspace` to scope per project). Built-in agents always inherit regardless.
- **Hot-reload (CLI 2.10+):** edits to `~/.kiro/agents/*` and `mcp.json` apply at the next idle boundary without restarting the session — reinstalling the harness takes effect without losing chat context.

## What Gets Installed

### Agents

**CLI tier** installs JSON agents under `agents/cli/`:
- Global (`~/.kiro/agents/`): orchestration (kiro-cli, architect, deep-researcher, devops, peer-reviewer), review agents (code-reviewer, security-reviewer, translator-docs)
- Workspace (`.kiro/agents/`): language reviewers, build-resolvers, database agents, e2e-runner, content agents

**IDE tier** installs Markdown agents under `.kiro/agents/` with the same roles.

### Hooks

**CLI tier**: hooks embedded in agent JSON (not separate files).

**IDE tier** (`.kiro/hooks/`): optimized set of event-driven automations:
- pre-write-guard: size limit, secret detection, doc-location check
- review-on-stop: post-task code review
- capture-lessons: self-evolution feedback loop
- changelog-on-commit: maintain a date-organized CHANGELOG (`## YYYY-MM-DD`) on git commit

### Steering

**CLI tier**: global steering limited to AGENTS.md (agent collaboration guide); agents reference skills via `skill://`.

**IDE tier** (`.kiro/steering/`):
- Always-on: coding style, security, testing, git workflow, patterns, performance
- FileMatch: language-specific rules loaded per file type
- Manual: skills loaded on demand (128 total; workload-tagged for selective inclusion)

### Skills

128 skill packages under `skills/`, tagged by workload. Installation selects only skills matching active workloads.
- Core: context budget, strategic compact, agentic engineering, lessons learned
- Infrastructure: Docker, deployment, database migrations, backend patterns
- Databases: PostgreSQL, MySQL, MongoDB, DynamoDB
- Backend: Django, Spring Boot, Laravel, FastAPI
- Frontend: Next.js, Nuxt4, Bun
- Mobile: Android, Compose, SwiftUI, Swift concurrency
- AI/LLM: Claude API, cost-aware pipelines, PyTorch
- Architecture: API design, ADRs, blueprint, MCP patterns
- Writing: articles, content, research, crossposting

### MCP

Curated MCP server catalog installed to `.kiro/settings/mcp.json` (or `~/.kiro/settings/mcp.json` for CLI global).

**Cloud workload** includes: terraform, aws-documentation, aws-core, cloudwatch, aws-ecs, aws-iam (DevOps); aws-pricing, aws-billing-cost-management (FinOps).

## Project Structure

```
├── install.js                  # Tier × workload installer
├── scripts/lib/
│   ├── workloads.js            # Workload catalog and classification
│   ├── select-assets.js        # Asset selection engine + review-backend filter
│   ├── tiers.js                # CLI/IDE install planners
│   └── tag-assets.js           # Workload tagging
├── rules/                      # Steering source (common + per-language)
├── agents/
│   ├── cli/                    # CLI agents (global + workspace)
│   ├── ide/                    # IDE agents (Markdown)
│   └── AGENTS.md               # Shared agent collaboration guide
├── skills/                     # 128 skill packages (workload-tagged)
├── mcp-configs/                # MCP server configurations
├── scripts/                    # Validation utilities (validate-agents.js, validate-models.js)
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
  --scope <global|workspace>     Installation scope (default: global for CLI, workspace for IDE)
  --workload <list|all>          Comma-separated workloads or 'all' (default: core only)
  --review-backend <kiro|claude> Code review routing (default: claude)
  --target <path>                Install to specified directory
  --dry-run                      Preview changes without writing
  --list                         Show all workloads
  --status                       Show installation status
```

## Acknowledgments

This project was heavily inspired by [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code). Many of the rules, agent patterns, and skill structures originated from ECC and were adapted for Kiro IDE's native format (steering, hooks, skills).

The `ponytail` steering rule (lazy senior dev mode) is adapted from [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail); it is applied to reduce token usage by favoring minimal code over boilerplate (write less, delete more).
