# Hook Reference

Kiro IDE hooks are event-driven automations defined as **v1 JSON files** in `.kiro/hooks/*.json`. They trigger on IDE events and run an agent prompt or a shell command.

> **Reference source**: Hook schema and trigger names verified against the official Kiro IDE documentation ([kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/), [What's new in IDE 1.0](https://kiro.dev/docs/whats-new-1-0/)). Verification date: 2026-07-14.
>
> **IDE 1.0 format change**: The v1 JSON format (`.kiro/hooks/*.json`) replaces the legacy `.kiro.hook` / `.hook` format. Legacy hooks show an upgrade badge in the Agent Hooks panel and **do not execute until migrated** (click the badge to convert; the migrated hook activates immediately). The harness installer emits v1 JSON directly, so a fresh harness install needs no hook migration — only hooks you authored under 0.x need the panel upgrade. Legacy `Manual` hooks are replaced by manual steering files (`.kiro/steering/<name>.md` invoked as `/<name>`).

## v1 JSON Schema

Each file is a `{ "version": "v1", "hooks": [ ... ] }` wrapper. The harness ships one hook per file.

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Pre-Write Guard",
      "description": "Pre-write check: file size, secrets, doc location",
      "trigger": "PreToolUse",
      "matcher": "write",
      "action": { "type": "agent", "prompt": "..." },
      "enabled": true
    }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Identifier shown in the Agent Hooks panel / telemetry |
| `description` | No | Documentation only |
| `trigger` | Yes | When the hook fires (see triggers below) |
| `matcher` | No | Regex on tool name (PreToolUse/PostToolUse) or file path (file events). Omit to always match |
| `action` | Yes | `{ "type": "agent", "prompt": "..." }` or `{ "type": "command", "command": "..." }` |
| `timeout` | No | Seconds. Default 60. `0` disables. Ignored for agent actions |
| `enabled` | No | Default `true`. Set `false` to skip without deleting |

## Triggers

| Trigger | Fires when | Matcher | Can block? |
|---------|-----------|---------|-----------|
| `SessionStart` | Session begins | — | No |
| `Stop` | Agent completes its turn | — | No |
| `PreToolUse` | Before a tool executes | tool name (regex) | **Yes** (exit 2) |
| `PostToolUse` | After a tool executes | tool name (regex) | No |
| `PreTaskExec` | Before a spec task starts | — | **Yes** |
| `PostTaskExec` | After a spec task finishes | — | No |
| `UserPromptSubmit` | User submits a prompt | — | **Yes** |
| `PostFileCreate` | After the agent creates a file | file path (regex) | No |
| `PostFileSave` | After the agent saves a file | file path (regex) | No |
| `PostFileDelete` | After the agent deletes a file | file path (regex) | No |

For `PreToolUse`/`PostToolUse`, built-in tool categories usable as a matcher include `read`, `write`, `shell`, `web`, `spec`, and `*`. Source prefixes `@mcp`, `@builtin` are matched by regex.

> **Manual hooks removed**: the legacy `Manual` / `userTriggered` trigger no longer exists. Manual invocation is now a **manual steering file** (`.kiro/steering/<name>.md` with `inclusion: manual`), invoked as a `/<filename>` slash command.

## Installed Hooks (IDE tier)

The IDE tier installs 2 hooks — deterministic gates symmetric with the CLI tier, defined in `scripts/lib/tiers.js` (`IDE_HOOKS`). Per-event agent automations (review-on-stop, capture-lessons, changelog-on-commit) were removed in v2: reviews run on demand (code-reviewer agent, `cross-review.sh`), lessons live in the `lessons-learned` skill, and the CHANGELOG convention lives in repo steering. (`scripts/validate-counts.js` checks this number against the install plan, so it can't drift silently.)

### pre-write-guard
- Trigger: `PreToolUse`, matcher `write`
- Action: agent
- Checks (one pass): (1) SIZE — block writes over 800 lines, suggest splitting under 400; (2) SECRETS — flag hardcoded keys/tokens/passwords/connection strings; (3) DOC LOCATION — warn when a `.md`/`.txt` is created outside `docs/`, `.kiro/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE`.
- Reports issues only; passes silently otherwise.

### git-pipeline-guard
- Trigger: `PreToolUse`, matcher `shell`
- Action: agent
- Detects whether the shell call is `git push` and whether its target is the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, falling back to an existing `main`/`master`; with no refspec the target is the current branch). A push to the default branch is **blocked** with the pipeline spelled out: `git switch -c <type>/<slug>` -> `git push -u origin <branch>` -> `gh pr create --fill` -> `gh pr merge --squash --delete-branch`.
- Exceptions (not blocked): tag-only pushes (`--tags`), branch deletion (`--delete`/`-d`), local-only repos with no remote, and the user explicitly saying "directly to main". Non-default-branch pushes pass silently.
- The CLI tier ships the deterministic equivalent, `pre-push-guard.sh` (`exit 2`, bypass with `KIRO_ALLOW_MAIN_PUSH=1`). Policy text: `rules/common/git-workflow.md`.

## Adding or Disabling Hooks

- **Disable**: set `"enabled": false` in the hook file, delete the `.json` file from `.kiro/hooks/`, or drop the relevant workload from your install command.
- **Add a custom hook**: create a `.kiro/hooks/<name>.json` file following the v1 schema above, or use the Command Palette → "Kiro: Open Kiro Hook UI" → describe in natural language.

> **CLI tier note**: the CLI tier (`kiro-cli chat`) does not use these files. It embeds hooks inside the agent JSON (`hooks` field) and installs 2 CLI hook scripts as deterministic gates (`exit 2`), referenced by 2 preToolUse hooks in `kiro-cli.json`:
>
> | Script | matcher | Blocks on |
> |--------|---------|-----------|
> | `pre-write-guard.sh` | `fs_write` | hardcoded secrets, content over 800 lines |
> | `pre-push-guard.sh` | `execute_bash` | `git push` targeting the default branch (bypass: `KIRO_ALLOW_MAIN_PUSH=1`) |
>
> `cross-review.sh` is **not** a hook — it is an on-demand script (see below), so it is not counted here.

## On-demand 3-way cross-review (`--review-backend cross`)

Installing with `--review-backend cross` adds `cross-review.sh` under `.kiro/hooks/` (both tiers). It is an **on-demand command**, not an automatic hook — not every change needs a 3-way review, so it never runs on its own.

- Run `bash .kiro/hooks/cross-review.sh` (optionally `--base <branch>`) to cross-check uncommitted changes with **Codex** (`codex review --model gpt-5.6-sol --uncommitted`, which reads the git worktree directly — no code passed as a shell argument; override the model with the `CODEX_MODEL` env var, and if the pinned model is rejected it retries once without the pin) and **Claude Code** (`claude -p`, fed the diff via stdin). Kiro then synthesizes a Kiro + Claude + Codex review.
- Diff-guarded: exits silently when there are no changes. Each external CLI degrades gracefully when it is not installed or fails.
- For a synthesized, agent-driven pass, delegate to the `peer-reviewer` agent instead (same 3-way, with narrative synthesis and cleanup).
