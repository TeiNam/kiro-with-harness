# Kiro Crew and the harness

`kiro-cli crew` appeared as a subcommand in CLI 2.x (`kiro-cli --help-all` lists it; verified on 2.16.1). It is a **launcher**, not a chat feature:

```
crew    Launch Kiro Crew, installing it if it is not already installed
        Options: -y/--yes (install without prompting); ARGS are forwarded to the Kiro Crew CLI
```

Kiro Crew is a separate product — an Apache-2.0, self-hosted, persistent agent runtime. It runs a **Gateway** (default port `5476`) that you reach from a desktop app, a web dashboard, the `kirocrew` CLI, or chat channels (Slack, Discord, Telegram, Teams, Webex, WeCom, WeChat). Multi-step tasks run unattended, cron jobs run on a schedule, and heartbeats monitor systems until something needs attention ([Quick start](https://kiro.dev/docs/crew/)).

## Why this matters to the harness

**Crew reads agent definitions from `~/.kiro/agents/` — the same directory the harness installs into.**

> For file-based configuration, create a JSON file ... Place it under `~/.kiro/agents/` or reference it from the dashboard.
> — [Agents](https://kiro.dev/docs/crew/capabilities/agents/)

So `node install.js cli --scope global` already populates Crew's agent source. The harness fleet (kiro-cli, architect, deep-researcher, devops, peer-reviewer, code-reviewer, security-reviewer, refactor-cleaner, translator-docs) becomes selectable as Crew agents without a separate integration step. The ponytail injection travels with them, because it lives in the `prompt` field rather than in steering.

Crew's default `kirocrew` agent uses model `auto`, which means "the model configured in kiro-cli", and `config.json` sets `agent.provider: "acp"` — Crew talks to a backend agent over the Agent Client Protocol, and `kiro-cli acp` exists (`--agent`, `--model`, `--effort`, `--agent-engine v1|v2|v3`). The harness therefore sits underneath Crew rather than beside it.

## Install and run

```bash
# Via the Kiro CLI launcher (installs Crew if absent)
kiro-cli crew            # add -y to skip the install prompt

# Or the documented one-liner (pipx, or a managed venv at ~/.kiro/crew/venv)
curl -fsSL https://download.crew.kiro.dev/cli.sh | sh

kirocrew setup           # interactive: data dir, agent, credentials
kirocrew doctor          # verify wiring
kirocrew gateway         # start the server -> http://localhost:5476
```

Configuration lives in `~/.kiro/crew/config.json`; channel tokens live in `~/.kiro/crew/.env` at mode 600. Two environment variables cannot live in the config file: `KIROCREW_HOME` (default `~/.kiro/crew`) and `KIROCREW_PORT` (default `5476`). Headless equivalent of the settings panel: `kirocrew config get|set|edit` ([Configuration](https://kiro.dev/docs/crew/configuration/)).

## Asset mapping

| Harness asset | Crew status |
|---|---|
| `~/.kiro/agents/*.json` (CLI global tier) | **Shared directory** — documented as the file-based agent location |
| Agent `model` pin (`claude-opus-5` etc.) | Crew's own default is `auto`; whether a pinned identifier is honored is **not stated in the docs** |
| `resources`, `toolsSettings`, `hooks`, `mcpServers` in harness JSON | Crew's documented example uses `name`/`description`/`model`/`prompt`/`tools` only; treatment of extra fields is **not stated** |
| `~/.kiro/steering/` (AGENTS.md, ponytail) | Crew has its own Steering surface ("workspace-level rules that every session inherits"); whether it reads the CLI global steering path is **not stated** |
| `~/.kiro/skills/` (138 packages) | Crew has its own Skills surface; harness skills use `workloads:` frontmatter, which is a harness convention — compatibility **unverified** |
| `.kiro/settings/mcp.json` | Crew manages MCP under Integrations and ships `kirocrew-core` + `kirocrew-cron`; merge behavior **not stated** |
| `.kiro/hooks/*.json` (IDE v1 hooks) | Crew has its own Hooks surface; schema overlap on the same directory is **unverified** |

Everything marked "not stated" needs a live check against an installed Gateway before you depend on it. Do not assume inheritance.

## Dividing work between Crew and the harness

Crew's subagents have concrete limits worth designing around ([Subagents](https://kiro.dev/docs/crew/features/subagents/)):

- Concurrency is auto-sized to the machine, usually 3–32; excess requests queue.
- Each subagent has a **30-minute hard timeout** and gets a stall warning after ~2 minutes of no activity (not auto-killed).
- Subagents inherit the main session's approval mode. Under Autopilot their tool calls are auto-approved — denied commands and sensitive-path blocks still apply.
- Results are retained about an hour after delivery.

| Send to Crew | Why |
|---|---|
| Recurring work (cron), heartbeat monitoring, webhooks | The harness has no scheduler; Crew persists across restarts |
| Long unattended multi-step tasks | Task Runner checkpoints and retries; nobody has to sit at the terminal |
| Work you want to reach from Slack/Telegram/phone | Only Crew exposes channels |
| Wide parallel fan-out | Runtime-enforced concurrency instead of an orchestrator convention |

| Keep in the harness | Why |
|---|---|
| Workload-scoped installs (`--dev=rust`, `--category=cloud`) | Crew has no workload selection model |
| Role-based model tiers (Opus/Sonnet/Haiku per agent) | Crew's default is a single `auto` model |
| **Cross-family review** (`peer-reviewer`, `cross-review.sh`) | Crew's self-review runs the same model family, so correlated blind spots stay correlated. This axis is not replaced |
| IDE-tier assets (Markdown agents, v1 hooks, fileMatch steering) | Crew is a CLI/Gateway runtime |
| The MCP proxy | Separate concern; Crew spawns its own MCP servers |

The overlap to be deliberate about is **lessons**: the harness has a `capture-lessons` hook plus a `lessons-learned` skill, and Crew turns corrections into durable lessons on its own. Running both against the same repo means two stores of the same knowledge with no reconciliation. Pick one owner per workspace.

## Security

The Gateway is a **local network service**. Before exposing it:

- Bind it locally and reach remote instances over an **SSH tunnel** — the desktop app supports exactly this ([Quick start](https://kiro.dev/docs/crew/)). Do not put the port on a public interface.
- `~/.kiro/crew/.env` holds channel bot tokens and is enforced at mode 600. Keep it out of git and out of snapshots you share.
- Autopilot auto-approves tool calls for a session, and subagents inherit that mode. Denied commands and sensitive-path blocks still apply, but Autopilot plus a chat channel means anyone who can post in that channel can drive tool execution — scope the channel to yourself.
- Sandbox mode, denied commands, and governance live under Settings → Security; review them before the first unattended run.

See [Security](https://kiro.dev/docs/crew/security/) for the full model.

## Status in this repo

The harness does **not** install or configure Crew. The relationship is one-directional and already in effect: install the CLI global tier and Crew can use those agents. Anything beyond that — steering inheritance, skill loading, MCP merge, hook coexistence — is unverified here because Crew is not installed in this environment. Verify with `kirocrew config get` and a real session before wiring automation to it.
