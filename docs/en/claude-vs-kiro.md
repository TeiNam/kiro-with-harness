# Kiro IDE vs Claude Code Differences Guide

> A document summarizing the key differences between Kiro IDE and Claude Code,
> and what changes when applying a Claude Code-based harness to Kiro
> Written: 2026-03-22

---

## 1. Key Differences at a Glance

| Area | Claude Code | Kiro IDE |
|------|-------------|----------|
| **Rules/Guidelines** | `rules/` directory, `CLAUDE.md` | `.kiro/steering/*.md` (always / fileMatch / manual) |
| **Hook System** | `hooks.json` (PreToolUse / PostToolUse / Stop, etc.) | `.kiro/hooks/*.kiro.hook` (fileEdited / preToolUse / postToolUse, etc.) |
| **Hook Input** | Receives JSON via stdin, can block with exit code 2 | Event metadata only, delegates judgment via `preToolUse` + `askAgent` |
| **Slash Commands** | `commands/*.md` (59 commands) | None — request the same tasks via conversation |
| **Custom Agents** | `agents/*.md` (sub-agent delegation) | None — only built-in agents (context-gatherer, general-task-execution) |
| **Skills** | `skills/*/SKILL.md` (auto-detected) | Auto/conditional/manual detection supported via `.kiro/steering/*.md` |
| **Specs** | None | `.kiro/specs/` (Requirements → Design → Implementation Tasks) — Kiro-exclusive feature |
| **MCP Configuration** | `mcp-configs/mcp-servers.json` | `.kiro/settings/mcp.json` |
| **Session Persistence** | Manually managed via `session-start.js` / `session-end.js` hooks | Managed by Kiro internally — no separate scripts needed |
| **Context Compression** | `/compact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Managed by Kiro internally |
| **Model Routing** | `/model sonnet`, `CLAUDE_CODE_SUBAGENT_MODEL` | Managed by Kiro internally |
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
| Blocking Method | Return exit code 2 | Delegates judgment to agent via `preToolUse` + `askAgent` |
| Async Execution | `async: true` option | None (runCommand is synchronous) |
| Tool Filter | Regex matcher (`Bash\|Edit\|Write`) | `toolTypes` categories (`read`, `write`, `shell`, `web`) or regex |
| Profile Control | `HOOK_PROFILE` environment variable | None — add/remove hook files directly |

**Kiro Hook JSON Example**

```json
{
  "name": "Lint after TS/JS file edit",
  "version": "1.0.0",
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx", "*.js", "*.jsx"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "A TS/JS file was edited. Use getDiagnostics to check for lint and type errors instead of running shell commands. Do NOT use executeBash or terminal for linting."
  }
}
```

> **Note**: Use `askAgent` + `getDiagnostics` instead of `runCommand` to prevent terminal blocking.

```json
{
  "name": "Security review before write operation",
  "version": "1.0.0",
  "when": {
    "type": "preToolUse",
    "toolTypes": ["write"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "Verify this write operation complies with security rules: no hardcoded secrets, user input validated, SQL injection prevented"
  }
}
```

---

### 2.3 Agents

Claude Code allows defining and delegating to custom sub-agents via `agents/*.md`.

Kiro supports **built-in agents only**:
- `context-gatherer` — Explores the codebase and identifies relevant files
- `general-task-execution` — General-purpose task execution

Custom agent definition files cannot be used directly in Kiro.
However, the **domain knowledge** contained in agents (checklists, workflows, patterns)
can be converted to steering to integrate into Kiro's default behavior.

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

Kiro **manages all of these internally**. No separate scripts or environment variables are needed.

---

## 3. Claude Code-Exclusive Components Not Available in Kiro

| Component | Reason |
|-----------|--------|
| `commands/` (59 slash commands) | Kiro has no slash command system |
| `agents/` (27 custom agents) | Custom agent definition not possible in Kiro |
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