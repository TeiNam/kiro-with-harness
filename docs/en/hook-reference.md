# Hook Reference

Kiro hooks are event-driven automations defined in `.kiro/hooks/`. They trigger on IDE events and run agent prompts or shell commands.

> **Reference source**: Hook event types and schema verified against the official Kiro documentation ([kiro.dev/docs/hooks/types](https://kiro.dev/docs/hooks/types/)). Verification date: 2026-06-03.

## Hook Event Types

Kiro supports the following hook event (trigger) types. Each hook definition declares exactly one `event`. The harness hooks documented below use a subset of these.

| Event Type | Triggers When |
|------------|---------------|
| `promptSubmit` | The user submits a prompt |
| `agentStop` | The agent completes its turn and finishes responding |
| `preToolUse` | The agent is about to invoke a tool |
| `postToolUse` | The agent has invoked a tool |
| `fileCreated` | A file matching the configured patterns is created |
| `fileEdited` | A file matching the configured patterns is saved |
| `fileDeleted` | A file matching the configured patterns is deleted |
| `preTaskExecution` | A spec task is about to start (status changes to in_progress) |
| `postTaskExecution` | A spec task completes (status changes to completed) |
| `userTriggered` | The hook is run manually on demand |

For `preToolUse` and `postToolUse`, target tools are selected by name. Built-in categories include `read`, `write`, `shell`, `web`, `spec`, and `*` (all tools). Source prefixes `@mcp`, `@powers`, and `@builtin` are matched by regex.

## Available Hooks

### pre-write-guard (hooks-core)

- Event: `preToolUse` (write tools)
- Action: `askAgent`
- Checks:
  1. SIZE — Blocks writes exceeding 800 lines. Suggests splitting into modules under 400 lines.
  2. SECRETS — Flags hardcoded API keys, tokens, passwords, or connection strings.
  3. DOC LOCATION — Warns if `.md` or `.txt` files are created outside `docs/`, `.kiro/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, or `LICENSE`.
- Behavior: Only reports issues found. Passes silently if all checks clear.
- Note: This hook intercepts every write operation. The agent must acknowledge the check and retry the write.

### review-on-stop (hooks-quality)

- Event: `agentStop`
- Action: `askAgent`
- Checks:
  1. Security issues
  2. Proper error handling
  3. Leftover `console.log` statements
  4. Tests needed for changes
- Behavior: Reports issues only. No output if everything looks good.

### diagnostics-on-save (hooks-quality)

- Event: `fileEdited` (`*.ts`, `*.tsx`, `*.js`, `*.jsx`)
- Action: `askAgent`
- Behavior: Runs `getDiagnostics` on edited TS/JS files. Reports lint errors and type errors. Does not use terminal.

### test-after-task (hooks-quality)

- Event: `postTaskExecution`
- Action: `askAgent`
- Behavior: Reminds user to run tests manually after a spec task completes. Does not execute tests directly.

### post-write-review (hooks-guardrails)

- Event: `postToolUse` (write tools)
- Action: `askAgent`
- Checks:
  1. `console.log` statements (flags for removal; ignores `console.error`/`console.warn`)
  2. New `TODO`/`FIXME`/`HACK` comments (suggests creating tracked issues)
- Behavior: Only reports if issues found.

## Hook Modules

| Module | Hooks included | Installed by profiles |
|--------|---------------|----------------------|
| hooks-global | pre-write-guard, review-on-stop | `global` |
| hooks-core | pre-write-guard | `core`, `developer`, `full`, `writer`, `mobile`, `ai`, `backend`, `frontend`, `architect` |
| hooks-quality | diagnostics-on-save, review-on-stop, test-after-task | `developer`, `full`, `mobile`, `ai`, `backend`, `frontend` |
| hooks-guardrails | post-write-review | `developer`, `full`, `backend`, `frontend` |

## Troubleshooting

**"Why is my write being blocked?"**
The `pre-write-guard` hook intercepts all write tool calls. If you see an interception message, the agent needs to verify the checks pass and retry. This is normal behavior.

**"How do I disable a hook?"**
Delete the `.kiro.hook` file from `.kiro/hooks/`, or remove the hook module from your install command.

**"Can I add custom hooks?"**
Yes. Create a `.kiro.hook` JSON file in `.kiro/hooks/` following the hook schema, or use the Kiro command palette → "Open Kiro Hook UI".
