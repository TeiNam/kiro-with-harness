# 평가 하네스(Eval Harness) 가이드

Kiro 세션을 위한 공식 평가 프레임워크로, 평가 주도 개발(EDD, Eval-Driven Development)을 구현합니다.

## 사용 시점

- AI 지원 워크플로우에 평가 주도 개발을 설정할 때
- 작업 완료에 대한 통과/실패 기준을 정의할 때
- pass@k 지표로 신뢰성을 측정할 때
- 프롬프트 또는 에이전트 변경에 대한 회귀 테스트 스위트를 만들 때

## 평가 유형

### 기능 평가(Capability Evals)
새로운 기능이 동작하는지 테스트합니다:
```
[CAPABILITY EVAL: feature-name]
Task: Description
Success Criteria:
  - [ ] Criterion 1
  - [ ] Criterion 2
Expected Output: Description
```

### 회귀 평가(Regression Evals)
변경 사항이 기존 기능을 깨뜨리지 않는지 확인합니다:
```
[REGRESSION EVAL: feature-name]
Baseline: SHA or checkpoint
Tests:
  - test-1: PASS/FAIL
  - test-2: PASS/FAIL
Result: X/Y passed
```

## 채점기 유형(Grader Types)

1. 코드 기반(Code-Based) — 결정론적 검사 (grep, 테스트 러너, 빌드)
2. 모델 기반(Model-Based) — LLM을 심사위원으로 활용한 루브릭 채점 (1-5점)
3. 사람(Human) — 보안/모호한 출력에 대한 수동 검토

## 지표(Metrics)

- pass@1: 첫 번째 시도 성공률
- pass@3: 3회 시도 내 성공 (목표 > 90%)
- pass^3: 3회 시도 모두 성공 (릴리스 필수 항목 목표 100%)

## 워크플로우

### 1. 정의 (코딩 전)
```
EVAL DEFINITION: feature-xyz

Capability Evals:
1. Can create new user account
2. Can validate email format

Regression Evals:
1. Existing login still works
2. Session management unchanged

Success Metrics:
- pass@3 > 90% for capability
- pass^3 = 100% for regression
```

### 2. 구현
정의된 평가를 통과하기 위한 코드를 작성합니다.

### 3. 평가
각 평가를 실행하고 PASS/FAIL을 기록합니다. 타입/린트 검사에는 getDiagnostics를 사용합니다.
테스트 스위트는 사용자가 직접 실행하도록 안내합니다.

### 4. 보고
```
EVAL REPORT: feature-xyz
========================
Capability: 3/3 passed (pass@3: 100%)
Regression: 3/3 passed (pass^3: 100%)
Status: READY FOR REVIEW
```

## 평가 저장소

```
.kiro/evals/
  feature-xyz.md      # 평가 정의
  feature-xyz.log     # 실행 이력
  baseline.json       # 회귀 기준선
```

## 모범 사례

1. 코딩 전에 평가를 정의하세요
2. 평가를 자주 실행하세요
3. 시간에 따른 pass@k 추이를 추적하세요
4. 가능하면 코드 기반 채점기를 사용하세요
5. 보안 관련은 사람이 검토하세요
6. 평가를 빠르게 유지하세요
7. 평가를 코드와 함께 버전 관리하세요

## 안티패턴

- 알려진 평가 예제에 프롬프트를 과적합(overfitting)시키는 것
- 정상 경로(happy-path) 출력만 측정하는 것
- 통과율을 높이려다 비용/지연 시간 변화를 무시하는 것
- 릴리스 게이트에 불안정한(flaky) 채점기를 허용하는 것
