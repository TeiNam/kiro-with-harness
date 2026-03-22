# 훅(Hook) 레퍼런스

Kiro 훅(Hook)은 `.kiro/hooks/`에 정의된 이벤트 기반 자동화입니다. IDE 이벤트에 의해 트리거되며 에이전트 프롬프트 또는 셸 명령을 실행합니다.

## 사용 가능한 훅

### pre-write-guard (hooks-core)

- 이벤트: `preToolUse` (쓰기 도구)
- 액션: `askAgent`
- 검사 항목:
  1. SIZE — 800줄을 초과하는 쓰기를 차단합니다. 400줄 이하의 모듈로 분할할 것을 제안합니다.
  2. SECRETS — 하드코딩된 API 키, 토큰, 비밀번호 또는 연결 문자열을 감지합니다.
  3. DOC LOCATION — `docs/`, `.kiro/`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, `LICENSE` 외부에 `.md` 또는 `.txt` 파일이 생성되면 경고합니다.
- 동작: 발견된 문제만 보고합니다. 모든 검사를 통과하면 조용히 진행합니다.
- 참고: 이 훅은 모든 쓰기 작업을 가로챕니다. 에이전트는 검사를 확인하고 쓰기를 재시도해야 합니다.

### review-on-stop (hooks-quality)

- 이벤트: `agentStop`
- 액션: `askAgent`
- 검사 항목:
  1. 보안 문제
  2. 적절한 에러 처리
  3. 남아있는 `console.log` 문
  4. 변경 사항에 필요한 테스트
- 동작: 문제가 있을 때만 보고합니다. 모든 것이 정상이면 출력 없음.

### diagnostics-on-save (hooks-quality)

- 이벤트: `fileEdited` (`*.ts`, `*.tsx`, `*.js`, `*.jsx`)
- 액션: `askAgent`
- 동작: 편집된 TS/JS 파일에 대해 `getDiagnostics`를 실행합니다. 린트 에러와 타입 에러를 보고합니다. 터미널을 사용하지 않습니다.

### test-after-task (hooks-quality)

- 이벤트: `postTaskExecution`
- 액션: `askAgent`
- 동작: 스펙(Spec) 작업 완료 후 사용자에게 수동으로 테스트를 실행하도록 알립니다. 테스트를 직접 실행하지 않습니다.

### post-write-review (hooks-guardrails)

- 이벤트: `postToolUse` (쓰기 도구)
- 액션: `askAgent`
- 검사 항목:
  1. `console.log` 문 (제거 권고; `console.error`/`console.warn`은 무시)
  2. 새로운 `TODO`/`FIXME`/`HACK` 주석 (추적 이슈 생성 제안)
- 동작: 문제가 발견된 경우에만 보고합니다.

## 훅 모듈

| 모듈 | 포함된 훅 | 설치되는 프로필 |
|--------|---------------|----------------------|
| hooks-global | pre-write-guard, review-on-stop | `global` |
| hooks-core | pre-write-guard | `core`, `developer`, `full`, `writer`, `mobile`, `ai`, `backend`, `frontend`, `architect` |
| hooks-quality | diagnostics-on-save, review-on-stop, test-after-task | `developer`, `full`, `mobile`, `ai`, `backend`, `frontend` |
| hooks-guardrails | post-write-review | `developer`, `full`, `backend`, `frontend` |

## 문제 해결

**"왜 쓰기가 차단되나요?"**
`pre-write-guard` 훅이 모든 쓰기 도구 호출을 가로챕니다. 가로채기 메시지가 표시되면 에이전트가 검사 통과를 확인하고 재시도해야 합니다. 이것은 정상적인 동작입니다.

**"훅을 비활성화하려면 어떻게 하나요?"**
`.kiro/hooks/`에서 `.kiro.hook` 파일을 삭제하거나, 설치 명령에서 해당 훅 모듈을 제거하세요.

**"커스텀 훅을 추가할 수 있나요?"**
네. 훅 스키마에 따라 `.kiro/hooks/`에 `.kiro.hook` JSON 파일을 생성하거나, Kiro 명령 팔레트 → "Open Kiro Hook UI"를 사용하세요.
