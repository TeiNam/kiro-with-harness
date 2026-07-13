---
name: analysis-methodology
description: >
  Data analysis methodology — how to frame a question, pick the right technique,
  avoid statistical traps, and connect results to decisions. NOT a tool tutorial
  (pandas/polars/duckdb live in python-data-analysis) — this is the judgment
  layer: problem framing, analysis-type decision tree, experiment/causal design,
  and domain playbooks (churn, cohort, funnel, anomaly). Trigger: "왜 늘었/줄었지",
  이탈 분석, 코호트, 퍼널, A/B 테스트, 인과추론, 상관 vs 인과, 유의성, 세그먼트,
  이상 탐지, "이 데이터로 뭘 봐야", 지표 설계, exploratory analysis.
origin: custom
workloads: [python-data]
---

# Data Analysis Methodology

분석의 어려움은 pandas 문법이 아니라 **"무엇을·왜 보고, 결과를 어떻게 믿고,
의사결정에 어떻게 연결하나"**다. 이 스킬은 그 판단 층을 다룬다. 실제 코드(pandas·
polars·duckdb·plotting)는 `python-data-analysis` 로 위임한다 — 여기서 중복하지 않는다.

## When to Activate

- "왜 늘었/줄었지" 류의 원인 규명, 이탈·코호트·퍼널·세그먼트 분석
- A/B 테스트 설계·해석, 인과추론(상관과 인과 구분)
- "이 데이터로 뭘 봐야 하나" — 문제 정의가 아직 흐릴 때
- 통계적 유의성 해석, 다중비교·표본편향 같은 함정 회피
- 지표(metric) 설계, 분석 결과를 의사결정으로 연결

순수 도구 사용법(groupby·join·parquet·차트 코드)은 `python-data-analysis`.
프로덕션 ML 모델링은 `mle-workflow`·`pytorch-patterns`. AWS 분석 엔진(Glue·
Athena·Redshift) 운영은 `aws-lakehouse`·`aws-etl-cdc` 스킬과 `cloud` 워크로드 MCP.

## 분석 워크플로 (프레이밍 → 접근 → 검증 → 결정)

도구를 열기 전에 이 4단계를 먼저 밟는다. 대부분의 나쁜 분석은 1단계를 건너뛴다.

### 1. 프레이밍 — 질문을 분석 가능하게 만든다
- **모호한 요청 → 구체 질문**: "매출 봐줘" → "지난 분기 대비 이번 분기 매출이
  변한 게 세그먼트 때문인가, 단가 때문인가, 물량 때문인가?"
- **의사결정을 먼저 묻는다**: "이 분석으로 무슨 결정을 내릴 건가?" 결정과 무관한
  분석은 하지 않는다(YAGNI). 결정이 없으면 분석 범위가 무한 발산한다.
- **성공 기준·지표를 정의**: 무엇이 "올랐다/개선됐다"인지 숫자로. 방향(↑좋음/↓좋음)도.

### 2. 분석 유형 결정 — 무슨 기법인가
질문의 성격이 기법을 정한다. 상세 결정 트리는
[references/analysis-type-decision.md](references/analysis-type-decision.md).

| 질문 유형 | 예 | 접근 |
|-----------|-----|------|
| 기술(descriptive) | "지금 상태가 어떤가" | 요약통계·분포·시계열 추세 |
| 진단(diagnostic) | "왜 이렇게 됐나" | 세그먼트 분해·드릴다운·기여도 분석 |
| 추론(inferential) | "이 차이가 진짜인가" | 가설검정·신뢰구간·효과크기 |
| 예측(predictive) | "앞으로 어떻게 될까" | 시계열 예측·회귀·분류 (→ mle-workflow) |
| 인과(causal) | "X 가 Y 를 일으켰나" | 실험·준실험 (→ experiment-design.md) |

### 3. 검증 — 결과를 믿기 전에
함정 체크리스트(상세는 아래 "함정" + references):
- 상관 ≠ 인과. 교란변수(confounder)를 배제했나?
- 표본이 대표성이 있나? 생존편향·선택편향은?
- 다중비교: 20개 지표를 보면 하나는 우연히 "유의"하다.
- 통계적 유의 ≠ 실질적 유의. p<0.05 라도 효과크기가 무의미하면 소용없다.
- Simpson's paradox: 전체 추세와 세그먼트별 추세가 반대일 수 있다.

### 4. 의사결정 연결 — so what
- 결과를 "그래서 무엇을 할 것인가"로 번역. 숫자만 던지지 않는다.
- 불확실성을 함께 전한다(신뢰구간·가정·한계). 과신은 나쁜 결정을 부른다.
- 재현 가능하게 남긴다(노트북·쿼리·가정) — `python-data-analysis` 의 재현성 규약.

## 도메인 플레이북 (상황별 접근)

자주 나오는 분석 상황의 표준 접근. 상세는
[references/domain-playbooks.md](references/domain-playbooks.md).

- **이탈(churn)**: 이탈 정의(언제부터 이탈?)가 먼저. 코호트별 생존곡선, 이탈 선행지표.
- **코호트(cohort)**: 가입 시점별로 묶어 시간에 따른 행동 변화. 리텐션 커브.
- **퍼널(funnel)**: 단계별 전환율·이탈 지점. 세그먼트별 퍼널 비교.
- **이상 탐지(anomaly)**: 무엇이 "정상"인가 기준선 먼저. 계절성·추세 분리(STL).
- **원인 규명("왜 늘었지")**: 기여도 분해 — 물량×단가×믹스. 세그먼트 드릴다운.

## 실험·인과 설계

"진짜 X 때문인가"는 관측 데이터만으론 대개 답 못 한다. 상세는
[references/experiment-design.md](references/experiment-design.md).

- **A/B 테스트**: 무작위 배정이 인과의 gold standard. 검정력 분석으로 표본 크기 먼저.
- **준실험(관측 데이터)**: 무작위가 불가능할 때 — DiD(이중차분)·회귀불연속·성향점수매칭.
  각각 성립 가정이 있고, 가정이 깨지면 결론도 깨진다.
- **관측 분석의 겸손**: 인과를 주장하기 전에 "이건 상관이고, 인과 가설은 실험으로
  검증 필요"라고 명시.

## 함정 (analysis-specific anti-patterns)

- **데이터부터 열기** — 질문·결정 없이 groupby 부터 하면 방향 없는 탐색에 빠진다(1단계 먼저).
- **p-hacking** — 유의할 때까지 자르고 나누기. 가설은 데이터 보기 전에.
- **평균의 함정** — 평균만 보고 분포·꼬리·세그먼트 무시. 항상 분포를 본다.
- **차트로 결론 강요** — 축 조작·체리피킹. 정직한 시각화(→ python-data-analysis 플로팅).
- **1회성 분석** — 반복될 질문은 재현 가능한 파이프라인으로.

## Related

- `python-data-analysis` — 도구·문법·재현성(pandas/polars/duckdb/plotting). **코드는 여기로.**
- `mle-workflow` · `pytorch-patterns` — 예측 모델링.
- `duckdb-patterns` — 큰 데이터 SQL 분석.
- AWS 분석/레이크하우스는 `aws-lakehouse`·`aws-etl-cdc` 스킬과 `cloud` 워크로드 MCP.
