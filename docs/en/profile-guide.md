# Profile Selection Guide

## Quick Decision

| You are... | Use profile |
|------------|-------------|
| Setting up Kiro for the first time | `global` (then add a project profile) |
| Starting any dev project | `core` (minimal) or `developer` (recommended) |
| Building a REST API | `backend` |
| Building a web frontend | `frontend` |
| Building a mobile app | `mobile` |
| Working with AI/LLM | `ai` |
| Designing system architecture | `architect` |
| Writing articles or content | `writer` |
| Want everything | `full` |

## Profile Module Map

```
global ─── steering-global, hooks-global, docs-prompt-templates, mcp-catalog

core ───── steering-core, hooks-core, mcp-catalog

developer ─ steering-core
           ├── steering-languages (11 languages)
           ├── steering-agent-knowledge
           ├── steering-skills
           ├── steering-writing-research
           ├── steering-infra
           ├── steering-architecture
           ├── steering-quality
           ├── steering-lang-testing
           ├── steering-lang-patterns
           ├── hooks-core + hooks-quality + hooks-guardrails
           ├── docs-eval-harness + docs-prompt-templates
           └── mcp-catalog

backend ─── steering-core
           ├── steering-languages
           ├── steering-agent-knowledge
           ├── steering-infra
           ├── steering-django
           ├── steering-springboot
           ├── steering-laravel
           ├── steering-fastapi
           ├── steering-architecture
           ├── hooks-core + hooks-quality + hooks-guardrails
           └── mcp-catalog

frontend ── steering-core
           ├── steering-languages
           ├── steering-frontend-frameworks
           ├── hooks-core + hooks-quality + hooks-guardrails
           └── mcp-catalog

mobile ──── steering-core
           ├── steering-languages
           ├── steering-mobile
           ├── hooks-core + hooks-quality
           └── mcp-catalog

ai ──────── steering-core
           ├── steering-languages
           ├── steering-ai-llm
           ├── hooks-core + hooks-quality
           ├── docs-eval-harness
           └── mcp-catalog

architect ─ steering-core
           ├── steering-agent-knowledge
           ├── steering-architecture
           ├── steering-quality
           ├── steering-infra
           ├── hooks-core
           ├── docs-eval-harness + docs-prompt-templates
           └── mcp-catalog

writer ──── steering-core
           ├── steering-writing-research
           ├── hooks-core
           ├── docs-prompt-templates
           └── mcp-catalog

full ────── (all modules)
```

## Installation Patterns

### First-time setup

```bash
# 1. Install global baseline (once, applies to all projects)
node install.js global

# 2. Install project profile
node install.js developer
```

### Combining profiles

Profiles are additive. Run multiple installs to combine:

```bash
node install.js backend
node install.js --modules steering-ai-llm    # add AI skills to backend project
```

### Module-only install

Skip profiles entirely and pick individual modules:

```bash
node install.js --modules steering-django,steering-infra,hooks-core
```

### Check what's installed

```bash
node install.js --status
```

## Global vs Project

| Scope | Location | Use for |
|-------|----------|---------|
| Global | `~/.kiro/` | Universal rules that apply everywhere (git workflow, guardrails) |
| Project | `.kiro/` in project root | Project-specific rules, hooks, skills |

The `global` profile installs to `~/.kiro/`. All other profiles install to the current project (or `--target` path).

## Steering Inclusion Types

| Type | Loaded when | Example |
|------|-------------|---------|
| always | Every Kiro session | coding-style, security, testing |
| fileMatch | Matching file is opened | TypeScript rules when editing `.ts` |
| manual | User adds via `#` in chat | Django patterns, PostgreSQL guideline |
