# AGENTS.md — 글로벌 에이전트 협업 규약 (concise)

이 문서는 모든 워크스페이스가 공유하는 에이전트 협업 규약을 요약한다. 위임(delegation)과 모델 정책만 다루며, 응답 언어·코딩 스타일·보안 규칙 등 기존 글로벌 steering이 정의하는 정책은 재정의하지 않는다.

## 위임(Delegation) 규약

- 오케스트레이터(`kiro-cli`)는 광범위한 탐색·리서치·대규모 코드 읽기를 격리 컨텍스트 서브에이전트에 위임하여 메인 컨텍스트를 가볍게 유지한다. 좁고 명확한 단건 조회는 직접 처리한다.
- 독립 작업은 DAG로 모델링하고, `depends_on` 의존이 없는 스테이지는 격리 서브에이전트에 병렬 위임한다.
- 각 위임 산출물은 검증 후 수렴(verify-then-converge): 결과를 합치기 전에 정확성을 확인한 뒤에만 수렴 결과를 사용자에게 제시한다.
- 교차 모델 리뷰·설계 토론·독립 교차 점검이 필요하면 `peer-reviewer`(터미널 `claude -p`) 에이전트를 사용한다.

## 모델 정책 요약 (4-티어, 프로바이더 독립)

역할을 능력 티어에 매핑하고, 티어를 모델 식별자에 매핑한다. 단일 출처는 `scripts/lib/model-policy.js`이며, 자세한 배정·전환은 `docs/kr/model-routing.md`를 참조한다.

- `claude-opus-4.8` → `claude-fable-5` (frontier) — 오케스트레이터(kiro-cli) 전용. 기본 opus-4.8(널리 가용), 설치 시 가용하면 fable-5(Mythos-class)로 승격(`--frontier-model=fable5` 또는 대화형).
- `claude-opus-4.8` (deep-reasoning) — 아키텍처·보안·근본 원인 분석·리서치 종합 등 추론 중심 작업(architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler).
- `claude-sonnet-5` (balanced, 기본 티어) — 코드/언어 리뷰·빌드 오류 해결·리팩터·e2e·문서 등 코딩 주력. 명시되지 않은 역할은 이 티어로 떨어진다.
- `claude-haiku-4.5` (cost-optimized) — 번역·문서·분류 등 비용 최적화 작업.

OpenAI GPT가 Kiro에 붙으면 frontier/deep-reasoning→`gpt-5.5`, balanced→`gpt-5.4`로 매핑한다(예정). 프로바이더 전환: `node scripts/apply-model-policy.js --provider=openai`.
