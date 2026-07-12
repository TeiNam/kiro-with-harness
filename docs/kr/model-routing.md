# 모델 라우팅(Model Routing)

하네스는 파일마다 모델을 손으로 고르는 대신, 각 에이전트를 **능력 티어(capability tier)**로 배정한다. 티어는 **프로바이더 독립적(provider-agnostic)**이다 — 동일한 세 티어가 지금은 Claude 식별자에, GPT가 Kiro에 붙으면 OpenAI 식별자에 매핑된다. 단일 출처(SSOT)는 [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js)다.

## 능력 티어

| 티어 | Claude (기본) | OpenAI (예정) | 용도 |
|------|---------------|---------------|------|
| **deep-reasoning** | `claude-opus-4.8` | `gpt-5.5` | 오케스트레이션, 아키텍처, 보안 판단, 근본 원인 분석, 리서치 종합, 복잡한 데이터 모델링 |
| **balanced** | `claude-sonnet-5` | `gpt-5.4` | 코딩 주력(workhorse): 코드/언어 리뷰, 빌드 오류 해결, 리팩터링, e2e, 문서 |
| **cost-optimized** | `claude-haiku-4.5` | `gpt-5.4` | 단순·대량·저판단 작업: 번역, 분류, 기본 콘텐츠 |

설계 원칙: **Opus는 추론·오케스트레이션, Sonnet은 코딩 물량, Haiku는 값싼 대량 작업.** 기본 티어는 `balanced`(Sonnet 5)다 — 대부분의 에이전트가 코딩 에이전트이므로, deep-reasoning·cost-optimized로 명시되지 않은 역할은 모두 balanced로 떨어진다.

## 에이전트별 배정

| 티어 | 에이전트 |
|------|----------|
| **deep-reasoning** (`claude-opus-4.8`) | kiro-cli(오케스트레이터), architect, security-reviewer, deep-researcher, devops, peer-reviewer, rdbms-data-modeler |
| **balanced** (`claude-sonnet-5`) | code-reviewer, refactor-cleaner, 전체 언어 리뷰어(python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, 전체 빌드 리졸버(build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, 문서 에이전트(tech-doc-writer, tech-writer-monolith, doc-clarity-reviewer, doc-quality-detector, tech-fidelity-auditor) |
| **cost-optimized** (`claude-haiku-4.5`) | translator-docs, article-writer, content-creator |

분류 근거:
- **security-reviewer는 Opus 유지**, 범용 **code-reviewer는 Sonnet으로 이동** — 보안 판단은 깊은 추론에서 이득을 보지만, 일상적 품질 리뷰는 Sonnet의 강점이자 물량이 훨씬 많다.
- **rdbms-data-modeler는 Opus 유지** — 3NF 정규화와 물리 스키마 트레이드오프는 언어별 리뷰와 달리 실제 추론이 필요하다.
- **peer-reviewer는 Opus 유지** — 교차 모델 second opinion은 왕복 비용을 정당화하려면 최상위 티어에서 나와야 한다.

## 적용 및 프로바이더 전환

각 에이전트 파일의 `model` 필드는 정책 적용기가 기록한다:

```bash
# 미리보기 (쓰기 없음)
node scripts/apply-model-policy.js --dry-run

# Claude(anthropic) 매핑 적용 — 기본값
node scripts/apply-model-policy.js

# 예정: 모든 에이전트를 OpenAI 티어 식별자로 재지정
node scripts/apply-model-policy.js --provider=openai --dry-run
node scripts/apply-model-policy.js --provider=openai
```

적용기는 `model` 값만 교체하며(라인 보존 — 들여쓰기·키 순서·본문 불변), 각 편집 후 JSON 유효성을 검증한다. 티어가 가리키는 식별자를 바꾸려면 `model-policy.js`의 `TIERS`를 수정하고 다시 실행하면 된다.

일관성 검증은 언제든:

```bash
node scripts/validate-models.js   # 또는: npm run validate:models
```

## 모델 식별자 주의사항 (고정 전 필독)

Kiro는 `model` 값을 모델 서비스가 반환하는 ID와 대조한다. **알 수 없는 ID는 경고와 함께 기본 모델로 조용히 폴백**한다 — 즉 잘못된 문자열은 에이전트를 엉뚱한 모델로 조용히 돌린다.

- 하네스는 **점(dot)** 표기를 쓴다: `claude-opus-4.8`, `claude-sonnet-5`, `claude-haiku-4.5`.
- Anthropic의 정식 API/Bedrock ID는 마이너 버전에 **하이픈**을 쓴다: `claude-opus-4-8`, `claude-haiku-4-5`. `claude-sonnet-5`는 메이저만 있는 릴리스라 두 표기가 같은 문자열로 수렴한다(모호성 없음).
- OpenAI는 원래 **점** 표기다: `gpt-5.5`, `gpt-5.4`.
- **의존하기 전에 활성 Kiro 세션에서 `/model`로 각 식별자를 확인하라.** 사용 중인 Kiro 빌드가 하이픈 마이너 버전 형식을 기대한다면 `model-policy.js`의 `TIERS`를 고치고 적용기를 다시 실행한다.

## Kiro 가용성 (기본 티어가 `balanced`라 중요)

티어 값은 Anthropic 모델명이지만, **Kiro 내부 가용성**은 다르며 가용하지 않은 모델은 세션 기본값으로 조용히 폴백한다. 2026-07-11 기준([kiro.dev/docs/models](https://kiro.dev/docs/models)):

| 모델 | Kiro 상태 | 리전 | 플랜 |
|------|-----------|------|------|
| `claude-opus-4.8` | Active | us-east-1, eu-central-1 | Pro / Pro+ / Power |
| `claude-sonnet-5` | **Experimental** | **us-east-1 전용** | Pro / Pro+ / Power (Free 제외) |
| `claude-haiku-4.5` | Active | us-east-1, eu-central-1 | 광범위 |

**이 제약은 `balanced`(Sonnet 5)에 가장 크게 작용한다 — 대다수 에이전트를 커버하는 기본 티어이기 때문이다.** Anthropic API에서는 Sonnet 5가 GA지만 **Kiro에서는 Experimental + us-east-1 전용**이다. eu-central-1이나 Free 티어에서 하네스를 설치하면 대부분의 에이전트가 기본 모델로 조용히 폴백한다. 그 경우 `TIERS`(`model-policy.js`)의 `balanced`를 가용한 모델로 바꾸고 적용기를 다시 실행한 뒤 `/model`로 확인하라. (Sonnet 5는 수동 extended thinking이 제거되고 adaptive thinking이 기본 ON이다. effort는 low→max를 API 수준에서 지원하며 코딩·agentic에는 high/xhigh가 적합.)

## 훅(Hook) → 티어 가이드

IDE 훅(`.kiro/hooks/*.json`, v1 포맷)은 `askAgent` 프롬프트로 에이전트 액션을 트리거한다. v1 훅 스키마에는 **훅별 모델 필드가 없으므로**, 훅이 트리거한 액션은 현재 세션 모델로 실행된다. 훅 작업 성격에 맞춰 세션 모델을 고른다:

| 훅 | 성격 | 적합 티어 |
|----|------|-----------|
| pre-write-guard | 크기/시크릿/문서 위치 점검 | cost-optimized 또는 balanced |
| review-on-stop | 작업 후 코드 리뷰 | balanced (보안 중요 변경은 deep-reasoning) |
| capture-lessons | 반복 교정 사항 요약 | cost-optimized |
| changelog-on-commit | 기계적 CHANGELOG/README 갱신 | cost-optimized 또는 balanced |

세션 모델과 무관하게 특정 티어에서 돌려야 하는 무거운 리뷰는, 훅 프롬프트에서 세션 모델에 기대지 말고 명명된 에이전트(예: 보안 점검은 `security-reviewer`)에 위임한다.

## OpenAI GPT-5.5 / GPT-5.4 도입 계획

GPT-5.5, GPT-5.4가 Kiro에서 선택 가능해지면:

1. `/model`로 정확한 식별자를 확인한다.
2. `gpt-5.5` / `gpt-5.4`와 다르면 `TIERS`(`model-policy.js`)의 `openai` 열을 수정한다.
3. `node scripts/apply-model-policy.js --provider=openai`로 전체 에이전트를 재지정하거나, 프로젝트별로 실행해 워크스페이스마다 프로바이더를 섞는다.
4. `deep-reasoning → gpt-5.5`, `balanced → gpt-5.4`. `cost-optimized`는 더 가벼운 GPT-5.x 티어가 나오기 전까지 `gpt-5.4`를 재사용한다 — 나오면 그 한 줄만 교체.

혼합은 의도된 설계다: 라우팅이 에이전트 단위이므로, 오케스트레이션·보안은 Claude Opus에 두고 물량이 많은 `balanced` 코딩 에이전트만 GPT-5.4로 돌리는(또는 그 반대) 구성이 가능하다 — 그때그때 벤치마크와 가격이 유리한 쪽으로.
