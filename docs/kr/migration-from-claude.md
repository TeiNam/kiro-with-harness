# Claude Code에서 Kiro로 마이그레이션

Claude Code 하네스 설정을 Kiro IDE 네이티브 형식으로 변환하는 단계별 가이드입니다.

## 개념 매핑

| Claude Code | Kiro IDE | 비고 |
|-------------|----------|------|
| `CLAUDE.md` | `.kiro/steering/*.md` | 주제별로 분리된 파일로 분할 |
| `.claude/settings.json` | `.kiro/hooks/*.kiro.hook` | 이벤트 기반 훅이 권한 설정을 대체 |
| `.claude/commands/` | Kiro 커스텀 에이전트 | 에이전트 마크다운 파일 |
| Claude의 MCP 설정 | `.kiro/settings/mcp.json` | 동일한 MCP 프로토콜, 다른 설정 위치 |
| 프로젝트 메모리 | 스티어링(항상 포함) | 세션 간 지속되는 컨텍스트 |

## 1단계: CLAUDE.md를 스티어링으로 변환

Claude Code는 단일 `CLAUDE.md` 파일을 사용합니다. Kiro는 주제별로 분리된 여러 스티어링 파일을 사용합니다.

`CLAUDE.md`를 주제별로 분할하세요:

```
CLAUDE.md 섹션               →  .kiro/steering/ 파일
─────────────────────────────────────────────────────
Coding standards            →  coding-style.md (always)
Security rules              →  security.md (always)
Testing guidelines          →  testing.md (always)
Git workflow                →  git-workflow.md (always)
Framework-specific rules    →  framework-name.md (manual)
Project-specific context    →  project-context.md (always)
```

### 스티어링 프론트매터(front-matter)

```markdown
---
inclusion: always
---
# Coding Style Rules
...
```

옵션: `always`, `manual`, 또는 `fileMatchPattern`과 함께 사용하는 `fileMatch`.

## 2단계: 권한을 훅으로 변환

Claude Code는 도구 권한에 `settings.json`을 사용합니다. Kiro는 사전/사후 도구 검사에 훅을 사용합니다.

예시: Claude의 "docs/에 쓰기 거부"를 사전 쓰기 훅으로 변환:

```json
{
  "name": "Pre-Write Guard",
  "version": "1.0.0",
  "when": {
    "type": "preToolUse",
    "toolTypes": ["write"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "Check if this write follows project rules."
  }
}
```

## 3단계: 커맨드를 에이전트로 변환

Claude Code 슬래시 커맨드(`/command`)는 `agents/` 디렉토리의 Kiro 커스텀 에이전트에 매핑됩니다.

각 에이전트는 지침이 포함된 마크다운 파일입니다. Kiro의 에이전트 선택기에서 참조하세요.

## 4단계: MCP 설정 이동

```bash
# Claude Code 위치
.claude/mcp.json

# Kiro 위치
.kiro/settings/mcp.json
```

MCP 서버 형식은 동일합니다. 서버 정의를 복사하고 필요시 경로를 조정하세요.

## 5단계: 하네스를 통한 설치

수동 변환 대신 하네스 설치 프로그램을 사용하세요:

```bash
# 프로젝트 유형에 맞는 프로필 설치
node install.js developer

# 또는 특정 모듈 선택
node install.js --modules steering-core,hooks-core,mcp-catalog
```

## 주요 차이점

| 항목 | Claude Code | Kiro |
|------|-------------|------|
| 컨텍스트 주입 | 단일 CLAUDE.md | 포함 유형이 있는 여러 스티어링 파일 |
| 도구 제어 | 권한 허용/거부 목록 | 에이전트 프롬프트를 활용한 이벤트 기반 훅 |
| 컨텍스트 로딩 | 한 번에 전부 로드 | 선택적 (always, fileMatch, manual) |
| 자동화 | Bash 훅만 가능 | 에이전트 훅 + 셸 커맨드 |
| 스킬(Skills) | 네이티브 미지원 | 온디맨드 지식을 위한 수동 포함 스티어링 |
