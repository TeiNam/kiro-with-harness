---
name: humanize-korean
description: >
  AI(ChatGPT·Claude·Gemini 등)가 쓴 한글 텍스트를 "사람이 쓴 글처럼" 윤문하는 스킬.
  번역투·영어 인용 과다·기계적 병렬·AI 관용구·피동태 남용·접속사 남발·리듬 균일성·이모지/불릿 과다 등
  10대 카테고리 40+ AI 티 패턴을 탐지·분류해 내용은 한 글자도 건드리지 않고 문체·리듬·표현만
  자연스러운 한국어로 재작성한다.
  트리거 — "AI 티 없애줘", "AI 같은 글 자연스럽게", "GPT/ChatGPT 문체", "AI 번역투 고쳐",
  "사람이 쓴 것처럼 윤문", "AI 윤문", "ChatGPT 티 제거", "한글 AI 탐지·윤문", "AI 글 사람처럼",
  "번역투 제거", "영어 인용 많은 글 윤문", "AI 글 티 안 나게", "휴머나이저", "humanize Korean",
  "AI detector bypass 한글". 후속 — "특정 카테고리만 다시", "윤문 강도 조정", "장르 바꿔서",
  "이 문단만", "2차 윤문"도 이 스킬. 단순 맞춤법·오탈자 교정은 직접 처리, 순수 번역은 번역 도구,
  내용 추가·삭제를 동반한 재작성은 별도 집필 작업.
origin: im-not-ai (humanize-korean, Kiro CLI 이식판)
workloads: [writing]
---

# Humanize Korean — AI 한글 티 제거 (Kiro CLI 이식판)

> **이식 고지** — 원본(`im-not-ai`)은 Claude Code의 다중 서브에이전트 파이프라인(`Agent`·`TeamCreate`)으로
> 동작한다. Kiro CLI에는 그 도구가 없으므로, 원본의 **Fast 모드(`humanize-monolith` 단일 호출 로직)를
> 메인 세션이 인라인으로 직접 수행**하도록 옮겼다. 정밀(deep) 모드도 별도 에이전트 없이 인라인 2-pass로
> 재현한다. 규칙 자산(`references/`)은 원본 저장소에 심링크되어 있어 `git pull` 시 자동 반영된다.

이 스킬이 발동되면 아래 절차를 **메인 세션이 직접** 실행한다. 다른 에이전트로 위임하지 않는다
(원본 monolith의 존재 이유 = 에이전트 간 컨텍스트 재로드·도구 호출 chain 제거).

## 철칙 (Prime Directives — 위반 시 즉시 롤백)

1. **의미 불변**: 사실·주장·수치·날짜·고유명사·인용문은 원문과 100% 일치.
2. **근거 기반**: `quick-rules.md`(또는 deep의 taxonomy)에 매핑되지 않는 구간은 건드리지 않는다.
3. **장르 유지**: 입력 장르(칼럼·리포트·블로그·공적)에서 이탈 금지.
4. **register 보존**: 원문이 격식체면 결과도 격식체. AI 티 = 문법·수사이지 격식 자체가 아니다.
5. **과윤문 금지**: 변경률 30% 초과 = 경고, 50% 초과 = 작업 중단·롤백.
6. **Do-NOT list**: 고유명사·제품명·모델명·기관명, 수치·날짜·단위, 큰따옴표 직접 인용, 법률 조문,
   수학·화학·통계 표기, 영어 약어(LLM·GPU·MCP·API 등 업계 표준)는 탐지·윤문 모두에서 제외.
7. **자동 로드 금지**: 프로젝트의 다른 파일을 임의 파싱해 옵션을 추론하지 않는다. 입력 텍스트만 다룬다.

## Phase 0: 모드 결정 및 상태 출력

작업 시작 시 가장 먼저 다음 한 줄을 출력한다.

```
humanize-korean (Kiro) — {fast|deep} 모드 / run_id: {YYYY-MM-DD-NNN}
```

### 모드 결정
- 사용자가 `--strict`·`--deep`·"정밀 모드"·"꼼꼼히" 명시 → **deep**
- 입력 8,000자 초과 → **deep** (자동 승급 + 1줄 고지)
- 그 외 모두 → **fast (디폴트)**

### run_id 결정
- 모든 경로는 **cwd 기준**. 산출물은 cwd 기준 `_workspace/{YYYY-MM-DD-NNN}/`에 만든다.
- 기존 시퀀스는 `glob` 도구로 표지 파일을 매칭해 조회:
  `glob(pattern="_workspace/{오늘날짜}-*/01_input.txt")` → 폴더명에서 NNN 최댓값 + 1.
  당일 폴더가 없으면 NNN = 001.
- 부분 재실행 신호("이 카테고리만 다시"·"2차 윤문")면 기존 run_id 재사용 + deep 모드로 자동 승급.

## Fast 모드 (디폴트) — 단일 패스 인라인

원본 `humanize-monolith`를 메인 세션이 그대로 수행한다. 파일 I/O는 입력 저장·룰북 로드·결과 저장 3회로 캡.

### 단계 1: 입력 저장 + 룰북 로드
1. cwd 기준 `_workspace/{run_id}/` 생성 (`write`로 디렉터리 내 파일 작성 시 자동 생성)
2. 입력 텍스트를 `_workspace/{run_id}/01_input.txt`에 저장 (`write`). 글자수·문장수·문단수 계산.
3. `references/quick-rules.md`를 `read`로 로드 → S1·S2 핵심 룰표를 메모리에 내재화.
   (이 스킬 디렉터리 기준 상대경로 `references/quick-rules.md`. 절대경로는
   `~/.kiro/skills/humanize-korean/references/quick-rules.md`.)
4. 입력이 한국어가 아니면 "한국어 텍스트만 처리 가능" 안내 후 종료.
5. 장르 자동 추정(첫 300자) — 사용자가 명시하면 우선.

### 단계 2: 패턴 탐지 (메모리, 파일 I/O 0회)
- A·D·H·I·J 카테고리: 어휘·어미 키워드 매칭
- C 카테고리: 문서 구조(헤딩·따옴표·불릿·콜론 부제) 통계
- E 카테고리: 문장 길이 stdev, 동일 종결어미 연속
- 각 매치를 (ID, span, severity, suggested_fix) 튜플로 메모리 보관
- **Do-NOT list 엄격 적용**: 고유명사·수치·인용 span 제외

### 단계 3: 윤문 (메모리)
처리 순서(문장이 짧아지는 것부터 → 안정적):
`D(관용구 삭제) → A(번역투) → I(형식명사) → G(hedging) → H(접속사) → F(수식중복) → B(영어인용) → C·J(구조/장식) → E(리듬)`
- 문단 단위로 처리, 각 edit의 before/after를 메모리에 누적.
- 변경률을 계속 모니터링: 50% 임박 시 후속 edit 보류.

### 단계 4: 자체검증 (메모리)
`quick-rules.md`의 "자체검증 체크리스트" 6항을 점검:
1. 고유명사·수치·날짜·인용 100% 보존
2. 변경률 30% 이하 (50% 초과는 중단)
3. 장르 이탈 없음
4. register 보존
5. 잔존 S1 패턴 0건 (D-1~D-7, A-7, A-8, A-16, C-5, C-10, C-11, H-1, I-1, J-2 등)
6. 원문에 없던 비유·수사 임의 추가 없음

위반 시 해당 edit 롤백 → 단계 3 부분 재실행 (**자체 루프 최대 1회**). 미해결이면 결과는 출력하되
summary에 위반 항목을 명시.

### 단계 5: 출력 (파일 I/O 1회)
`_workspace/{run_id}/final.md`를 `write`로 작성. **윤문본 본문 + 본문 끝에 `<!-- HUMANIZE-SUMMARY -->`
HTML 주석 블록 1개**를 포함한다(HTML 주석이라 마크다운 뷰어·게시·복사 시 본문에 안 보임):

```markdown
{윤문본 본문 그대로}

<!-- HUMANIZE-SUMMARY (Kiro)
run_id: 2026-06-10-001
metrics:
  char_in: 2604
  char_out: 2210
  change_rate: 15.1%
  self_check: 6/6
  grade: A
categories:  # before → after (quick-rules ID 기준)
  D-4 hype 어휘: 5 → 0
  H-3 메타 진입 '이는~': 6 → 1
  C-11 연결어미 뒤 쉼표: 9 → 0
self_check:
  - 고유명사·수치·인용 100% 보존: ✅
  - 변경률 30% 이하: ✅
  - 장르 이탈 없음: ✅
  - register 보존: ✅
  - S1 잔존 0건: ✅
  - 인공 표현 추가 없음: ✅
highlights:
  - id: D-6
    before: "지금이야말로 …할 때다."
    after: "…을 짚을 차례다."
  # 3~5건
residual_findings: (없음 / 또는 ID + 사유)
grade_reason: "A — S1 0건, 변경률 15.1%, 자체검증 6항 통과. 칼럼 register 그대로."
-->
```

### 단계 6: 사용자에게 반환 (간결하게)
긴 본문은 final.md에 맡기고, 응답은 메타 중심으로:
1. 한 줄 상태: `완료. 변경률 X% / 등급 Y / 자체검증 N/6 통과 (final.md 저장)`
2. 핵심 카테고리 탐지 4~6건 (before → after)
3. 변경 하이라이트 1~2건 (before → after, 각 100자 이내)
4. 등급 B 이하면 "정밀 검증이 필요하면 `--deep`(또는 \"꼼꼼히 다시\")로 2-pass 실행 가능" 안내

> 짧은 스니펫(수백 자 이하)이고 사용자가 파일 산출을 원치 않으면, `_workspace` 없이 윤문본을 인라인으로
> 바로 보여줘도 된다. 다만 기본은 final.md 저장 경로다.

**wall-clock 목표:** 5,000자 이하 fast 1패스로 빠르게.

## Deep 모드 (`--deep`/`--strict` 또는 자동 승급) — 인라인 2-pass

별도 에이전트 없이 메인 세션이 더 꼼꼼하게 2단계로 수행한다.

### Pass 1: 전수 탐지 + 윤문
- `references/ai-tell-taxonomy.md`(10대분류 × 40+ 패턴 전수)와 `references/rewriting-playbook.md`
  (카테고리별 치환 레시피·장르별 허용 표)를 `read`로 로드.
- Fast 단계 2~3과 동일하되 **S3까지 포함**, 처방은 playbook의 장르별 허용 표를 따른다.
- 결과를 `_workspace/{run_id}/03_rewrite.md`에 저장.

### Pass 2: 독립 검증
- Pass 1 산출물을 **새로 읽어** 원문과 대조하며 의미 동등성(fidelity)·자연스러움(naturalness)·과윤문을
  재점검. 잔존 finding이 있으면 해당 부분만 2차 윤문(최대 round 3).
- (선택) 더 강한 교차검증이 필요하면 `subagent`의 `code-reviewer`/`translator-docs`에 "원문 대비 의미
  보존·자연스러움만 점검"을 위임할 수 있다. 단 윤문 자체는 메인 세션이 수행한다.

### 정량 메트릭 (선택)
객관 점수가 필요하면 `references/metrics_v2.py`(또는 `metrics.py`)를 `shell`로 실행해 post-editese
지표를 산출하고 summary에 첨부할 수 있다. 예: `python3 references/metrics_v2.py <원문> <윤문본>`
(스크립트 인터페이스는 파일 상단 docstring 확인). 베이스라인은 `references/baseline_v2.json`.

### Deep 출력
Fast 단계 5~6과 동일 포맷으로 `final.md` + `<!-- HUMANIZE-SUMMARY -->` 작성. 이전 `final.md`가 있으면
`final_prev.md`로 백업 후 새로 쓴다.

## 부분 재실행 / 후속 명령

| 사용자 신호 | 처리 |
|---|---|
| "특정 카테고리만 다시" | deep 모드 전환, 해당 카테고리 finding만 재윤문 |
| "이 문단만" | deep 모드, 해당 문단만 입력으로 새 run_id |
| "2차 윤문"·"다시 다듬어" | 기존 run_id의 `final.md`를 입력으로 deep Pass 1부터 재실행, `03_rewrite_v2.md`로 버전 분리 |
| "윤문 강도 조정" | `최소심각도` 변경 후 재실행 |
| "장르 바꿔서" | `genre_hint` 변경 후 재실행 |
| "이 변경 되돌려줘" | 해당 edit 롤백 후 재검증 |

## 옵션 (인자 끝에 자연어로)

- `장르: 칼럼|리포트|블로그|공적` — 생략 시 첫 300자로 자동 추정
- `강도: 보수|기본|적극` — 기본값: 기본
- `최소심각도: S1|S2|S3` — 기본값: S2
- `--deep` (= `--strict`) — 인라인 2-pass 정밀 모드 강제

## 에러 핸들링

- 입력이 한글 아님 → "한국어 텍스트만 처리 가능" 후 종료.
- 8,000자 초과 → deep 자동 승급 + 1줄 고지. 매우 길면 문단 묶음 단위 처리 권고.
- 변경률 50% 초과 도달 → 마지막 안전 버전으로 롤백, summary에 `over_polish_aborted: true` 기록.
- 자체검증 1회 재시도에도 미해결 → 결과 출력 + 위반 항목 명시.

## 참고 자료 (references/, 원본 저장소 심링크)

- [`references/quick-rules.md`](references/quick-rules.md) — Fast 전용 슬림 룰북(S1·S2 핵심 + 자체검증 체크리스트)
- [`references/ai-tell-taxonomy.md`](references/ai-tell-taxonomy.md) — Deep 전용 10대분류 × 40+ 패턴 전수
- [`references/rewriting-playbook.md`](references/rewriting-playbook.md) — 카테고리별 치환 레시피·장르별 허용 표
- [`references/scholarship.md`](references/scholarship.md) — 학술 인용 근거
- [`references/metrics_v2.py`](references/metrics_v2.py), [`references/metrics.py`](references/metrics.py) — 선택적 정량 채점 스크립트
- [`references/baseline_v2.json`](references/baseline_v2.json), [`references/baseline.json`](references/baseline.json) — 메트릭 베이스라인
- [`references/web-service-spec.md`](references/web-service-spec.md) — 웹 확장 스펙(옵션)
