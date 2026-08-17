# MCP Server Reference

Curated Model Context Protocol (MCP) server catalog. Source of truth: `mcp-configs/mcp-servers.json`.

- **CLI tier** installs nothing to `mcp.json` by default — CLI agents carry their own `mcpServers` (the devops agent points at the devops proxy URLs below). The global `~/.kiro/settings/mcp.json` is IDE-only.
- **IDE tier** writes `.kiro/settings/mcp.json` with the general + DevOps servers that match active workloads.
- Keep **fewer than ~10 active servers** to preserve the context window.
- Secrets use `${VAR}` env references or `YOUR_*_HERE` placeholders — never commit real tokens.

## Two local proxies

The harness runs MCP servers behind [mcp-proxy](https://github.com/tbxark/mcp-proxy) containers (bundled in `mcp-proxy/`) rather than spawning a process per client. Clients connect over streamable HTTP: `{"type":"http","url":"http://localhost:<port>/<server>/mcp"}`.

| Proxy | Port | Config | Contents | When it starts |
|-------|------|--------|----------|----------------|
| General | 9090 | `mcp-proxy/config.json` | fetch, time, brave-search, exa, drawio, token-optimizer, obsidian | opt-in via `--mcp-proxy` (IDE tier) |
| DevOps | 9092 | `mcp-proxy/config.devops.json` | terraform + AWS servers (see tables below) | automatically whenever the `cloud` or `finops` workload is active, on either tier |

They are split for **credential isolation**: only the devops container mounts `~/.aws` (read-only), so general backends like brave/github/obsidian never sit in the same filesystem as your AWS profiles and SSO tokens. Both bind to `127.0.0.1` only — the endpoints are unauthenticated, so never widen the binding.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy   # both proxies
node install.js cli --scope global --workload=cloud        # devops proxy only
cd mcp-proxy && docker compose up -d devops-mcp-proxy      # manual start
```

The installer provisions each proxy it needs: it checks `docker ps`, runs `docker compose up -d <service>` when the container is absent, and skips when it is already running. No Docker, a stopped daemon, and `--dry-run` all degrade gracefully — the install still completes.

### Why the DevOps servers are not optional-proxy

They used to run as `docker run -i --rm <image>` per server, spawned by the client. That failed on first use: pulling each image took 14–20 seconds, well past the MCP initialization timeout, so **every** devops MCP server failed at once. A resident proxy pays that cost once, at container start.

### General proxy routing (`--mcp-proxy`, available when workload matches)

| Server | Workload |
|--------|----------|
| fetch, time | (universal, always) |
| brave-search, exa | writing |
| drawio | architecture, writing |
| token-optimizer | ai-agent, ai |
| obsidian | obsidian |

Proxied servers are excluded from the general/stdio output to prevent duplication.

### Servers outside the proxies

- **Built into Kiro** — github, context7, playwright, memory, sequential-thinking. Because Kiro provides these natively, they are not exposed as proxy URLs (the general proxy still serves github/context7 backends for non-Kiro clients).
- **General-purpose AWS API** — there is no MCP server for this. `awslabs.core-mcp-server` (the old `aws-core` entry) was yanked upstream with the reason "load individual MCPs", and its suggested replacement `awslabs.aws-api-mcp-server` both duplicates Kiro's built-in `use_aws` tool and unconditionally creates `~/.aws/aws-api-mcp/` at startup, which conflicts with the read-only credential mount. Use `use_aws` or the `aws` CLI — that also keeps mutations inside the devops agent's plan → approval → execute flow.
- **Host-specific local stdio** — GitKraken (local binary paths), playwright (local browser). Clients start these directly; the harness does not manage them.

> `--mcp-proxy` applies only to the IDE tier; the CLI tier does not generate mcp.json. The devops proxy is independent of that flag. If a proxy is not running, its URLs fail to connect — start it with `cd mcp-proxy && docker compose up -d <mcp-proxy|devops-mcp-proxy>`. Keep the total active servers well below ~10.

## Built into Kiro (not in the catalog)

These are provided by Kiro itself, so the harness does not list them: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## General servers (workload-tagged)

| Server | Transport | Workload | Purpose |
|--------|-----------|----------|---------|
| cloudflare-docs | http | cloud | Cloudflare documentation search |
| mcpydoc | stdio (disabled by default) | python | Python package docs + code analysis (auto-detects venv) |

## DevOps / Infrastructure (devops proxy :9092, cloud workload — used by the devops agent)

Backends are the **official AWS `awslabs` servers** run via `uvx` inside the proxy, at pinned versions. Earlier releases used third-party `acuvity/*` mirrors, which wrap the same awslabs sources in a `minibridge` process that defaults to HTTP mode and was unreliable over stdio.

| Server | Backend | Purpose |
|--------|---------|---------|
| terraform | `hashicorp/terraform-mcp-server:1.0.0` sidecar (internal HTTP) | Terraform Registry: provider/module docs + versions |
| aws-documentation | `uvx awslabs.aws-documentation-mcp-server@1.1.30` | AWS docs search + recommendations |
| cloudwatch | `uvx awslabs.cloudwatch-mcp-server@0.1.8` | Metrics, alarms, Logs Insights |
| aws-ecs | `uvx --from awslabs-ecs-mcp-server@0.1.34 ecs-mcp-server` | ECS inspection (`ALLOW_WRITE=false`) |
| aws-iam | `uvx awslabs.iam-mcp-server@1.0.25` | IAM users/roles/policies (sensitive — read-only, disabled by default) |

## FinOps / Cost (devops proxy :9092, finops workload)

| Server | Backend | Purpose |
|--------|---------|---------|
| aws-pricing | `uvx awslabs.aws-pricing-mcp-server@1.0.34` | Pre-deploy cost estimation (Price List API) |
| aws-billing-cost-management | `uvx awslabs.billing-cost-management-mcp-server@0.0.33` | Actual spend, budgets, Cost Explorer, optimization |

> **Credentials.** The devops proxy mounts `~/.aws` read-only and receives `AWS_PROFILE` / `AWS_REGION` (override via the shell or `mcp-proxy/.env`). SSO profiles must be refreshed on the host — `aws sso login --profile <name>` — because the container cannot write to a read-only mount. terraform, aws-documentation, and aws-pricing need no credentials.
>
> **Write policy.** The set is read-biased on purpose: aws-ecs runs with `ALLOW_WRITE=false`, and `awslabs.iam-mcp-server` is read-only unless started with `--allow-write` (its own default — verify with `uvx awslabs.iam-mcp-server@1.0.25 --help`), so that flag must never be added. Mutations belong to the devops agent's plan → approval → execute flow, not to an auto-approved MCP tool; `test/mcp-proxy.test.js` fails the build if a write flag appears.
>
> **Version updates.** Versions are pinned for reproducibility (a floating `@latest` re-resolves on every container start). To bump, edit `mcp-proxy/config.devops.json`, then `docker compose up -d --force-recreate devops-mcp-proxy`.

## Opt-in catalog (`_disabled` — copy into `mcpServers` to enable)

Highlights (full list in `mcp-configs/mcp-servers.json`):

| Server | Transport | Purpose |
|--------|-----------|---------|
| brave-search | stdio (`BRAVE_API_KEY`) | Independent web/local search (complements exa) |
| sentry | http (remote OAuth) | Sentry errors/issues — approve OAuth on first use |
| time | stdio (uvx) | Current time + IANA timezone conversion |
| exa-web-search | stdio (`EXA_API_KEY`) | Web search/research via Exa |
| vercel / railway | http / stdio | Deploy/hosting |
| supabase / clickhouse | stdio / http | Database & analytics |
| firecrawl | stdio (`FIRECRAWL_API_KEY`) | Web scraping/crawling |

> `brave-search`, `sentry`, and `time` were added to the opt-in catalog to mirror the upstream Claude harness; enable the ones you need and keep the active total under ~10.
