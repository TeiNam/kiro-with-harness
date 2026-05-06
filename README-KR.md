# Kiro Harness

[English](README.md)

![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-yellow.svg)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933.svg)

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://qr.kakaopay.com/Ej74xpc815dc06149)

Kiro IDE용 하네스 엔지니어링. 프로필 기반 인스톨러로 스티어링 룰, 훅, 에이전트, 스킬, MCP 설정을 Kiro 워크스페이스에 배포합니다.

## 빠른 시작

인스톨러는 **글로벌**(모든 프로젝트 공통)과 **워크스페이스**(프로젝트별) 2단계 구조를 사용합니다.

```bash
# 처음이라면? 인자 없이 실행하면 설치 가이드가 표시됩니다
node install.js

# 1단계: 글로벌 설치 (에이전트, MCP, 필수 스킬 → ~/.kiro)
node install.js global

# 2단계: 워크스페이스 프로필 설치 (현재 프로젝트)
node install.js developer

# 특정 프로젝트에 설치
node install.js backend --target /path/to/project

# 특정 모듈만 설치
node install.js --modules steering-infra,hooks-quality

# 명시적 범위 지정으로 모듈 설치
node install.js --scope global --modules agents-global,skills-global

# 모든 프로필과 모듈 목록 확인
node install.js --list

# 설치 상태 확인
node install.js --status
node install.js --status --scope global
```

> **참고:** 글로벌 설정이 감지되지 않으면 글로벌 설치를 먼저 권장합니다. 글로벌 설정은 모든 워크스페이스가 상속하는 기반(에이전트, 가드레일, MCP 카탈로그)을 제공합니다.

## 설치 구조

### 글로벌 (`~/.kiro/`)

한 번 설치하면 모든 Kiro 워크스페이스에 적용:

| 구성 요소 | 내용 |
|-----------|------|
| 스티어링 | Git 워크플로우, 패턴, 성능 규칙 |
| 훅 | 작업 완료 후 리뷰, 쓰기 전 가드 (크기/시크릿/문서 위치) |
| 에이전트 | 7개 글로벌 에이전트 — architect, code-reviewer, deep-researcher, security-reviewer, refactor-cleaner, devops, translator-docs |
| 스킬 | 4개 필수 스킬 — verification loop, coding standards, strategic compact, context budget |
| MCP | 전체 MCP 서버 카탈로그 (필요 시 활성화) |

### 워크스페이스 (프로젝트의 `.kiro/`)

글로벌 위에 프로젝트별 설정을 레이어링:

| 구성 요소 | 내용 |
|-----------|------|
| 스티어링 | 코딩 스타일, 보안, 테스트 + 언어별 규칙 (fileMatch) + 프레임워크 스킬 (manual) |
| 훅 | 쓰기 전 가드, 품질 훅, 가드레일 |
| MCP | 동일 카탈로그 (워크스페이스에서 오버라이드 가능) |

## 프로필

| 프로필 | 설명 |
|--------|------|
| `global` | 범용 기본 — 글로벌 에이전트, 필수 스킬, 가드레일, MCP 카탈로그. `~/.kiro/`에 설치 |
| `core` | 최소 개발 기본 — 공통 룰, 보안 훅, MCP |
| `developer` | 표준 개발 — core + 언어별 룰, 스킬, 인프라, 아키텍처, 품질, 훅 |
| `full` | 전체 — 모든 모듈 + 하네스 소스 참조 |
| `writer` | 글쓰기/콘텐츠 — 아티클, 소셜 미디어, 리서치 |
| `mobile` | 모바일 개발 — Android, Compose, SwiftUI, Swift 동시성 |
| `ai` | AI/LLM 개발 — Claude API, 비용 최적화 파이프라인, PyTorch |
| `backend` | 백엔드/API — Django, Spring Boot, Laravel, FastAPI, 인프라, DB |
| `frontend` | 프론트엔드 — Next.js, Nuxt4, Bun, TypeScript |
| `architect` | 아키텍처 — API 설계, ADR, 블루프린트, 품질 자동화 |

## 설치 항목

### 스티어링 (`.kiro/steering/`)

Kiro 컨텍스트에 주입되는 룰과 가이드라인:
- 상시 적용: 코딩 스타일, 보안, 테스트, git 워크플로우, 패턴, 성능
- 파일 매치: 해당 파일 열 때만 로드되는 언어별 룰 (11개 언어)
- 수동: 필요할 때만 로드하는 96개 스킬 — 프레임워크, DB 가이드라인, AI/LLM, 아키텍처 등

### 훅 (`.kiro/hooks/`)

이벤트 기반 자동화:
- 쓰기 전 가드 (파일 크기 제한, 시크릿 감지, 문서 위치 체크)
- 작업 완료 후 코드 리뷰
- TS/JS 파일 편집 시 진단
- 쓰기 후 console.log/TODO 경고
- 스펙 작업 후 테스트 리마인더

### 에이전트 (`agents/`)

27개 커스텀 에이전트:
- 범용: architect, planner, code-reviewer, security-reviewer, build-error-resolver, refactor-cleaner, doc-updater, database-reviewer
- 테스트: tdd-guide, e2e-runner
- 글쓰기: article-writer, content-creator, deep-researcher
- 언어별: TypeScript, Python, Go, Rust, Java, Kotlin, C++, Flutter 리뷰어 및 빌드 리졸버

### 스킬 (`skills/`)

96개 스킬 (도메인별 구성):
- 인프라: Docker, 배포, 데이터베이스 마이그레이션, 백엔드 패턴
- 데이터베이스: PostgreSQL, MySQL, MongoDB, DynamoDB, ClickHouse
- 백엔드 프레임워크: Django, Spring Boot, Laravel, FastAPI
- 프론트엔드: Next.js, Nuxt4, Bun, Flutter, Liquid Glass
- 모바일: Android, Compose Multiplatform, SwiftUI, Swift 동시성, Kotlin
- AI/LLM: Claude API, 비용 최적화 파이프라인, PyTorch, 온디바이스 모델
- 아키텍처: API 설계, ADR, 블루프린트, MCP 서버 패턴
- 품질: 에이전틱 엔지니어링, 컨텍스트 버짓, 지속적 학습
- 글쓰기: 아티클, 콘텐츠 엔진, 딥 리서치, 크로스포스팅
- 도메인: 공급망, 제조, 에너지, 컴플라이언스
- 언어별: Python, Go, Rust, C++, Kotlin, Perl, Java 테스트 및 패턴

### MCP (`.kiro/settings/mcp.json`)

사전 구성된 MCP 서버 카탈로그.

## 프로젝트 구조

```
├── install.js                  # 인스톨러 스크립트 (글로벌/워크스페이스 라우팅)
├── manifests/
│   ├── install-modules.json    # 모듈 정의 (28개 모듈)
│   └── install-profiles.json   # 프로필 정의 (10개 프로필)
├── rules/                      # 스티어링 소스 (공통 + 11개 언어)
├── agents/                     # 27개 커스텀 에이전트 (IDE + CLI 포맷)
├── skills/                     # 96개 스킬 패키지
├── docs/                       # 가이드 (eval harness, 프롬프트 템플릿, 비교)
├── mcp-configs/                # MCP 서버 설정
├── scripts/                    # 빌드/감사 유틸리티
└── .kiro/                      # 이 프로젝트 자체의 Kiro 설정
```

## CLI 레퍼런스

```
node install.js [options] [profile]

옵션:
  (인자 없음)              대화형 설치 가이드
  --list                 모든 프로필과 모듈 표시
  --status               현재 디렉토리 설치 상태 확인
  --status --scope global  글로벌 설치 상태 확인
  --target <경로>        지정 디렉토리에 설치
  --scope <global|workspace>  명시적 설치 범위
  --modules <목록>       특정 모듈만 설치 (쉼표 구분)
  --profile <이름>       명시적 프로필 선택
```

## 감사의 말

이 프로젝트는 [Everything Claude Code (ECC)](https://github.com/affaan-m/everything-claude-code)를 많이 참고하여 만들었습니다. 룰, 에이전트 패턴, 스킬 구조의 상당 부분이 ECC에서 비롯되었으며, Kiro IDE 네이티브 포맷(steering, hooks, skills)에 맞게 변환했습니다.
