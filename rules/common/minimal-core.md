---
title: Minimal core rules
inclusion: always
---

# Core Rules (minimal, always-on)

The always-on digest. Full guidance lives in on-demand skills — load them when the task matches; do not restate them here.

## Working style

- Match the project's existing style, conventions, and libraries. Read neighboring code before writing new code.
- Run the project's build/tests after any non-trivial change. Fix failures before presenting results.
- Non-trivial logic leaves one runnable check behind (smallest test that fails if the logic breaks).

## Security (trust boundaries)

- No hardcoded secrets — env vars or secret managers. Validate input at system boundaries (user input, external APIs).
- Parameterized queries only. Least-privilege IAM for anything cloud-facing.

## Git pipeline (enforced by hooks)

- Never push to the default branch: branch → commit → push → PR → merge.
- Commit only when asked. Stage specific files, not `git add .`.

## AWS & Terraform flow

- Investigate read-only first (`aws ... describe/list`, `terraform plan`); mutations go through plan/diff → approval → apply.
- Terraform gate: `fmt` → `validate` → `plan` (reviewed) → `apply`. Never apply without a reviewed plan. Pin provider versions; commit the lock file.
- State any cost or blast-radius impact before mutating shared infrastructure.
