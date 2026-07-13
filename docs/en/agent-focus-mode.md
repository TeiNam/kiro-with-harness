# Agent Focus Mode & the Harness

Kiro IDE 1.0 adds **Agent Focus Mode** (experimental) — a chat-first layout where you direct agents instead of editing code line by line. This guide maps Focus Mode to how the harness is built.

> Source: [Agent Focus Mode](https://kiro.dev/docs/experimental/focus-mode/), [What's new in IDE 1.0](https://kiro.dev/docs/whats-new-1-0/). Verified 2026-07-14.

## What Focus Mode changes

| | Editor View | Agent Focus Mode |
|--|-------------|------------------|
| Primary surface | Code editor | Chat |
| File editing | Direct | Through the agent |
| Sessions | One foreground | **Multiple parallel** |
| Specs | Sequential phases | Conversational, then formalized |

Toggle with the **Agent Focus** button (top-right). Sessions carry over between views and both can run at once. It is experimental — the interface and behavior may change.

## Why the harness fits Focus Mode

The harness is already built around *directing agents*, not hand-editing:

- A **role-based agent fleet** (reviewers, build-resolvers, `architect`, `deep-researcher`, `devops`, …) — each is a purpose-built agent you select per session from the agent selector.
- **tag-based tools** on every IDE agent (`read` / `write` / `shell` / `web`) so Focus Mode's capability prompts resolve cleanly per agent (least-privilege by role).
- An **orchestrator** (`kiro-cli`, CLI tier) that delegates independent work as a parallel DAG.

## Workflow picker → harness agents

Focus Mode's new-session **workflow picker** (Spec / Plan / Bug Fix / Quick Spec) sets the agent mode for that session. Pair each with harness agents:

| Workflow | What it does | Harness pairing |
|----------|--------------|-----------------|
| **Spec** | Structured feature development | `architect` (design) → implement → `code-reviewer` / language reviewer |
| **Plan** | Break an idea into a plan, no changes | `architect` for large structural calls; the built-in Plan Agent |
| **Bug Fix** | Investigate → diagnose → resolve | language `*-build-resolver` (build breaks) → `*-reviewer` |
| **Quick Spec** | Auto-generate requirements/design/tasks | start freeform, attach a spec once intent firms up |

## Parallel sessions: two distinct layers

Focus Mode's **multiple parallel sessions** and the orchestrator's **DAG delegation** are complementary but operate at different levels:

- **IDE Focus Mode parallel sessions** — several *top-level* agent sessions, each on a different task or workspace, monitored from the left panel by status (spinning / warning / paused).
- **CLI orchestrator DAG** — within *one* `kiro-cli` session, independent stages fan out to isolated sub-agents (`depends_on`-free stages run together), then converge. See [`AGENTS.md`](../../agents/AGENTS.md).

Use Focus Mode sessions for parallel **tracks you supervise**; use the orchestrator for parallel **sub-work inside a single track**.

## What still needs Editor / IDE view

Focus Mode intentionally routes some work back to the IDE view. These harness touchpoints live there:

- **MCP server management** — the harness writes `.kiro/settings/mcp.json`; edit/inspect it in IDE view.
- **Terminal & full git** — installer runs (`node install.js …`), `--status`, and commits.
- **Direct file editing and settings/preferences**.

## Install note

Focus Mode is a UI layer over the same `.kiro/` assets — the harness install is unchanged. Install the IDE tier as usual; agents appear in the selector, hooks run on their triggers, and steering/skills load the same way in either view. Because agents and `mcp.json` hot-reload (CLI 2.10+ / IDE 1.0), re-running the installer updates them without losing session context.
