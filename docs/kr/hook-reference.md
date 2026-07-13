# 훅(Hook) 레퍼런스

Kiro IDE 훅은 `.kiro/hooks/*.json`에 정의되는 **v1 JSON** 이벤트 기반 자동화입니다. IDE 이벤트에 트리거되어 에이전트 프롬프트 또는 셸 명령을 실행합니다.

> **참조 출처**: 훅 스키마와 트리거 이름은 Kiro IDE 공식 문서([kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/), [What's new in IDE 1.0](https://kiro.dev/docs/whats-new-1-0/))를 기준으로 확인했습니다. 확인 일자: 2026-06-29.
>
> **IDE 1.0 포맷 변경**: v1 JSON 포맷(`.kiro/hooks/*.json`)이 레거시 `.kiro.hook` / `.hook` 포맷을 대체합니다. 레거시 훅은 Agent Hooks 패널에 업그레이드 배지로 표시되며 **마이그레이션 전까지 실행되지 않습니다**. 하네스 설치기는 v1 JSON을 직접 생성합니다.

## v1 JSON 스키마

각 파일은 `{ "version": "v1", "hooks": [ ... ] }` 래퍼입니다. 하네스는 파일당 훅 하나를 배치합니다.

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "Pre-Write Guard",
      "description": "Pre-write check: file size, secrets, doc location",
      "trigger": "PreToolUse",
      "matcher": "write",
      "action": { "type": "agent", "prompt": "..." },
      "enabled": true
    }
  ]
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | 예 | Agent Hooks 패널/텔레메트리에 표시되는 식별자 |
| `description` | 아니오 | 문서용 |
| `trigger` | 예 | 훅이 발화하는 시점(아래 트리거 표) |
| `matcher` | 아니오 | 도구 이름(PreToolUse/PostToolUse) 또는 파일 경로(파일 이벤트) 정규식. 생략 시 항상 매칭 |
| `action` | 예 | `{ "type": "agent", "prompt": "..." }` 또는 `{ "type": "command", "command": "..." }` |
| `timeout` | 아니오 | 초. 기본 60. `0`이면 비활성. agent 액션에서는 무시 |
| `enabled` | 아니오 | 기본 `true`. `false`면 삭제 없이 건너뜀 |

## 트리거

| 트리거 | 발화 시점 | 매처 | 차단 가능? |
|--------|-----------|------|-----------|
| `SessionStart` | 세션 시작 | — | 아니오 |
| `Stop` | 에이전트가 턴을 완료 | — | 아니오 |
| `PreToolUse` | 도구 실행 직전 | 도구 이름(정규식) | **예** (exit 2) |
| `PostToolUse` | 도구 실행 직후 | 도구 이름(정규식) | 아니오 |
| `PreTaskExec` | 스펙 작업 시작 직전 | — | **예** |
| `PostTaskExec` | 스펙 작업 완료 후 | — | 아니오 |
| `UserPromptSubmit` | 사용자가 프롬프트 제출 | — | **예** |
| `PostFileCreate` | 에이전트가 파일 생성 후 | 파일 경로(정규식) | 아니오 |
| `PostFileSave` | 에이전트가 파일 저장 후 | 파일 경로(정규식) | 아니오 |
| `PostFileDelete` | 에이전트가 파일 삭제 후 | 파일 경로(정규식) | 아니오 |

`PreToolUse`/`PostToolUse`에서 매처로 쓸 수 있는 내장 도구 카테고리: `read`, `write`, `shell`, `web`, `spec`, `*`. 소스 접두사 `@mcp`, `@builtin`은 정규식으로 매칭됩니다.

> **수동 훅 제거됨**: 레거시 `Manual` / `userTriggered` 트리거는 더 이상 존재하지 않습니다. 수동 호출은 이제 **수동 steering 파일**(`.kiro/steering/<name>.md`, `inclusion: manual`)로 대체되어 `/<filename>` 슬래시 커맨드로 호출합니다.

## 설치되는 훅 (IDE 티어)

IDE 티어는 `scripts/lib/tiers.js`(`IDE_HOOKS`)에 정의된 최적화 세트를 설치합니다. 모두 워크로드 독립적이며 agent 액션을 사용합니다.

### pre-write-guard
- 트리거: `PreToolUse`, 매처 `write`
- 액션: agent
- 검사(한 번에): (1) SIZE — 800줄 초과 쓰기 차단, 400줄 이하로 분할 제안; (2) SECRETS — 하드코딩된 키/토큰/비밀번호/연결 문자열 감지; (3) DOC LOCATION — `docs/`, `.kiro/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE` 외부에 `.md`/`.txt` 생성 시 경고.
- 문제만 보고, 통과 시 조용히 진행.

### review-on-stop
- 트리거: `Stop`
- 액션: agent
- 작업 완료 후 간단 리뷰: 보안 문제, 에러 처리, 남은 `console.log`, 필요한 테스트. 문제만 보고.

### capture-lessons
- 트리거: `Stop`
- 액션: agent
- 반복 가능한 교정(반복되는 리뷰 지적, 빌드 실패 패턴, 사용자 정정)을 감지해 `.kiro/steering/lessons-learned.md`에 추가할 한 줄 교훈을 제안. 사용자 자산 수정 전 확인 필수, 없으면 조용히 종료. 자기 진화 루프의 일부.

### changelog-on-commit
- 트리거: `PreToolUse`, 매처 `shell`
- 액션: agent
- 셸 도구 호출이 `git commit`인지 판별해, 맞으면 날짜별 `CHANGELOG.md`(`## YYYY-MM-DD`)를 유지하고 이번 커밋으로 부정확해진 README만 갱신해 같은 커밋에 스테이징. 커밋이 아니거나 문서 전용 커밋이면 무동작(루프 가드).

## 훅 추가/비활성화

- **비활성화**: 훅 파일에서 `"enabled": false` 설정, `.kiro/hooks/`의 `.json` 파일 삭제, 또는 설치 명령에서 해당 워크로드 제외.
- **커스텀 훅 추가**: 위 v1 스키마에 따라 `.kiro/hooks/<name>.json`을 생성하거나, 명령 팔레트 → "Kiro: Open Kiro Hook UI" → 자연어로 설명.

> **CLI 티어 참고**: CLI 티어(`kiro-cli chat`)는 이 파일들을 쓰지 않습니다. 훅을 에이전트 JSON(`hooks` 필드)에 임베드하고, `kiro-cli.json`이 참조하는 결정적 `pre-write-guard.sh`(exit 2)를 함께 배치합니다.

## 온디맨드 3-way 교차 리뷰 (`--review-backend cross`)

`--review-backend cross`로 설치하면 두 티어 모두 `.kiro/hooks/`에 `cross-review.sh`가 추가됩니다. 이것은 자동 훅이 아니라 **온디맨드 command**입니다 — 모든 변경이 3-way 리뷰를 필요로 하지는 않으므로 스스로 실행되지 않습니다.

- `bash .kiro/hooks/cross-review.sh`(옵션 `--base <branch>`)를 실행하면 커밋되지 않은 변경을 **Codex**(`codex review --uncommitted` — git 워크트리를 직접 읽으며 코드를 셸 인자로 넘기지 않음)와 **Claude Code**(`claude -p` — diff를 stdin으로 전달)로 교차 점검합니다. 이후 Kiro가 Kiro + Claude + Codex 리뷰를 종합합니다.
- diff 가드: 변경이 없으면 조용히 종료합니다. 각 외부 CLI는 미설치이거나 실패하면 graceful하게 건너뜁니다.
- 종합까지 포함한 에이전트 주도 리뷰가 필요하면 `peer-reviewer` 에이전트에 위임하세요(동일한 3-way, 서술형 종합 + 정리 포함).
