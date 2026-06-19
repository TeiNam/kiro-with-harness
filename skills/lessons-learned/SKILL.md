---
name: lessons-learned
description: Designated learning log for the harness self-evolution mechanism. Accumulates one-line lessons from repeated corrections — recurring review findings, build failure patterns, and user corrections — so the same mistake is not repeated across sessions.
inclusion: manual
origin: harness
workloads: [core]
---

# Lessons Learned

A manual-inclusion learning log for the harness self-evolution mechanism (Kiro reinterpretation of `continuous-learning-v2`). It accumulates short, reusable lessons distilled from repeated corrections, so the same mistake is not made twice.

Pull this steering in manually (or via the `capture-lessons` hook proposal flow) when starting a task that resembles past work, when reviewing, or when fixing a recurring failure.

## How Entries Get Added

- The `capture-lessons` hook (`agentStop`) only **proposes** a one-line lesson; it never edits this file automatically.
- Entries are written **only after user confirmation**, keeping changes to user assets traceable.
- Keep each lesson to a single, actionable line. Promote a lesson into a permanent rule (steering) once it proves stable.

## Lesson Categories

- **Review findings** — recurring code-review issues (missing error handling, mutation instead of immutable update, missing input validation).
- **Build failure patterns** — repeated compile/lint/test failures and their root-cause fix.
- **User corrections** — explicit direction the user had to give more than once.

## Entry Format

Add one line per lesson under the matching category, using:

```
- [YYYY-MM-DD] (category) <trigger / context> -> <the lesson, stated as a rule>
```

Example:

```
- [2026-06-03] (build) Vitest watch mode hangs CI -> always run tests with `vitest run` (single-shot).
```

## Lessons

### Review findings

<!-- Add one-line review lessons here -->

### Build failure patterns

<!-- Add one-line build lessons here -->

### User corrections

<!-- Add one-line user-correction lessons here -->
