# Workload Guide

> This guide replaces the former profile-based model. The installer now selects assets by
> **tier × workload**, not by named profiles. See the [README](../../README.md) for the full reference.

## Model

```
node install.js <cli|ide> [--scope global|workspace] [--workload a,b|all] [--review-backend kiro|claude] [--dry-run]
```

- **Tier** — `cli` (for `kiro-cli chat`: JSON agents, hooks embedded in agent JSON, `skill://` skills) or `ide` (for Kiro IDE: Markdown agents, `.kiro/hooks/*.kiro.hook`, steering).
- **Scope** — `global` (`~/.kiro`, CLI default) or `workspace` (project `.kiro`, IDE default).
- **Workload** — what you are working on today. `core` is always installed; add others as needed.

## Workloads

`core` is always present. Select additional workloads by name (comma-separated, or `all` for every group except `lab`).

| Category | Workloads |
|----------|-----------|
| Languages | python, rust, go, java, javascript, typescript, node, kotlin, cpp, csharp, php, perl, swift |
| Specialized | ai-agent, ai, cloud, frontend, mobile, python-data |
| Databases | mysql, postgres, mongodb, dynamodb |
| Other | architecture, writing, domain, obsidian |
| Special | lab (hidden; opt-in via `--workload lab`) |

Languages are split per-language because they are rarely combined — selecting `rust` does not pull in `go` assets. An asset is installed when its `workloads:` frontmatter intersects your active set.

## Examples

```bash
# Rust backend service, native Kiro review
node install.js cli --scope workspace --workload rust --review-backend kiro

# Cloud / IaC work (devops + FinOps MCP, Terraform, AWS skills)
node install.js cli --scope global --workload cloud

# IDE project: TypeScript + frontend
node install.js ide --workload typescript,frontend

# Everything (except lab)
node install.js cli --scope global --workload all
```

## Review backend

`--review-backend` controls code review only:

- `claude` (default) — route review through `peer-reviewer`, which calls terminal Claude Code (`claude -p`) for a cross-model second opinion.
- `kiro` — install native Kiro reviewer agents (code-reviewer, security-reviewer, language `*-reviewer`s).

Programming, build, and orchestrator agents are always Kiro-native regardless of this toggle.

## Global ↔ workspace inheritance

A workspace install inherits (skips) any file byte-identical to one already installed globally, so `--scope workspace` only adds what differs from your global baseline. Run `node install.js --status --scope global` to inspect the global manifest.

## Migrating from profiles

| Old profile command | New equivalent |
|---------------------|----------------|
| `install.js global` | `install.js cli --scope global --workload core` |
| `install.js developer` | `install.js cli --scope workspace --workload <your languages>` |
| `install.js backend` | `install.js cli --scope workspace --workload python,cloud` (etc.) |
| `install.js frontend` | `install.js ide --workload typescript,frontend` |
| `install.js full` | `install.js cli --scope global --workload all` |
