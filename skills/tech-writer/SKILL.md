---
name: tech-writer
version: "1.0.0"
description: "IT 기술 문서를 \"정확하고 명확하고 실행 가능하게\" 작성·윤문해주는 오케스트레이터 스킬. 개발 가이드·API 문서·README·테크 블로그·기술 리포트·RFC/설계서·업무 문서를 대상으로, 번역투·hype·모호성·수동태 남용을 제거하고 전제조건·코드 예제·용어 일관성·구조(헤딩·목록·표)를 보강한다. 한국어·영어 양방향. 노트·요점에서 새 문서를 작성(write)하거나 기존 초안을 다듬는(polish) 하이브리드. 트리거 — \"기술 문서 써줘\", \"API 문서 작성\", \"README 작성/개선\", \"테크 블로그 글 다듬어\", \"기술 리포트 윤문\", \"개발 가이드 작성\", \"이 노트로 문서 만들어\", \"tech doc\", \"technical writing\", \"문서 명확하게\", \"번역투 기술문서 고쳐\", \"developer documentation\". 후속 작업 — \"이 절만 다시\", \"예제 추가\", \"영어로 다시\", \"독자 레벨 바꿔서\", \"2차 검토\" 도 모두 이 스킬. 순수 번역은 번역 스킬, 기술 문서가 아닌 일반 산문의 AI 티 제거 윤문이나 단순 맞춤법은 이 스킬 대상이 아니다."
origin: harness
workloads: [report]
---
# Tech Writer — IT 기술 문서 작성·윤문 오케스트레이터 (v1.0.0)

> 5인 구조와 monolith Fast Path 위에서 동작하는 IT 기술 문서 하네스.
> 구조(헤딩·불릿·번호)를 **권장 자산**으로 보고, 번역투·hype·모호성만 제거하면서 **전제·예제·용어 일관성·실행가능성을 보강**한다. 그리고 윤문만 하는 게 아니라 노트·요점에서 **새 문서를 작성**하는 하이브리드다.

## 대상 장르

| 장르 | 성격 | 핵심 품질 축 |
|---|---|---|
| 개발 가이드·튜토리얼 | 절차 중심 | 전제조건·번호 목록·복사가능 명령·기대 출력 |
| API 문서·레퍼런스 | 정밀 명세 | 파라미터 표·예제·에러 코드·일관 표기 |
| README | 진입점 | 빠른 시작·설치·배지·구조 |
| 테크 블로그 | 설득·설명 | 흐름·코드 예제·근거·과장 절제 |
| 기술 리포트·설계서(RFC) | 의사결정 | 구조·근거·트레이드오프·중립 톤 |
| 업무 문서(메일·공지·회고) | 전달 | 간결·실행항목·명확한 요청 |

## Phase 0: 컨텍스트 확인 및 모드 결정

작업 시작 시 가장 먼저 다음 한 줄을 사용자에게 출력한다.

```
tech-writer v1.0.0 — {fast|strict} 모드 / {write|polish|hybrid} / {KR|EN} / run_id: {YYYY-MM-DD-NNN}
```

### 경로 규약 (모든 Phase 공통, 중요)
오케스트레이터는 에이전트에 **레퍼런스 절대경로를 치환해 전달**한다. 에이전트는 워크스페이스 `.kiro/agents/`에, 룰북은 스킬 설치 위치(`{SKILL_DIR}/references/`)에 따로 설치되므로, 에이전트가 상대경로 `references/...`를 가정하면 깨진다.

- `{SKILL_DIR}` = 이 SKILL.md가 위치한 스킬 디렉토리(보통 `~/.kiro/skills/tech-writer` 또는 워크스페이스 `.kiro/skills/tech-writer`). Kiro 는 이 값을 주입하지 않으므로, 오케스트레이터가 스킬을 활성화할 때 확인한 SKILL.md 경로로 실제 절대경로를 정해 에이전트에 전달한다.
- `quick_rules_path` = `{SKILL_DIR}/references/quick-rules.md`
- `taxonomy_path` = `{SKILL_DIR}/references/tech-doc-taxonomy.md`
- `playbook_path` = `{SKILL_DIR}/references/tech-writing-playbook.md`
- `_workspace/`는 **cwd 기준**(스킬 디렉토리가 아니라 작업 디렉토리).

### 실행 모드 결정 (fast/strict)
- 사용자가 `--strict`·"정밀 검토"·"5인 파이프라인" 명시 → **strict**
- 입력 8,000자 초과 → **strict** (자동 승급 + 1줄 고지)
- 5,000~8,000자 → **fast**이되 monolith에 "장문" 경고(품질 저하 시 strict 권고)
- 5,000자 이하 → **fast (디폴트)**

> Fast/Strict 임계는 monolith 에러 핸들링(5,000자 권장·8,000자 경고)과 정렬: **≤5,000 이상적 / 5,000~8,000 fast+경고 / >8,000 자동 strict**.

### 작업 모드 결정 (write/polish/hybrid)
- 입력이 개요·불릿 메모·요점이거나 "작성/써줘/초안" 지시 → **write**
- 입력이 완성된 글이고 "다듬어/윤문/개선" → **polish**
- 초안은 있으나 절·예제가 비어 있음 → **hybrid**

### 언어 결정 (KR/EN)
- 입력 언어 자동 감지. "영어로/in English" 지시 시 출력 언어 전환(번역이 아니라 해당 언어로 재작성·윤문).

### run_id 결정
- 모든 `_workspace` 경로는 **cwd 기준**. `_workspace/{YYYY-MM-DD-NNN}/`에 생성.
- 기존 시퀀스 확인은 **`list_directory` 도구**로 `_workspace/` 를 읽어 `01_input.txt` 를 가진 폴더만 고른다 → 폴더명에서 당일(`YYYY-MM-DD`) 접두사를 필터링 → NNN 최댓값 + 1. (날짜를 패턴에 직접 박지 않고 결과에서 거른다 — 모든 에이전트·문서가 동일 패턴을 쓰도록 통일.)
- 당일 폴더 없으면 NNN = 001. 셸 `ls` 대신 `list_directory` 를 쓴다(결과 형식이 일정하다).
- 부분 재실행 신호("이 절만 다시"·"2차 검토")는 기존 run_id 재사용 + strict 승급. **monolith 재실행은 새 run_id 발급**(monolith는 백업 파일을 만들지 않으므로 이전 산출물 보존을 위해 새 디렉토리 사용).

## Fast 모드 (디폴트)

### Phase 1: 입력 저장
1. cwd 기준 `_workspace/{run_id}/` 생성
2. 입력을 `01_input.txt`에 저장
3. 첫 300자 + 지시문으로 장르·작업모드·언어 추정 (사용자 명시 우선)

### Phase 2: Monolith 호출
`tech-writer-monolith` 에이전트를 `invoke_sub_agent` 도구로 1회 호출.

입력:
```
input_path: <abs path>/_workspace/{run_id}/01_input.txt
quick_rules_path: {SKILL_DIR}/references/quick-rules.md
genre_hint: 가이드 | API | README | 블로그 | 리포트 | 업무 | null
task_mode: write | polish | hybrid
lang: KR | EN
audience_hint: 입문 | 중급 | 고급 | null
```

출력 (에이전트가 직접 작성):
- `_workspace/{run_id}/final.md` — 결과 문서 (끝에 `<!-- TECHWRITER-SUMMARY -->` 주석 블록 통합)

monolith는 단일 호출 안에서(도구 호출 3회 = Read 2 + Write 1):
1. quick-rules 로드 → 작업모드에 따라 작성 또는 탐지+윤문 + 자체검증 7항(write 모드는 변경률 제외 6항)
2. 변경률 60% 초과 시 자동 롤백 (윤문 모드만)
3. 자체검증 위반 시 **메모리 내** 1회 재시도 (추가 Write 없음)
4. final.md 1개만 Write (백업·중간본 없음)

### Phase 3: 결과 전달
monolith는 본문을 인라인 반환하지 않고 `final.md`에만 저장한다. **본문 전달은 오케스트레이터 책임**이다:
1. `read_file`로 `_workspace/{run_id}/final.md`를 읽는다.
2. 한 줄 상태: `완료. {작업모드} / 변경률 X%(write=n/a) / 등급 Y / 자체검증 N/7 통과` — **write 모드면 N/6**(변경률 항목 제외).
3. 결과 문서 본문 (마크다운 블록) — `<!-- TECHWRITER-SUMMARY -->` 주석은 게시 시 숨겨지므로 그대로 두거나 사용자에게 메트릭으로 요약.
4. 핵심 변경·보강 4~6건 (결함 ID → 처리)
5. 등급 B 이하면 "정밀 검토가 필요하면 `--strict`" 안내

**wall-clock 목표:** 5,000자 이하 2~3분, 8,000자 5~7분.

## Strict 모드 (`--strict` 또는 자동 승급)

5인 파이프라인. 정밀 검증·장문·중요 문서일 때.

> **루프 카운터는 오케스트레이터가 소유한다.** 에이전트는 라운드 수를 모른다 — 오케스트레이터가 `round`(1·2·3)를 입력으로 주입하고, 3회 도달 후 미해결이면 `hold_and_report`로 강제 종료한다. 에이전트끼리 직접 호출하지 못하므로 **모든 핸드오프는 오케스트레이터가 파일을 중계**한다.

### Phase A: 탐지
`doc-quality-detector`를 `invoke_sub_agent` 도구로 호출 → `02_detection.json` (span·category·severity·anchor·suggested_fix)

입력:
```
run_id: {YYYY-MM-DD-NNN}
input_text: <01_input.txt 내용 또는 경로>
taxonomy_path: {SKILL_DIR}/references/tech-doc-taxonomy.md   # 절대경로 치환
genre_hint / lang / options
```

### Phase B: 작성/윤문 (최대 3회 루프)
`tech-doc-writer`를 `invoke_sub_agent` 도구로 호출 → `03_draft.md` + `03_diff.json`

입력:
```
input_path: <abs>/_workspace/{run_id}/01_input.txt
detection_path: <abs>/_workspace/{run_id}/02_detection.json   # polish/hybrid 필수, write는 선택
playbook_path: {SKILL_DIR}/references/tech-writing-playbook.md   # 절대경로 치환
task_mode / genre_hint / lang / audience_hint
round: 1   # 오케스트레이터가 주입·증가
rework_targets: []   # 2차+에서 감사·리뷰가 지목한 롤백 edit·target finding
```

### Phase C: 병렬 검증
fidelity-auditor와 clarity-reviewer는 **서로 독립**이다. **한 턴에 두 개의 `invoke_sub_agent` 호출을 동시에 보내** 병렬 실행한다(순차 금지). 둘 다 판정 파일만 쓰고 문서를 수정하지 않는다.

- `tech-fidelity-auditor` → `04_fidelity_audit.json` (사실·코드·수치·식별자 정확성 14항)
  - 입력: `01_input.txt`·`03_draft.md`·`03_diff.json`
- `doc-clarity-reviewer` → `05_clarity_review.json` (잔존 결함·실행가능성·구조위반·과윤문)
  - 입력: `01_input.txt`·`02_detection.json`·`03_draft.md`·`taxonomy_path`(직접 재스캔)·`round`

#### 종합 판정 (AND 결합 — 둘 다 통과해야 승인)
fidelity와 clarity 결과를 **AND로 종합**한다. clarity의 5개 verdict와 fidelity의 3개 판정을 모두 매핑한다.

| fidelity | clarity | 종합 | 후속 |
|---|---|---|---|
| full_pass | accept | **최종 승인** | Phase D |
| full_pass | accept_with_note | **승인(잔존 기록)** | Phase D — 잔존 S2를 summary에 명시 |
| full_pass | rewrite_round_2 | **2차 작업** | Phase B 재호출 (target finding, round+1) |
| full_pass | rollback_and_rewrite | **롤백 후 재작업** | 문제 edit(구조위반·과윤문) 롤백 → Phase B (round+1) |
| conditional_pass | accept / accept_with_note | **롤백된 edit만 재시도** | fidelity 롤백 대상만 Phase B (round+1) |
| conditional_pass | rewrite_round_2 / rollback_and_rewrite | **양쪽 지시 병합 재작업** | 두 파일의 target·롤백 합쳐 Phase B (round+1) |
| fail | - | **전면 재작업** | Phase B 전면 재호출 (round+1) |
| - | hold_and_report | **사람 검토** | Phase D 생략, 미해결 리포트 |
| (round 3 도달, 미해결) | - | **hold_and_report 강제** | 사람 검토 권고 + 마지막 안정본 출력 |

2차/3차는 `03_draft_v2.md`·`v3.md`로 분리. **최대 3회(round) 후에도 미해결이면 `hold_and_report`** — 오케스트레이터가 강제한다.

### Phase D: 최종 출력
1. `final.md`에 최종본 복사
2. `<!-- TECHWRITER-SUMMARY -->` 블록 포함 — 등급은 **`quick-rules.md`의 "등급 기준 (정본 SSOT)"** 정의를 적용(여기서 재정의 금지). write 모드는 변경률(2항) 제외 6항 채점.
3. 오케스트레이터가 `final.md`를 Read해 사용자에게 결과 본문 + 등급 + 안내 제시.

## 부분 재실행 / 후속 명령

| 사용자 신호 | 처리 |
|---|---|
| "이 절만 다시" | strict 전환, 해당 절만 입력으로 재실행 |
| "예제 추가" | hybrid 모드, 해당 위치에 코드 예제·기대 출력 작성 |
| "영어로 다시" / "한글로" | `lang` 전환 후 재작성 |
| "독자 레벨 바꿔서" | `audience_hint` 변경 후 Phase B부터 |
| "2차 검토" | 기존 run_id의 final.md를 새 입력으로 strict Phase B 재실행 |
| "장르 바꿔서" | `genre_hint` 변경 후 Phase A부터 |

## 옵션 (인자 끝에 자연어로)

- `장르: 가이드|API|README|블로그|리포트|업무`
- `작업: 작성|윤문|하이브리드`
- `언어: 한국어|영어`
- `독자: 입문|중급|고급`
- `강도: 보수|기본|적극`
- `--strict` — 5인 파이프라인 강제

## 데이터 흐름 요약

### Fast 모드
```
01_input.txt
    ↓ [tech-writer-monolith — 단일 호출, 도구 3회]
    ├ 메모리: quick-rules 로드 → 작성 or 탐지+윤문 → 자체검증 7항(write=6항)
    └→ final.md (+ TECHWRITER-SUMMARY 블록)
    ↓ [오케스트레이터가 final.md Read → 사용자에 본문 제시]
```

### Strict 모드
```
01_input.txt
    ↓ [doc-quality-detector] → 02_detection.json
    ↓ [tech-doc-writer]       → 03_draft.md + 03_diff.json
    ↓ [병렬 팀]
    ├→ [tech-fidelity-auditor] → 04_fidelity_audit.json
    └→ [doc-clarity-reviewer]  → 05_clarity_review.json
    ↓ [오케스트레이터 종합]
    ├→ (재작업) Phase B로 복귀 (최대 3회)
    └→ (승인) final.md
```

## 에이전트 호출 규칙

**모델:** 단계별로 나눠 태깅한다 — 답의 형태가 이미 정해진 단계와, 판정이 열려 있는 단계를 가른다(SSOT: `scripts/lib/model-policy.js`).

- balanced(`claude-sonnet-5.5`) — 닫힌 단계: `doc-quality-detector`(taxonomy 대조 스캔), `tech-doc-writer`(탐지 리포트대로 작성·윤문), `tech-writer-monolith`(fast path 일괄 실행).
- deep-reasoning(`claude-opus-5.5`) — 열린 단계: `tech-fidelity-auditor`(코드·수치·시그니처 훼손/날조 판정), `doc-clarity-reviewer`(미분류 결함 발견 + 구조 위반·과윤문 판정).

**호출 방식:** 오케스트레이터(SKILL.md)가 `invoke_sub_agent` 도구로 각 워커 에이전트를 이름으로 직접 호출한다. 워커는 워크스페이스 `.kiro/agents/`(`node install.js cli --scope workspace` 또는 IDE 설치)에 있으며 서로 직접 통신하지 못한다 — 모든 핸드오프는 오케스트레이터가 `_workspace` 파일로 중계한다.

**필요 에이전트 5종:**
- `tech-writer-monolith` (fast 전용, 단일 호출)
- `doc-quality-detector` · `tech-doc-writer` · `tech-fidelity-auditor` · `doc-clarity-reviewer` (strict 4명)

## 철칙

1. **정확성 최우선 (Accuracy First)** — 코드·명령·수치·식별자·버전·API 시그니처는 100% 정확. 윤문 모드에서 사실 변경 금지.
2. **실행가능성 (Runnable)** — 명령은 복사-실행 가능, 코드블록은 언어 태그, 위험 명령은 경고.
3. **구조는 자산 (Structure is Good)** — 헤딩·목록·표·코드블록을 제거하지 않는다. 없으면 보강한다.
4. **모호성 제로 (No Vagueness)** — "쉽게·간단히·여러·빠르게" 같은 평가절하·막연한 표현 제거.
5. **장르·독자 유지** — 입력 장르와 독자 레벨에서 이탈 금지. register 일관.
6. **작성 모드는 사실 날조 금지** — 노트에 없는 API·수치·동작을 지어내지 않는다. 불명확하면 `<!-- TODO: 확인 필요 -->`로 표시.

## 주의 사항

- **수치·고유명사·버전·식별자·코드는 탐지/윤문 대상 아님.** Do-NOT list 엄수.
- **구조를 없애지 않는다.** 불릿·헤딩·번호 목록은 기술 문서의 자산이다.
- **장르 이탈 금지.** API 레퍼런스를 블로그로, 리포트를 튜토리얼로 옮기지 않는다.
- **변경률 40% 초과 → 경고, 60% 초과 → 강제 중단** (윤문 모드 한정). 산식은 **산문 문장 단위** `(수정·삭제·추가 산문 문장) ÷ (원본 산문 문장)` — 정의는 `quick-rules.md "변경률 산식 (정본)"` 참조. write 모드는 `n/a`.
- **등급 정의는 단일 SSOT.** `quick-rules.md "등급 기준 (정본 SSOT)"`만 진실 원천이다. SKILL·monolith·README·CLAUDE는 복제하지 말고 인용한다.
- **자동 로드 금지.** 다른 파일을 자동 파싱해 옵션을 추론하지 않는다.

## 참고 자료

- 슬림 룰북 (Fast 전용 + **등급/변경률 정본 SSOT**): `references/quick-rules.md` — A~I 카테고리 + 작성/윤문 모드 + 자체검증 7항 + 등급·변경률 정의
- 분류 체계 본진 (Strict 전용): `references/tech-doc-taxonomy.md` — 전체 패턴 + 예문 (v1.1: A 11·B-1~7·C-1~8·D-1~9·E-1~8·F-1~7·I-1~7. 2025–26 신규 D-8 안티테제(S1)·I-5 em-dash·E-6 구조과잉 등 포함)
- 작성·윤문 처방 (Strict 전용): `references/tech-writing-playbook.md` — 장르별 템플릿·치환 레시피

> 위 경로는 `{SKILL_DIR}/references/` 기준이다. **에이전트에 전달할 때는 `{SKILL_DIR}`를 절대경로로 치환**해 `quick_rules_path`·`taxonomy_path`·`playbook_path`로 넘긴다(경로 규약 참조).
