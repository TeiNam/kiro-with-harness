# Installation Guide

> This guide replaces the former profile-based model. The installer now selects assets by
> **tier × category tree** (major category → sub-category → detail option), with a legacy low-level
> **workload** surface maintained for backward compatibility. See the [README](../../README.md) for the full reference.

## Model

```
node install.js <cli|ide> [--scope global|workspace] [--category <list>] [--<category>=<list>] [--<category>-<sub>=<list>] [--workload a,b|all] [--review-backend kiro|claude|cross] [--dry-run]
```

- **Tier** — `cli` (for `kiro-cli chat`: JSON agents, hooks embedded in agent JSON, `skill://` skills) or `ide` (for Kiro IDE: Markdown agents, `.kiro/hooks/*.json` v1 JSON hooks, steering).
- **Scope** — `global` (`~/.kiro`, CLI default) or `workspace` (project `.kiro`, IDE default).
- **Category** — major categories (dev, cloud, ai, data, research, writing) + sub-category drill-down (--dev=rust,python) + detail options (--dev-apple=core). `core` is always installed; unselected levels default to all sub-options. For backward compatibility, `--workload` remains available for direct low-level workload key specification.

## Categories

Select by **category tree**: major categories (dev, cloud, ai, data, research, writing), then sub-categories and optional detail levels. `core` is always installed.

| Major | Sub-Category | Detail | Mapped Workload |
|-------|--------------|--------|-----------------|
| **dev** | frontend | — | frontend, typescript |
| | python | — | python |
| | rust | — | rust |
| | nodejs | — | node, javascript |
| | go | — | go |
| | java | — | java |
| | kotlin | — | kotlin |
| | cpp | — | cpp |
| | csharp | — | csharp |
| | php | — | php |
| | perl | — | perl |
| | apple | core / platform / product | swift |
| | mobile | — | mobile |
| | architecture | — | architecture |
| | domain | — | domain |
| | obsidian | — | obsidian, frontend |
| | chrome | — | frontend |
| | claude | — | ai-agent |
| **cloud** | infra | — | cloud |
| | finops | — | finops |
| | integration | — | cloud |
| **ai** | llm | — | ai |
| | agent | — | ai-agent |
| **data** | duckdb | — | python-data |
| | python-data | — | python-data, ai |
| | aws-analytics | — | cloud, python-data |
| | mysql | — | mysql |
| | postgres | — | postgres |
| | mongodb | — | mongodb |
| | dynamodb | — | dynamodb |
| | aws-rds | — | mysql, postgres |
| **research** | websearch | — | research |
| | report | — | report |
| **writing** | general | — | writing |
| | social | voice / content / visual | writing |

**Selection rules:**
- `--category=dev,cloud` — select entire major categories.
- `--dev=rust,python` — select sub-categories (auto-enables dev).
- `--dev-apple=core` — select detail options (auto-enables dev and apple).
- Unselected levels default to **all** sub-options.
- `--workload=<key,...>` — low-level direct workload specification (legacy surface, merges via union with categories).
- `lab` is hidden; opt-in via `--workload=lab` only.

## Examples

```bash
# Rust backend, native Kiro review, workspace
node install.js cli --scope workspace --dev=rust --review-backend kiro

# Cloud / IaC work (DevOps + FinOps + data engineering)
node install.js cli --scope global --category=cloud

# IDE project: TypeScript + frontend
node install.js ide --dev=frontend,nodejs

# Data engineering: PostgreSQL + AWS analytics
node install.js cli --scope workspace --data=postgres,aws-analytics

# Multiple specializations
node install.js ide --category=dev,cloud --dev=python --review-backend claude

# Low-level direct workload (legacy, backward compatible)
node install.js cli --scope global --workload rust,postgres,cloud
```

## Review backend

`--review-backend` controls code review only:

- `claude` (default) — route review through `peer-reviewer`, which calls terminal Claude Code (`claude -p`) for a cross-model second opinion (Kiro + Claude, 2-way).
- `cross` — same routing as `claude`, but `peer-reviewer` gathers **both** Claude Code (`claude -p`) and Codex CLI (`codex`) into a Kiro + Claude + Codex 3-way review, and installs an on-demand `cross-review.sh` (`bash .kiro/hooks/cross-review.sh`). Opt-in, not an automatic hook; each external CLI degrades gracefully.
- `kiro` — install native Kiro reviewer agents (code-reviewer, security-reviewer, language `*-reviewer`s).

Programming, build, and orchestrator agents are always Kiro-native regardless of this toggle.

## Global ↔ workspace inheritance

A workspace install inherits (skips) any file byte-identical to one already installed globally, so `--scope workspace` only adds what differs from your global baseline. Run `node install.js --status --scope global` to inspect the global manifest — it also reports the installed harness version (`sourceVersion`, recorded from `package.json`) and flags whether the install is **outdated** relative to the current source.

## Migrating from profiles

| Old profile | New equivalent |
|-------------|----------------|
| `install.js global` | `install.js cli --scope global --category=core` |
| `install.js developer` | `install.js cli --scope workspace --dev=<your languages>` |
| `install.js backend` | `install.js cli --scope workspace --category=dev --dev=rust,python,go` |
| `install.js frontend` | `install.js ide --dev=frontend` |
| `install.js full` | `install.js cli --scope global --category=dev,cloud,ai,data,research,writing` |
