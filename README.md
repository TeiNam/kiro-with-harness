# Kiro Harness

[한국어](README-KR.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Harness engineering for Kiro IDE. Profile-based installer that deploys curated steering rules, hooks, agents, skills, and MCP configs into Kiro workspaces. Tuned for Claude Opus 4.8 — role-based model routing, DAG-style parallel delegation, and a shared agent collaboration guide (AGENTS.md).

## Quick Start

The installer uses a two-tier approach: **global** (shared across all projects) and **workspace** (project-specific).

```bash
# First time? Run without arguments for a guided setup
node install.js

# Step 1: Install global baseline (agents, MCP, essential skills → ~/.kiro)
node install.js global

# Step 2: Install workspace profile (to current project)
node install.js developer

# Or install to a specific project
node install.js backend --target /path/to/project

# Install specific modules only
node install.js --modules steering-infra,hooks-quality

# Explicit scope with modules
node install.js --scope global --modules agents-global,skills-global

# List all profiles and modules
node install.js --list

# Check installation status
node install.js --status
node install.js --status --scope global

# Preview changes without writing anything (works with any command)
node install.js global --dry-run
```

> **Note:** If global settings are not detected, the installer will recommend installing global first. Global settings provide the foundation (agents, guardrails, MCP catalog) that all workspaces inherit.

## Installation Tiers

### Global (`~/.kiro/`)

Installed once, applies to all Kiro workspaces:

| Component | Contents |
|-----------|----------|
| Steering | Git workflow, patterns, performance rules + AGENTS.md (agent collaboration guide, auto-recognized by Kiro) |
| Hooks | Post-task review, pre-write guard (size/secrets/doc-location), spec-task test reminder, repeated-lesson capture (self-evolution) |
| Agents | 9 global CLI agents — kiro-cli (orchestrator), architect, code-reviewer, deep-researcher, security-reviewer, refactor-cleaner, devops, peer-reviewer (terminal Claude Code cross-model review), translator-docs |
| Skills | Essential universal skills (manual) — strategic compact, context budget, agentic engineering, lessons learned. Coding-biased skills (verification loop, coding standards) live in the workspace tier |
| Native skills | Real `skill://` resources under `~/.kiro/skills/` — humanize-korean (AI Korean-text humanizer); progressively loaded by the kiro-cli orchestrator |
| MCP | Full MCP server catalog (enable as needed) |

### Workspace (`.kiro/` in project)

Project-specific configuration layered on top of global:

| Component | Contents |
|-----------|----------|
| Steering | Coding style, security, testing + language-specific rules (fileMatch) + framework skills (manual) |
| Hooks | Pre-write guard, quality hooks, guardrails |
| MCP | Same catalog (workspace can override) |

## Models

Agent model assignments follow a role-based policy. The `model` field in each agent definition is the single source of truth.

| Role | Model | Agents |
|------|-------|--------|
| Reasoning | `claude-opus-4.8` | architect, code-reviewer, deep-researcher, security-reviewer, refactor-cleaner, devops, and language-specific reviewers/build-resolvers |
| Cost-optimized | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |
| General | inherited | Agents without an explicit `model` inherit the model selected in chat |

> **Opus 4.8 availability:** `claude-opus-4.8` is **experimental** and available only in **us-east-1** and **eu-central-1**. It requires **Kiro CLI v2.5.0+**. Agents pinned to `claude-opus-4.8` will fail to resolve on older CLI versions or unsupported regions — upgrade Kiro CLI to avoid silent failures.

## Profiles

| Profile | Description |
|---------|-------------|
| `global` | Universal baseline — global agents, essential skills, guardrails, MCP catalog. Installs to `~/.kiro/` |
| `core` | Minimal dev baseline — common rules, security hook, MCP |
| `developer` | Standard setup — core + languages, skills, infra, architecture, quality, hooks |
| `full` | Everything — all modules + harness source reference |
| `writer` | Writing/content — articles, social media, research |
| `mobile` | Mobile dev — Android, Compose, SwiftUI, Swift concurrency |
| `ai` | AI/LLM dev — Claude API, cost-aware pipelines, PyTorch |
| `backend` | Backend/API — Django, Spring Boot, Laravel, FastAPI, infra, DB |
| `frontend` | Frontend — Next.js, Nuxt4, Bun, TypeScript |
| `architect` | Architecture — API design, ADRs, blueprint, quality |

## What Gets Installed

### Steering (`.kiro/steering/`)

Rules and guidelines injected into Kiro context:
- Always-on: coding style, security, testing, git workflow, patterns, performance
- File-match: language-specific rules (11 languages) loaded when matching files are opened
- Manual: 104 skills loaded on demand — frameworks, DB guidelines, AI/LLM, architecture, etc.

### Hooks (`.kiro/hooks/`)

Event-driven automations (which ones install depends on the module/profile):
- Pre-write guard — size limit, secret detection, doc-location check (`preToolUse`)
- Pre-shell / post-shell guard — command safety review (`preToolUse`/`postToolUse`, guardrails)
- Post-write cleanup — console.log/TODO warning (`postToolUse`)
- Diagnostics on TS/JS file save (`fileEdited`)
- New-file scaffold check (`fileCreated`)
- Post-task code review (`agentStop`)
- Spec-task test reminder (`postTaskExecution`)
- Repeated-lesson capture — self-evolution, proposes lessons-learned entries with user confirmation (`agentStop`)
- Pre-task plan (`preTaskExecution`, quality profile)
- Pre-push docs gate — update CHANGELOG/README before a remote push (`preToolUse`, guardrails)

### Agents (`agents/`)

Provided in two formats — **IDE** (26 Markdown agents) and **CLI** (JSON: 9 global + 20 workspace):
- Orchestration & global: kiro-cli (orchestrator), architect, code-reviewer, security-reviewer, refactor-cleaner, devops, deep-researcher, peer-reviewer (terminal Claude Code cross-model review), translator-docs
- Language reviewers: TypeScript, Python, Go, Rust, Java, Kotlin, C++, Flutter
- Build resolvers: C++, Go, Java, Kotlin, Rust, PyTorch + generic build-error-resolver
- Data: database-reviewer, rdbms-data-modeler
- Testing: e2e-runner
- Writing: article-writer, content-creator

### Skills (`skills/`)

104 skills organized by domain:
- Infrastructure: Docker, deployment, database migrations, backend patterns
- Databases: PostgreSQL, MySQL, MongoDB, DynamoDB, ClickHouse
- Backend frameworks: Django, Spring Boot, Laravel, FastAPI
- Frontend: Next.js, Nuxt4, Bun, Flutter, Liquid Glass
- Mobile: Android, Compose Multiplatform, SwiftUI, Swift concurrency, Kotlin
- AI/LLM: Claude API, cost-aware pipelines, PyTorch, on-device models
- Architecture: API design, ADRs, blueprint, MCP server patterns
- Quality: agentic engineering, context budget, continuous learning
- Writing: articles, content engine, deep research, crossposting
- Domain: supply chain, manufacturing, energy, compliance
- Languages: testing and patterns for Python, Go, Rust, C++, Kotlin, Perl, Java

### MCP (`.kiro/settings/mcp.json`)

Pre-configured MCP server catalog.

## Project Structure

```
├── install.js                  # Installer script (global/workspace routing)
├── manifests/
│   ├── install-modules.json    # Module definitions (35 modules)
│   └── install-profiles.json   # Profile definitions (10 profiles)
├── rules/                      # Steering source (common + 11 languages)
├── agents/                     # IDE (26 .md) + CLI (9 global + 20 workspace) agent definitions + AGENTS.md
├── skills/                     # 104 skill packages
├── docs/                       # Guides — migration, profiles, skill catalog, hook reference, eval harness, prompt templates (EN + KR)
├── mcp-configs/                # MCP server configurations
├── scripts/                    # Build/audit utilities (validate-agents, validate-models, validate-baseline)
└── .kiro/                      # This project's own Kiro config
```

## CLI Reference

```
node install.js [options] [profile]

Options:
  (no args)              Interactive setup guide
  --list                 Show all profiles and modules
  --status               Show installation status for current directory
  --status --scope global  Show global installation status
  --target <path>        Install to specified directory
  --scope <global|workspace>  Explicit installation scope
  --modules <list>       Install specific modules (comma-separated)
  --profile <name>       Explicit profile selection
  --dry-run              Preview all changes without writing/removing any file
```

## Acknowledgments

This project was heavily inspired by [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code). Many of the rules, agent patterns, and skill structures originated from ECC and were adapted for Kiro IDE's native format (steering, hooks, skills).
