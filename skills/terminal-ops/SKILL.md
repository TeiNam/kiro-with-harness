---
name: terminal-ops
description: Evidence-first repo execution workflow. Use when the user wants a command run, a repo checked, a CI/build failure debugged, or a narrow fix made and pushed — with exact proof of what was executed and verified. Distinguishes changed-locally / verified-locally / committed / pushed.
origin: harness
workloads: [cloud]
---

# Terminal Ops

Use this when the user wants real repo execution: run commands, inspect git state, debug CI or builds, make a narrow fix, and report exactly what changed and what was verified.

This skill is intentionally narrower than general coding guidance. It is an operator workflow for evidence-first terminal execution.

## Skill Stack

Pull these harness-native skills into the workflow when relevant:

- `verification-loop` — exact proving steps after changes
- `tdd-workflow` — when the right fix needs regression coverage
- `security-review` — when secrets, auth, or external inputs are involved
- `lessons-learned` — when a verified outcome (or repeated correction) should be captured into durable steering
- For CI / PR / release state, use the `gh` CLI directly (read-only first: `gh run list`, `gh pr view`).

## When to Use

- user says "fix", "debug", "run this", "check the repo", or "push it"
- the task depends on command output, git state, test results, or a verified local fix
- the answer must distinguish changed locally, verified locally, committed, and pushed

## Guardrails

- inspect before editing
- stay read-only if the user asked for audit/review only
- prefer repo-local scripts and helpers over improvised ad hoc wrappers
- do not claim **fixed** until the proving command was rerun
- do not claim **pushed** unless the branch actually moved upstream
- destructive git (force-push, reset --hard, clean -f) requires explicit user confirmation

## Workflow

### 1. Resolve the working surface
Settle: exact repo path, branch, local diff state, and requested mode (inspect / fix / verify / push).

### 2. Read the failing surface first
Before changing anything: inspect the error, the file or test, and git state. Use already-supplied logs/context before re-reading blindly.

### 3. Keep the fix narrow
Solve one dominant failure at a time. Use the smallest useful proving command first; only escalate to a bigger build/test pass after the local failure is addressed. If a command keeps failing with the same signature, stop broad retries and narrow scope.

### 4. Report exact execution state
Use exact status words: inspected / changed locally / verified locally / committed / pushed / blocked.

## Output Format

```text
SURFACE
- repo
- branch
- requested mode

EVIDENCE
- failing command / diff / test

ACTION
- what changed

STATUS
- inspected / changed locally / verified locally / committed / pushed / blocked
```

## Pitfalls

- do not work from stale memory when the live repo state can be read
- do not widen a narrow fix into repo-wide churn
- do not use destructive git commands without confirmation
- do not ignore unrelated local work

## Verification

- the response names the proving command or test
- git-related work names the repo path and branch
- any push claim includes the target branch and exact result
