# 모델 라우팅(Model Routing)

하네스는 파일마다 모델을 손으로 고르는 대신, 각 에이전트를 **능력 티어(capability tier)**로 배정한다. 이는 **3-티어** 정책이며, 티어는 **프로바이더 독립적(provider-agnostic)**이다 — 동일한 티어가 Claude 식별자(기본)와 OpenAI GPT-5.6 식별자에 모두 매핑된다. 세 번째 설치 패턴인 **`mixed`**는 역할 단위 조합을 한다 — Claude Fable이 오케스트레이션, 그 외 전 역할은 GPT-5.6 Sol([Mixed 패턴](#mixed-패턴-fable-오케스트레이션--sol-서브에이전트) 참조). 단일 출처(SSOT)는 [`scripts/lib/model-policy.js`](../../scripts/lib/model-policy.js)다.

**Opus 5가 천장(ceiling)이다.** 그 위의 티어는 없다. 최상위 티어가 충분한 결과를 내지 못할 때, 두 방향으로만 확대한다 — **내향**(티어 내에서 노력 증가)과 **횡향**(다른 모델 가족). [천장 위: 노력, 그 다음 크로스 패밀리](#천장-위-노력-그-다음-크로스-패밀리) 참조.

## 능력 티어

| 티어 | Claude (기본) | OpenAI | 용도 |
|------|---------------|--------|------|
| **deep-reasoning** (천장) | `claude-opus-5` | `gpt-5.6-sol` | 오케스트레이션, 아키텍처, 보안 판단, 근본 원인 분석, 리서치 종합, 복잡한 데이터 모델링, 장기 자율 실행 |
| **balanced** | `claude-sonnet-5` | `gpt-5.6-terra` | 코딩 주력(workhorse): 코드/언어 리뷰, 빌드 오류 해결, 리팩터링, e2e, 문서 |
| **cost-optimized** | `claude-haiku-4.5` | `gpt-5.6-luna` | 단순·대량·저판단 작업: 번역, 분류, 기본 콘텐츠 |

설계 원칙: **Opus 5가 오케스트레이션과 추론을 맡고, Sonnet은 코딩 물량, Haiku는 값싼 대량 작업.** 기본 티어는 `balanced`(Sonnet 5)다 — 대부분의 에이전트가 코딩 에이전트이므로, 명시되지 않은 역할은 모두 balanced로 떨어진다.

## 에이전트별 배정

| 티어 | 에이전트 |
|------|----------|
| **deep-reasoning** (`claude-opus-5`, 천장) | kiro-cli(오케스트레이터), architect, security-reviewer, deep-researcher, devops, peer-reviewer |
| **balanced** (`claude-sonnet-5`) | code-reviewer, refactor-cleaner, 전체 언어 리뷰어(python, rust, go, java, kotlin, cpp, typescript, flutter), database-reviewer, 전체 빌드 리졸버(build-error-resolver, cpp, go, java, kotlin, pytorch, rust), e2e-runner, 문서 에이전트(tech-doc-writer, tech-writer-monolith, doc-clarity-reviewer, doc-quality-detector, tech-fidelity-auditor) |
| **cost-optimized** (`claude-haiku-4.5`) | translator-docs, article-writer, content-creator |

분류 근거:
- **kiro-cli는 천장에 위치하지만 위에 있지 않다** — 오케스트레이터가 `claude-opus-5`를 실행하는데, 이는 추론 에이전트와 동일한 티어다. 장기 자율 작업, 광폭 병렬 서브에이전트 위임, 자가 검증이 이 티어의 용도다. 정책의 이전 판에서는 오케스트레이터를 Opus 위의 별도 frontier 티어에 두었지만, 그 티어는 이제 없다. 오케스트레이터는 여전히 지렛대가 가장 큰 단일 좌석이지만, 지렛대는 **노력**(max로 실행)이지, 더 비싼 모델이 아니다.
- **security-reviewer는 Opus 유지**, 범용 **code-reviewer는 Sonnet으로 이동** — 보안 판단은 깊은 추론에서 이득을 보지만, 일상적 품질 리뷰는 Sonnet의 강점이자 물량이 훨씬 많다.
- **peer-reviewer는 Opus 유지** — Claude Code(`claude -p`) + Codex(`codex`)를 조율하는 교차 모델 second opinion(Kiro + Claude + Codex 3-way)은 왕복 비용을 정당화하려면 최상위 티어에서 나와야 한다.

## 천장 위: 노력, 그 다음 크로스 패밀리

Opus 5는 하네스가 라우팅하는 최상위 티어다. 그 위의 뭔가를 찾는 대신, 두 방향으로 확대한다.

### 1) 내향 — 티어 내에서 노력 증가

같은 모델, 더 큰 추론 예산. 티어 점프보다 싸고, Kiro가 직접 지원한다:

```bash
# Claude
kiro-cli settings chat.modelDefaults \
  '{"claude-opus-5":{"output_config":{"effort":"max"}}}'

# GPT-5.6
kiro-cli settings chat.modelDefaults \
  '{"gpt-5.6-sol":{"reasoning":{"effort":"max"}}}'

# 모든 프로바이더, 세션별
kiro-cli chat --effort max
```

공용 사다리는 `low` → `medium` → `high` → `xhigh` → `max`. GPT-5.6은 추가로 `none`도 지원한다. **기본값은 `max`** (`DEFAULT_EFFORT`에 정의): 추론 모델과 추론 주력 작업은 설계상 전체 예산을 받으며, 하네스는 모델 쓰로틀보다 가이드레일을 최소화·보안 중심으로 유지해서(결정적 게이트 2개) 보상한다. 따라서 사다리는 하향으로만 작동한다 — `ROLE_EFFORT`는 기계적 예외만 열거한다:

| 역할 | 노력 | 이유 |
|------|------|------|
| 모든 추론/판단 역할 (오케스트레이터, architect, 리뷰어들, 리서처, 빌드 해결자, …) | `max` (기본값) | 추론 예산이 목표 — 그 위의 티어가 없으므로 사다리 최상단에서 시작 |
| refactor-cleaner, translator-docs | `low` | 기계적 작업은 추론 예산이 불필요 |

`effort`는 **에이전트 설정 필드가 아니다** — Kiro 에이전트 스키마에는 `model`만 있다. 세션/설정 노브이므로 설치기는 정확한 명령을 출력하지만 자동으로 작성하지 않는다.

### 2) 횡향 — 다른 모델 가족

`max`에는 위가 없다. 남은 축은 다른 모델 가족이다. 같은 가족을 다시 프롬프트하는 것은 상관된 맹점을 깨뜨릴 수 없기 때문이다 — 같은 학습, 같은 실패 모드. Kiro는 이를 `peer-reviewer` 에이전트(터미널 `claude -p` + `codex`)와 `--review-backend cross` 옵션의 온디맨드 `bash .kiro/hooks/cross-review.sh`로 노출한다. 설치된 프로바이더 프로필이 독립 백엔드 우선순위를 정한다: Anthropic → Codex를 먼저 호출, OpenAI → Claude Code를 먼저 호출. 다른 CLI는 같은 가족 상호 검증으로 남는다.

**독립성**이나 **수고**가 가치인 경우 다른 가족에 작업을 넘긴다:

| 상황 | 같은 가족의 다른 서브에이전트보다 다른 가족이 나은 이유 |
|------|-----------------------------------------------------|
| 이 함대가 작성한 코드에 대한 적대적 리뷰 | 같은 가족 리뷰는 맹점을 공유한다. 가족을 바꾸는 것이 상관관계를 끊는 유일한 방법 |
| 두 시도가 불일치한 후 동점 해결 | 세 번째 같은 가족 의견은 첫 두 개와 상관된다 |
| 대규모 기계적 편집(N개 파일에서 이름 변경, 코드모드) | 천장 티어 컨텍스트를 쓰지 않고 수고를 내려놓는다. 후에 diff 검증 |
| 루프에 갇혔을 때 두 번째 진단 | 재프롬프트보다 신선한 프레이밍 나음 |

하네스에서 일을 유지할 수 있을 때는, 작업에 steering 규칙, 기술, 워크로드 태그, 프로젝트 규약, 도구 오케스트레이션(MCP / 훅 / 서브에이전트DAG) 또는 한국어 출력이 필요할 때다 — 외부 CLI는 이 모두에서 처음부터 시작한다.

**이를 이득으로 만드는 규칙: 외부 가족이 중요한 뭔가의 *유일한* 리더가 되도록 놔두지 마라.** 그것만 보고하는 결과는 여전히 실제 코드에 대해 확인이 필요하고, 두 가족이 독립적으로 플래그하는 결과가 고신뢰도 결과다. `cross-review.sh`는 실행마다 끝에 이 규칙을 출력한다.

### 폭발 범위(diff가 말하지 않는 것)

한쪽 또는 양쪽 축에 변경을 넘기기 전에, `cross-review.sh`는 **폭발 범위**를 추출한다 — 변경되지 않았지만 리뷰해야 할 파일. 두 축, 가용할 인덱스 없음:

- **(a) 역방향 참조** — 변경된 모듈을 `require`/`import`하는 파일.
- **(b) 동일 커밋** — 역사적으로 같은 커밋에 나타나는 파일. import 엣지가 없는 결합도 포착(예: 문서의 카운터와 그 카운터가 세는 파일).

두 가지 실패 모드, 모두 측정:
- `rg`에 경로 인자와 `</dev/null`을 줘야 하지 않으면 루프의 stdin을 삼켜서 첫 파일만 조용히 처리한다.
- `git log --name-only -- <path>`는 파일 *목록*을 pathspec으로 필터하므로 동일 커밋은 커밋 해시를 먼저 모으고 각 커밋의 전체 파일 집합을 `git show`로 읽어서 계산해야 한다.

고전적 함정은 **카운터/카탈로그 일관성**: diff가 숫자나 리스트를 바꾸면 그 숫자가 나온 파일을 열어라. `scripts/validate-counts.js`가 이제 그 종류를 기계적으로 포착한다.

## 프로바이더 설치 및 전환

설치 시 패밀리를 선택하세요. 소스 함대는 Anthropic 우선으로 유지되며, 설치된 JSON/Markdown 에이전트만 변환됩니다.

```bash
# Claude 프로필 (기본)
node install.js cli --scope global --provider=anthropic

# GPT-5.6 프로필
node install.js cli --scope global --provider=openai
node install.js ide --provider=openai --dev=frontend

# Mixed 프로필 — Fable 오케스트레이션 + Sol 서브에이전트
node install.js cli --scope global --provider=mixed
```

프로바이더 프로필이 네 가지를 함께 변경합니다:

1. 역할-티어 모델 ID (`Opus/Sonnet/Haiku`, `Sol/Terra/Luna`, 또는 mixed의 `Fable` + 전부 `Sol`).
2. 출력된 `chat.modelDefaults` 필드 경로는 **오케스트레이터 모델의 패밀리**에서 결정됨 (`output_config.effort` for Claude/Fable, `reasoning.effort` for GPT).
3. 모든 설치된 에이전트에 주입된 간결한 운영 노트, **그 에이전트의 모델 패밀리** 기준(글로벌 플래그 아님). Claude 패밀리 에이전트는 plan/자가검증과 1M 컨텍스트 가이드를 받고, GPT 패밀리 에이전트는 배치 도구와 272K 컨텍스트용 조기 컴팩션 가이드를 받습니다. Mixed에서는 두 종류 운영 노트가 한 설치에서 공존합니다.
4. Cross-family 우선순위. Anthropic은 Codex 우선, OpenAI는 Claude Code 우선; mixed는 Codex 우선(Fable 작성 쪽 vs.) — Claude Code는 Sol 작성 쪽을 커버.

매니페스트가 `provider`를 기록하며, `node install.js --status`로 확인 가능합니다. 다른 프로바이더로 설치기를 다시 실행하면 워크스페이스를 전환합니다. 글로벌·워크스페이스 설치는 다른 프로바이더를 사용할 수 있으며, 콘텐츠 기반 중복 제거가 차이나는 프로바이더별 워크스페이스 사본을 유지합니다.

### Mixed 패턴 (Fable 오케스트레이션 + Sol 서브에이전트)

`--provider=mixed`는 역할 단위 조합이지, 네 번째 티어 열이 아니다:

- **오케스트레이터(`kiro-cli`) → `claude-fable-5`** via `ROLE_MODEL_OVERRIDES` — Claude가 planning·delegation·convergence를 담당한다.
- **모든 다른 역할 → `gpt-5.6-sol`**, 티어 무관. 서브에이전트 작업은 의도적으로 Terra/Luna가 아닌 OpenAI 천장 모델로 평탄화된다. 패턴의 목표는 균일하게 강한 Sol 워커들 위의 Fable 품질 오케스트레이션이다.

**Fable 가용성 폴백.** 사용 환경에서 에이전트가 핀한 모델을 서빙하지 않을 때마다 Kiro는 `chat.defaultModel`로 폴백한다(경고와 함께). 따라서 설치기는 `claude-fable-5`를 사용할 수 없는 곳에 **`claude-opus-5`를 노력 `max`**로 대체하는 두 명령을 출력한다(`MIXED_ORCHESTRATOR_FALLBACK` in `model-policy.js`):

```bash
kiro-cli settings chat.defaultModel claude-opus-5
kiro-cli settings chat.modelDefaults '{"claude-opus-5":{"output_config":{"effort":"max"}}}'
```

서브에이전트는 폴백 영향을 받지 않는다 — `gpt-5.6-sol`을 직접 핀한다.

`scripts/apply-model-policy.js`는 저장소 소스 자산을 의도적으로 재지정하기 위한 유지 보수 도구로 남아 있습니다. 일반적인 프로바이더 전환이 아닙니다. 소스 검증이 의도적으로 Anthropic 우선 베이스라인을 예상하기 때문입니다.

일관성 검증은 언제든:

```bash
node scripts/validate-models.js   # 또는: npm run validate:models
```

## 모델 식별자 주의사항 (고정 전 필독)

Kiro는 `model` 값을 모델 서비스가 반환하는 ID와 대조한다. **알 수 없는 ID는 경고와 함께 기본 모델로 조용히 폴백**한다 — 즉 잘못된 문자열은 에이전트를 엉뚱한 모델로 조용히 돌린다.

- 하네스는 **점(dot)** 표기를 쓴다: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4.5`; mixed 패턴은 추가로 오케스트레이터에 `claude-fable-5`를 핀한다.
- Anthropic의 정식 API/Bedrock ID는 마이너 버전에 **하이픈**을 쓴다: `claude-haiku-4-5`. `claude-opus-5`, `claude-sonnet-5`는 메이저만 있는 릴리스라 두 표기가 같은 문자열로 수렴한다(모호성 없음).
- OpenAI의 Kiro 식별자는 `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`입니다.
- **의존하기 전에 활성 Kiro 세션에서 `/model`로 각 식별자를 확인하라.** 사용 중인 Kiro 빌드가 하이픈 마이너 버전 형식을 기대한다면 `model-policy.js`의 `TIERS`를 고치고 적용기를 다시 실행한다. `/model` 목록에 `claude-fable-5`가 없으면 위의 mixed 패턴에서 출력하는 opus-5 `max` 폴백을 사용한다.

## Kiro 가용성 (기본 티어가 `balanced`라 중요)

가용성은 여전히 중요합니다. 알 수 없거나 가용하지 않은 식별자는 세션 기본값으로 폴백할 수 있기 때문입니다. 2026-08-04 업데이트 Kiro 모델 문서 기준:

| 모델 패밀리 | Kiro 상태 | 컨텍스트 / 리전 안내 |
|-----------|----------|------------------|
| `claude-opus-5` | Experimental | 1M 컨텍스트; us-east-1, eu-central-1 (cross-region inference 지원) |
| `claude-sonnet-5` | Active | 1M 컨텍스트 |
| `claude-haiku-4.5` | Active | 광범위 가용 |
| GPT-5.6 Sol / Terra / Luna | Experimental | 272K 컨텍스트; us-east-1, eu-central-1 (cross-region inference 지원) |

Experimental 모델은 변경될 수 있으며 리전 제약이 있습니다. 특히 Kiro 업데이트 후에 설치된 ID를 `/model`로 확인하세요.

## 훅(Hook) → 티어 가이드

IDE 훅(`.kiro/hooks/*.json`, v1 포맷)은 `askAgent` 프롬프트로 에이전트 액션을 트리거한다. v1 훅 스키마에는 **훅별 모델 필드가 없으므로**, 훅이 트리거한 액션은 현재 세션 모델로 실행된다. 훅 작업 성격에 맞춰 세션 모델을 고른다:

| 훅 | 성격 | 적합 티어 |
|----|------|-----------|
| pre-write-guard | 크기/시크릿/문서 위치 점검 | cost-optimized 또는 balanced |
| git-pipeline-guard | 기본 브랜치 푸시 게이트 | cost-optimized 또는 balanced |

세션 모델과 무관하게 특정 티어에서 돌려야 하는 무거운 리뷰는, 훅 프롬프트에서 세션 모델에 기대지 말고 명명된 에이전트(예: 보안 점검은 `security-reviewer`)에 위임한다.

## OpenAI GPT-5.6 (현재 선택 가능)

세 GPT-5.6 변형 모두 Kiro에서 선택 가능합니다:

- **Sol** (`gpt-5.6-sol`, 2.4x credits): 가장 어려운 장기 추론, 리팩터, 터미널 워크플로.
- **Terra** (`gpt-5.6-terra`, 1.0x): 일상적 다단계 개발과 균형잡힌 workhorse.
- **Luna** (`gpt-5.6-luna`, 0.1x): 높은 빈도, 속도·크레딧 민감 작업.

세 종 모두 272K 컨텍스트 윈도우를 가지고 `none`부터 `max`까지 `reasoning.effort`를 지원합니다. `--provider=openai`로 설치하세요. 일반적인 워크스페이스 전환에는 소스 정책 적용기를 실행하지 마세요.
