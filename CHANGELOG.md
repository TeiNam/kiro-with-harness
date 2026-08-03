# Changelog

이 프로젝트의 주요 변경 사항을 **날짜별(YYYY-MM-DD)** 로 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르되, 버전 대신 날짜 섹션으로 정리합니다.

## 2026-08-01

상위 프로젝트(`my_harness_for_claude_code` v0.3.0)의 변경을 Kiro 하네스에 맞게 반영했습니다. 문자 그대로 옮기지 않고, Kiro 쪽 실측 근거가 있는 것만 적용했습니다(아래 "적용하지 않은 것" 참조).

### Changed

- **Fable 티어 제거 — Opus 5 가 천장** — `model-policy.js`에서 `frontier` 티어와 `FRONTIER_FALLBACK`을 제거해 4-티어 → **3-티어**(`deep-reasoning` / `balanced` / `cost-optimized`)로 정리. `kiro-cli` 오케스트레이터는 `deep-reasoning`(`claude-opus-5`)으로 이동 — 천장 위의 티어를 찾지 않는다. `--frontier-model` 플래그와 대화형 설치의 오케스트레이터 모델 프롬프트를 완전히 제거하고, 매니페스트 키를 `frontierModel` → `orchestratorModel`로 변경.
- **천장 위로 가는 두 축 신설** — (1) **안으로**: `EFFORT_LADDER`(`low`→`medium`→`high`→`xhigh`→`max`)·`ROLE_EFFORT`·`effortForRole()`·`escalateEffort()`. Kiro가 실제로 지원하는 손잡이(`kiro-cli chat --effort`, `chat.modelDefaults`의 `output_config.effort`)에 매핑되며, effort는 에이전트 JSON 필드가 아니라 세션/설정 값이라 설치기가 **실행할 명령을 출력**한다(`printEffortHint`). (2) **옆으로**: `CROSS_FAMILY` — 다른 모델 패밀리로 넘길 기준 4개, 하네스에 남길 기준 3개, 그리고 철칙 "**외부 패밀리를 유일한 독자로 두지 않는다**". `escalateEffort('max')`가 `null`을 반환하는 것이 곧 옆으로 가라는 신호다.
- **cross-review Codex 모델 핀 제거** — `gpt-5.6-sol` 고정을 걷어내고 로컬 CLI 기본 모델을 쓴다. 특정 모델에 핀하면 그 모델이 없거나 이름이 바뀔 때 조용히 실패한다.
- **`lab` 워크로드 키 제거** — `skills/*/SKILL.md` 어디에도 `workloads: [... lab ...]` 태그가 없어(실측 0개) `--workload=lab`이 아무것도 설치하지 않는 죽은 키였다. `treeCoverage()`의 lab 예외도 함께 제거해 이제 **모든** 워크로드가 카테고리 트리에서 도달 가능해야 한다(커버리지 예외 없음). 상위 프로젝트는 이 키를 유지했지만 그쪽엔 lab 태그 자산이 7종 있다 — Kiro엔 없다.
- **apple 허위 3분할 제거** — `--dev-apple=core|platform|product` 세 소분류가 모두 동일하게 `['swift']`로 수렴해 선택이 아무 차이를 만들지 못했고, `product` 라벨("App Store/성장/법무")은 **존재하지 않는 자산을 약속**했다. 세분화를 없애고 `--dev=apple` → `[swift]` 단일 leaf로 정리(swift 개발 스킬 4종은 그대로 유지 — 실제 자산이다).
- **`capture-lessons` 훅 설명 정정** — "자기 진화 루프의 일부" → 교정이 반복되면 `lessons-learned.md`에 한 줄 교훈을 넣는 것.
- **`npm test`가 검증기까지 실행** — `validate-agents` → `validate-models` → `validate-baseline` → `validate-counts` → `node --test` 순서. 유닛 테스트만 돌리려면 `npm run test:unit`.

### Added

- **규모 기반 버전 범프 `scripts/bump-version.js` (`npm run bump`)** — `install.js`는 설치 시 `package.json`의 version을 매니페스트 `sourceVersion`으로 기록하고 `--status`에서 `compareSemver`로 outdated를 판정한다. 그런데 version이 최초 커밋 이후 한 번도 오르지 않아(`git log -G'"version":' -- package.json` 결과 커밋 1개) 소스가 382파일 바뀌어도 영구히 "up to date"로 보였다 — 게이지는 붙어 있는데 바늘을 아무도 안 움직인 상태. 사람이 기억해야 하는 절차는 잊히므로 규모 판정을 기계가 한다: **자산 구성 변경(`agents/`·`skills/` 파일 추가·삭제) 또는 변경 파일 ≥10 또는 churn ≥300 → `minor`**, 그 외 변경 → `patch`, 변경 없음 → 범프 안 함. baseline은 version 라인이 마지막으로 바뀐 커밋이며, `"version":`의 발생 *횟수*는 값이 바뀌어도 그대로라 pickaxe(`-S`)가 아니라 `-G`로 찾는다. 적용은 `npm version --no-git-tag-version`에 위임해 `package-lock.json`의 version 두 곳(root·`packages[""]`)을 맞추는 코드를 다시 쓰지 않는다. 미커밋·untracked 변경도 규모에 포함한다 — 범프는 커밋 직전에 돌리는 것이 자연스럽고, 커밋된 것만 보면 지금 만든 변경이 판정에서 빠진다. 정책은 `rules/common/git-workflow.md`의 "Version Bump" 절에 명문화. 이 방식의 첫 적용으로 **v1.0.0 → v1.1.0**.
- **git 파이프라인 강제 (브랜치 → 커밋 → 푸시 → PR → 머지)** — `agents/cli/hooks/pre-push-guard.sh` 신설: Kiro `preToolUse` 이벤트(matcher `execute_bash`)로 `git push`를 가로채 대상이 기본 브랜치(`origin/HEAD`, 없으면 실재하는 `main`/`master`)면 `exit 2`로 차단하고 남은 파이프라인 단계를 안내한다. refspec의 **목적지(dst)** 로 판정하므로 `git push origin feat/x:main`도 잡히고, 값을 먹는 옵션(`-o`)의 값을 remote로 오인하지 않는다. 예외: 태그 전용 푸시(`--tags`)·브랜치 삭제(`--delete`/`-d`)·원격 없는 로컬 레포·git 레포가 아닌 디렉터리·JSON 파싱 실패. 우회: `KIRO_ALLOW_MAIN_PUSH=1`. IDE 티어에는 동등한 `git-pipeline-guard` 훅을 추가했고, 정책 본문은 `rules/common/git-workflow.md` 최상단에 6단계로 명문화했다.
- **cross-review blast radius 프리앰블** — 두 리뷰 축에 diff를 넘기기 전에 "바뀌지 않았지만 검토할 파일"을 뽑는다. (a) 역참조 — 바뀐 모듈을 `require`/`import` 하는 파일, (b) 동반변경 — 히스토리상 같은 커밋에 자주 등장한 파일(import 관계가 없어도 잡힌다). 인덱스를 만들지 않으므로 stale 될 것이 없다. diff에 이미 포함된 파일(untracked 신규 파일 포함)은 제외하고, 20개를 넘으면 상위 20개만 쓰면서 **잘랐다는 사실을 리포트에 남긴다**(조용한 절단 금지).
- **카운트 정합 검증기 `scripts/validate-counts.js`** — 문서가 주장하는 수치(스킬 수·IDE 훅 수·CLI 훅 스크립트 수·오케스트레이터 훅 수·모델 티어 수)를 **실측값**과 대조한다. "140개 스킬"이라는 문장은 그 자체로 모순이 없어서 사람 리뷰와 교차 모델 리뷰를 둘 다 통과한다 — 숫자의 *출처*와 대조하는 것만이 이 부류를 잡으므로 기계가 한다. 주장은 명시 등록제이며, 등록된 패턴이 **하나도 매치되지 않으면** 그것도 실패로 본다(pattern-rot — 문구가 바뀌어 검증기가 조용히 무력화되는 것을 막는다).

### Removed

- **`continuous-learning-v2` 스킬 (10파일, 3,973줄)** — 관측만 하고 아무것도 만들지 못한 자기진화 층. 하드 증거: `~/.local/share/harness-homunculus`에 `instincts/` 27개·`evolved/` 27개 디렉터리가 있으나 그 안의 **파일은 0개**, `ecc-homunculus`도 0개. 더구나 Kiro 쪽에는 `observe.sh`·`instinct-cli.py`를 호출하는 훅·에이전트가 **하나도 없다** — 설치되지만 아무도 부르지 않는다. 반면 유지한 `lessons-learned`는 실제 프로젝트에서 31줄·55줄이 기록되어 있다. 산문 의존 정리 후 제거: `lessons-learned`·`iterative-retrieval`·`strategic-compact`의 참조를 생존 대체물로 재배선, legacy baseline 매니페스트·skill-catalog(en/kr) 항목 제거.
- **`enterprise-agent-ops` 스킬 (51줄)** — 코드블록이 단 하나도 없는 순수 나열형 stub이며 다른 스킬이 인용하지 않는 고립 노드였다(참조 3곳 = 문서 카탈로그 2 + legacy 매니페스트 1).

스킬 140 → **138**.

### 적용하지 않은 것 (근거)

- **apple 스킬 23종 제거** — Kiro에는 상위 프로젝트가 제거한 `apple-app-store`·`apple-design`·`apple-generators` 계열(ASO/마케팅/법무) 자산이 **애초에 없다**. Kiro의 apple 자산은 `swift-concurrency-6-2`·`swiftui-patterns`·`swift-actor-persistence`·`swift-protocol-di-testing` 4종의 순수 개발 스킬이고, 이는 다른 언어 워크로드가 받는 것과 동급의 실제 자산이다. 제거 대상은 자산이 아니라 자산을 약속만 한 **메뉴 세분화**였다(위 apple 3분할 항목).
- **lab 스킬 30종 제거** — Kiro에 lab 태그 자산이 0개다. 제거 대상은 자산이 아니라 **죽은 키** 자체였다(위 `lab` 항목).
- **`agentic-engineering` 제거** — 상위 프로젝트는 "메뉴 비노출"을 근거로 제거했으나 Kiro에서는 `--ai=agent` 카테고리로 **실제 노출**되고, 나아가 `manifests/install-modules.json`·`scripts/validate-baseline.js`·`scripts/lib/baseline-check.js`와 테스트 5개 파일이 이를 **글로벌 위임 지침의 단일 소스(R1)** 로 참조한다. 두 제거 근거(비노출·고립) 모두 Kiro에서 성립하지 않는다.
- **`context-budget`·`strategic-compact`·`production-audit`·`agent-eval`·`eval-harness`·`agent-harness-construction` 제거** — 상위 프로젝트에서는 메뉴에 노출되지 않는 lab 자산이었지만, Kiro에서는 각각 `core`·`cloud`·`ai-agent` 워크로드로 노출되어 실제 설치된다. 노출 근거로 제거할 수 없고, 서로 다른 레이어(도구 사용법 / eval 프레임워크 / 하네스 설계)를 다뤄 중복도 아니다.


## 2026-07-26

### Changed
- **모델 정책 업그레이드 — frontier `claude-fable-5` 기본 + deep-reasoning `claude-opus-5`** — fable-5 정식 가용·opus-5 출시에 맞춰 SSOT(`model-policy.js`) 갱신: frontier 티어 기본을 `claude-opus-4.8`→`claude-fable-5`로, deep-reasoning을 `claude-opus-4.8`→`claude-opus-5`로 교체. `FRONTIER_UPGRADE`(승격)를 `FRONTIER_FALLBACK`(폴백, `claude-opus-5`)으로 의미 반전(`frontierFallbackIdentifier`). `--frontier-model` 값은 `fable5`(기본)|`opus5`|`auto`로 변경(`opus48` 제거), 대화형 설치 프롬프트도 fable-5 기본으로 갱신. `apply-model-policy.js`로 에이전트 13종 재기록(frontier 1 + deep-reasoning 12).
- **OpenAI GPT-5.6 3종 매핑** — Kiro에서 gpt-5.6 전 변형이 선택 가능해짐에 따라 openai 열을 현행화: frontier/deep-reasoning→`gpt-5.6`, balanced→`gpt-5.6-mini`, cost-optimized→`gpt-5.6-nano`(기존 forward-looking gpt-5.5/5.4 대체). `--provider=openai` 전환은 이제 예정이 아닌 현행 기능.
- `model-detect.js` Legacy 식별자를 `claude-opus-4.7`→`claude-opus-4.8`로 교체(이번 마이그레이션의 잔존 스캔 대상). README(en/kr)·model-routing(en/kr)·profile-guide(en/kr)·AGENTS.md 모델 정책 서술 갱신.
- **cross-review Codex 모델 고정** — `peer-reviewer`(CLI/IDE)와 `cross-review.sh`의 Codex 호출을 `--model gpt-5.6-sol`로 고정. 스크립트는 `CODEX_MODEL` 환경변수 오버라이드를 지원하고, 지정 모델 거부 시 모델 미지정으로 1회 재시도(graceful degradation 유지). Kiro 네이티브 GPT 에이전트 쌍 대신 기존 외부 CLI 경유 구조를 유지하기로 결정(교차 하네스 다양성 보존). hook-reference(en/kr) 갱신.

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
