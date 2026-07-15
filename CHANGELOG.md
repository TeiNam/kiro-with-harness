# Changelog

이 프로젝트의 주요 변경 사항을 **날짜별(YYYY-MM-DD)** 로 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르되, 버전 대신 날짜 섹션으로 정리합니다.

## 2026-07-16

### Added
- **archify 스킬** — 아키텍처·워크플로·시퀀스·데이터플로·라이프사이클 5종 다이어그램을 self-contained HTML(인라인 SVG, 다크/라이트 테마 토글, PNG/JPEG/WebP/SVG 내보내기)로 생성. plain-language 또는 Mermaid(flowchart/sequenceDiagram/stateDiagram) 입력 지원, Node 렌더러 + ajv 스키마 검증. `[architecture, writing]` 워크로드 태그(frontmatter 신설). MIT(Cocoon-AI 기반). skill-catalog(Architecture)·README 반영, 스킬 139 → 140.

## 2026-07-14

### Added
- **Agent Focus Mode 가이드**(`docs/{en,kr}/agent-focus-mode.md`) — IDE 1.0 에이전트 포커스 모드(병렬 세션·workflow picker Spec/Plan/Bug Fix/Quick Spec)를 하네스 에이전트 묶음·DAG 오케스트레이션에 매핑. README 버전 호환성에 세션 마이그레이션·Focus Mode 항목과 docs 링크(en/kr) 추가.
- **매니페스트 설치 버전 기록** — 설치 시 `.harness-manifest.json`에 `sourceVersion`(`package.json` version)을 기록한다. `node install.js --status`가 설치 버전과 현재 소스 버전을 semver 비교해 **outdated**(갱신 필요) / ahead / up-to-date 를 안내한다(`install.js`의 `compareSemver`). `test/tier-install.test.js`에 단위·e2e 테스트 추가.
- **frontier 모델 티어(오케스트레이터 전용)** — 기본 `claude-opus-4.8`(널리 가용), 설치 시 `--frontier-model=fable5`(또는 대화형)로 Mythos-class `claude-fable-5` 승격. `model-policy.js`에 frontier tier + `FRONTIER_UPGRADE`, `install.js`가 kiro-cli model 치환 + 매니페스트 `frontierModel` 기록, `validate-models.js` 4티어 출력. Kiro CLI에 비대화형 모델 목록 명령이 없어 명시 선택 방식(미가용 모델은 `chat.defaultModel`로 폴백).
- 신규 스킬 2종 — `aws-finops`(finops 워크로드; Cost Explorer·SP/RI·rightsizing·단위경제학·showback/chargeback), `analysis-methodology`(python-data; 분석 판단층). 스킬 137 → 139.

### Changed
- **IDE 에이전트 tag-based tools 정합** — tools 누락 23종에 역할별 최소권한 태그 부여(리뷰어=`read`, build-resolver·e2e-runner·refactor-cleaner=`read/write/shell`, architect·deep-researcher=`read/web`, content-creator·article-writer=`read/write`). IDE 에이전트 32종 전부 IDE 1.0 custom agent 규격(tag-based tools) 정합.
- **hook-reference(en/kr)** — 훅 마이그레이션 흐름(레거시 배지 업그레이드, `Manual`→매뉴얼 steering 파일) 명확화 + verification date 갱신. 하네스는 v1 JSON을 직접 emit하므로 신규 설치는 훅 마이그레이션 불필요.
- **3-tier 카테고리 트리** 도입 — `install-menu.js` → `categories.js`(대분류→중분류→소분류 + CLI 플래그 파서). `cloud`에서 `finops`, `writing`에서 `research`/`report` 워크로드 분리.
- **워크로드별 프록시 config 필터링** — `proxy-config.js`가 활성 워크로드에 필요한 백엔드만 담은 `mcp-proxy/config.generated.json`을 생성.

## 2026-07-09

### Added
- **3-tier provider-agnostic model routing** — `scripts/lib/model-policy.js` is the new single source of truth mapping every agent role to a capability tier: deep-reasoning → `claude-opus-4.8` / `gpt-5.5`, balanced → `claude-sonnet-5` / `gpt-5.4`, cost-optimized → `claude-haiku-4.5` / `gpt-5.4`. `balanced` is the default tier.
- `scripts/apply-model-policy.js` — applies the tier→identifier map to all agent files (line-preserving; `--provider=anthropic|openai`, `--dry-run`). Idempotent; fails fast on unknown flags/providers and on corrupt/field-missing agent files.
- `docs/{en,kr}/model-routing.md` — tiers, per-agent assignment, hook→tier guidance, the model-ID (`/model`) dot-vs-hyphen caveat, and the OpenAI GPT-5.5/5.4 forward plan (`--provider=openai` switch).
- New skills (7): `humanize-writing` (human-like web/long-form writing), `pdf-generation`, `pptx-generation`, `docx-generation`, `xlsx-generation` (document deliverables), plus popular gap-fillers `mcp-builder` and `brand-guidelines`. Skill count 130 → 137.
- `test/model-policy.test.js` — unit tests for the SSOT policy (classification, tier identifiers, providers) and the applier's argument contract.

### Changed
- Balanced tier introduced: **47 coding-volume agents** (code-reviewer, refactor-cleaner, all language reviewers/build-resolvers, e2e-runner, database-reviewer, doc/tech writers) repinned from `claude-opus-4.8` → `claude-sonnet-5`. Deep-reasoning roles (kiro-cli, architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler) stay on Opus; cost-optimized (translator-docs, article-writer, content-creator) stay on Haiku.
- `validate-models.js` now validates all three tiers (was two); `MODEL_POLICY` in `model-detect.js` derives its identifiers from the SSOT to prevent drift; `workloads.js` gains classification rules for the new skills.
- README/README-KR Models section reworked to the 3-tier table (Opus/Sonnet/Haiku) with the OpenAI forward mapping and a Model routing doc link; `agents/AGENTS.md` model policy and `docs/{en,kr}/skill-catalog.md` updated; `claude-api`, `aws-bedrock`, and `cost-aware-llm-pipeline` skills bumped from `claude-sonnet-4-6` to `claude-sonnet-5`.

## 2026-06-29

### Changed
- **IDE hooks migrated to the IDE 1.0 v1 JSON format** (`.kiro/hooks/*.json`, `{version:"v1", hooks:[...]}` with `trigger`/`matcher`/`action`), replacing the legacy `.kiro.hook` (`when`/`then`/`askAgent`) format that no longer executes on Kiro IDE 1.0. Source generator `scripts/lib/tiers.js` (`hookJson` + `HOOK_TRIGGER` event mapping) and the dogfood `.kiro/hooks/` files updated; `docs/{en,kr}/hook-reference.md` rewritten to the v1 schema and the actual installed hook set.
- Synced DB guideline skills from the Claude harness: `mysql-guideline` (+ `mysql_dev-practices.md`, `mysql_jdbc-driver.md`), `postgres-guideline`, `mongodb-guideline`, `dynamodb-guideline`, `lessons-learned`, `drawio-diagram` translated to English (startup-loaded `description` token savings); `drawio-diagram` keeps its `[architecture, writing]` workload tag.
- README/README-KR: model section reworded to "tuned for three Kiro models" (`claude-opus-4.8` default, `claude-sonnet-4.6`, `claude-haiku-4.5`); added a "Kiro Version Compatibility (CLI 2.10 / IDE 1.0)" section (v1 hooks, default resource inheritance + `chat.disableInheritingDefaultResources`, hot-reload) and a model-ID-format note.
- `docs/{en,kr}/claude-vs-kiro.md`, `migration-from-claude.md`, `profile-guide.md`: hook examples and references updated to v1 JSON.

### Added
- New skills ported from the Claude harness: `rdbms-naming` (`[mysql, postgres]`), `mongodb-patterns` (`[mongodb]`), `mle-workflow` (`[ai, python-data]`), `git-workflow` (`[core]`).
- New skill `aws-sdk-patterns` (`[cloud]`) — boto3/aioboto3 + AWS SDK for JS v3 + AWS CLI v2 usage (credential chain, retries/adaptive mode, paginators/waiters, ClientError handling, async, JS v3 command/middleware, CLI `--query`/SSO/pager). Fills the SDK/CLI coding layer below `aws-cloud` (neither harness had it).
- Ported `vite-patterns` (`[frontend]`, 12 files) — Vite 6/7 config, plugins, HMR, env vars, dev proxy, library mode, pre-bundling, build optimization, security.
- `code-reviewer` (CLI JSON + IDE MD) gained a "Focused Review Lenses" section (silent failures / type design / comments), mirroring the Claude harness consolidation of the three micro-reviewers.
- MCP catalog `_disabled`: `brave-search`, `sentry`, `time` as opt-in entries.
- `rules/README.md`: documented workload tagging + the IDE `fileMatch` auto-load convention (Kiro equivalent of Claude's `paths:` frontmatter).
- Skill count 119 → 125 (README updated).

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
