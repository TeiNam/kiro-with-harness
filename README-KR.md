# Kiro Harness

[English](README.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)

Kiro IDE를 위한 하네스 엔지니어링. 계층(CLI / IDE) 기반 설치 관리자와 워크로드 선택으로 큐레이션된 스티어링 규칙, 훅, 에이전트, 스킬, MCP 설정을 Kiro 워크스페이스에 배포합니다. Claude Opus 4.8에 최적화 — 역할 기반 모델 라우팅, DAG 스타일 병렬 위임, 공유 에이전트 협업 가이드(AGENTS.md).

## 빠른 시작

설치 관리자는 **계층 × 워크로드** 모델을 사용합니다: `cli` 또는 `ide`를 선택한 후 워크로드를 선택하세요.

```bash
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
| **전문** | ai-agent, ai, cloud, frontend, mobile, python-data | 에이전트/하네스 구축; LLM/ML 사용; DevOps/FinOps/Terraform/AWS/Docker/K8s; React/Next/Nuxt; Android/Swift/Compose; DuckDB/pandas/ClickHouse |
| **데이터베이스** | postgres, mysql, mongodb, dynamodb | DB 특화 규칙 및 리뷰어 |
| **기타** | architecture, writing, domain, obsidian | API 설계/ADR; 기사/리서치; 비즈니스 도메인; Obsidian 통합 |
| **특수** | lab | 숨김; `--workload lab`으로만 옵트인 |

예: `--workload core,rust,postgres,cloud`는 Rust, PostgreSQL, 클라우드(DevOps/FinOps) 지원을 설치합니다.

## 리뷰 백엔드 토글

`--review-backend`로 코드 리뷰 에이전트 설치 방식을 제어하세요:

- `--review-backend claude` (기본값): 네이티브 리뷰어 제외; `peer-reviewer` 에이전트를 통해 리뷰 라우팅 (터미널 Claude Code 호출로 교차 모델 의견 수렴)
- `--review-backend kiro`: 네이티브 Kiro 리뷰어 에이전트 설치 (code-reviewer, security-reviewer, 언어 리뷰어)

빌드 에이전트(build-error-resolver, 언어 build-resolver, e2e-runner, kiro-cli)는 이 토글과 관계없이 항상 네이티브입니다.

## 모델

에이전트 모델 할당은 역할 기반입니다. 각 에이전트 정의의 `model` 필드가 유일한 소스입니다.

| 역할 | 모델 | 에이전트 |
|------|------|----------|
| 추론 | `claude-opus-4.8` | architect, code-reviewer, security-reviewer, deep-researcher, devops, refactor-cleaner, 언어 리뷰어, 빌드 해결자 |
| 비용 최적화 | `claude-haiku-4.5` | translator-docs, article-writer, content-creator |
| 일반 | 상속됨 | 명시적 `model`이 없는 에이전트는 채팅에서 선택한 모델을 상속합니다 |

> **Opus 4.8 가용성:** `claude-opus-4.8`은 **실험적**이며 **us-east-1**과 **eu-central-1**에서만 사용 가능합니다. **Kiro CLI v2.5.0+**가 필요합니다. `claude-opus-4.8`으로 고정된 에이전트는 이전 CLI 버전 또는 지원되지 않는 지역에서 실패합니다 — Kiro CLI를 업그레이드하세요.

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
- Manual: 필요 시 로드되는 스킬 (119개 총; 워크로드로 선택적 포함 태그됨)

### 스킬

`skills/` 아래 119개 스킬 패키지는 워크로드로 태그됩니다. 설치는 활성 워크로드와 교집합인 스킬만 선택합니다.
- 핵심: context budget, strategic compact, agentic engineering, lessons learned
- 인프라: Docker, deployment, database migrations, backend patterns
- 데이터베이스: PostgreSQL, MySQL, MongoDB, DynamoDB
- 백엔드: Django, Spring Boot, Laravel, FastAPI
- 프론트엔드: Next.js, Nuxt4, Bun
- 모바일: Android, Compose, SwiftUI, Swift concurrency
- AI/LLM: Claude API, cost-aware pipelines, PyTorch
- 아키텍처: API design, ADR, blueprint, MCP patterns
- 작성: articles, content, research, crossposting

### MCP

`.kiro/settings/mcp.json`(또는 CLI 글로벌의 경우 `~/.kiro/settings/mcp.json`)에 설치되는 큐레이션된 MCP 서버 카탈로그.

**클라우드 워크로드**에는 다음이 포함됩니다: terraform, aws-documentation, aws-core, cloudwatch, aws-ecs, aws-iam (DevOps); aws-pricing, aws-billing-cost-management (FinOps).

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
├── skills/                     # 119개 스킬 패키지 (워크로드 태그됨)
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
  --scope <global|workspace>     설치 범위 (기본: CLI는 global, IDE는 workspace)
  --workload <list|all>          쉼표로 구분한 워크로드 또는 'all' (기본: core만)
  --review-backend <kiro|claude> 코드 리뷰 라우팅 (기본: claude)
  --target <path>                지정 디렉토리에 설치
  --dry-run                      파일을 쓰지 않고 변경 사항 미리보기
  --list                         모든 워크로드 표시
  --status                       설치 상태 표시
```

## 감사의 말

이 프로젝트는 [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)에서 큰 영감을 받았습니다. 많은 규칙, 에이전트 패턴, 스킬 구조가 ECC에서 유래했으며 Kiro IDE의 네이티브 형식(스티어링, 훅, 스킬)에 맞게 조정되었습니다.
