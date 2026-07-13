# Kiro Harness

[English](README.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Kiro IDE를 위한 하네스 엔지니어링. 계층(CLI / IDE) 기반 설치 관리자와 워크로드 선택으로 큐레이션된 스티어링 규칙, 훅, 에이전트, 스킬, MCP 설정을 Kiro 워크스페이스에 배포합니다. Claude Opus 4.8에 최적화 — 역할 기반 모델 라우팅, DAG 스타일 병렬 위임, 공유 에이전트 협업 가이드(AGENTS.md).

## 빠른 시작

설치 관리자는 **계층 × 워크로드** 모델을 사용합니다: `cli` 또는 `ide`를 선택한 후 워크로드를 선택하세요.

```bash
# 대화형 설치 (가이드 프롬프트: 티어, scope, 워크로드, 리뷰 백엔드, MCP 프록시)
node install.js              # 또는: node install.js -i

# CLI 계층: 글로벌 기본 설정 설치 (오케스트레이터 에이전트, 스킬 → ~/.kiro)
node install.js cli --scope global --workload core

# CLI 계층: 워크스페이스 설정 설치 (언어 리뷰어, 빌드 해결자 → 프로젝트 .kiro)
node install.js cli --scope workspace --workload rust,python

# IDE 계층: 프로젝트 설정 설치 (에이전트, 훅, 스티어링 → 프로젝트 .kiro)
node install.js ide --workload typescript,frontend

# 여러 워크로드 설치
node install.js cli --scope global --workload cloud,rust,go

# 모든 워크로드 설치 (lab 제외)
node install.js cli --scope global --workload all

# 사용 가능한 워크로드 나열
node install.js --list

# 설치 상태 확인
node install.js --status
node install.js --status --scope global

# 파일을 쓰지 않고 미리보기 (모든 명령어에서 작동)
node install.js cli --scope global --workload core --dry-run
```

> **기본값:** CLI는 기본적으로 글로벌에 설치됩니다(~/.kiro); IDE는 기본적으로 워크스페이스에 설치됩니다(프로젝트 .kiro).

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

## 워크로드 (총 29개)

모든 설치에는 **core**(보편적 규칙, 기본 에이전트)가 포함됩니다. 이름으로 추가 워크로드를 선택하세요.

| 카테고리 | 워크로드 | 목적 |
|----------|---------|------|
| **언어** | python, rust, go, java, javascript, typescript, node, kotlin, cpp, csharp, php, perl, swift | 언어별 규칙, 리뷰어, 빌드 해결자 (필요한 언어만 선택) |
| **전문** | ai-agent, ai, cloud, frontend, mobile, python-data | 에이전트/하네스 구축; LLM/ML 사용; **cloud = AWS DevOps/FinOps + 데이터 엔지니어링**(SDK boto3/JS v3/CLI v2, S3 Tables/Iceberg/Athena/Spark 레이크하우스, DMS/Glue/Kinesis/MSK/Flink ETL·CDC, RDBMS→S3/OpenSearch 로그 오프로딩, EKS/MSK 최신버전 확인, Terraform); React/Next/Nuxt/Vite; Android/Swift/Compose; DuckDB/pandas/ClickHouse |
| **데이터베이스** | postgres, mysql, mongodb, dynamodb | DB 특화 규칙 및 리뷰어 |
| **기타** | architecture, writing, domain, obsidian | API 설계/ADR; 기사/리서치; 비즈니스 도메인; Obsidian 통합 |
| **특수** | lab | 숨김; `--workload lab`으로만 옵트인 |

예시:
- `--workload core,rust,postgres,cloud` — Rust, PostgreSQL, AWS 클라우드 + 데이터 엔지니어링 스킬군.
- `--workload core,cloud,python-data` — 데이터 플랫폼 집중: AWS SDK/레이크하우스/ETL-CDC/로그 오프로딩 + DuckDB/pandas 분석.

## 리뷰 백엔드 토글

`--review-backend`로 코드 리뷰 에이전트 설치 방식을 제어하세요:

- `--review-backend claude` (기본값): 네이티브 리뷰어 제외; `peer-reviewer` 에이전트를 통해 리뷰 라우팅 (터미널 Claude Code `claude -p` 호출로 교차 모델 의견 수렴 — Kiro + Claude 2-way)
- `--review-backend cross`: `claude`와 동일하게 라우팅하되, `peer-reviewer`가 Claude Code(`claude -p`)와 Codex CLI(`codex`) **양쪽** 의견을 모아 **Kiro + Claude + Codex 3-way**로 종합합니다. 온디맨드 `cross-review.sh`도 설치합니다(`bash .kiro/hooks/cross-review.sh`로 커밋되지 않은 변경을 교차 점검). 각 외부 CLI는 없으면 graceful하게 건너뜁니다. 모든 리뷰가 3-way일 필요는 없으므로, 이 스크립트는 자동 훅이 **아니라** 선택 실행입니다.
- `--review-backend kiro`: 네이티브 Kiro 리뷰어 에이전트 설치 (code-reviewer, security-reviewer, 언어 리뷰어)

빌드 에이전트(build-error-resolver, 언어 build-resolver, e2e-runner, kiro-cli)는 이 토글과 관계없이 항상 네이티브입니다.

## 모델

에이전트 모델 할당은 역할 기반이며, **프로바이더 독립적인 세 능력 티어**로 구성됩니다. 각 에이전트 정의의 `model` 필드가 유일한 소스이며, [`scripts/lib/model-policy.js`](scripts/lib/model-policy.js)에서 기록됩니다. 이 하네스는 **Kiro 세 모델에 최적화**되어 있습니다 — **`claude-opus-4.8`**(심층 추론), **`claude-sonnet-5`**(균형, 기본 코딩 티어), **`claude-haiku-4.5`**(비용 최적화). `kiro-cli` 오케스트레이터(설치 시 기본 에이전트로 지정)와 추론 에이전트는 `claude-opus-4.8`에 고정되고, 물량이 많은 코딩 에이전트는 `claude-sonnet-5`, 비용 민감 역할은 `claude-haiku-4.5`를 씁니다.

| 티어 | 모델 | 에이전트 |
|------|------|----------|
| 심층 추론 | `claude-opus-4.8` | kiro-cli, architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler |
| 균형 (기본) | `claude-sonnet-5` | code-reviewer, refactor-cleaner, 언어 리뷰어, 빌드 해결자, database-reviewer, e2e-runner, 문서/기술 작성자 |
| 비용 최적화 | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |

설계 원칙: **Opus는 추론·오케스트레이션, Sonnet은 코딩 물량, Haiku는 값싼 대량 작업.** 라우팅은 에이전트 단위라 역할별로 모델을 섞을 수 있습니다. OpenAI GPT-5.5 / GPT-5.4가 Kiro에서 선택 가능해지면 동일한 티어가 그대로 매핑됩니다(`deep-reasoning → gpt-5.5`, `balanced → gpt-5.4`) — `node scripts/apply-model-policy.js --provider=openai`로 재지정하세요. 전체 배정·훅→티어 가이드·프로바이더 전환 워크플로: [모델 라우팅](docs/kr/model-routing.md).

> **Opus 4.8 가용성:** `claude-opus-4.8`은 **실험적**이며 **us-east-1**과 **eu-central-1**에서만 사용 가능합니다. **Kiro CLI v2.5.0+**가 필요합니다. `claude-opus-4.8`으로 고정된 에이전트는 이전 CLI 버전 또는 지원되지 않는 지역에서 실패합니다 — Kiro CLI를 업그레이드하세요.

> **모델 ID 형식:** Kiro는 `model` 값을 model service가 반환하는 ID와 대조하며, 알 수 없는 ID는 경고와 함께 기본 모델로 silent 폴백됩니다. 고정 전 활성 채팅 세션에서 `/model`로 정확한 식별자를 확인하세요.

## Kiro 버전 호환성 (CLI 2.10 / IDE 1.0)

- **IDE 훅은 v1 JSON 포맷**(`.kiro/hooks/*.json`)을 사용합니다. IDE 1.0에서 도입되어 레거시 `.kiro.hook` 포맷을 대체하며, 레거시 훅은 마이그레이션 전까지 실행되지 않습니다. 설치기는 v1 JSON을 직접 생성합니다. `docs/kr/hook-reference.md` 참고.
- **기본 리소스 상속(CLI 2.7+):** 커스텀 에이전트는 자신의 `resources`에 더해 글로벌 steering·skills·`AGENTS.md`를 자동 상속합니다. 설치를 워크로드 범위로만 엄격히 유지하려면(글로벌 끌어오기 차단) 비활성화하세요: `kiro-cli settings chat.disableInheritingDefaultResources true` (`--workspace`로 프로젝트 범위 지정 가능). 내장 에이전트는 설정과 무관하게 항상 상속합니다.
- **Hot-reload(CLI 2.10+):** `~/.kiro/agents/*` 와 `mcp.json` 편집은 세션 재시작 없이 다음 idle 경계에서 반영됩니다 — 하네스를 재설치해도 채팅 컨텍스트 손실 없이 적용됩니다.

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
- Manual: 필요 시 로드되는 스킬 (137개 총; 워크로드로 선택적 포함 태그됨)

### 스킬

`skills/` 아래 137개 스킬 패키지는 워크로드로 태그됩니다. 설치는 활성 워크로드와 교집합인 스킬만 선택합니다.
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

## 프로젝트 구조

```
├── install.js                  # 계층 × 워크로드 설치 관리자
├── scripts/lib/
│   ├── workloads.js            # 워크로드 카탈로그 및 분류
│   ├── select-assets.js        # 자산 선택 엔진 + review-backend 필터
│   ├── tiers.js                # CLI/IDE 설치 계획자
│   └── tag-assets.js           # 워크로드 태깅
├── rules/                      # 스티어링 소스 (공통 + 언어별)
├── agents/
│   ├── cli/                    # CLI 에이전트 (글로벌 + 워크스페이스)
│   ├── ide/                    # IDE 에이전트 (Markdown)
│   └── AGENTS.md               # 공유 에이전트 협업 가이드
├── skills/                     # 137개 스킬 패키지 (워크로드 태그됨)
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
  --workload <list|all>          쉼표로 구분한 워크로드 또는 'all' (기본: core만)
  --review-backend <kiro|claude|cross> 코드 리뷰 라우팅 (기본: claude; cross = Claude+Codex 3-way + cross-review.sh)
  --target <path>                지정 디렉토리에 설치
  --dry-run                      파일을 쓰지 않고 변경 사항 미리보기
  --list                         모든 워크로드 표시
  --status                       설치 상태 표시
```

## 문서

전체 가이드는 `docs/` 아래에 있습니다 — 영어는 `docs/en/`, 한국어는 `docs/kr/`.

| 문서 | 내용 |
|------|------|
| [워크로드 가이드](docs/kr/profile-guide.md) | tier × workload 모델, 설치 플래그, 프로필 마이그레이션 |
| [훅 레퍼런스](docs/kr/hook-reference.md) | IDE 1.0 v1 JSON 훅 포맷, 트리거, 설치되는 훅 세트 |
| [MCP 레퍼런스](docs/kr/mcp-reference.md) | 큐레이션 MCP 카탈로그 (내장 / general / DevOps / FinOps / opt-in) |
| [모델 라우팅](docs/kr/model-routing.md) | 3-티어 모델 정책(Opus/Sonnet/Haiku), 에이전트별 배정, 훅→티어 가이드, OpenAI GPT-5.5/5.4 도입 계획 |
| [스킬 카탈로그](docs/kr/skill-catalog.md) | 137개 스킬 도메인별 정리 |
| [스킬 만들기](docs/kr/creating-skills.md) | `workloads:` frontmatter로 스킬 작성·등록 |
| [Claude vs Kiro](docs/kr/claude-vs-kiro.md) | Claude Code vs Kiro CLI vs Kiro IDE — 공식 문서 기준 기능별 차이 |
| [Claude에서 마이그레이션](docs/kr/migration-from-claude.md) | Claude Code 설정을 Kiro로 변환 |
| [Eval 하네스](docs/kr/eval-harness.md) | 평가 기반 개발 워크플로 |
| [프롬프트 템플릿](docs/kr/prompt-templates.md) | 재사용 가능한 프롬프트 템플릿 |

각 문서의 영어판은 `docs/en/`에 있습니다.

## 감사의 말

이 프로젝트는 [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)에서 큰 영감을 받았습니다. 많은 규칙, 에이전트 패턴, 스킬 구조가 ECC에서 유래했으며 Kiro IDE의 네이티브 형식(스티어링, 훅, 스킬)에 맞게 조정되었습니다.

`ponytail` 스티어링 규칙(lazy senior dev mode)은 [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)에서 가져왔으며, 불필요한 보일러플레이트 대신 최소한의 코드를 지향해 **토큰 사용량을 줄이기 위해** 적용했습니다.
