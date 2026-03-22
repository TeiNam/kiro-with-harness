# Kiro IDE vs Claude Code 차이점 가이드

> Kiro IDE와 Claude Code의 핵심 차이를 이해하고,
> Claude Code 기반 하네스를 Kiro에 적용할 때 무엇이 달라지는지 정리한 문서
> 작성일: 2026-03-22

---

## 1. 핵심 차이점 한눈에 보기

| 영역 | Claude Code | Kiro IDE |
|------|-------------|----------|
| **규칙/가이드라인** | `rules/` 디렉토리, `CLAUDE.md` | `.kiro/steering/*.md` (always / fileMatch / manual) |
| **훅 시스템** | `hooks.json` (PreToolUse / PostToolUse / Stop 등) | `.kiro/hooks/*.kiro.hook` (fileEdited / preToolUse / postToolUse 등) |
| **훅 입력** | stdin으로 JSON 수신, exit code 2로 차단 가능 | 이벤트 메타데이터만, `preToolUse` + `askAgent`로 판단 위임 |
| **슬래시 커맨드** | `commands/*.md` (59개) | 없음 — 대화로 동일 작업 요청 |
| **커스텀 에이전트** | `agents/*.md` (서브에이전트 위임) | 없음 — 내장 에이전트만 사용 (context-gatherer, general-task-execution) |
| **스킬** | `skills/*/SKILL.md` (자동 감지) | `.kiro/steering/*.md`에서 자동/조건부/수동 감지 지원 |
| **스펙** | 없음 | `.kiro/specs/` (요구사항 → 설계 → 구현 태스크) — Kiro 고유 기능 |
| **MCP 설정** | `mcp-configs/mcp-servers.json` | `.kiro/settings/mcp.json` |
| **세션 영속화** | `session-start.js` / `session-end.js` 훅으로 직접 관리 | Kiro가 자체 관리 — 별도 스크립트 불필요 |
| **컨텍스트 압축** | `/compact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` | Kiro가 자체 관리 |
| **모델 라우팅** | `/model sonnet`, `CLAUDE_CODE_SUBAGENT_MODEL` | Kiro가 자체 관리 |
| **훅 프로파일 제어** | `HOOK_PROFILE=minimal\|standard\|strict` 환경 변수 | 없음 — 훅 파일 자체를 추가/제거 |

---

## 2. 영역별 상세 차이

### 2.1 규칙 / 가이드라인

Claude Code는 `rules/` 디렉토리와 `CLAUDE.md`에 규칙을 두고 모든 대화에 일괄 로드합니다.

Kiro는 **스티어링(Steering)** 시스템을 사용합니다. 세 가지 로드 모드가 있습니다:

| 모드 | 동작 | 사용 예 |
|------|------|---------|
| `always` | 모든 대화에 자동 포함 | 코딩 스타일, 보안 규칙, TDD 워크플로우 |
| `fileMatch` | 특정 파일 패턴 열릴 때만 포함 | TypeScript 규칙 (`**/*.ts`), Python 규칙 (`**/*.py`) |
| `manual` | 사용자가 `#키워드`로 명시적 호출 시만 포함 | 코드 리뷰 체크리스트, 계획 템플릿 |

```markdown
---
inclusion: fileMatch
fileMatchPattern: "**/*.ts,**/*.tsx"
---
# TypeScript 코딩 규칙
```

`fileMatch`와 `manual` 모드를 활용하면 토큰 낭비 없이 필요한 지식만 로드할 수 있습니다.

---

### 2.2 훅 시스템

두 플랫폼 모두 이벤트 기반 자동화를 지원하지만 스키마와 동작 방식이 다릅니다.

**이벤트 타입 비교**

| Claude Code | Kiro |
|-------------|------|
| `PreToolUse` | `preToolUse` |
| `PostToolUse` | `postToolUse` |
| `Stop` | `agentStop` |
| (없음) | `fileEdited`, `fileCreated`, `fileDeleted` |
| (없음) | `promptSubmit` |
| (없음) | `preTaskExecution`, `postTaskExecution` |
| (없음) | `userTriggered` |

**훅 동작 방식 비교**

| 항목 | Claude Code | Kiro |
|------|-------------|------|
| 입력 | stdin으로 JSON 수신 | 이벤트 메타데이터만 |
| 차단 방법 | exit code 2 반환 | `preToolUse` + `askAgent`로 에이전트에게 판단 위임 |
| 비동기 실행 | `async: true` 옵션 | 없음 (runCommand는 동기) |
| 도구 필터 | 정규식 매처 (`Bash\|Edit\|Write`) | `toolTypes` 카테고리 (`read`, `write`, `shell`, `web`) 또는 정규식 |
| 프로파일 제어 | `HOOK_PROFILE` 환경 변수 | 없음 — 훅 파일 자체를 추가/제거 |

**Kiro 훅 JSON 예시**

```json
{
  "name": "TS/JS 파일 편집 후 린트",
  "version": "1.0.0",
  "when": {
    "type": "fileEdited",
    "patterns": ["*.ts", "*.tsx", "*.js", "*.jsx"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "A TS/JS file was edited. Use getDiagnostics to check for lint and type errors instead of running shell commands. Do NOT use executeBash or terminal for linting."
  }
}
```

> **참고**: 터미널 블로킹 방지를 위해 `runCommand` 대신 `askAgent` + `getDiagnostics`를 사용합니다.

```json
{
  "name": "쓰기 작업 전 보안 검토",
  "version": "1.0.0",
  "when": {
    "type": "preToolUse",
    "toolTypes": ["write"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "이 쓰기 작업이 보안 규칙을 준수하는지 확인하세요: 하드코딩된 시크릿 없음, 사용자 입력 검증됨, SQL 인젝션 방지됨"
  }
}
```

---

### 2.3 에이전트

Claude Code는 `agents/*.md`로 커스텀 서브에이전트를 정의하고 위임할 수 있습니다.

Kiro는 **내장 에이전트만** 지원합니다:
- `context-gatherer` — 코드베이스 탐색 및 관련 파일 식별
- `general-task-execution` — 범용 태스크 실행

커스텀 에이전트 정의 파일은 Kiro에서 직접 사용할 수 없습니다.
단, 에이전트가 담고 있는 **도메인 지식**(체크리스트, 워크플로우, 패턴)은
스티어링으로 변환하여 Kiro의 기본 동작에 녹일 수 있습니다.

| Claude Code 에이전트 | 추출할 지식 | Kiro 스티어링 변환 |
|---------------------|-----------|-------------------|
| `agents/code-reviewer.md` | 리뷰 체크리스트 | `.kiro/steering/code-review-checklist.md` (manual) |
| `agents/security-reviewer.md` | OWASP Top 10, 코드 패턴 플래그 | `.kiro/steering/security.md`에 통합 (always) |
| `agents/tdd-guide.md` | TDD 단계, 엣지 케이스 목록 | `.kiro/steering/testing.md`에 통합 (always) |
| `agents/build-error-resolver.md` | 에러→수정 매핑 테이블 | `.kiro/steering/build-error-fixes.md` (manual) |
| `agents/planner.md` | 계획 포맷 템플릿 | `.kiro/steering/planning-template.md` (manual) |

---

### 2.4 슬래시 커맨드

Claude Code는 `commands/*.md`로 `/tdd`, `/verify`, `/plan` 같은 슬래시 커맨드를 정의합니다.

Kiro에는 슬래시 커맨드 시스템이 없습니다. 동일한 작업을 대화로 요청하거나,
워크플로우 로직을 스티어링으로 변환하여 Kiro가 자동으로 따르게 합니다.

---

### 2.5 스킬

Claude Code는 `skills/*/SKILL.md`를 자동 감지하여 적절한 상황에 활성화합니다.

Kiro도 스티어링 시스템을 통해 스킬을 자동 감지합니다.
`always` 모드는 항상 로드, `fileMatch`는 파일 패턴 매칭 시 자동 로드, `manual`은 `#키워드`로 호출합니다.
Claude Code의 스킬 디렉토리 구조(`skills/*/SKILL.md`)와는 다르지만, 동등한 자동 감지 기능을 제공합니다.

| 스킬 유형 | Kiro 변환 방법 |
|----------|--------------|
| 워크플로우 품질 스킬 (tdd-workflow, verification-loop 등) | `.kiro/steering/` (always 또는 manual) |
| 프레임워크 스킬 (django-patterns, springboot-patterns 등) | `.kiro/steering/` (fileMatch — 자동 감지) |
| 도메인 스킬 (api-design, security-review 등) | `.kiro/steering/` (manual) |
| 훅/스크립트 종속 스킬 (continuous-learning 등) | 변환 불가 — Claude Code 훅 체계 종속 |

---

### 2.6 스펙 (Kiro 고유 기능)

Kiro에만 있는 기능입니다. Claude Code에는 없습니다.

`.kiro/specs/`에 요구사항 → 설계 → 구현 태스크를 구조화하여 점진적으로 개발합니다.
Claude Code의 워크플로우 지식을 스펙 시스템과 결합하면 더 강력해집니다:

| Claude Code 워크플로우 | Kiro 스펙 활용 |
|---------------------|--------------|
| planner 에이전트의 계획 포맷 | 스펙의 요구사항(Requirements) 섹션에 적용 |
| tdd-guide의 TDD 단계 | 스펙 태스크를 RED → GREEN → REFACTOR 순서로 구성 |
| verification-loop의 6단계 검증 | 스펙 태스크 완료 조건에 검증 단계 포함 |

---

### 2.7 세션 / 컨텍스트 / 모델 관리

Claude Code는 이 모든 것을 개발자가 직접 제어합니다:
- 세션 영속화: `session-start.js` / `session-end.js` 훅
- 컨텍스트 압축: `/compact`, `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`
- 모델 라우팅: `/model sonnet`, `CLAUDE_CODE_SUBAGENT_MODEL`
- 비용 추적: `cost-tracker.js` 훅

Kiro는 이 모든 것을 **자체적으로 관리**합니다. 별도 스크립트나 환경 변수가 필요 없습니다.

---

## 3. Kiro에서 사용 불가한 Claude Code 전용 구성 요소

| 구성 요소 | 이유 |
|----------|------|
| `commands/` (슬래시 커맨드 59개) | Kiro에 슬래시 커맨드 시스템 없음 |
| `agents/` (커스텀 에이전트 27개) | Kiro에 커스텀 에이전트 정의 불가 |
| `scripts/hooks/session-*.js` | Kiro가 세션 자체 관리 |
| `scripts/hooks/suggest-compact.js`, `pre-compact.js` | Kiro에 `/compact` 없음 |
| `scripts/hooks/cost-tracker.js` | Claude Code 전용 텔레메트리 |
| `scripts/hooks/auto-tmux-dev.js`, `pre-bash-tmux-reminder.js` | Kiro에 tmux 통합 없음 |
| `scripts/hooks/pre-bash-git-push-reminder.js` | Claude Code Bash 매처 전용 |
| `scripts/hooks/post-bash-*.js`, `post-edit-*.js` | Claude Code Bash/Edit 매처 전용 |
| `scripts/lib/hook-flags.js` | `HOOK_PROFILE` 환경 변수 체계 전용 |
| 원본 `hooks/hooks.json` (Claude Code) | Claude Code 스키마, Kiro 스키마와 비호환. 훅은 `install-modules.json`에 인라인 정의 |
| `skills/continuous-learning/`, `continuous-learning-v2/` | Claude Code 훅 체계 + homunculus 디렉토리 종속 (도메인 지식은 steering으로 부분 변환 가능) |
| `skills/strategic-compact/` | Kiro에 수동 컴팩션 없음 (컨텍스트 관리 가이드라인은 steering으로 부분 변환 가능) |
| `CLAUDE.md` | Claude Code 전용 |
| `manifests/`, `install.js` | Claude Code 설치 시스템 전용 |

---

## 4. Kiro 프로젝트 구조 (변환 후)

```
.kiro/
├── steering/
│   ├── coding-style.md          (always)    ← rules/common/coding-style.md
│   ├── security.md              (always)    ← rules/common/security.md + agents/security-reviewer.md
│   ├── testing.md               (always)    ← rules/common/testing.md + agents/tdd-guide.md
│   ├── git-workflow.md          (always)    ← rules/common/git-workflow.md
│   ├── performance.md           (always)    ← rules/common/performance.md
│   ├── patterns.md              (always)    ← rules/common/patterns.md
│   ├── typescript-rules.md      (fileMatch: **/*.ts,**/*.tsx)
│   ├── python-rules.md          (fileMatch: **/*.py)
│   ├── golang-rules.md          (fileMatch: **/*.go)
│   ├── code-review-checklist.md (manual)    ← agents/code-reviewer.md
│   ├── planning-template.md     (manual)    ← agents/planner.md
│   ├── verification-loop.md     (manual)    ← skills/verification-loop/
│   └── build-error-fixes.md     (manual)    ← agents/build-error-resolver.md
├── hooks/                              ← install-modules.json에서 생성
│   ├── pre-write-guard.kiro.hook       (preToolUse → askAgent: 크기+보안+문서위치)
│   ├── diagnostics-on-save.kiro.hook   (fileEdited → askAgent: getDiagnostics)
│   ├── post-write-review.kiro.hook     (postToolUse → askAgent: console.log + TODO)
│   ├── test-after-task.kiro.hook       (postTaskExecution → askAgent: 테스트)
│   └── review-on-stop.kiro.hook        (agentStop → askAgent: 코드 리뷰)
├── specs/                       ← Kiro 고유 기능
└── settings/
    └── mcp.json                 ← mcp-configs/mcp-servers.json 에서 선택
```
