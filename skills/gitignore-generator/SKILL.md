---
name: gitignore-generator
description: Generate or update a project .gitignore. Defaults to excluding agent/harness config dirs (.kiro/, .claude/, .codex/) plus secrets, OS/editor noise, and build output, then layers language-specific patterns. Use when initializing a repo, adding a .gitignore, or auditing what should be ignored. Triggers on "gitignore", new repo setup, or "exclude from git".
origin: harness
workloads: [core]
---

# .gitignore Generator

Produce a focused `.gitignore` that keeps agent config, secrets, build output, and OS/editor noise out of version control **by default**. Start from the agent/harness baseline, then layer language-specific patterns.

## When to Activate

- Initializing a new repository or adding a missing `.gitignore`
- Auditing an existing `.gitignore` for gaps (secrets, agent dirs, build output)
- Onboarding the harness into a project — `.kiro/` `.claude/` `.codex/` should not leak local/machine-specific state

## Baseline (always include)

Agent / harness config — local, often machine-specific or secret-bearing, excluded by default:

```gitignore
# AI agent / harness config
.kiro/
.claude/
.codex/
```

> **Team-shared exception:** if you deliberately commit shared steering/specs, un-ignore selectively rather than tracking everything — e.g.
> `!.kiro/` then `!.kiro/steering/` and `!.kiro/specs/`, while keeping `.kiro/settings/` ignored if it holds local MCP credentials.

Secrets & environment:

```gitignore
.env
.env.*
!.env.example
*.pem
*.key
id_rsa
secrets.*
```

OS / editor:

```gitignore
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
```

## Language layers (add only what applies)

- **Node**: `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `coverage/`, `*.tsbuildinfo`, `.turbo/`
- **Python**: `__pycache__/`, `*.pyc`, `.venv/`, `venv/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `*.egg-info/`
- **Rust**: `target/`, `**/*.rs.bk`
- **Go**: `bin/`, `*.test`
- **Java/Kotlin**: `target/`, `build/`, `.gradle/`, `*.class`
- **Terraform**: `.terraform/`, `*.tfstate`, `*.tfstate.*`, `crash.log`, `*.tfvars` (keep `*.tfvars.example`). **Do NOT ignore `.terraform.lock.hcl` — it is committed.**

## Procedure

1. Detect project type(s) from manifest files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `build.gradle`, `*.tf`).
2. Start from the baseline (agent dirs + secrets + OS/editor).
3. Append only the matching language layers.
4. If a `.gitignore` already exists, **merge** — add missing patterns, never remove the user's entries.
5. For files already tracked that should now be ignored, note they need `git rm --cached <path>` (do not run destructive git without confirmation).

## Pitfalls

- Ignoring `.terraform.lock.hcl` (must be committed for reproducible providers).
- Ignoring `.env.example` (teams need the template — keep the `!.env.example` negation).
- Blanket-ignoring `.kiro/` when the team shares steering — use selective un-ignore instead.
- Adding patterns for tools the project does not use — keep it lean.
