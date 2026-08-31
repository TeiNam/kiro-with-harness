# Kiro Harness

[English](README.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Kiro IDE를 위한 하네스 엔지니어링. 계층(CLI / IDE) 기반 설치 관리자로 워크로드와 모델 프로바이더를 선택하여, 큐레이션된 스티어링 규칙, 훅, 에이전트, 스킬, MCP 설정을 Kiro 워크스페이스에 배포합니다. 설치 관리자는 동일 역할 티어를 세 가지 모델 사용 패턴 — Claude(기본), GPT-5.6, 또는 **mixed**(Claude Fable 오케스트레이션 + GPT-5.6 Sol 서브에이전트)으로 최적화하며, 자산 fleet을 중복하지 않습니다: 프로바이더 특화 모델 ID, 노력(effort) 가이드, 운영 노트, 교차 패밀리 리뷰 우선순위를 설치 산출물에 기록합니다. 천장 티어는 **노력**으로 에스컬레이션하고, 그 다음 다른 모델 패밀리로 옆(sideways) 에스컬레이션합니다 — 역할 기반 모델 라우팅, DAG 스타일 병렬 위임, 강제 git 파이프라인, 공유 에이전트 협업 가이드(AGENTS.md).

## 빠른 시작

설치 관리자는 **계층 × 카테고리 트리** 모델을 사용합니다: `cli` 또는 `ide`를 선택한 후 카테고리를 선택하세요.

```bash
# 대화형 설치 (가이드 프롬프트: 티어, scope, 카테고리, 리뷰 백엔드, MCP 프록시)
node install.js              # 또는: node install.js -i

# CLI 계층: 글로벌 기본 설정 설치 (오케스트레이터 에이전트, 스킬 → ~/.kiro)
node install.js cli --scope global

# OpenAI GPT-5.6 Sol / Terra / Luna로 최적화한 동일 fleet
node install.js cli --scope global --provider=openai

# Mixed: Claude Fable이 오케스트레이션, GPT-5.6 Sol이 모든 서브에이전트 실행
# (사용 환경에서 Fable이 제공되지 않으면 설치기가 opus-5 max 폴백 명령을 출력합니다)
node install.js cli --scope global --provider=mixed

# Claude는 기본값; 프로바이더 선택은 IDE/워크스페이스 설치에도 적용됨
node install.js ide --provider=anthropic --dev=frontend
node install.js cli --scope workspace --dev=rust,python

# 프론트엔드 개발 (React/TypeScript)
node install.js ide --dev=frontend

# iOS/macOS 개발 (Apple 생태계)
node install.js cli --scope workspace --dev=apple

# 클라우드 인프라 작업 (AWS DevOps/IaC/FinOps)
node install.js cli --scope global --category=cloud

# LLM + 에이전트 구축
node install.js ide --ai=llm,agent

# 데이터 엔지니어링: 분석 + AWS 레이크하우스
node install.js cli --scope workspace --data=aws-analytics,dynamodb

# 카테고리 트리 보기
node install.js --list

# 저수준: 워크로드 키로 직접 설치 (레거시 표면, 카테고리와 합집합)
node install.js cli --scope global --workload rust,mongodb

# 설치 상태 확인
node install.js --status
node install.js --status --scope global

# 파일을 쓰지 않고 미리보기 (모든 명령어에서 작동)
node install.js cli --scope workspace --dev=rust --dry-run
```

> **기본값:** CLI는 기본적으로 글로벌에 설치됩니다(~/.kiro); IDE는 기본적으로 워크스페이스에 설치됩니다(프로젝트 .kiro).
> **카테고리 선택:** `--category=dev,cloud`는 전체 카테고리를 선택하고, `--dev=rust,python`은 중분류를 선택하며(대분류 자동), `--writing-social=voice`는 소분류를 선택합니다(소분류가 있는 중분류만). 미선택 레벨은 모든 하위 옵션을 기본값으로 사용합니다.

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
- e2e-runner, database-reviewer (NoSQL — MongoDB/DynamoDB)
- Article-writer, content-creator

### IDE 계층 (Kiro IDE)

Markdown 에이전트와 별도 훅 파일을 설치합니다; 스킬은 스티어링으로 변환됩니다(수동 포함).

**워크스페이스** (`.kiro/agents/`, `.kiro/hooks/`, `.kiro/steering/`):
- 에이전트: CLI와 동일한 역할, Markdown 형식
- 훅: pre-write-guard, git-pipeline-guard (2개 결정적 게이트, CLI 계층과 대칭)
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
| | apple | — | swift | iOS/macOS (Swift/SwiftUI) |
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
| | mongodb | — | mongodb | MongoDB 설계 |
| | dynamodb | — | dynamodb | DynamoDB 설계 |
| **research** | websearch | — | research | 웹 검색 · 자료조사 (exa · brave · deep-research) |
| | report | — | report | 기술 리포트 작성 · 검증 |
| **writing** | general | — | writing | 일반 글쓰기 (블로깅 · PPT · 창작 · 번역) |
| | social | voice / content / visual | writing | 소셜 콘텐츠 (LinkedIn 등) |

**사용법:** `--category=dev,cloud`는 대분류 전체를 선택하고, `--dev=rust,python`은 중분류를 선택하며(대분류 자동 활성화), `--writing-social=voice`는 소분류를 선택합니다(소분류가 있는 중분류만). 미선택 레벨은 **모든** 하위 옵션을 기본값으로 사용합니다. 필요에 따라 `--review-backend` 및 `--mcp-proxy`(IDE)와 함께 사용합니다.

**클라우드 워크로드 상세:** `cloud` 카테고리는 AWS DevOps(IaC·컨테이너화·관측성)와 통합(메시징)을 다룹니다. FinOps(청구/가격 MCP·비용 추적)는 별도 `finops` 워크로드로 분리되어 `--cloud=finops`로 선택합니다(`--category=cloud`에는 자동 포함). cloud 스위트에는 **데이터 엔지니어링**: S3 Tables / Iceberg / Athena 레이크하우스, DMS/Glue/Kinesis/MSK/Flink ETL & CDC, RDBMS→S3/OpenSearch 로그 오프로딩, EKS/MSK 버전 최신성 확인, Terraform 배포가 포함됩니다([aws-cloud](skills/aws-cloud/SKILL.md), [aws-lakehouse](skills/aws-lakehouse/SKILL.md), [aws-etl-cdc](skills/aws-etl-cdc/SKILL.md), [log-data-offloading](skills/log-data-offloading/SKILL.md), [terraform-deployment](skills/terraform-deployment/SKILL.md) 참고).

**레거시 워크로드 표면:** `--workload=<키,...>|all`은 저수준 직접 워크로드 키 지정을 계속 지원합니다. 카테고리 선택과 합집합됩니다. 숨은/고립 워크로드 키는 없습니다 — 모든 워크로드가 카테고리 트리에서 도달 가능하며, `scripts/lib/categories.js`의 커버리지 테스트가 이를 강제합니다.

## 리뷰 백엔드 토글

`--review-backend`로 코드 리뷰 에이전트 설치 방식을 제어하세요:

- `--review-backend claude` (기본값): 네이티브 리뷰어 제외; `peer-reviewer` 에이전트를 통해 리뷰 라우팅 (터미널 Claude Code `claude -p` 호출로 교차 모델 의견 수렴 — Kiro + Claude 2-way)
- `--review-backend cross`: `claude`와 동일하게 라우팅하되, `peer-reviewer`가 Claude Code(`claude -p`)와 Codex CLI(`codex`) **양쪽** 의견을 모아 **Kiro + Claude + Codex 3-way**로 종합합니다. 온디맨드 `cross-review.sh`도 설치합니다(`bash .kiro/hooks/cross-review.sh`로 커밋되지 않은 변경을 교차 점검). 각 외부 CLI는 없으면 graceful하게 건너뜁니다. 모든 리뷰가 3-way일 필요는 없으므로, 이 스크립트는 자동 훅이 **아니라** 선택 실행입니다.
- `--review-backend kiro`: 네이티브 Kiro 리뷰어 에이전트 설치 (code-reviewer, security-reviewer, 언어 리뷰어)

빌드 에이전트(build-error-resolver, 언어 build-resolver, e2e-runner, kiro-cli)는 이 토글과 관계없이 항상 네이티브입니다.

## 모델

에이전트 모델 할당은 역할 기반이며, **프로바이더 독립적인 세 능력 티어**로 구성됩니다. 각 에이전트 정의의 `model` 필드가 유일한 소스이며, [`scripts/lib/model-policy.js`](scripts/lib/model-policy.js)에서 기록됩니다. 이 하네스는 **Kiro 세 모델에 최적화**되어 있습니다 — **`claude-opus-5`**(심층 추론, 천장), **`claude-sonnet-5`**(균형, 기본 코딩 티어), **`claude-haiku-4.5`**(비용 최적화). `kiro-cli` 오케스트레이터(설치 시 기본 에이전트로 지정)는 천장 티어에서 추론 에이전트와 함께 실행되며, 물량이 많은 코딩 에이전트는 `claude-sonnet-5`, 비용 민감 역할은 `claude-haiku-4.5`를 씁니다.

| 티어 | 모델 | 에이전트 |
|------|------|----------|
| 심층 추론 (천장) | `claude-opus-5` | kiro-cli(오케스트레이터), architect, security-reviewer, deep-researcher, devops, peer-reviewer |
| 균형 (기본) | `claude-sonnet-5` | code-reviewer, refactor-cleaner, 언어 리뷰어, 빌드 해결자, database-reviewer, e2e-runner, 문서/기술 작성자 |
| 비용 최적화 | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |

설계 원칙: **Opus 5가 오케스트레이션과 추론을 담당하고, Sonnet이 코딩 물량을 처리하며, Haiku는 값싼 대량 작업을 맡는다.** 동일한 능력 티어가 OpenAI에도 매핑됩니다: `deep-reasoning → gpt-5.6-sol`, `balanced → gpt-5.6-terra`, `cost-optimized → gpt-5.6-luna`. `--provider=anthropic|openai|mixed`로 선택하세요. 설치기는 설치된 산출물만 변경하며 Anthropic 우선 소스 자산은 손대지 않습니다. 또한 모든 설치된 에이전트에 그 에이전트의 모델 패밀리에 맞는 간결한 운영 노트를 주입합니다(글로벌 플래그가 아니라): Claude 패밀리 에이전트는 plan/자가검증과 1M 컨텍스트 가이드를 받고, GPT 패밀리 에이전트는 배치 도구/조기 컴팩션 가이드(272K 컨텍스트용)를 받습니다. 전체 배정·훅→티어 가이드·프로바이더 전환: [모델 라우팅](docs/kr/model-routing.md).

**`mixed` 패턴(Fable 오케스트레이션 + Sol 서브에이전트).** `--provider=mixed`는 오케스트레이터(`kiro-cli`)만 `claude-fable-5`로 고정하고 **다른 모든 역할을 티어 무관 `gpt-5.6-sol`**로 라우팅합니다 — Claude가 오케스트레이션·위임·수렴을 담당하고, GPT-5.6 Sol이 위임된 작업 전부를 OpenAI 천장 티어에서 처리합니다. 각 에이전트는 자신의 패밀리에 맞는 운영 노트를 받으며, `cross-review.sh`는 Codex를 먼저 실행합니다(Fable 작성 변경 vs. Fable 측) — Claude Code는 Sol 작성 측을 커버합니다. 사용 환경에서 `claude-fable-5`를 서빙하지 않으면 Kiro는 `chat.defaultModel`로 폴백하므로(경고와 함께), 설치기는 **`claude-opus-5`를 노력 `max`**로 대체하는 두 `kiro-cli settings` 명령을 출력합니다:

```bash
kiro-cli settings chat.defaultModel claude-opus-5
kiro-cli settings chat.modelDefaults '{"claude-opus-5":{"output_config":{"effort":"max"}}}'
```

### Opus 5가 천장이다 — 안으로 에스컬레이션한 후 옆으로

`claude-opus-5` 위의 티어는 없습니다. 태스크가 최상위 티어 성능을 초과해야 할 때, 더 큰 모델에 도달하는 대신 하네스는 두 방향으로 에스컬레이션합니다:

1. **안으로 — 같은 티어 내에서 노력을 올린다.** `low` → `medium` → `high` → `xhigh` → `max`. 같은 모델, 더 큰 추론 예산, 티어 점프보다 저렴합니다. Kiro는 이를 `kiro-cli chat --effort <level>`과 `kiro-cli settings chat.modelDefaults '{"claude-opus-5":{"output_config":{"effort":"max"}}}'`로 노출합니다. 설치기가 정확한 명령을 출력합니다(effort는 세션/설정 손잡이이지 에이전트 설정이 아닙니다). **하네스 기본값은 모든 추론 역할에서 `max`** — 사다리는 기계적 역할(refactor-cleaner, translator-docs → `low`)을 낮추는 용도이며, 가이드레일은 보안 중심 최소(결정적 게이트 2개)로 유지해 모델의 추론 예산이 일하게 한다.
2. **옆으로 — 다른 모델 패밀리.** `max`에는 그 위가 없습니다. 같은 패밀리에 다시 프롬프트하면 상관관계가 있는 blind spot을 깨뜨릴 수 없습니다(같은 학습, 같은 failure 모드), 따라서 남은 축은 다른 패밀리입니다: `peer-reviewer` 에이전트(터미널 `claude -p` + `codex`)와 `--review-backend cross` 사용 시 `bash .kiro/hooks/cross-review.sh`. 선택된 프로바이더가 우선순위를 결정합니다: Anthropic 호스팅 fleet은 Codex를 먼저 호출하고, OpenAI 호스팅 fleet은 Claude Code를 먼저 호출합니다. 다른 백엔드는 같은 패밀리 상호 검증으로 남습니다. **독립성** 또는 **grinding**이 가치인 곳으로 넘기세요 — 이 fleet이 작성한 코드에 대한 adversarial review, 두 의견이 어긋날 때 tie-breaking, 대규모 기계 편집, 막힌 상태에서 두 번째 진단. 스티어링 규칙, 스킬, 워크로드 태그, 도구 오케스트레이션, 한국어 출력이 필요한 모든 것은 하네스에 유지하세요.

> **옆 축을 가치있게 만드는 규칙:** 중요한 무언가의 *유일한* 독자가 외부 패밀리가 되게 하지 마세요. 그것만 보고하는 발견은 여전히 실제 코드에 대한 확인이 필요하며, 두 패밀리가 독립적으로 플래그하는 발견이 높은 신뢰도입니다. `cross-review.sh`는 실행의 끝에 이를 출력하며, review 전에 **blast radius**를 추출합니다 — 변경되지 *않았지만* 어쨌든 리뷰되어야 할 파일들로, reverse `require`/`import` 참조와 역사적 co-change를 통해 찾습니다.

> **모델 가용성:** `claude-opus-5`는 **us-east-1**과 **eu-central-1**에서 서빙되며 최신 Kiro CLI가 필요합니다. 서빙되지 않는 모델로 고정된 에이전트는 경고와 함께 `chat.defaultModel`로 조용히 폴백합니다 — `/model`로 확인하고 Kiro CLI를 최신으로 유지하세요.

> **모델 ID 형식:** Kiro는 `model` 값을 model service가 반환하는 ID와 대조하며, 알 수 없는 ID는 경고와 함께 기본 모델로 silent 폴백됩니다. 고정 전 활성 채팅 세션에서 `/model`로 정확한 식별자를 확인하세요.

## Kiro 버전 호환성 (CLI 2.x / 3.0 / IDE 1.0)

- **CLI 3.0 (v3 engine, `kiro-cli --v3`로 옵트인):** 훅이 에이전트 임베디드 camelCase 필드에서 독립 `.kiro/hooks/*.json` 파일(v1 schema, PascalCase 트리거)로 이관됩니다. `--cli-version 3`으로 설치하면 2개 게이트 훅을 외부화하고 v3 엔진이 읽지 않는 임베디드 `hooks` 필드를 제거합니다. 에이전트 설정 자체는 하위 호환성이 있습니다. `toolsSettings` → `permissions` 마이그레이션을 하려면 `/upgrade-agent` 또는 `kiro-cli agent migrate`를 사용하세요. 기본값(`--cli-version 2`)은 현재의 2.x 임베디드 훅 설치를 유지합니다.
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

**Ponytail 주입:** Lazy senior dev 원칙(`rules/common/ponytail.md`)을 이 저장소의 **모든** 에이전트 정의에 무조건 사전 주입합니다 — CLI 에이전트는 `prompt` 필드, IDE 에이전트는 본문 — 설치는 그것을 그대로 복사합니다. 이는 무조건이며, 하네스는 ponytail을 유일한 조직화 원칙으로 유지합니다(상충 논리 없음). 그래서 글로벌 리소스 상속을 끈 상황에서도(`kiro-cli settings chat.disableInheritingDefaultResources true` — 격리된 워크스페이스에 권장) 모든 역할이 이 원칙을 받으며, steering으로만 전달하면 서브에이전트에 닿지 않는 상황이 정확히 그것일 때입니다. 산출물이 전수·정밀·절차인 역할(보안 감시, e2e 커버리지, 리서치 인용)은 주입된 요약본의 review-lens 문장과 "Never lazy about … anything explicitly requested" 조항으로 그 긴장을 스스로 해소합니다 — 정책상 누락된 결과를 보고하지 않고, 명시된 절차는 생략하지 않습니다. 주입은 멱등이며, 어느 역할이 주입되는지 보려면 `node scripts/apply-ponytail.js --list`를 실행하세요(제외 목록은 정책상 비어 있음). 문구를 수정한 뒤 재적용하려면 에이전트 파일을 되돌린 뒤 다시 실행합니다. SSOT는 `scripts/apply-ponytail.js`(`BRIEF`, 의도적으로 빈 `EXEMPT`)이고, `test/ponytail.test.js`가 전면 커버리지와 빈 EXEMPT를 강제합니다.

### 훅

**CLI 계층** (기본값, `--cli-version 2`): 훅은 에이전트 JSON 내에 내장되며, 2종 결정적 게이트 스크립트가 받침합니다. `--cli-version 3`이면 동일한 2개 게이트가 독립 `.kiro/hooks/*.json`(v1 schema)으로 설치되고 v3.0 엔진용으로 임베디드 필드가 제거됩니다. 게이트 스크립트 — `pre-write-guard.sh`(fs_write: 비밀, 과대 write), `pre-push-guard.sh`(execute_bash: 기본 브랜치 push 차단, `KIRO_ALLOW_MAIN_PUSH=1`로 우회 가능). `cross-review.sh`는 훅이 아니라 온디맨드 스크립트입니다.

**IDE 계층** (`.kiro/hooks/`): 2개 결정적 게이트, CLI 계층과 대칭:
- pre-write-guard: 크기 제한, 비밀 탐지, 문서 위치 확인
- git-pipeline-guard: 기본 브랜치로의 `git push`를 차단하고 branch → commit → push → PR → merge를 안내한다

이벤트 기반 에이전트 자동화(review-on-stop, capture-lessons, changelog-on-commit)는 v2에서 제거됨 — 리뷰는 온디맨드(code-reviewer 에이전트, `cross-review.sh`), 교훈은 `lessons-learned` 스킬에, CHANGELOG 규약은 저장소 스티어링에 정의됩니다.

### 스티어링

**CLI 계층**: 글로벌 스티어링 = AGENTS.md(에이전트 협업 가이드) + minimal-core(컴팩트 항시 digest incl. AWS/Terraform 게이트) + ponytail; 에이전트는 `skill://`을 통해 스킬을 참조합니다.

**IDE 계층** (`.kiro/steering/`):
- Always-on (v2 minimal): minimal-core (컴팩트 digest — working style·security·git pipeline·AWS/Terraform 게이트) + ponytail
- FileMatch: 파일 타입별로 로드되는 언어 특화 규칙
- Manual: 필요 시 로드되는 스킬 (134개 총; 워크로드로 선택적 포함 태그됨)

### 스킬

`skills/` 아래 134개 스킬 패키지는 워크로드로 태그됩니다. 설치는 활성 워크로드와 교집합인 스킬만 선택합니다.
- 핵심: context budget, strategic compact, agentic engineering, lessons learned, git workflow, verification loop
- 인프라: Docker, deployment, backend patterns
- 데이터베이스 (NoSQL): MongoDB, DynamoDB (+ mongodb-patterns) — RDBMS 설계·마이그레이션 스킬은 별도 easy-rdbms 플러그인으로 이관
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

**클라우드 워크로드**에는 다음이 포함됩니다: terraform, aws-documentation, cloudwatch, aws-ecs, aws-iam (DevOps); aws-pricing, aws-billing-cost-management (FinOps). 이들은 **온디맨드 stdio 프로세스**로 실행됩니다 — 아래를 참고하세요.

전체 카탈로그(general / DevOps / FinOps / opt-in: brave-search·sentry·time 포함)와 설정 안내: `docs/kr/mcp-reference.md`.

**DevOps MCP는 상주하지 않습니다(온디맨드).** terraform + AWS 서버들은 도구가 실제 사용될 때 클라이언트가 시작하는 stdio 프로세스로 실행되며, 세션과 함께 종료됩니다 — 도구를 사용 중이 아닐 때는 `docker ps`에 아무것도 뜨지 않으며, 보안해야 할 HTTP 엔드포인트도 없습니다. 백엔드는 호스트의 `uvx`로 버전 핀된 공식 AWS `awslabs` 서버이고, terraform은 버전 핀된 이미지로 `docker run -i --rm`으로 실행됩니다. 호스트에 `uv` 필요(`brew install uv`); Docker는 terraform에만 필요합니다.

이는 `:9092`의 상주 프록시를 대체합니다. 그 프록시는 콜드스타트를 '우회'하기 위해 존재했지, 원인을 고친 것이 아니었습니다. 원래 실패는 이렇습니다: 각 서버가 버전 핀 없는 `docker run`이었고, **첫 이미지 pull이 14~20초 걸려** MCP 초기화 타임아웃을 초과했으므로 **devops MCP 전부가 한 번에 실패**했습니다. 버전을 핀하고 호스트 `uvx`로 옮기면 pull이 사라지므로, warm-cache handshake는 **서버당 0.5~4.9초**로 프록시가 필요 없습니다. 또한 `~/.aws`를 마운트한 인증 없는 `:9092` 엔드포인트도 사라졌고, stdio는 호스트 프로세스이므로 `aws sso login` 이 읽기전용 마운트에 막히지 않고 즉시 반영됩니다.

**범용 프록시(`--mcp-proxy`, IDE 계층).** 범용 서버들을 선택적으로 하나의 로컬 [mcp-proxy](mcp-proxy/README.md) 컨테이너에 집중화할 수 있으므로, 클라이언트가 각각 중복을 띄우지 않습니다. `mcp.json` 항목은 `{"type":"http","url":"http://localhost:9090/<server>/mcp"}`로 변환됩니다. 설치기가 자동 보장합니다: `docker ps`로 확인해 컨테이너가 없으면 `docker compose up -d mcp-proxy`를 실행하고, 이미 떠 있으면 스킵합니다. 활성 워크로드에 맞는 백엔드만 담은 **`config.generated.json`**도 생성하므로 프록시가 "필요한 것만" 서빙합니다. `127.0.0.1`로만 바인드되며 인증 없으므로 바인딩을 확대하지 마세요. Docker 미설치면 Docker 설치 후 재실행 안내, 데몬 미실행이면 시작 후 재실행 안내, `--dry-run`과 실패는 graceful하게 넘어갑니다. 자세한 것: [`mcp-proxy/README.md`](mcp-proxy/README.md), [MCP 레퍼런스](docs/kr/mcp-reference.md).

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
├── skills/                     # 134개 스킬 패키지 (워크로드 태그됨)
├── mcp-configs/                # MCP 서버 설정
├── scripts/                    # 검증 유틸리티 (validate-agents.js, validate-models.js, validate-counts.js)
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
  --<category>-<sub>= <list>     소분류 옵션 (예: --writing-social=voice; 소분류가 있는 중분류만)
  --workload <list|all>          저수준: 워크로드 키 직접 지정 (쉼표로 구분 또는 'all'; 레거시 표면, 카테고리와 합집합)
  --provider <anthropic|openai|mixed>  모델 프로바이더 프로필 (기본: anthropic); 역할 모델·effort 가이드·운영 노트·교차 패밀리 우선순위를 설치 에이전트에 기록. mixed = Fable 오케스트레이션 + 나머지 전 역할 Sol (Fable 미서빙 시 opus-5 max 폴백 명령 출력)
  --cli-version <2|3>            CLI 계층 훅 포맷 (기본 2 = agent 임베디드; 3 = 독립 .kiro/hooks/*.json for CLI 3.0 engine)
  --review-backend <kiro|claude|cross> 코드 리뷰 라우팅 (기본: claude; cross = Claude+Codex 3-way + cross-review.sh)
  --mcp-proxy                    IDE 전용: mcp.json을 범용 mcp-proxy(:9090) 경유로 구성 + 그 컨테이너 자동 기동
                                 (DevOps/AWS MCP는 영향을 받지 않습니다 — 온디맨드 stdio로 실행되며, 컨테이너 없음)
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
| [Kiro Crew](docs/kr/crew-integration.md) | `kiro-cli crew`, Crew Gateway, 그리고 공유되는 `~/.kiro/agents/` 디렉터리 — 자산 매핑, 역할 분담, 보안 |
| [MCP 레퍼런스](docs/kr/mcp-reference.md) | 큐레이션 MCP 카탈로그 (내장 / general / DevOps / FinOps / opt-in) |
| [모델 라우팅](docs/kr/model-routing.md) | 3-티어 모델 정책(Opus/Sonnet/Haiku), Opus-5 천장 + effort/cross-family 에스컬레이션, 에이전트별 배정, 훅→티어 가이드, OpenAI GPT-5.6 프로바이더 전환 |
| [스킬 카탈로그](docs/kr/skill-catalog.md) | 134개 스킬 도메인별 정리 |
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
