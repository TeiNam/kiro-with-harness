# Changelog

이 프로젝트의 주요 변경 사항을 **날짜별(YYYY-MM-DD)** 로 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)를 따르되, 버전 대신 날짜 섹션으로 정리합니다.

## 2026-08-16 — v3.0.0

### Added

- **CLI 3.0(v3 엔진) 훅 포맷 지원 — `--cli-version 2|3`** — Kiro CLI 3.0(`kiro-cli --v3`)은 에이전트 JSON 의 camelCase embedded hooks 를 읽지 않는다(공식 브레이킹 체인지). `--cli-version 3` 으로 설치하면 두 게이트 훅(pre-write-guard, pre-push-guard)을 독립 `.kiro/hooks/*.json`(version v1, `PreToolUse` PascalCase 트리거, v3 도구 태그 matcher `write`/`shell`)으로 외부화하고, v3 엔진이 무시할 embedded `hooks` 필드를 설치본에서 제거한다(죽은 설정 잔존 방지). 게이트 셸 스크립트는 두 버전 공통. 기본값 `--cli-version 2` 는 기존 2.x embedded 설치를 바이트 동일하게 유지한다(회귀 가드 테스트 포함). 매니페스트·`--status` 에 `cliVersion` 기록. 에이전트 설정 자체는 v3 에서 하위 호환이며, `toolsSettings`→`permissions` 전환은 Kiro 공식 도구(`/upgrade-agent`, `kiro-cli agent migrate`)를 안내한다.

## 2026-08-16 — v2.0.0

하네스 최소화 릴리스. 상위 프로젝트(my_harness_for_claude_code)의 최소화 작업(훅 축소·상시 rule 다이어트·플로우 정리)을 Kiro 에 맞게 반영하고, AWS 인프라·Terraform 작업에 최적화했다.

### Removed

- **RDBMS 설계 자산 제거 → easy-rdbms 플러그인으로 분리** — `mysql-guideline`·`postgres-guideline`·`rdbms-naming`·`database-migrations` 스킬 4종과 `rdbms-data-modeler` 에이전트(CLI/IDE)를 삭제했다. RDBMS 설계·마이그레이션은 별도 플러그인(easy-rdbms)이 담당하며, 필요 시 그쪽에서 다시 가져온다. **NoSQL(mongodb/dynamodb)·duckdb·분석 자산은 유지**: `mongodb-guideline`·`mongodb-patterns`·`dynamodb-guideline`·`duckdb-patterns`·`clickhouse-io` 는 남고, ORM 앱 패턴(`prisma-patterns`·`kotlin-exposed-patterns`·`jpa-patterns`)과 캐시(`redis-patterns`)도 DB 설계가 아니므로 유지. 워크로드 키 `mysql`/`postgres` 와 카테고리 leaf(`data.mysql`/`data.postgres`/`data.aws-rds`) 제거, `data` 카테고리는 분석(duckdb/python-data/aws-analytics) + NoSQL 설계(mongodb/dynamodb)로 정리. 스킬 138 → **134**, 워크로드 31 → **29**.
- **이벤트 자동화 훅 3종 제거 (IDE 5→2)** — `review-on-stop`·`capture-lessons`·`changelog-on-commit` 을 제거했다. 매 턴/커밋마다 에이전트 프롬프트를 태우는 자동화는 토큰 대비 효용이 낮고 온디맨드 대체물이 이미 있다: 리뷰는 code-reviewer 에이전트·`cross-review.sh`, 교훈은 `lessons-learned` 스킬, CHANGELOG 는 저장소 규약(steering). IDE 훅은 CLI 티어와 대칭인 **결정적 게이트 2개**(pre-write-guard, git-pipeline-guard)만 남는다.

### Changed

- **상시 steering 축소 — minimal-core 고정** — IDE always-on 이 6파일(coding-style/security/testing/git-workflow/product/ponytail, ~13KB)에서 **2파일**(`minimal-core.md` + `ponytail.md`, ~3.2KB)로 줄었다. `rules/common/minimal-core.md` 신설: 작업 방식·보안 경계·git 파이프라인·**AWS/Terraform 게이트**를 압축한 상시 digest. CLI 글로벌 steering 에도 동일 digest 를 설치해 두 티어의 상시 규칙이 일치한다(AGENTS.md + minimal-core + ponytail).
- **AWS 인프라·Terraform 최적화** — kiro-cli 오케스트레이터 프롬프트에 "AWS & Terraform Default Flow" 섹션 신설: 조회는 세션 직접(describe/list/plan), 변경은 전부 `devops` 위임, Terraform 게이트(`fmt`→`validate`→`plan` 제시→승인→`apply`), provider 버전 핀 + lock 파일 커밋, terraform/aws-documentation MCP 우선, 변경 전 blast radius·비용 1줄 명시. AGENTS.md 위임 규약에도 인프라 게이트 항목을 추가해 오케스트레이터-서브에이전트 흐름이 모순 없이 이어진다.
- **database-reviewer 를 NoSQL 전담으로 재작성** — PostgreSQL 전용 프롬프트(RLS/psql)를 MongoDB(ESR 인덱스·aggregation·write concern)·DynamoDB(PK/SK 액세스 패턴·GSI·핫 파티션·RCU/WCU) 리뷰어로 교체. RDBMS 리뷰는 easy-rdbms 플러그인 소관임을 명시해 역할 경계가 겹치지 않는다.
- 생존 스킬 8종(aws-cloud, aws-lakehouse, log-data-offloading, mle-workflow, prompt-optimizer, prisma-patterns, redis-patterns, mongodb-patterns)의 삭제 자산 참조를 재배선하고, 문서(en/kr 8쌍)·legacy 매니페스트·검증 카운트를 동기화했다.

## 2026-08-15

### Added

- **설치 시 모델 프로바이더 프로필** — `node install.js <cli|ide> --provider=anthropic|openai`와 대화형 provider 선택을 추가했다. 역할별 모델뿐 아니라 provider별 effort 설정 경로(Claude `output_config.effort`, GPT `reasoning.effort`), 컨텍스트 운영 노트(Claude 1M, GPT 272K), cross-family 리뷰 우선순위를 모든 설치 에이전트에 함께 적용한다. 저장소의 Anthropic-first 소스 자산은 변형하지 않아 글로벌·워크스페이스별로 다른 provider를 안전하게 설치할 수 있다.

### Changed

- **OpenAI 라우팅 교정** — 존재하지 않던 `gpt-5.6` / `gpt-5.6-mini` / `gpt-5.6-nano` 매핑을 Kiro 실제 ID인 `gpt-5.6-sol` / `gpt-5.6-terra` / `gpt-5.6-luna`로 교체했다.
- **provider-aware cross review** — Anthropic 설치는 Codex를, OpenAI 설치는 Claude Code를 독립 cross-family primary로 먼저 실행하고 나머지 CLI는 same-family 보강으로 표시한다. 매니페스트와 `--status`에도 provider를 기록한다.
- **문서 동기화** — README 영문·국문과 모델 라우팅 가이드를 설치 시 전환, provider별 effort 경로, Sol/Terra/Luna 특성 및 최신 Kiro 가용성에 맞췄다.

### Fixed

- `apply-model-policy.js --provider=openai`가 소스 에이전트 66개를 영구 변형해 Anthropic 기준 검증과 프로젝트별 provider 혼합을 깨뜨리던 경로를 정상 설치 플로우에서 제거했다. 해당 스크립트는 명시적 소스 재핀용 유지보수 도구로만 남기고 경고를 출력한다.

## 2026-08-06

### Added

- **ponytail 원칙을 서브에이전트 정의에 주입** — `scripts/apply-ponytail.js` 신설. `rules/common/ponytail.md`(lazy senior dev)의 요약본을 CLI 에이전트 JSON 의 `prompt` 필드와 IDE 에이전트 마크다운 본문에 주입한다. 대상 42개 파일 = **22개 역할** × 두 티어. 주입은 멱등이고, `--list`(적용/제외 역할 조회)·`--dry-run` 을 지원한다. CLI JSON 은 `prompt` 한 줄만 재작성(라인 보존)하고 주입 후 `JSON.parse` 로 검증해 깨진 결과는 쓰지 않는다.
  - **왜 steering 이 아니라 정의에 넣는가**: `rules/common/ponytail.md` 는 IDE always-on steering 과 CLI 글로벌 steering 으로만 설치된다. CLI 2.7+ 기본 리소스 상속을 끄면(`chat.disableInheritingDefaultResources true` — README 가 격리 워크스페이스에 권장하는 설정) 서브에이전트가 그 steering 을 받지 못한다. 정의에 심으면 상속 설정과 무관하게 유지된다.
  - **제외 12개 역할** — 상세·전수·정밀 절차가 산출물의 본질이라 "적게 하라"가 곧 누락이 되는 역할: security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler, database-reviewer, e2e-runner, tech-fidelity-auditor, doc-quality-detector, doc-clarity-reviewer, tech-doc-writer, tech-writer-monolith. 정책 SSOT 는 `apply-ponytail.js` 의 `EXEMPT`·`BRIEF`.
  - 리뷰·판정 역할에는 "authoring 이 아니면 리뷰 렌즈로 적용하고 지적은 통합하라"는 한 줄이 함께 들어가 기존 리뷰 체크리스트와 충돌하지 않는다.
  - `test/ponytail.test.js` 9건 — 누락·오주입·멱등성·`prompt` 외 필드 보존·frontmatter 없는 파일 무시·EXEMPT 목록 드리프트·원문 대비 핵심 문구 드리프트.
- **Kiro Crew 통합 가이드** — `docs/en/crew-integration.md`, `docs/kr/crew-integration.md` 신설. `kiro-cli crew` 는 채팅 기능이 아니라 **런처**이고(2.16.1 실측: "Launch Kiro Crew, installing it if it is not already installed"), Crew 는 Gateway(기본 포트 5476)를 띄우는 Apache-2.0 별개 런타임이다. 하네스와의 접점은 하나로 요약된다: **Crew 는 `~/.kiro/agents/` 에서 에이전트 정의를 읽는다 — 하네스 CLI 글로벌 티어가 설치하는 바로 그 디렉터리다.** 따라서 `install.js cli --scope global` 이 이미 Crew 의 에이전트 소스를 채우고, ponytail 주입도 `prompt` 에 있으므로 함께 따라간다. 문서는 확인된 사실과 **공식 문서에 명시되지 않은 항목**(모델 핀 인정 여부, 하네스 JSON 의 추가 필드 처리, steering·skills·MCP 상속, 훅 스키마 공존)을 구분해 표기하고, 서브에이전트 실제 제약(동시성 3–32, 30분 하드 타임아웃, 승인 모드 상속)에 맞춘 역할 분담과 Gateway 보안 주의를 담았다.
- **저장소 작업 규약 steering** — `.kiro/steering/repo-conventions.md`. 문서는 항상 영/한 양쪽 동시 갱신(번역은 `translator-docs` 위임), 코드 변경 시 `npm run bump` 로 매니페스트 버전업, CHANGELOG 날짜 섹션, 커밋 전 `npm test`, ponytail 재적용 절차를 고정했다. 사람이 기억해야 하는 절차는 잊힌다.

### Changed

- **README·README-KR** — 'What Gets Installed > Agents' 소절에 ponytail 주입 정책과 제외 역할 표(12행)를 추가했다. 적용되는 22개 역할은 문서에 나열하지 않고 `node scripts/apply-ponytail.js --list` 로 조회하게 해 드리프트 소스를 만들지 않는다. 문서 표에 Kiro Crew 가이드 링크를 추가했다.
- **에이전트 42개 파일** — 프롬프트/본문 말미에 ponytail 요약 블록이 들어갔다. CLI JSON 22개는 `prompt` 한 줄 치환, IDE 마크다운 20개는 본문 14줄 추가. 그 외 필드·키 순서·들여쓰기는 보존된다.

### Known issues

- `test/mcp-proxy.test.js` 의 `install.js ide --mcp-proxy` e2e 1건이 로컬에서 실패한다. 원인은 코드가 아니라 작업 트리 오염 — `mcp-proxy/config.generated.json` 이 파일이 아니라 **디렉터리**로 존재해 테스트 정리 단계의 `rmSync` 가 `EISDIR` 을 던진다. git 미추적 경로이며 이번 변경과 무관하다.

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
