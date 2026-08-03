---
name: lessons-learned
description: Lightweight learning log that accumulates one-line lessons extracted from repeated corrections in a single file. When the same review findings, build failure patterns, or user corrections repeat, this prevents making the same mistake twice across sessions. Lighter than pattern-to-skill extraction, and explicit rather than automatic — a lesson is written only when a correction actually repeated.
inclusion: manual
workloads: [core]
origin: harness
---

# Lessons Learned (Lightweight Lesson Log)

One stage of the self-evolution mechanism. Extract short, reusable lessons one line at a time from repeated corrections — to avoid making the same mistake twice.

Pull in this steering manually (or via the `capture-lessons` hook suggestion flow) when starting work similar to past tasks, during review, or when fixing repeated failures.

## Boundaries with Other Learning Mechanisms in this Harness

| Mechanism | Weight | Output | When |
|-----------|--------|--------|------|
| **lessons-learned** (this skill) | Lightweight | One-line lessons (accumulated in one file) | When repeated corrections appear |
| `/learn` | Medium | 1 skill file/pattern | When a non-obvious problem is solved |

When lessons repeat stably, **promote to steering rules** — that's the final stage.

## How Items Are Added

- The `capture-lessons` hook (Stop event) **only suggests** one-line lessons. It does not automatically edit this file.
- Items are recorded **only after user confirmation**. This keeps user asset changes traceable.
- Each lesson is kept as one actionable line.
- Use the `/lessons` command to query the log, add manually, or promote to rules.

## Lesson Categories

- **Review findings** — Repeated code review findings (missing error handling, mutable changes instead of immutable updates, missing input validation, etc.).
- **Build failure patterns** — Repeated compile/lint/test failures and their root fixes.
- **User corrections** — Instructions the user had to give explicitly two or more times.

## Item Format

Add one line under the matching category:

```
- [YYYY-MM-DD] (category) <trigger / context> -> <lesson stated as a rule>
```

Examples:

```
- [2026-06-04] (build) bun test hung in watch mode -> Always run `bun test` (single-shot).
- [2026-06-04] (review) Repeated unhandled errors in async functions -> Wrap external calls in try/catch or Result.
```

## Lessons

### Review findings

<!-- Add review lessons one line at a time here -->

### Build failure patterns

<!-- Add build lessons one line at a time here -->

### User corrections

- [2026-06-20] (User corrections) Request for "hook that reacts when pushing via git push / GitKraken or other GUI" -> Claude hooks (PreToolUse/PostToolUse) only fire on Claude's own tool invocations. To cover user's direct git manipulation via terminal or GUI, use native git hooks (`core.hooksPath` + `post-commit`/`pre-push`).
