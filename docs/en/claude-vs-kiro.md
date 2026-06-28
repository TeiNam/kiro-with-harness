# Kiro IDE vs Claude Code Differences Guide

> A document summarizing the key differences between Kiro IDE and Claude Code,
> and what changes when applying a Claude Code-based harness to Kiro
> Written: 2026-03-22
>
> **Reference source** (verified 2026-06-03): custom agents & subagents — <https://kiro.dev/docs/chat/subagents/>; official model list (Opus 4.8 / Haiku 4.5) — <https://kiro.dev/docs/models/>; Opus 4.8 release — <https://kiro.dev/changelog/models/claude-opus-4-8-now-available/>; global steering & AGENTS.md — <https://kiro.dev/changelog/remote-mcp-and-global-steering/>

---

## 1. Key Differences at a Glance

| Area | Claude Code | Kiro IDE |
|------|-------------|----------|
| **Rules/Guidelines** | `rules/` directory, `CLAUDE.md` | `.kiro/steering/*.md` (always / fileMatch / manual) |
| **Global Steering** | `rules/` (project-level only) | `~/.kiro/steering/` (global) + project `.kiro/steering/` |
| **AGENTS.md Standard** | `CLAUDE.md` | `AGENTS.md` standard supported |
| **Hook System** | `hooks.json` (PreToolUse / PostToolUse / Stop, etc.) | `.kiro/hooks/*.json` v1 (PostFileSave / PreToolUse / PostToolUse / Stop, etc.) |
| **Hook Input** | Receives JSON via stdin, can block with exit code 2 | `command` action gets JSON via stdin + blocks with exit 2 (PreToolUse); `agent` action injects a prompt into the model |
| **Slash Commands** | `commands/*.md` (59 commands) | None — request the same tasks via conversation |
| **Custom Agents** | `agents/*.md` (sub-agent delegation) | Supported — `.kiro/agents/*.md` custom agents; built-in subagents: context-gathering, general-purpose |
| **Skills** | `skills/*/SKILL.md` (auto-detected) | Auto/conditional/manual detection supported via `.kiro/steering/*.md` |
| **Specs** | None | `.kiro/specs/` (Requirements → Design → Implementation Tasks) — Kiro-exclusive feature |
| **MCP Configuration** | `mcp-configs/mcp-servers.json` | `.kiro/settings/mcp.json` |
| **Session Persistence** | Manually managed via `session-start.js` / `session-end.js` hooks | Managed by Kiro internally — no separate scripts needed |
| **Context Compression** | `/compact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Managed by Kiro internally (automatic context compaction) |
| **Model Routing** | `/model sonnet`, `CLAUDE_CODE_SUBAGENT_MODEL` | Managed by Kiro internally; per-agent override via custom agent `model` frontmatter |
| **Hook Profile Control** | `HOOK_PROFILE=minimal\|standard\|strict` environment variable | None — add/remove hook files directly |

---

## 2. Detailed Differences by Area

### 2.1 Rules / Guidelines

Claude Code places rules in the `rules/` directory and `CLAUDE.md`, loading them into every conversation.

Kiro uses a **Steering** system. There are three loading modes:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `always` | Automatically included in every conversation | Coding style, security rules, TDD workflow |
| `fileMatch` | Included only when specific file patterns are opened | TypeScript rules (`**/*.ts`), Python rules (`**/*.py`) |
| `manual` | Included only when explicitly invoked with `#keyword` | Code review checklist, planning template |

```markdown
---
inclusion: fileMatch
fileMatchPattern: "**/*.ts,**/*.tsx"
---
# TypeScript Coding Rules
```

By leveraging `fileMatch` and `manual` modes, you can load only the knowledge you need without wasting tokens.

---

### 2.2 Hook System

Both platforms support event-driven automation, but the schema and behavior differ.

**Event Type Comparison**

| Claude Code | Kiro |
|-------------|------|
| `PreToolUse` | `preToolUse` |
| `PostToolUse` | `postToolUse` |
| `Stop` | `agentStop` |
| (none) | `fileEdited`, `fileCreated`, `fileDeleted` |
| (none) | `promptSubmit` |
| (none) | `preTaskExecution`, `postTaskExecution` |
| (none) | `userTriggered` |

**Hook Behavior Comparison**

| Item | Claude Code | Kiro |
|------|-------------|------|
| Input | Receives JSON via stdin | Event metadata only |
| Blocking Method | Return exit code 2 | `command` action returns exit code 2 (PreToolUse); `agent` action delegates judgment to the agent |
| Async Execution | `async: true` option | None (command actions are synchronous) |
| Tool Filter | Regex matcher (`Bash\|Edit\|Write`) | `matcher` regex on tool name; built-in categories `read`, `write`, `shell`, `web`, `spec` |
| Profile Control | `HOOK_PROFILE` environment variable | None — add/remove hook files or set `enabled: false` |

**Kiro Hook JSON Example** (IDE 1.0 v1 format — `.kiro/hooks/*.json`)

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Lint after TS/JS file edit",
      "trigger": "PostFileSave",
      "matcher": "\\.(ts|tsx|js|jsx)$",
      "action": {
        "type": "agent",
        "prompt": "A TS/JS file was edited. Use getDiagnostics to check for lint and type errors instead of running shell commands. Do NOT use executeBash or terminal for linting."
      },
      "enabled": true
    }
  ]
}
```

> **Note**: Use an `agent` action + `getDiagnostics` instead of a `command` action to prevent terminal blocking.

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
        "prompt": "Verify this write operation complies with security rules: no hardcoded secrets, user input validated, SQL injection prevented"
      },
      "enabled": true
    }
  ]
}
```

---

### 2.3 Agents

Claude Code allows defining and delegating to custom sub-agents via `agents/*.md`.

Kiro **supports custom agents**. Define them as `.md` files in `~/.kiro/agents` (global) or `<workspace>/.kiro/agents` (workspace). Kiro also ships **built-in subagents**:
- `context-gathering` — Explores the codebase and identifies relevant files
- `general-purpose` — General-purpose task execution

Each built-in subagent runs in its **own isolated context window**, and subagents are also exposed as **slash commands**.

**Custom agent frontmatter spec**

```yaml
---
name: my-reviewer          # required
description: When to use this agent
tools: [fs_read, grep_search]
model: claude-opus-4.8     # default: inherits the model selected in chat
includeMcpJson: true
includePowers: false
---
```

| Field | Required | Purpose |
|-------|----------|---------|
| `name` | Yes | Unique agent identifier |
| `description` | No | When the agent should be used |
| `tools` | No | Tools the agent may call |
| `model` | No | Model override (default: inherits the chat model) |
| `includeMcpJson` | No | Whether to load MCP server config |
| `includePowers` | No | Whether to load installed Powers |

**Constraints**: Subagents **cannot access Specs**, and **Hooks do not fire within subagents**.

**Agent model table**

| Model | Context Window | Max Output | Credit Multiplier | Availability |
|-------|----------------|------------|-------------------|--------------|
| `claude-opus-4.8` | 1M | 128K | 2.2x | experimental (us-east-1 / eu-central-1, Kiro CLI v2.5.0+) |
| `claude-haiku-4.5` | — | — | — | GA |

The **domain knowledge** contained in legacy agents (checklists, workflows, patterns)
can still be converted to steering as an auxiliary path:

| Claude Code Agent | Knowledge to Extract | Kiro Steering Conversion |
|-------------------|---------------------|--------------------------|
| `agents/code-reviewer.md` | Review checklist | `.kiro/steering/code-review-checklist.md` (manual) |
| `agents/security-reviewer.md` | OWASP Top 10, code pattern flags | Integrated into `.kiro/steering/security.md` (always) |
| `agents/tdd-guide.md` | TDD steps, edge case list | Integrated into `.kiro/steering/testing.md` (always) |
| `agents/build-error-resolver.md` | Error→fix mapping table | `.kiro/steering/build-error-fixes.md` (manual) |
| `agents/planner.md` | Planning format template | `.kiro/steering/planning-template.md` (manual) |

---

### 2.4 Slash Commands

Claude Code defines slash commands like `/tdd`, `/verify`, `/plan` via `commands/*.md`.

Kiro has no slash command system. You can request the same tasks via conversation,
or convert workflow logic to steering so Kiro follows it automatically.

---

### 2.5 Skills

Claude Code auto-detects `skills/*/SKILL.md` and activates them in appropriate situations.

Kiro also auto-detects skills through the steering system.
`always` mode loads at all times, `fileMatch` auto-loads on file pattern match, and `manual` is invoked with `#keyword`.
While the directory structure differs from Claude Code's skill structure (`skills/*/SKILL.md`), it provides equivalent auto-detection functionality.

| Skill Type | Kiro Conversion Method |
|------------|----------------------|
| Workflow quality skills (tdd-workflow, verification-loop, etc.) | `.kiro/steering/` (always or manual) |
| Framework skills (django-patterns, springboot-patterns, etc.) | `.kiro/steering/` (fileMatch — auto-detected) |
| Domain skills (api-design, security-review, etc.) | `.kiro/steering/` (manual) |
| Hook/script-dependent skills (continuous-learning, etc.) | Not convertible — dependent on Claude Code hook system |

---

### 2.6 Specs (Kiro-Exclusive Feature)

This feature exists only in Kiro. Claude Code does not have it.

Requirements → Design → Implementation tasks are structured in `.kiro/specs/` for incremental development.
Combining Claude Code's workflow knowledge with the spec system makes it even more powerful:

| Claude Code Workflow | Kiro Spec Application |
|---------------------|----------------------|
| Planner agent's planning format | Applied to the Requirements section of specs |
| tdd-guide's TDD steps | Organize spec tasks in RED → GREEN → REFACTOR order |
| verification-loop's 6-step verification | Include verification steps in spec task completion criteria |

---

### 2.7 Session / Context / Model Management

Claude Code gives developers direct control over all of these:
- Session persistence: `session-start.js` / `session-end.js` hooks
- Context compression: `/compact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
- Model routing: `/model sonnet`, `CLAUDE_CODE_SUBAGENT_MODEL`
- Cost tracking: `cost-tracker.js` hook

Kiro **manages session persistence and context compaction internally**. No separate scripts or environment variables are needed. Model routing is also managed by Kiro, but can be **explicitly overridden per agent** via the custom agent `model` frontmatter field.

---

## 3. Claude Code-Exclusive Components Not Available in Kiro

| Component | Reason |
|-----------|--------|
| `commands/` (59 slash commands) | Kiro has no slash command system |
| `agents/` (27 custom agents) | Directly portable to Kiro custom agents (`.kiro/agents/*.md`) |
| `scripts/hooks/session-*.js` | Kiro manages sessions internally |
| `scripts/hooks/suggest-compact.js`, `pre-compact.js` | Kiro has no `/compact` |
| `scripts/hooks/cost-tracker.js` | Claude Code-exclusive telemetry |
| `scripts/hooks/auto-tmux-dev.js`, `pre-bash-tmux-reminder.js` | Kiro has no tmux integration |
| `scripts/hooks/pre-bash-git-push-reminder.js` | Claude Code Bash matcher exclusive |
| `scripts/hooks/post-bash-*.js`, `post-edit-*.js` | Claude Code Bash/Edit matcher exclusive |
| `scripts/lib/hook-flags.js` | `HOOK_PROFILE` environment variable system exclusive |
| Original `hooks/hooks.json` (Claude Code) | Claude Code schema, incompatible with Kiro schema. Hooks are defined inline in `install-modules.json` |
| `skills/continuous-learning/`, `continuous-learning-v2/` | Dependent on Claude Code hook system + homunculus directory (domain knowledge partially convertible to steering) |
| `skills/strategic-compact/` | Kiro has no manual compaction (context management guidelines partially convertible to steering) |
| `CLAUDE.md` | Claude Code exclusive |
| `manifests/`, `install.js` | Claude Code installation system exclusive |

---

## 4. Kiro Project Structure (After Conversion)

```
.kiro/
├── steering/
│   ├── coding-style.md          (always)    ← rules/common/coding-style.md
│   ├── security.md              (always)    ← rules/common/security.md + agents/security-reviewer.md
│   ├── testing.md               (always)    ← rules/common/testing.md + agents/tdd-guide.md
│   ├── git-workflow.md          (always)    ← rules/common/git-workflow.md
│   ├── performance.md           (always)    ← rules/common/performance.md
│   ├── patterns.md              (always)    ← rules/common/patterns.md
│   ├── typescript-rules.md      (fileMatch: **/*.ts,**/*.tsx)
│   ├── python-rules.md          (fileMatch: **/*.py)
│   ├── golang-rules.md          (fileMatch: **/*.go)
│   ├── code-review-checklist.md (manual)    ← agents/code-reviewer.md
│   ├── planning-template.md     (manual)    ← agents/planner.md
│   ├── verification-loop.md     (manual)    ← skills/verification-loop/
│   └── build-error-fixes.md     (manual)    ← agents/build-error-resolver.md
├── hooks/                              ← Generated from install-modules.json
│   ├── pre-write-guard.kiro.hook       (preToolUse → askAgent: size+security+doc location)
│   ├── diagnostics-on-save.kiro.hook   (fileEdited → askAgent: getDiagnostics)
│   ├── post-write-review.kiro.hook     (postToolUse → askAgent: console.log + TODO)
│   ├── test-after-task.kiro.hook       (postTaskExecution → askAgent: tests)
│   └── review-on-stop.kiro.hook        (agentStop → askAgent: code review)
├── specs/                       ← Kiro-exclusive feature
└── settings/
    └── mcp.json                 ← Selected from mcp-configs/mcp-servers.json
```