# Hook Reference

Kiro hooks are event-driven automations defined in `.kiro/hooks/`. They trigger on IDE events and run agent prompts or shell commands.

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
