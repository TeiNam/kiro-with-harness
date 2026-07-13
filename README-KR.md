# Kiro Harness

[English](README.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Kiro IDE를 위한 하네스 엔지니어링. 계층(CLI / IDE) 기반 설치 관리자와 워크로드 선택으로 큐레이션된 스티어링 규칙, 훅, 에이전트, 스킬, MCP 설정을 Kiro 워크스페이스에 배포합니다. Claude Fable 5(Mythos-class)에 최적화 — 역할 기반 모델 라우팅, DAG 스타일 병렬 위임, 공유 에이전트 협업 가이드(AGENTS.md).

## 빠른 시작

설치 관리자는 **계층 × 카테고리 트리** 모델을 사용합니다: `cli` 또는 `ide`를 선택한 후 카테고리를 선택하세요.

```bash
# 대화형 설치 (가이드 프롬프트: 티어, scope, 카테고리, 리뷰 백엔드, MCP 프록시)
node install.js              # 또는: node install.js -i

# CLI 계층: 글로벌 기본 설정 설치 (오케스트레이터 에이전트, 스킬 → ~/.kiro)
node install.js cli --scope global --category=core

# Rust + Python 개발, 워크스페이스 설치
node install.js cli --scope workspace --dev=rust,python

# 프론트엔드 개발 (React/TypeScript)
node install.js ide --dev=frontend

# iOS/macOS 개발 (Apple 생태계)
node install.js cli --scope workspace --dev-apple=core

# 클라우드 인프라 작업 (AWS DevOps/IaC/FinOps)
node install.js cli --scope global --category=cloud

# LLM + 에이전트 구축
node install.js ide --ai=llm,agent

# 데이터 엔지니어링: 분석 + AWS 레이크하우스
node install.js cli --scope workspace --data=aws-analytics,postgres

# 카테고리 트리 보기
node install.js --list

# 저수준: 워크로드 키로 직접 설치 (레거시 표면, 카테고리와 합집합)
node install.js cli --scope global --workload rust,postgres

# 설치 상태 확인
node install.js --status
node install.js --status --scope global

# 파일을 쓰지 않고 미리보기 (모든 명령어에서 작동)
node install.js cli --scope workspace --dev=rust --dry-run
```

> **기본값:** CLI는 기본적으로 글로벌에 설치됩니다(~/.kiro); IDE는 기본적으로 워크스페이스에 설치됩니다(프로젝트 .kiro).
> **카테고리 선택:** `--category=dev,cloud`는 전체 카테고리를 선택하고, `--dev=rust,python`은 중분류를 선택하며(대분류 자동), `--dev-apple=core`은 소분류를 선택합니다. 미선택 레벨은 모든 하위 옵션을 기본값으로 사용합니다.

## 설치 계층

### CLI 계층 (`kiro-cli chat`)

JSON 에이전트(내장 훅)와 `skill://` 리소스로서의 스킬을 설치합니다.

**글로벌** (`~/.kiro/agents`, `~/.kiro/skills/`):
- 오케스트레이션 에이전트: kiro-cli, architect, deep-researcher, devops, peer-reviewer
- 리뷰 에이전트: code-reviewer, security-reviewer, translator-docs
- 스티어링: AGENTS.md (에이전트 협업 가이드)
- 스킬: 오케스트레이터의 점진적 `skill://` 로드

**워크스페이스** (`.kiro/agents/`):
- 언어 리뷰어, 빌드 해결자 (워크로드별)
- e2e-runner, database-reviewer, rdbms-data-modeler
- Article-writer, content-creator

### IDE 계층 (Kiro IDE)

Markdown 에이전트와 별도 훅 파일을 설치합니다; 스킬은 스티어링으로 변환됩니다(수동 포함).

**워크스페이스** (`.kiro/agents/`, `.kiro/hooks/`, `.kiro/steering/`):
- 에이전트: CLI와 동일한 역할, Markdown 형식
- 훅: pre-write-guard, review-on-stop, capture-lessons, changelog-on-commit (최적화된 세트)
- 스티어링: 언어 규칙 (fileMatch), 핵심 규칙 (always), 수동 스킬
- MCP: `.kiro/settings/mcp.json`

## 설치 카테고리 (3단 카테고리 트리)

설치 관리자는 이제 **카테고리 트리**(대분류 → 중분류 → 소분류)를 통해 설치를 구성하며, 레거시 저수준 워크로드 표면은 호환성을 위해 유지합니다.

**대분류:** dev, cloud, ai, data, research, writing.

| 대분류 | 중분류 | 소분류 | 매핑 워크로드 | 목적 |
|--------|--------|--------|------|----------|
| **dev** | frontend | — | frontend, typescript | React / Next / Vite / TypeScript |
| | python | — | python | Django / FastAPI |
| | rust | — | rust | Rust 백엔드 |
| | nodejs | — | node, javascript | Node.js / Bun / Prisma |
| | go | — | go | Go 백엔드 |
| | java | — | java | Java / Spring / JPA |
| | kotlin | — | kotlin | Kotlin / Ktor / Exposed |
| | cpp | — | cpp | C/C++ 시스템 |
| | csharp | — | csharp | C# 백엔드 |
| | php | — | php | PHP / Laravel |
| | perl | — | perl | Perl 스크립트 |
| | apple | core / platform / product | swift | iOS/macOS (Swift/SwiftUI) |
| | mobile | — | mobile | Android / Compose / Multiplatform |
| | architecture | — | architecture | API 설계 / ADR / blueprint |
| | domain | — | domain | 비즈니스 도메인 (물류·제조·에너지·통관) |
| | obsidian | — | obsidian, frontend | Obsidian 플러그인 |
| | chrome | — | frontend | Chrome 확장 (예약 — frontend 스위트) |
| | claude | — | ai-agent | Claude Code 플러그인 (예약 — ai-agent 스위트) |
| **cloud** | infra | — | cloud | IaC · EKS · ECS · Lambda · 관측성 |
| | finops | — | finops | 청구 · 가격 설정 |
| | integration | — | cloud | SNS · SQS · MQ · Step Functions |
| **ai** | llm | — | ai | LLM 사용 (Bedrock · Claude API · pytorch) |
| | agent | — | ai-agent | 에이전트/하네스 구축 (eval · mcp · prompt) |
| **data** | duckdb | — | python-data | DuckDB 분석 |
| | python-data | — | python-data, ai | Python 분석 (pandas / pytorch / MLE) |
| | aws-analytics | — | cloud, python-data | AWS 분석 (Glue · Athena · S3 Tables · Iceberg) |
| | mysql | — | mysql | MySQL / Aurora MySQL 설계 |
| | postgres | — | postgres | PostgreSQL / Aurora Postgres 설계 |
| | mongodb | — | mongodb | MongoDB 설계 |
| | dynamodb | — | dynamodb | DynamoDB 설계 |
| | aws-rds | — | mysql, postgres | AWS 관리형 DB (Aurora · RDS) |
| **research** | websearch | — | research | 웹 검색 · 자료조사 (exa · brave · deep-research) |
| | report | — | report | 기술 리포트 작성 · 검증 |
| **writing** | general | — | writing | 일반 글쓰기 (블로깅 · PPT · 창작 · 번역) |
| | social | voice / content / visual | writing | 소셜 콘텐츠 (LinkedIn 등) |

**사용법:** `--category=dev,cloud`는 대분류 전체를 선택하고, `--dev=rust,python`은 중분류를 선택하며(대분류 자동 활성화), `--dev-apple=core`는 소분류를 선택합니다. 미선택 레벨은 **모든** 하위 옵션을 기본값으로 사용합니다. 필요에 따라 `--review-backend` 및 `--mcp-proxy`(IDE)와 함께 사용합니다.

**클라우드 워크로드 상세:** `cloud` 카테고리는 AWS DevOps(IaC·컨테이너화·관측성)와 통합(메시징)을 다룹니다. FinOps(청구/가격 MCP·비용 추적)는 별도 `finops` 워크로드로 분리되어 `--cloud=finops`로 선택합니다(`--category=cloud`에는 자동 포함). cloud 스위트에는 **데이터 엔지니어링**: S3 Tables / Iceberg / Athena 레이크하우스, DMS/Glue/Kinesis/MSK/Flink ETL & CDC, RDBMS→S3/OpenSearch 로그 오프로딩, EKS/MSK 버전 최신성 확인, Terraform 배포가 포함됩니다([aws-cloud](skills/aws-cloud/SKILL.md), [aws-lakehouse](skills/aws-lakehouse/SKILL.md), [aws-etl-cdc](skills/aws-etl-cdc/SKILL.md), [log-data-offloading](skills/log-data-offloading/SKILL.md), [terraform-deployment](skills/terraform-deployment/SKILL.md) 참고).

**레거시 워크로드 표면:** `--workload=<키,...>|all`은 저수준 직접 워크로드 키 지정을 계속 지원합니다. 카테고리 선택과 합집합됩니다. 특수: `lab`은 `--workload=lab`으로만 옵트인됩니다.

## 리뷰 백엔드 토글

`--review-backend`로 코드 리뷰 에이전트 설치 방식을 제어하세요:

- `--review-backend claude` (기본값): 네이티브 리뷰어 제외; `peer-reviewer` 에이전트를 통해 리뷰 라우팅 (터미널 Claude Code `claude -p` 호출로 교차 모델 의견 수렴 — Kiro + Claude 2-way)
- `--review-backend cross`: `claude`와 동일하게 라우팅하되, `peer-reviewer`가 Claude Code(`claude -p`)와 Codex CLI(`codex`) **양쪽** 의견을 모아 **Kiro + Claude + Codex 3-way**로 종합합니다. 온디맨드 `cross-review.sh`도 설치합니다(`bash .kiro/hooks/cross-review.sh`로 커밋되지 않은 변경을 교차 점검). 각 외부 CLI는 없으면 graceful하게 건너뜁니다. 모든 리뷰가 3-way일 필요는 없으므로, 이 스크립트는 자동 훅이 **아니라** 선택 실행입니다.
- `--review-backend kiro`: 네이티브 Kiro 리뷰어 에이전트 설치 (code-reviewer, security-reviewer, 언어 리뷰어)

빌드 에이전트(build-error-resolver, 언어 build-resolver, e2e-runner, kiro-cli)는 이 토글과 관계없이 항상 네이티브입니다.

## 모델

에이전트 모델 할당은 역할 기반이며, **프로바이더 독립적인 네 능력 티어**로 구성됩니다. 각 에이전트 정의의 `model` 필드가 유일한 소스이며, [`scripts/lib/model-policy.js`](scripts/lib/model-policy.js)에서 기록됩니다. 이 하네스는 **Kiro 네 모델에 최적화**되어 있습니다 — **`claude-fable-5`**(프런티어, Mythos-class), **`claude-opus-4.8`**(심층 추론), **`claude-sonnet-5`**(균형, 기본 코딩 티어), **`claude-haiku-4.5`**(비용 최적화). `kiro-cli` 오케스트레이터(설치 시 기본 에이전트로 지정)는 `claude-fable-5`에 고정되고, 추론 에이전트는 `claude-opus-4.8`, 물량이 많은 코딩 에이전트는 `claude-sonnet-5`, 비용 민감 역할은 `claude-haiku-4.5`를 씁니다.

| 티어 | 모델 | 에이전트 |
|------|------|----------|
| 프런티어 (Mythos-class) | `claude-fable-5` | kiro-cli(오케스트레이터) |
| 심층 추론 | `claude-opus-4.8` | architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler |
| 균형 (기본) | `claude-sonnet-5` | code-reviewer, refactor-cleaner, 언어 리뷰어, 빌드 해결자, database-reviewer, e2e-runner, 문서/기술 작성자 |
| 비용 최적화 | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |

설계 원칙: **Fable은 장기 DAG 오케스트레이션, Opus는 추론, Sonnet은 코딩 물량, Haiku는 값싼 대량 작업.** 라우팅은 에이전트 단위라 역할별로 모델을 섞을 수 있습니다. OpenAI GPT-5.5 / GPT-5.4가 Kiro에서 선택 가능해지면 동일한 티어가 그대로 매핑됩니다(`frontier/deep-reasoning → gpt-5.5`, `balanced → gpt-5.4`) — `node scripts/apply-model-policy.js --provider=openai`로 재지정하세요. 전체 배정·훅→티어 가이드·프로바이더 전환 워크플로: [모델 라우팅](docs/kr/model-routing.md).

> **Opus 4.8 가용성:** `claude-opus-4.8`은 **실험적**이며 **us-east-1**과 **eu-central-1**에서만 사용 가능합니다. **Kiro CLI v2.5.0+**가 필요합니다. `claude-opus-4.8`으로 고정된 에이전트는 이전 CLI 버전 또는 지원되지 않는 지역에서 실패합니다 — Kiro CLI를 업그레이드하세요.

> **모델 ID 형식:** Kiro는 `model` 값을 model service가 반환하는 ID와 대조하며, 알 수 없는 ID는 경고와 함께 기본 모델로 silent 폴백됩니다. 고정 전 활성 채팅 세션에서 `/model`로 정확한 식별자를 확인하세요.

## Kiro 버전 호환성 (CLI 2.10 / IDE 1.0)

- **IDE 훅은 v1 JSON 포맷**(`.kiro/hooks/*.json`)을 사용합니다. IDE 1.0에서 도입되어 레거시 `.kiro.hook` 포맷을 대체하며, 레거시 훅은 마이그레이션 전까지 실행되지 않습니다. 설치기는 v1 JSON을 직접 생성합니다. `docs/kr/hook-reference.md` 참고.
- **기본 리소스 상속(CLI 2.7+):** 커스텀 에이전트는 자신의 `resources`에 더해 글로벌 steering·skills·`AGENTS.md`를 자동 상속합니다. 설치를 워크로드 범위로만 엄격히 유지하려면(글로벌 끌어오기 차단) 비활성화하세요: `kiro-cli settings chat.disableInheritingDefaultResources true` (`--workspace`로 프로젝트 범위 지정 가능). 내장 에이전트는 설정과 무관하게 항상 상속합니다.
- **Hot-reload(CLI 2.10+):** `~/.kiro/agents/*` 와 `mcp.json` 편집은 세션 재시작 없이 다음 idle 경계에서 반영됩니다 — 하네스를 재설치해도 채팅 컨텍스트 손실 없이 적용됩니다.
- **세션(IDE 1.0):** IDE 1.0은 새 세션 저장 포맷을 씁니다. 0.x 세션은 마이그레이션이 필요합니다(각 세션의 **Migrate** 버튼, 또는 세션을 열면 자동 마이그레이션). 이는 하네스와 무관합니다 — 하네스는 세션이 아니라 자산을 설치하며, hot-reload 덕분에 설치기를 다시 실행해도 활성 세션이 유지됩니다.
- **에이전트 포커스 모드(IDE 1.0, 실험적):** 다중 병렬 세션과 workflow picker(Spec/Plan/Bug Fix/Quick Spec)를 갖춘 채팅 우선 레이아웃으로, 동일한 `.kiro/` 자산 위에서 동작합니다. 하네스 에이전트 묶음·DAG 오케스트레이션과의 매핑은 `docs/kr/agent-focus-mode.md` 참조.

## 설치되는 항목

### 에이전트

**CLI 계층**은 `agents/cli/` 아래에 JSON 에이전트를 설치합니다:
- 글로벌(`~/.kiro/agents/`): 오케스트레이션 (kiro-cli, architect, deep-researcher, devops, peer-reviewer), 리뷰 에이전트 (code-reviewer, security-reviewer, translator-docs)
- 워크스페이스(`.kiro/agents/`): 언어 리뷰어, 빌드 해결자, 데이터베이스 에이전트, e2e-runner, 콘텐츠 에이전트

**IDE 계층**은 `.kiro/agents/` 아래에 동일한 역할의 Markdown 에이전트를 설치합니다.

### 훅

**CLI 계층**: 훅은 에이전트 JSON 내에 내장됩니다 (별도 파일 아님).

**IDE 계층** (`.kiro/hooks/`): 이벤트 기반 자동화의 최적화된 세트:
- pre-write-guard: 크기 제한, 비밀 탐지, 문서 위치 확인
- review-on-stop: 태스크 후 코드 리뷰
- capture-lessons: 자체 진화 피드백 루프
- changelog-on-commit: git commit 시 날짜별(`## YYYY-MM-DD`) CHANGELOG 갱신

### 스티어링

**CLI 계층**: 글로벌 스티어링은 AGENTS.md(에이전트 협업 가이드)로 제한됩니다; 에이전트는 `skill://`을 통해 스킬을 참조합니다.

**IDE 계층** (`.kiro/steering/`):
- Always-on: 코딩 스타일, 보안, 테스팅, Git 워크플로우, 패턴, 성능
- FileMatch: 파일 타입별로 로드되는 언어 특화 규칙
- Manual: 필요 시 로드되는 스킬 (139개 총; 워크로드로 선택적 포함 태그됨)

### 스킬

`skills/` 아래 139개 스킬 패키지는 워크로드로 태그됩니다. 설치는 활성 워크로드와 교집합인 스킬만 선택합니다.
- 핵심: context budget, strategic compact, agentic engineering, lessons learned
- 인프라: Docker, deployment, database migrations, backend patterns
- 데이터베이스: PostgreSQL, MySQL, MongoDB, DynamoDB (+ rdbms-naming, mongodb-patterns)
- 클라우드 / 데이터: aws-cloud, aws-sdk-patterns(boto3/JS v3/CLI v2), aws-lakehouse(S3 Tables/Iceberg/Athena/Spark), aws-etl-cdc(DMS/Glue/Kinesis/MSK/Flink), log-data-offloading(RDBMS→S3/OpenSearch), infra-version-currency(EKS/MSK 최신 버전 확인), terraform-deployment
- 백엔드: Django, Spring Boot, Laravel, FastAPI
- 프론트엔드: Next.js, Nuxt4, Vite, Bun
- 모바일: Android, Compose, SwiftUI, Swift concurrency
- AI/LLM: Claude API, cost-aware pipelines, PyTorch, mle-workflow
- 아키텍처: API design, ADR, blueprint, MCP patterns + builder
- 작성: articles, content, research, crossposting, humanize-writing
- 문서: PDF, PPTX, DOCX, XLSX 생성, brand guidelines

### MCP

`.kiro/settings/mcp.json`(또는 CLI 글로벌의 경우 `~/.kiro/settings/mcp.json`)에 설치되는 큐레이션된 MCP 서버 카탈로그.

**클라우드 워크로드**에는 다음이 포함됩니다: terraform, aws-documentation, aws-core, cloudwatch, aws-ecs, aws-iam (DevOps); aws-pricing, aws-billing-cost-management (FinOps).

전체 카탈로그(general / DevOps / FinOps / opt-in: brave-search·sentry·time 포함)와 설정 안내: `docs/kr/mcp-reference.md`.

**중앙 프록시 (`--mcp-proxy`, IDE 티어):** 프록시 가능한 MCP 서버를 로컬 [mcp-proxy](mcp-proxy/README.md) 컨테이너 하나로 모아(`mcp.json`이 `{"type":"http","url":"http://localhost:9090/<서버>/mcp"}` 형태가 됨), 여러 클라이언트가 서버 프로세스를 중복 기동하지 않도록 한다. 설치기는 **컨테이너까지 자동 보장**한다: `docker ps`로 확인해 `mcp-proxy`가 실행 중이 아니면 `mcp-proxy/`에서 `docker compose up -d`, 이미 떠 있으면 스킵. 또한 활성 워크로드에 맞는 백엔드만 담은 **`config.generated.json`**을 생성해 프록시가 "필요한 것만" 서빙하도록 하며(전체 `config.json`은 템플릿/수동 fallback), 클라이언트 `mcp.json`과 서빙 목록이 정합한다. Docker 미설치면 "Docker 설치 후 재실행", 데몬 미실행이면 "데몬 시작 후 재실행"을 안내하며, `--dry-run`·기동 실패는 graceful하게 넘어간다(설치는 계속된다). 자격증명 기반 AWS 서버와 Kiro 내장은 프록시를 거치지 않는다 — [`mcp-proxy/README.md`](mcp-proxy/README.md) 참고.

## 프로젝트 구조

```
├── install.js                  # 계층 × 워크로드 설치 관리자
├── scripts/lib/
│   ├── categories.js           # 카테고리 트리 (3단) 및 CLI 플래그 파서
│   ├── workloads.js            # 워크로드 카탈로그 및 분류
│   ├── select-assets.js        # 자산 선택 엔진 + review-backend 필터
│   ├── tiers.js                # CLI/IDE 설치 계획자
│   └── tag-assets.js           # 워크로드 태깅
├── rules/                      # 스티어링 소스 (공통 + 언어별)
├── agents/
│   ├── cli/                    # CLI 에이전트 (글로벌 + 워크스페이스)
│   ├── ide/                    # IDE 에이전트 (Markdown)
│   └── AGENTS.md               # 공유 에이전트 협업 가이드
├── skills/                     # 139개 스킬 패키지 (워크로드 태그됨)
├── mcp-configs/                # MCP 서버 설정
├── scripts/                    # 검증 유틸리티 (validate-agents.js, validate-models.js)
├── docs/                       # 가이드 (영어 + 한국어)
└── .kiro/                      # 이 프로젝트의 Kiro 설정
```

## CLI 참고

```
node install.js <tier> [options]

계층:
  cli                kiro-cli chat 용 설치
  ide                Kiro IDE 용 설치

옵션:
  -i, --interactive              가이드 대화형 설치 (인자 없이 TTY 실행 시 기본)
  --scope <global|workspace>     설치 범위 (기본: CLI는 global, IDE는 workspace)
  --category <list>              대분류: dev, cloud, ai, data, research, writing (콤마로 구분; 미선택 = 전체)
  --<category>= <list>           중분류 선택 (예: --dev=frontend,python; 미선택 = 전체 중분류)
  --<category>-<sub>= <list>     소분류 옵션 (예: --dev-apple=core; 소분류가 있는 중분류만)
  --workload <list|all>           저수준: 워크로드 키 직접 지정 (쉼표로 구분 또는 'all'; 레거시 표면, 카테고리와 합집합)
  --review-backend <kiro|claude|cross> 코드 리뷰 라우팅 (기본: claude; cross = Claude+Codex 3-way + cross-review.sh)
  --mcp-proxy                    IDE 전용: mcp.json을 mcp-proxy(:9090) 경유로 구성 + 프록시 컨테이너 자동 기동(미실행 시 docker compose up -d)
  --target <path>                지정 디렉토리에 설치
  --dry-run                      파일을 쓰지 않고 변경 사항 미리보기
  --list                         카테고리 트리 표시
  --status                       설치 상태 표시 (설치 버전·갱신 필요 여부 포함)
```

## 문서

전체 가이드는 `docs/` 아래에 있습니다 — 영어는 `docs/en/`, 한국어는 `docs/kr/`.

| 문서 | 내용 |
|------|------|
| [워크로드 가이드](docs/kr/profile-guide.md) | tier × workload 모델, 설치 플래그, 프로필 마이그레이션 |
| [훅 레퍼런스](docs/kr/hook-reference.md) | IDE 1.0 v1 JSON 훅 포맷, 트리거, 설치되는 훅 세트 |
| [에이전트 포커스 모드](docs/kr/agent-focus-mode.md) | IDE 1.0 에이전트 포커스 모드(실험적) — 병렬 세션·workflow picker를 하네스 에이전트/오케스트레이션에 매핑 |
| [MCP 레퍼런스](docs/kr/mcp-reference.md) | 큐레이션 MCP 카탈로그 (내장 / general / DevOps / FinOps / opt-in) |
| [모델 라우팅](docs/kr/model-routing.md) | 3-티어 모델 정책(Opus/Sonnet/Haiku), 에이전트별 배정, 훅→티어 가이드, OpenAI GPT-5.5/5.4 도입 계획 |
| [스킬 카탈로그](docs/kr/skill-catalog.md) | 139개 스킬 도메인별 정리 |
| [스킬 만들기](docs/kr/creating-skills.md) | `workloads:` frontmatter로 스킬 작성·등록 |
| [Claude vs Kiro](docs/kr/claude-vs-kiro.md) | Claude Code vs Kiro CLI vs Kiro IDE — 공식 문서 기준 기능별 차이 |
| [Claude에서 마이그레이션](docs/kr/migration-from-claude.md) | Claude Code 설정을 Kiro로 변환 |
| [Eval 하네스](docs/kr/eval-harness.md) | 평가 기반 개발 워크플로 |
| [프롬프트 템플릿](docs/kr/prompt-templates.md) | 재사용 가능한 프롬프트 템플릿 |

각 문서의 영어판은 `docs/en/`에 있습니다.

## 감사의 말

이 프로젝트는 [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)에서 큰 영감을 받았습니다. 많은 규칙, 에이전트 패턴, 스킬 구조가 ECC에서 유래했으며 Kiro IDE의 네이티브 형식(스티어링, 훅, 스킬)에 맞게 조정되었습니다.

`ponytail` 스티어링 규칙(lazy senior dev mode)은 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)에서 가져왔으며, 불필요한 보일러플레이트 대신 최소한의 코드를 지향해 **토큰 사용량을 줄이기 위해** 적용했습니다.

중앙 MCP 프록시는 [tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy)(MIT License, © TBXark)를 **수정하지 않은 공개 Docker 이미지**(`ghcr.io/tbxark/mcp-proxy`, `v0.43.2` 고정)로 사용합니다. 하네스는 프록시 소스가 아니라 compose 파일·설정·문서만 번들합니다.
