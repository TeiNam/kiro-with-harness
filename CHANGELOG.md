# Changelog

이 프로젝트의 주요 변경 사항을 **날짜별(YYYY-MM-DD)** 로 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르되, 버전 대신 날짜 섹션으로 정리합니다.

## 2026-06-20

### Changed
- Installer migrated from profile-based selection to tier (cli/ide) × workload model; profiles (global, developer, full, etc.) are removed and replaced by tier + workload options.
- Per-language workloads split per-language rules, reviewers, and build resolvers (python, rust, go, java, javascript, typescript, node, kotlin, cpp, csharp, php, perl, swift).
- README and README-KR updated to document tier × workload commands and new installation flow.
- CLI tier no longer writes/manages `settings/mcp.json` — the global MCP config is IDE-only, so CLI installs no longer overwrite it on reinstall.

### Added
- `--review-backend` toggle to control code review agent routing: `kiro` (native reviewers) or `claude` (peer-reviewer + terminal Claude Code cross-model review; default).
- Global ↔ workspace dedup via `.harness-manifest.json`; workspace installs skip files identical to global, reducing redundancy.
- Terraform + FinOps MCP curation: terraform-mcp-server, aws-pricing (cost estimation), aws-billing-cost-management (spend tracking); wired into devops agent.
- New skills: terraform-deployment (pinned Terraform versions), aws-cloud, aws-bedrock, terminal-ops, gitignore-generator; ported from the Claude harness: redis-patterns, prisma-patterns, duckdb-patterns, hexagonal-architecture, tech-writer, dashboard-builder, drawio-diagram, production-audit, cost-tracking, python-data-analysis.
- Workload tagging system for 119 skills; skills filtered by active workload intersection.
- Tech-writer agent bundle ported from the Claude harness (CLI JSON + IDE MD, Korean, writing workload): tech-writer-monolith, tech-doc-writer, doc-quality-detector, doc-clarity-reviewer, tech-fidelity-auditor.
- `pre-write-guard` CLI hook — deterministic `preToolUse` guard (hardcoded-secret + >800-line block, exit 2) embedded in `kiro-cli.json` and shipped as `agents/cli/hooks/pre-write-guard.sh`.
- `ponytail` (lazy senior dev mode) core steering rule, installed always-on in both CLI and IDE tiers to reduce token usage by favoring minimal code over boilerplate; adapted from DietrichGebert/ponytail.
- Workload scoping for general MCP servers via a `workloads` tag — `mcpydoc` → python, `cloudflare-docs` → cloud (devops); untagged servers remain universal.

### Removed
- Profile-based install commands (global, developer, full, writer, mobile, ai, backend, frontend, architect) — use tier + workload instead.
- `manifests/install-profiles.json` and `manifests/install-modules.json` (legacy reference only; not used by current installer).
- `token-optimizer` from the default MCP catalog (now a user-local opt-in only).
