---
name: agentic-loops
description: >
  Loop engineering for Kiro's autonomous features — how to drive `/goal` (iterative
  iterate-until-done loops, default 5 / `--max N`, self-verifying completion), Subagent Review
  Loops (reviewer rejects work back to the implementer until it passes), and DAG delegation
  (parallel sub-agents, verify-then-converge). Centers on writing goals as evidence-backed
  completion contracts (each success criterion verifiable by tool output, not narrative),
  designing RED→GREEN verification gates, and avoiding loop failure modes (declaring done
  without proof, no-progress thrashing, goal drift, cross-iteration context bloat). Use when
  setting up an autonomous `/goal` run, a review loop, or a multi-stage delegation pipeline.
  Triggers: /goal, loop engineering, autonomous loop, completion criteria, verify then converge,
  subagent review loop, max iterations, self-verification, agent keeps looping, when is it done.
origin: harness
workloads: [ai-agent]
---

# Agentic Loops (Kiro `/goal` & friends)

A loop is only as good as its **exit condition**. Kiro's `/goal` will iterate on its own, but
it stops well only when "done" is defined as criteria it can *verify with evidence* — not as the
model's feeling that it finished. This skill is about engineering that exit condition and
picking the right loop shape for the work.

## When to Activate

- Kicking off a `/goal` run and deciding its success criteria + `--max`
- An agent loops without finishing, or declares "done" while something is still broken
- Choosing between iterate-in-place (`/goal`), reviewer↔implementer loops, and parallel delegation
- Building a self-correcting pipeline (implement → review → fix → re-review)

## The three loop primitives in Kiro

| Primitive | Shape | Use when |
|---|---|---|
| **`/goal`** (CLI 2.7+) | One agent iterates until the goal is met (default 5, `--max N`), self-verifying before it stops | A single objective with checkable criteria — "make tests pass", "get the build green", "implement X to spec" |
| **Subagent Review Loops** (CLI 2.5+) | A reviewer stage rejects work back to the implementer and repeats until it passes | Quality gate on generated work — implement → `code-reviewer`/`peer-reviewer` → fix → re-review |
| **DAG delegation** | Independent stages run in parallel, results verified then converged | Work that fans out (research tracks, multi-file edits) — see `AGENTS.md` delegation rules |

Combine them: a `/goal` loop can delegate exploration to a sub-agent and use a reviewer loop as its verification gate.

## Write the goal as a completion contract

The single highest-leverage move: state success as **criteria each verifiable by concrete evidence**. The loop continues until every criterion is satisfied by tool output you can cite.

- **Good** (verifiable): "`npm test` exits 0 with all suites green", "`terraform plan` shows no diff", "the endpoint returns 200 for the three sample payloads", "no `ClientError` in the run log".
- **Weak** (unverifiable): "the code is correct", "it works now", "improved performance". The model can't prove these, so it either loops forever or fakes completion.

Rule: **belief, assumption, and narrative confidence are not evidence.** Only tool results (tests, build, command output, file contents) count. If a criterion can't be checked, rewrite it until it can.

## Loop design: RED → GREEN gate

1. **Define** criteria up front (the contract).
2. **Act** — make the smallest change that could satisfy an unmet criterion.
3. **Verify** each criterion with a tool; record which pass.
4. **If any fail** — diagnose the *root cause*, don't patch blindly (see no-progress rule below), then iterate.
5. **Complete only when every criterion is cited as passing.** Don't complete on a partial.

This mirrors TDD (`verification-loop`, `tdd-workflow`): the failing check is the loop's "RED", and the loop runs until "GREEN".

## Failure modes (and the fix)

- **Declaring done without proof** — the most common. Gate completion on cited tool output, not a summary sentence. (Kiro's `/goal` self-verification + the `goal complete` contract enforce this — lean on it.)
- **No-progress thrashing** — if an approach fails ~twice, stop incrementally patching. Diagnose the root cause and try a *fundamentally different* approach. Same error three times = the loop is stuck; change the plan, not the patch.
- **Goal drift** — the agent quietly redefines the objective to one it can meet. Re-anchor on the original criteria each iteration; if scope must change, surface it instead of silently widening.
- **Cross-iteration context bloat** — long loops fill the window with stale attempts. Compact at phase boundaries (`strategic-compact`) so the loop keeps the criteria + latest state, not every dead end.
- **Runaway loop** — always set `--max` as a safety cap. If it hits the cap unmet, report what's blocked + the evidence, don't loop silently.
- **Verifying with the wrong signal** — "it compiles" ≠ "it's correct". Match the check to the criterion (behavioral test, not just a build).

## Pair with

- **`peer-reviewer` / `code-reviewer`** as the verification stage of a review loop (cross-model second opinion reduces single-model blind spots).
- **`capture-lessons`** (Stop hook) so repeated corrections inside loops become durable lessons (`lessons-learned`), not re-learned every run.
- **`eval-harness` / `agent-eval`** when you need to *measure* loop output quality over time, not just pass/fail once.
- **Plan first** for multi-step goals — a stepwise plan gives the loop discrete, checkable milestones.

## Anti-patterns

- Starting a `/goal` run with a vague one-line objective and no success criteria.
- No `--max` cap on an open-ended goal.
- Treating "the agent said it's done" as done — without re-running the checks.
- Looping on the same failing approach instead of stepping back.
- Letting the loop's context grow unbounded instead of compacting at phase edges.

## Related

- `verification-loop` — the verification discipline a loop's GREEN gate uses
- `agentic-engineering` — broader agent-building principles
- `strategic-compact` — compact at phase boundaries to keep long loops lean
- `eval-harness` / `agent-eval` — measure loop output quality
- `tdd-workflow` — RED→GREEN as the canonical verifiable loop
- `AGENTS.md` (steering) — delegation / DAG / verify-then-converge rules
