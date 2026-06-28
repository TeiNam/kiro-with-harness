# MCP Server Reference

Curated Model Context Protocol (MCP) server catalog. Source of truth: `mcp-configs/mcp-servers.json`.

- **CLI tier** installs nothing to `mcp.json` by default — CLI agents carry their own `mcpServers` (e.g. the devops agent embeds the AWS/Terraform servers). The global `~/.kiro/settings/mcp.json` is IDE-only.
- **IDE tier** writes `.kiro/settings/mcp.json` with the general + Docker servers that match active workloads.
- Keep **fewer than ~10 active servers** to preserve the context window.
- Secrets use `${VAR}` env references or `YOUR_*_HERE` placeholders — never commit real tokens.

## Built into Kiro (not in the catalog)

These are provided by Kiro itself, so the harness does not list them: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## General servers (workload-tagged)

| Server | Transport | Workload | Purpose |
|--------|-----------|----------|---------|
| cloudflare-docs | http | cloud | Cloudflare documentation search |
| mcpydoc | stdio (disabled by default) | python | Python package docs + code analysis (auto-detects venv) |

## DevOps / Infrastructure (Docker, cloud workload — used by the devops agent)

| Server | Image | Purpose |
|--------|-------|---------|
| terraform | hashicorp/terraform-mcp-server | Terraform Registry: provider/module docs + versions |
| aws-documentation | acuvity/mcp-server-aws-documentation | AWS docs search + recommendations |
| aws-core | acuvity/mcp-server-aws-core | Core AWS API operations (S3, EC2, IAM, …) |
| cloudwatch | mcp/cloudwatch-mcp-server | Metrics, alarms, Logs Insights |
| aws-ecs | acuvity/mcp-server-aws-ecs | ECS deploy/troubleshoot |
| aws-iam | mcp/iam-mcp-server | IAM users/roles/policies (sensitive — enable per task) |

## FinOps / Cost (Docker, cloud workload)

| Server | Image | Purpose |
|--------|-------|---------|
| aws-pricing | mcp/aws-pricing-mcp-server | Pre-deploy cost estimation (Price List API) |
| aws-billing-cost-management | mcp/billing-cost-management-mcp-server | Actual spend, budgets, Cost Explorer, optimization |

> Run `docker pull <image>` before first use. AWS servers need credentials via env (`AWS_REGION`/`AWS_PROFILE` + keys) or a mounted `~/.aws`.

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
