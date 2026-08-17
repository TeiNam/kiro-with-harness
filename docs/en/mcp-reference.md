# MCP Server Reference

Curated Model Context Protocol (MCP) server catalog. Source of truth: `mcp-configs/mcp-servers.json`.

- **CLI tier** installs nothing to `mcp.json` by default — CLI agents carry their own `mcpServers` (the devops agent embeds the on-demand stdio definitions below). The global `~/.kiro/settings/mcp.json` is IDE-only.
- **IDE tier** writes `.kiro/settings/mcp.json` with the general + DevOps servers that match active workloads.
- Keep **fewer than ~10 active servers** to preserve the context window.
- Secrets use `${VAR}` env references or `YOUR_*_HERE` placeholders — never commit real tokens.

## How servers are started

| Group | Transport | Lifetime | Started by |
|-------|-----------|----------|------------|
| General (fetch, time, brave-search, exa, drawio, token-optimizer, obsidian) | stdio, or HTTP via the local proxy with `--mcp-proxy` | proxy is resident when opted in | client, or `mcp-proxy` container on `:9090` |
| DevOps / FinOps (terraform + AWS servers) | **stdio, on demand** | process lives only while a tool is in use | client — host `uvx`, or `docker run -i --rm` for terraform |

The DevOps servers keep **nothing resident**: no container in `docker ps` when you are not using them, and no HTTP endpoint to secure. Requirements are `uv` on the host (`brew install uv`) and, for terraform only, Docker.

### Why they are stdio and not proxied

An earlier revision routed these through a resident proxy container on `:9092`. That existed to dodge a cold-start problem rather than to solve one: the old backends were `docker run` per call on unpinned `acuvity/*` images, and the **first image pull took 14–20 seconds** — past the MCP initialization timeout, so *every* devops MCP server failed at once.

Pinning the versions and moving to host `uvx` removes the pull entirely. Measured warm-cache handshake latency:

| Server | Latency |
|--------|---------|
| terraform (`docker run --rm`, pinned image) | 0.47s |
| aws-documentation | 0.58s |
| cloudwatch | 1.6s |
| aws-pricing | 2.0s |
| aws-iam | 2.1s |
| aws-billing-cost-management | 3.1s |
| aws-ecs | 4.9s |

So the proxy was unnecessary. Dropping it also removed an unauthenticated `:9092` endpoint that had `~/.aws` mounted into it, and it means SSO token refreshes (`aws sso login --profile <name>`) take effect immediately instead of being blocked by a read-only mount.

> **Cold start.** The first run of a pinned version downloads it into the uv cache (~30s worst case). Warm it up ahead of time if you want the first devops call to be fast:
> ```bash
> for p in awslabs.aws-documentation-mcp-server@1.1.30 awslabs.cloudwatch-mcp-server@0.1.8 \
>          awslabs.aws-pricing-mcp-server@1.0.34 awslabs.billing-cost-management-mcp-server@0.0.33 \
>          awslabs.iam-mcp-server@1.0.25; do uvx "$p" --help >/dev/null 2>&1; done
> docker pull hashicorp/terraform-mcp-server:1.0.0
> ```

## General proxy (`--mcp-proxy`, IDE tier)

Running a local [mcp-proxy](https://github.com/tbxark/mcp-proxy) instance (bundled in `mcp-proxy/`) centralizes the general servers in one container so multiple clients don't each spawn duplicates. `mcp.json` entries become `{"type":"http","url":"http://localhost:9090/<server>/mcp"}`.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
cd mcp-proxy && docker compose up -d mcp-proxy   # manual start
```

The installer auto-provisions it: it checks `docker ps`, runs `docker compose up -d mcp-proxy` when absent, skips when already running, and generates a **workload-filtered `config.generated.json`** so the proxy serves only the backends your active workloads need. No Docker, a stopped daemon, and `--dry-run` all degrade gracefully.

| Server | Workload |
|--------|----------|
| fetch, time | (universal, always) |
| brave-search, exa | writing |
| drawio | architecture, writing |
| token-optimizer | ai-agent, ai |
| obsidian | obsidian |

Proxied servers are excluded from the stdio output to prevent duplication. The proxy binds to `127.0.0.1` only and is unauthenticated — don't widen the binding.

### Servers outside the proxy

- **Built into Kiro** — github, context7, playwright, memory, sequential-thinking. Because Kiro provides these natively, they are not exposed as proxy URLs (the proxy still serves github/context7 backends for non-Kiro clients).
- **DevOps / AWS** — on-demand stdio, as described above.
- **General-purpose AWS API** — there is no MCP server for this. `awslabs.core-mcp-server` (the old `aws-core` entry) was yanked upstream with the reason "load individual MCPs", and its suggested replacement `awslabs.aws-api-mcp-server` duplicates Kiro's built-in `use_aws` tool. Use `use_aws` or the `aws` CLI — that also keeps mutations inside the devops agent's plan → approval → execute flow.
- **Host-specific local stdio** — GitKraken (local binary paths), playwright (local browser). Clients start these directly; the harness does not manage them.

> `--mcp-proxy` applies only to the IDE tier; the CLI tier does not generate mcp.json. Keep the total active servers well below ~10.

## Built into Kiro (not in the catalog)

These are provided by Kiro itself, so the harness does not list them: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## General servers (workload-tagged)

| Server | Transport | Workload | Purpose |
|--------|-----------|----------|---------|
| cloudflare-docs | http | cloud | Cloudflare documentation search |
| mcpydoc | stdio (disabled by default) | python | Python package docs + code analysis (auto-detects venv) |

## DevOps / Infrastructure (on-demand stdio, cloud workload — used by the devops agent)

Backends are the **official AWS `awslabs` servers** at pinned versions. Earlier releases used third-party `acuvity/*` mirrors, which wrap the same awslabs sources in a `minibridge` process that defaults to HTTP mode and was unreliable over stdio.

| Server | Backend | Purpose |
|--------|---------|---------|
| terraform | `docker run -i --rm hashicorp/terraform-mcp-server:1.0.0` | Terraform Registry: provider/module docs + versions |
| aws-documentation | `uvx awslabs.aws-documentation-mcp-server@1.1.30` | AWS docs search + recommendations |
| cloudwatch | `uvx awslabs.cloudwatch-mcp-server@0.1.8` | Metrics, alarms, Logs Insights |
| aws-ecs | `uvx --from awslabs-ecs-mcp-server@0.1.34 ecs-mcp-server` | ECS inspection (`ALLOW_WRITE=false`) |
| aws-iam | `uvx awslabs.iam-mcp-server@1.0.25` | IAM users/roles/policies (sensitive — read-only, disabled by default) |

## FinOps / Cost (on-demand stdio, finops workload)

| Server | Backend | Purpose |
|--------|---------|---------|
| aws-pricing | `uvx awslabs.aws-pricing-mcp-server@1.0.34` | Pre-deploy cost estimation (Price List API) |
| aws-billing-cost-management | `uvx awslabs.billing-cost-management-mcp-server@0.0.33` | Actual spend, budgets, Cost Explorer, optimization |

> **Credentials.** These run as host processes, so they read `~/.aws` directly and `AWS_PROFILE` / `AWS_REGION` come from your shell. `aws sso login --profile <name>` takes effect immediately. terraform, aws-documentation, and aws-pricing need no credentials.
>
> **Write policy.** The set is read-biased on purpose: aws-ecs runs with `ALLOW_WRITE=false`, and `awslabs.iam-mcp-server` is read-only unless started with `--allow-write` (its own default — verify with `uvx awslabs.iam-mcp-server@1.0.25 --help`), so that flag must never be added. Mutations belong to the devops agent's plan → approval → execute flow, not to an auto-approved MCP tool; `test/mcp-proxy.test.js` fails the build if a write flag appears.
>
> **Version updates.** Versions are pinned for reproducibility — a floating `@latest` re-resolves on every start, which is what made the cold-start failure possible. To bump, edit `mcpServersDevops.servers` in `mcp-configs/mcp-servers.json`, mirror it into `agents/cli/global/devops.json`, and re-run the install. A test asserts the two stay identical.

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
