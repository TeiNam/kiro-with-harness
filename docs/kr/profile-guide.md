# 프로필(Profile) 선택 가이드

## 빠른 결정

| 당신은... | 사용할 프로필 |
|------------|-------------|
| Kiro를 처음 설정하는 경우 | `global` (이후 프로젝트 프로필 추가) |
| 개발 프로젝트를 시작하는 경우 | `core` (최소) 또는 `developer` (권장) |
| REST API를 구축하는 경우 | `backend` |
| 웹 프론트엔드를 구축하는 경우 | `frontend` |
| 모바일 앱을 구축하는 경우 | `mobile` |
| AI/LLM 작업을 하는 경우 | `ai` |
| 시스템 아키텍처를 설계하는 경우 | `architect` |
| 글이나 콘텐츠를 작성하는 경우 | `writer` |
| 모든 기능을 원하는 경우 | `full` |

## 프로필 모듈 맵

```
global ─── steering-global, hooks-global, docs-prompt-templates, mcp-catalog

core ───── steering-core, hooks-core, mcp-catalog

developer ─ steering-core
           ├── steering-languages (11개 언어)
           ├── steering-agent-knowledge
           ├── steering-skills
           ├── steering-writing-research
           ├── steering-infra
           ├── steering-architecture
           ├── steering-quality
           ├── steering-lang-testing
           ├── steering-lang-patterns
           ├── hooks-core + hooks-quality + hooks-guardrails
           ├── docs-eval-harness + docs-prompt-templates
           └── mcp-catalog

backend ─── steering-core
           ├── steering-languages
           ├── steering-agent-knowledge
           ├── steering-infra
           ├── steering-django
           ├── steering-springboot
           ├── steering-laravel
           ├── steering-fastapi
           ├── steering-architecture
           ├── hooks-core + hooks-quality + hooks-guardrails
           └── mcp-catalog

frontend ── steering-core
           ├── steering-languages
           ├── steering-frontend-frameworks
           ├── hooks-core + hooks-quality + hooks-guardrails
           └── mcp-catalog

mobile ──── steering-core
           ├── steering-languages
           ├── steering-mobile
           ├── hooks-core + hooks-quality
           └── mcp-catalog

ai ──────── steering-core
           ├── steering-languages
           ├── steering-ai-llm
           ├── hooks-core + hooks-quality
           ├── docs-eval-harness
           └── mcp-catalog

architect ─ steering-core
           ├── steering-agent-knowledge
           ├── steering-architecture
           ├── steering-quality
           ├── steering-infra
           ├── hooks-core
           ├── docs-eval-harness + docs-prompt-templates
           └── mcp-catalog

writer ──── steering-core
           ├── steering-writing-research
           ├── hooks-core
           ├── docs-prompt-templates
           └── mcp-catalog

full ────── (모든 모듈)
```

## 설치 패턴

### 최초 설정

```bash
# 1. 글로벌 기본 설정 설치 (한 번만, 모든 프로젝트에 적용)
node install.js global

# 2. 프로젝트 프로필 설치
node install.js developer
```

### 프로필 조합

프로필은 누적 방식입니다. 여러 번 설치하여 조합할 수 있습니다:

```bash
node install.js backend
node install.js --modules steering-ai-llm    # 백엔드 프로젝트에 AI 스킬 추가
```

### 모듈 단독 설치

프로필을 건너뛰고 개별 모듈만 선택할 수 있습니다:

```bash
node install.js --modules steering-django,steering-infra,hooks-core
```

### 설치 상태 확인

```bash
node install.js --status
```

## 글로벌(Global) vs 프로젝트(Project)

| 범위 | 위치 | 용도 |
|-------|----------|---------|
| 글로벌 | `~/.kiro/` | 모든 프로젝트에 적용되는 범용 규칙 (git 워크플로, 가드레일) |
| 프로젝트 | 프로젝트 루트의 `.kiro/` | 프로젝트별 규칙, 훅(Hook), 스킬(Skill) |

`global` 프로필은 `~/.kiro/`에 설치됩니다. 다른 모든 프로필은 현재 프로젝트(또는 `--target` 경로)에 설치됩니다.

## 스티어링(Steering) 포함 유형

| 유형 | 로드 시점 | 예시 |
|------|-------------|---------|
| always | 모든 Kiro 세션 | coding-style, security, testing |
| fileMatch | 일치하는 파일이 열릴 때 | `.ts` 파일 편집 시 TypeScript 규칙 |
| manual | 사용자가 채팅에서 `#`으로 추가 | Django 패턴, PostgreSQL 가이드라인 |
