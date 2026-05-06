# Kiro Harness

[한국어](README-KR.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Harness engineering for Kiro IDE. Profile-based installer that deploys curated steering rules, hooks, agents, skills, and MCP configs into Kiro workspaces.

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
```

> **Note:** If global settings are not detected, the installer will recommend installing global first. Global settings provide the foundation (agents, guardrails, MCP catalog) that all workspaces inherit.

## Installation Tiers

### Global (`~/.kiro/`)

Installed once, applies to all Kiro workspaces:

| Component | Contents |
|-----------|----------|
| Steering | Git workflow, patterns, performance rules |
| Hooks | Post-task review, pre-write guard (size/secrets/doc-location) |
| Agents | 7 global agents — architect, code-reviewer, deep-researcher, security-reviewer, refactor-cleaner, devops, translator-docs |
| Skills | 4 essential skills — verification loop, coding standards, strategic compact, context budget |
| MCP | Full MCP server catalog (enable as needed) |

### Workspace (`.kiro/` in project)

Project-specific configuration layered on top of global:

| Component | Contents |
|-----------|----------|
| Steering | Coding style, security, testing + language-specific rules (fileMatch) + framework skills (manual) |
| Hooks | Pre-write guard, quality hooks, guardrails |
| MCP | Same catalog (workspace can override) |

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
- Manual: 96 skills loaded on demand — frameworks, DB guidelines, AI/LLM, architecture, etc.

### Hooks (`.kiro/hooks/`)

Event-driven automations:
- Pre-write guard (size limit, secret detection, doc location check)
- Post-task code review
- Diagnostics on TS/JS file edit
- Post-write console.log/TODO warning
- Spec task test reminder

### Agents (`agents/`)

27 custom agents:
- General: architect, planner, code-reviewer, security-reviewer, build-error-resolver, refactor-cleaner, doc-updater, database-reviewer
- Testing: tdd-guide, e2e-runner
- Writing: article-writer, content-creator, deep-researcher
- Language-specific: reviewers and build resolvers for TypeScript, Python, Go, Rust, Java, Kotlin, C++, Flutter

### Skills (`skills/`)

96 skills organized by domain:
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
│   ├── install-modules.json    # Module definitions (28 modules)
│   └── install-profiles.json   # Profile definitions (10 profiles)
├── rules/                      # Steering source (common + 11 languages)
├── agents/                     # 27 custom agents (IDE + CLI formats)
├── skills/                     # 96 skill packages
├── docs/                       # Guides (eval harness, prompt templates, comparison)
├── mcp-configs/                # MCP server configurations
├── scripts/                    # Build/audit utilities
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
```

## Acknowledgments

This project was heavily inspired by [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code). Many of the rules, agent patterns, and skill structures originated from ECC and were adapted for Kiro IDE's native format (steering, hooks, skills).
