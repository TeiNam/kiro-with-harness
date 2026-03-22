# Kiro Harness

[한국어](README-KR.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Harness engineering for Kiro IDE. Profile-based installer that deploys curated steering rules, hooks, agents, skills, and MCP configs into Kiro workspaces.

## Quick Start

```bash
# Install global baseline (to ~/.kiro)
node install.js global

# Install developer profile (to current project)
node install.js developer

# Install specific profile to a target project
node install.js backend --target /path/to/project

# Install specific modules only
node install.js --modules steering-infra,hooks-quality

# List all profiles and modules
node install.js --list

# Check installation status
node install.js --status
```

## Profiles

| Profile | Description |
|---------|-------------|
| `global` | Universal baseline — git workflow, guardrails, prompt templates. Installs to `~/.kiro/` |
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
├── install.js                  # Installer script
├── manifests/
│   ├── install-modules.json    # Module definitions (26 modules)
│   └── install-profiles.json   # Profile definitions (10 profiles)
├── rules/                      # Steering source (common + 11 languages)
├── agents/                     # 27 custom agents
├── skills/                     # 96 skill packages
├── docs/                       # Guides (eval harness, prompt templates, comparison)
├── mcp-configs/                # MCP server configurations
├── scripts/                    # Hook scripts and installer libraries
└── .kiro/                      # This project's own Kiro config
```

## Acknowledgments

This project was heavily inspired by [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code). Many of the rules, agent patterns, and skill structures originated from ECC and were adapted for Kiro IDE's native format (steering, hooks, skills).
