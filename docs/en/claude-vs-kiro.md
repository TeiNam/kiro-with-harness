# Claude Code vs Kiro (CLI · IDE) Differences Guide

> Compares Claude Code and Kiro's **two forms — CLI and IDE** against their official docs,
> and summarizes what changes when applying a Claude Code-based harness to Kiro.
> First written 2026-03-22 · **Fully revised 2026-07-11** (Kiro CLI added, official docs re-verified)
>
> **Verified as of**: 2026-07-11. Product versions — Claude Code ~v2.1.x, Kiro IDE 1.0.116, Kiro CLI 2.12.x.
> Citations are consolidated in the final [Reference Sources](#6-reference-sources) section.

---

## 1. The Three Products: Relationship and Config Locations

| | Claude Code | Kiro CLI | Kiro IDE |
|---|---|---|---|
| **Form** | Terminal coding agent (+ IDE extension) | Terminal agent | VS Code-based agentic IDE |
| **Config root** | `.claude/`, `~/.claude/`, `CLAUDE.md` | `.kiro/`, `~/.kiro/` | `.kiro/`, `~/.kiro/` |
| **Launch** | `claude`, `claude -p` (headless) | `kiro-cli`, `kiro-cli chat` (legacy `q` also works) | Kiro app |
| **Lineage** | Anthropic native | **Successor to Amazon Q Developer CLI** | AWS native (VS Code fork) |

**Key fact 1 — Kiro CLI is the next update of the Amazon Q Developer CLI.** The official docs state verbatim: "Kiro CLI is the next update of the Q CLI" (released 2025-11-17, auto-migration 2025-11-24). Existing Q CLI workflows, subscription, and auth keep working; the entry point changed `q` → `kiro-cli` (`q`/`q chat` still work), the license changed Apache 2.0 → AWS IP License, and "Amazon Q rules" became "Kiro steering." In other words, the harness's `agents/cli/*.json` (agent-v1 schema) *is* the Kiro CLI agent format.

**Key fact 2 — Kiro CLI and IDE share the `.kiro/` convention.** Both forms use workspace `.kiro/` and home `~/.kiro/` (steering, agents, hooks, `settings/mcp.json`). Only the CLI-only paths differ: `~/.kiro/settings/cli.json` (CLI settings), `~/.kiro/prompts`. The `KIRO_HOME` env var overrides `~/.kiro`. Legacy Amazon Q paths (`~/.aws/amazonq/*`) are still read by the CLI for backward compatibility, but new config is written to `.kiro`, and when both exist `.kiro` wins.

**Q CLI → Kiro CLI config migration mapping** (official migrating-from-q):

| Config | Kiro | Legacy Amazon Q |
|---|---|---|
| MCP (user) | `~/.kiro/settings/mcp.json` | `~/.aws/amazonq/mcp.json` |
| MCP (workspace) | `.kiro/settings/mcp.json` | `.amazonq/mcp.json` |
| Agents (user) | `~/.kiro/agents` | `~/.aws/amazonq/cli-agents` |
| Agents (workspace) | `.kiro/agents` | `.amazonq/cli-agents` |
| Steering/rules (user) | `~/.kiro/steering` | `~/.aws/amazonq/rules` |
| Prompts (user) | `~/.kiro/prompts` | `~/.aws/amazonq/prompts` |

> Tool names were simplified too (old names still work): `fs_read→read`, `fs_write→write`, `use_aws→aws`, `execute_bash→shell`, `report_issue→report`. The default CLI agent is `kiro_default`.

---

## 2. Key Differences at a Glance

| Area | Claude Code | Kiro CLI | Kiro IDE |
|------|-------------|----------|----------|
| **Rules/Memory** | `CLAUDE.md` hierarchy + `.claude/rules/` + `@import` | `.kiro/steering/*.md` (shared) | `.kiro/steering/*.md` (always/fileMatch/manual/auto) |
| **Global rules** | `~/.claude/CLAUDE.md`, `~/.claude/rules/` | `~/.kiro/steering/` | `~/.kiro/steering/` |
| **AGENTS.md** | Supported via `@AGENTS.md` import | Supported | Supported (always included, no inclusion modes) |
| **Hooks** | `hooks` in `settings.json` (many events) | Agent-JSON embedded hooks + v3 standalone `.kiro/hooks/*.json` | `.kiro/hooks/*.json` v1 (PascalCase triggers) |
| **Hook handlers** | `command`·`http`·`mcp_tool`·`prompt`·`agent` | `command`·`agent` | `command`·`agent` |
| **Slash commands** | Built-in + custom (`.claude/commands/*.md`, unified with Skills) | Yes: `/model`,`/plan`,`/agent`,`/compact`, etc. | manual steering & subagents exposed as `/name` |
| **Custom agents** | `.claude/agents/*.md` | `.kiro/agents/*.json` (or v3 md) | `.kiro/agents/*.md` |
| **Built-in subagents** | Explore, Plan, general-purpose | built-in agents `kiro_default`/`kiro_help`/`kiro_planner` | context gathering, general purpose (2) |
| **Skills** | Agent Skills (`.claude/skills/*/SKILL.md`) | `.kiro/skills/` (exposed as slash commands) | Replaced by steering (auto/conditional/manual) |
| **Specs** | None | None | `.kiro/specs/` (requirements→design→tasks) — Kiro IDE exclusive |
| **MCP config** | `.mcp.json` (scope local/project/user) | `.kiro/settings/mcp.json` + agent-embedded | `.kiro/settings/mcp.json` |
| **Remote (HTTP) MCP** | stdio/SSE/HTTP + OAuth | HTTP + OAuth (clientSecret supported) | HTTP + OAuth (PKCE public only) |
| **Session/Context** | `/compact`·auto-compact·`/clear`·checkpoints (`/rewind`) | auto compaction + `/compact`·`/rewind`, auto-saved sessions | Managed internally by Kiro |
| **Model routing** | `/model` (persists), `CLAUDE_CODE_SUBAGENT_MODEL` | `/model` (→ saved to `cli.json`), `/effort` | model dropdown, reasoning effort, per-agent `model` |
| **Plugins** | Plugins & marketplaces | (none) | Powers (capability bundles) |

---

## 3. Detailed Differences by Area

### 3.1 Rules / Memory ↔ Steering

**Claude Code** loads rules through the `CLAUDE.md` hierarchy. Files discovered in order managed(policy) > user (`~/.claude/CLAUDE.md`) > project (`./CLAUDE.md` or `./.claude/CLAUDE.md`) > local (`./CLAUDE.local.md`) are **all concatenated** (not overridden). `@path` imports pull in other files (recursive to depth 4), and `.claude/rules/` supports path scoping via `paths:` frontmatter. `/memory` inspects/edits loaded files; `/init` generates a starter `CLAUDE.md`. Auto memory (`MEMORY.md`) is on by default.

**Kiro** (shared by CLI and IDE) uses **Steering**. `.kiro/steering/*.md` (workspace), `~/.kiro/steering/` (global; workspace wins). There are **four** inclusion modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `always` (default) | Included in every conversation | Coding style, security rules |
| `fileMatch` | Included when `fileMatchPattern` files are open | TypeScript (`**/*.ts`), Python (`**/*.py`) |
| `manual` | Invoked explicitly with `#name` (also exposed as `/name` slash in the IDE) | Review checklist, planning template |
| `auto` | Description-matched via `name`+`description` (skill-like) | Situation-detected knowledge |

Foundational files `product.md`·`tech.md`·`structure.md` are always included. **AGENTS.md** (the agents.md standard) is supported in `~/.kiro/steering/` or the workspace root and is always included (no inclusion modes). Reference files with `#[[file:path]]`.

```markdown
---
inclusion: fileMatch
fileMatchPattern: "**/*.ts,**/*.tsx"
---
# TypeScript Coding Rules
```

---

### 3.2 Hook System

All three support event-driven automation, but registration location, events, and handlers differ.

**Claude Code** — registered in the `hooks` key of `settings.json` (user/project/local/managed) plus plugin `hooks/hooks.json` and skill/agent frontmatter. Events expanded greatly: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, `Notification`, plus `SubagentStart`, `PostToolUseFailure`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`, `PostCompact`, and more. Handler types are also varied — `command`·`http`·`mcp_tool`·`prompt`·`agent` (no longer just "command + exit 2"). Command hooks receive event JSON on stdin and block with exit 2.

**Kiro CLI** — two mechanisms coexist.
- **Agent-JSON embedded hooks**: the `hooks` field of an agent file. Triggers `agentSpawn`/`userPromptSubmit`/`preToolUse` (can block)/`postToolUse`/`stop`; `matcher` matches **internal tool names** (`fs_read`,`fs_write`,`execute_bash`,`use_aws`).
- **v3 standalone hooks**: `.kiro/hooks/<name>.json` (`"version":"v1"`), applied to **all agents** in the workspace. `kiro-cli agent migrate` converts embedded → standalone.

**Kiro IDE** — `.kiro/hooks/*.json` (`"version":"v1"`). Triggers (PascalCase): `SessionStart`, `Stop`, `PreToolUse` (blocks), `PostToolUse`, `PreTaskExec` (blocks), `PostTaskExec`, `UserPromptSubmit` (blocks), `PostFileCreate`/`PostFileSave`/`PostFileDelete`. Actions are `{type:"command", command}` or `{type:"agent", prompt}`. Exit 0=success (SessionStart/UserPromptSubmit send STDOUT→context), 2=block (STDERR→agent).

**Kiro hook JSON example** (shared IDE/CLI v1 format)

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Security review before write operation",
      "trigger": "PreToolUse",
      "matcher": "write",
      "action": {
        "type": "agent",
        "prompt": "Verify this write complies with security rules: no hardcoded secrets, user input validated, SQL injection prevented"
      },
      "enabled": true
    }
  ]
}
```

> **Note**: to avoid terminal blocking, handle linting/type-checking with an `agent` action + diagnostics instead of a `command` action.

---

### 3.3 Agents / Subagents

**Claude Code** — `.claude/agents/*.md` (project) and `~/.claude/agents/` (user). Frontmatter `name`·`description` (required), `tools`/`disallowedTools`, `model` (`sonnet|opus|haiku|inherit`, default `inherit`), plus `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `isolation: worktree`, and more. Each subagent runs in an isolated context and returns only a summary. Built-ins: **Explore, Plan, general-purpose**. Invoke via `@agent-<name>` or `--agent`.

**Kiro CLI** — agents live in `.kiro/agents/*.json` (local)·`~/.kiro/agents/*.json` (global). JSON schema fields: `name`, `description`, `prompt` (inline or `file://`), `mcpServers`, `tools`, `allowedTools`, `toolsSettings`, `resources` (`file://`·`skill://`·knowledgeBase), `hooks`, `includeMcpJson`, `model`. Three tools-related fields matter:
- `tools` — which tools the agent can **see** (`read`, `@server`, `@server/tool`, `@builtin`, `*`)
- `allowedTools` — which run **without prompting** (glob patterns; bare `"*"` not allowed)
- `toolsSettings` — per-tool config (`write.allowedPaths`, `shell.allowedCommands`/`deniedCommands`/`autoAllowReadonly`, etc.)

Built-in agents `kiro_default`/`kiro_help`/`kiro_planner` (not editable). A Markdown-based v3 self-contained format also exists. `kiro-cli agent set-default <name>`, `kiro-cli chat --agent <name>`.

**Kiro IDE** — custom agents are `.kiro/agents/*.md`. Frontmatter `name` (required)·`description`·`tools` (tags `read`/`write`/`shell`/`web`/`subagent`/`context`/`@mcp`/`@builtin`/`*`)·`model` (default: inherits chat model)·`includeMcpJson` (default false)·`includePowers` (default false)·`mcpServers`·`permissions.rules` (allow|deny|ask, default ask). Built-in subagents are **exactly two** — **context gathering** (explore the project) and **general purpose** (parallelize work). Each runs in its own isolated context in parallel. **Constraints**: subagents **cannot access Specs**, and **Hooks do not fire within subagents**. Invoke via description auto-match, `/name`, or "use the X subagent."

---

### 3.4 Slash Commands

The previous edition's claim "Kiro has no slash commands" was **an error**. In reality:

- **Claude Code** — built-in commands (`/help`,`/init`,`/memory`,`/compact`,`/clear`,`/model`,`/config`,`/permissions`,`/mcp`,`/plugin`,`/agents`,`/hooks`,`/context`,`/rewind`,`/resume`,`/plan`,`/review`,`/security-review`, etc.) plus custom ones (`.claude/commands/*.md`). Custom commands are now **unified with Agent Skills** (both `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` create `/deploy`; skill wins if both exist). Some built-ins (`/init`,`/review`,`/security-review`) are exposed to the model via the **Skill** tool.
- **Kiro CLI** — a rich set of slash commands: `/model`, `/effort low|medium|high|xhigh|max`, `/context`, `/compact`, `/spawn`, `/plan`, `/agent`, `/mcp`, `/tools`, `/checkpoint`, `/goal`, `/rewind`, `/tangent`, `/knowledge`, `/usage`, etc. Skills in `.kiro/skills/` auto-appear as slash commands.
- **Kiro IDE** — instead of a separate command system, `manual` steering and subagents are exposed as **`/name`**.

---

### 3.5 Skills

- **Claude Code** — Agent Skills. Each skill directory has a `SKILL.md` (frontmatter `description` + body); supporting files load on demand. Locations `~/.claude/skills/` (personal)·`.claude/skills/` (project)·enterprise·plugin, precedence enterprise > personal > project. The model reviews a skill listing each turn and invokes relevant skills (model-invoked), or the user invokes `/skill-name`. Follows the open Agent Skills standard (agentskills.io).
- **Kiro CLI** — skills in `.kiro/skills/` are exposed as slash commands and referenced via `skill://` in an agent's `resources`.
- **Kiro IDE** — replaces a separate skill system with steering (`always`/`fileMatch`/`manual`/`auto`).

| Skill Type | Kiro Conversion |
|----------|-----------|
| Workflow quality (tdd, verification, etc.) | Steering `always` or `manual` |
| Framework (django, springboot, etc.) | Steering `fileMatch` (auto-detected) |
| Domain (api-design, security, etc.) | Steering `manual`/`auto` |

---

### 3.6 Specs (Kiro IDE Exclusive)

This feature exists only in Kiro IDE (not in the CLI or Claude Code). Under `.kiro/specs/`, each spec has three files — `requirements.md` (or `bugfix.md`)·`design.md`·`tasks.md` — for incremental development through **Requirements → Design → Tasks**. Feature Specs offer Requirements-First or Design-First; Quick Plan generates all three without approval gates. "Run all Tasks" builds a dependency graph and executes independent tasks concurrently in **waves**.

| Claude Code Workflow | Kiro Spec Application |
|---------------------|--------------|
| Planning format | Requirements section of a spec |
| TDD steps | Organize spec tasks as RED→GREEN→REFACTOR |
| Verification loop | Include verification steps in task completion criteria |

---

### 3.7 MCP

- **Claude Code** — `.mcp.json` (project root, committed to VCS). Transports stdio/SSE (deprecated)/HTTP (recommended), scopes local (default)/project/user, `${VAR}`·`${VAR:-default}` expansion, OAuth (HTTP/SSE, tokens auto-refreshed). Manage connections/auth with `/mcp`.
- **Kiro CLI** — loading priority **agent `mcpServers` > `.kiro/settings/mcp.json` (workspace) > `~/.kiro/settings/mcp.json` (global)**. Remote HTTP MCP supported (`url`, `type:"http"`), and OAuth is richer than the IDE — it also supports **`clientSecret` (confidential clients)**. Only changed servers hot-reload on save. `kiro-cli mcp add|remove|list|import|status`, `/mcp auth`.
- **Kiro IDE** — `.kiro/settings/mcp.json` (workspace) + `~/.kiro/settings/mcp.json` (global), merged with workspace precedence. Local keys `command`/`args`/`env`/`disabled`/`autoApprove`/`disabledTools`, remote keys `url`/`headers`/`oauth`. Remote HTTP MCP supported, but **public PKCE clients only** (no client_secret).

> This repo can centralize proxy-eligible MCP servers via a local **mcp-proxy**. See the installer's `--mcp-proxy` option and details in [mcp-reference.md](./mcp-reference.md) and `mcp-proxy/README.md`.

---

### 3.8 Model · Context · Session

**Claude Code** — the developer controls session/context/model directly. Context: `/compact` (+ `autoCompactEnabled` auto), `/clear`, checkpoints (`fileCheckpointingEnabled`, `/rewind` restores file/conversation snapshots). Model: `/model` (persists the choice as default; aliases `sonnet|opus|haiku|opusplan|sonnet[1m]`, etc.), `model` in `settings.json`, subagent model resolution `CLAUDE_CODE_SUBAGENT_MODEL` env > per-invocation > frontmatter > main. Headless `claude -p --output-format text|json|stream-json`.

**Kiro CLI** — **auto compaction** when the context window overflows (+ manual `/compact`); sessions auto-save every turn (`--resume`). `/model` (choice auto-saved to `~/.kiro/settings/cli.json`), `/effort low|medium|high|xhigh|max`, `/context show|add|remove|clear`. `kiro set-default cli|ide` switches the default entry point.

**Kiro IDE** — session persistence and context compaction are **managed internally** (no separate scripts). Model via the chat dropdown + per-model reasoning effort, overridable per agent via the `model` frontmatter.

**Model roster** (Kiro, excerpt as of 2026-07-11 — Cost is a multiple relative to Auto=1.0x):

| Model | Context | Multiplier | Notes |
|------|---------|------|------|
| Claude Opus 4.8 | 1M | 2.2x | 128K max output, Active |
| Claude Sonnet 5 | 1M | 1.3x | newest (Experimental) |
| Claude Sonnet 4.5 | 200K | 1.3x | free tier |
| Auto | — | 1.0x | model router (recommended) |
| Claude Haiku 4.5 | 200K | 0.4x | fast, good for subagents |

> The full roster is much larger (DeepSeek·MiniMax·GLM·Qwen, etc.). See kiro.dev/docs/models for the latest list and available regions.

---

### 3.9 Product-Exclusive Features

| Feature | Description |
|------|------|
| **Claude Code — Plugins & marketplaces** | `.claude-plugin/plugin.json` + `skills/`·`commands/`·`agents/`·`hooks/`·`.mcp.json` bundle. Install with `/plugin`, register marketplaces via `extraKnownMarketplaces` (official `claude-plugins-official`, `claude-community`). |
| **Claude Code — Output styles** | `outputStyle` setting / `~/.claude/output-styles`. Alters the system prompt's role/tone/format (Default/Proactive/Explanatory/Learning). |
| **Claude Code — Plan mode** | `--permission-mode plan`, `Shift+Tab`, `/plan`. Read-only research that proposes a plan. |
| **Kiro IDE — Autopilot/Supervised** | Autopilot (default): autonomous multi-file edits (view all changes/revert/interrupt). Supervised: per-hunk and per-file accept/reject on each edit. |
| **Kiro IDE — Powers** | On-demand capability bundles (`POWER.md` steering + MCP + optional hooks). Activate by keyword to avoid context overload. Partners include Datadog·Figma·Neon·Stripe. |
| **Kiro IDE — Agent Focus (experimental)** | Chat-first layout (v1.0+, top-right toggle): agent conversations centered, a parallel-sessions list, and an auxiliary panel for specs/diffs. It is a **UI view, not a context-scoping mode** — steering/agents/hooks/MCP apply unchanged and it introduces no `.kiro/` config. Switch back to IDE view for settings, Powers/skills, MCP management, terminal, and direct file editing. |
| **Kiro CLI — Parallel/session tools** | `/spawn` (parallel session), `/tangent`, `/goal`, `/knowledge`, auto-saved/resumable sessions. |

---

## 4. Harness (kiro-with-harness) Mapping

This repo's installer places assets by **tier (cli|ide) × workload**.

| Asset | CLI tier | IDE tier |
|------|----------|----------|
| Agents | `~/.kiro/agents/*.json` (agent-v1 JSON, verbatim) | `.kiro/agents/*.md` (Markdown) |
| Steering | `~/.kiro/steering/AGENTS.md`, `ponytail.md` (always) | `.kiro/steering/*.md` (always/fileMatch/manual) |
| Hooks | `~/.kiro/hooks/*.sh` + agent-embedded | `.kiro/hooks/*.json` (v1) |
| MCP | Agents carry their own `mcpServers` (no global mcp.json generated) | `.kiro/settings/mcp.json` (general + docker; proxy URLs with `--mcp-proxy`) |
| Skills | `~/.kiro/skills/` (progressive) | Converted to `manual` steering |

> **Note**: Kiro CLI also reads `~/.kiro/settings/mcp.json` (shared convention), but the harness CLI tier **intentionally** does not create a global mcp.json — agents carry their own `mcpServers` so as not to overwrite IDE settings. For full MCP/proxy behavior see [mcp-reference.md](./mcp-reference.md).

**Claude Code-exclusive assets that are hard to convert**

| Component | Reason |
|----------|------|
| `.claude/commands/*.md` (custom commands) | Kiro CLI has slash commands but a different format — move the knowledge to steering/skills |
| Claude Code hooks' `http`·`mcp_tool` handlers | Kiro hooks support only `command`·`agent` |
| `isolation: worktree` subagents | No equivalent concept in Kiro |
| Plugins & marketplaces | Partially replaced by Powers (IDE) |
| `CLAUDE.md` | Move to `AGENTS.md` (Kiro-supported) or steering |

---

## 5. Kiro Project Structure (After Conversion, IDE Tier Example)

```
.kiro/
├── steering/
│   ├── coding-style.md          (always)    ← rules/common/coding-style.md
│   ├── security.md              (always)    ← rules/common/security.md
│   ├── testing.md               (always)    ← rules/common/testing.md
│   ├── ponytail.md              (always)    ← rules/common/ponytail.md
│   ├── typescript-rules.md      (fileMatch: **/*.ts,**/*.tsx)
│   ├── python-rules.md          (fileMatch: **/*.py)
│   └── <skill>.md               (manual)    ← skills/<skill>/SKILL.md
├── hooks/                              ← v1 JSON, generated by the tier installer
│   ├── pre-write-guard.json            (PreToolUse/write → agent)
│   └── git-pipeline-guard.json         (PreToolUse/shell → agent)
├── agents/                       ← IDE: *.md / CLI: *.json
├── specs/                        ← Kiro IDE exclusive
└── settings/
    └── mcp.json                 ← Selected from mcp-configs/mcp-servers.json (proxy URLs with --mcp-proxy)
```

---

## 6. Reference Sources

All official docs, **verified 2026-07-11**.

**Claude Code** (docs.claude.com/en/docs/claude-code):
memory · settings · commands · skills · sub-agents · hooks · plugins · mcp · output-styles · permission-modes · checkpointing · model-config · headless

**Kiro** (kiro.dev/docs):
- Product/install: /docs/ · /docs/getting-started/installation/ · /docs/cli/
- Kiro CLI ↔ Q CLI: /docs/cli/migrating-from-q/ (2026-07-01)
- IDE: /docs/specs/ · /docs/steering/ · /docs/hooks/ · /docs/custom-agents/ · /docs/chat/subagents/ · /docs/mcp/configuration/ · /docs/models/ · /docs/chat/autopilot/ · /docs/powers/
- CLI: /docs/cli/custom-agents/configuration-reference/ · /docs/cli/v3/agent-config/ · /docs/cli/v3/hooks/ · /docs/cli/mcp/configuration/ · /docs/cli/reference/slash-commands/ · /docs/cli/reference/cli-commands/ · /docs/cli/chat/context/
