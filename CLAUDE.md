# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Kiro Harness is a profile-based installer that provisions curated rules, hooks, agents, skills, and MCP configs into Kiro IDE workspaces. It transforms source assets (markdown rules, agent definitions, skill docs) into Kiro's native formats: steering files (`.kiro/steering/`), hook files (`.kiro/hooks/`), and MCP settings (`.kiro/settings/mcp.json`).

## Key Commands

```bash
# Install a profile to current project (default: core)
node install.js developer
node install.js backend --target /path/to/project

# Install to global ~/.kiro
node install.js global

# Install specific modules only
node install.js --modules steering-core,hooks-quality

# List all profiles and modules
node install.js --list

# Check what's installed
node install.js --status
```

## Architecture

### Installer Pipeline (`install.js`)

The installer reads two manifest files and transforms source content into Kiro-native output:

1. **`manifests/install-profiles.json`** — Defines named profiles (global, core, developer, full, writer, mobile, ai, backend, frontend, architect), each mapping to a list of module IDs.
2. **`manifests/install-modules.json`** — Defines modules with source mappings and output targets. Each module specifies how to transform sources into Kiro steering/hooks/MCP.

The installer has three steering generators:
- **`steering-always`** — Copies markdown (stripping frontmatter) to `.kiro/steering/`. Supports `merge` to concatenate multiple source files (e.g., security rule + security-reviewer agent + security-review skill into one `security.md`).
- **`fileMatch`** — Reads rule files (coding-style, testing, patterns, security) from a source directory in sorted order, concatenates them, and wraps with `inclusion: fileMatch` frontmatter. Used for language-specific rules.
- **`manual`** — Wraps content with `inclusion: manual` frontmatter. Loaded on-demand via `#context-key`.

Hook generation converts declarative definitions (event + action + prompt) into `.kiro.hook` JSON files.

### Source Assets

- **`rules/`** — Organized as `common/` (language-agnostic, always-on) + per-language directories. Language-specific rules extend common ones. Each language dir has: coding-style, testing, patterns, hooks, security.
- **`agents/`** — 27 Kiro custom agent definitions (markdown). General-purpose (architect, planner, code-reviewer) + language-specific reviewers/build-resolvers + writing agents.
- **`skills/`** — 100+ skill libraries as markdown. Pure domain knowledge (no code dependencies). Categories: frameworks, infrastructure, DB guidelines, architecture, mobile, AI/LLM, quality workflows.
- **`mcp-configs/`** — MCP server catalog (`mcp-servers.json`).

Hooks are defined inline in `manifests/install-modules.json` (single source of truth). The installer generates `.kiro.hook` files from these definitions.

### Kiro Steering Inclusion Modes

- **`always`** — Loaded into every conversation (coding-style, security, testing, git-workflow, patterns, performance)
- **`fileMatch`** — Loaded only when files matching a glob pattern are open (language-specific rules)
- **`manual`** — Loaded on-demand when user references with `#` context key (framework/domain skills)

## Adding Content

- **New language**: Create `rules/<lang>/` with coding-style.md, testing.md, patterns.md, hooks.md, security.md. Add fileMatch entry to `steering-languages` module in `install-modules.json`.
- **New skill**: Create `skills/<name>/SKILL.md`. Add to appropriate module in `install-modules.json` with `inclusion: manual`.
- **New hook**: Add hook definition to the relevant hooks module in `install-modules.json` (hooks-core, hooks-quality, or hooks-guardrails).
- **New profile**: Add entry to `install-profiles.json` referencing existing module IDs.
- **New agent**: Create `agents/<name>.md` with YAML frontmatter (name, description).

## Conventions

- Language-specific rules override common rules when idioms differ (common = defaults, language = specifics).
- The `global` profile auto-targets `~/.kiro/` (strips `.kiro/` prefix from outputDir). Non-`.kiro/` modules (like `docs`) install relative to target without stripping.
- Skill files use `SKILL.md` as the entry point filename.
- The `merge` field in module sources concatenates full agent/skill content (after frontmatter stripping) into always-on steering (e.g., security.md merges rule + agent + skill).
- Hook actions are either `runCommand` (shell execution) or `askAgent` (AI-driven check). Quality hooks prefer `getDiagnostics` over terminal commands to avoid blocking.
- Re-running the installer cleans managed output directories before writing, preventing stale files from prior profiles.
- MCP config separates ready-to-use servers (`mcpServers`) from API-key-required servers (`_disabled`). Move servers from `_disabled` to `mcpServers` after configuring keys.
