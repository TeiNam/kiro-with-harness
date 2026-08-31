# AGENTS.md — 글로벌 에이전트 협업 규약 (concise)

이 문서는 모든 워크스페이스가 공유하는 에이전트 협업 규약을 요약한다. 위임(delegation)과 모델 정책만 다루며, 응답 언어·코딩 스타일·보안 규칙 등 기존 글로벌 steering이 정의하는 정책은 재정의하지 않는다.

## 위임(Delegation) 규약

- 오케스트레이터(`kiro-cli`)는 광범위한 탐색·리서치·대규모 코드 읽기를 격리 컨텍스트 서브에이전트에 위임하여 메인 컨텍스트를 가볍게 유지한다. 좁고 명확한 단건 조회는 직접 처리한다.
- 독립 작업은 DAG로 모델링하고, `depends_on` 의존이 없는 스테이지는 격리 서브에이전트에 병렬 위임한다.
- 인프라(AWS·Terraform·K8s) 변경은 `devops` 에이전트로 위임한다 — 조회는 직접, 변경은 plan/diff → 승인 → apply 게이트를 거친다.
- 각 위임 산출물은 검증 후 수렴(verify-then-converge): 결과를 합치기 전에 정확성을 확인한 뒤에만 수렴 결과를 사용자에게 제시한다.
- 교차 모델 리뷰·설계 토론·독립 교차 점검이 필요하면 `peer-reviewer`(터미널 `claude -p` + `codex`) 에이전트를 사용한다. 판단 기준은 아래 "cross-family 핸드오프".

## 모델 정책 요약 (3-티어, 프로바이더 독립 — 천장은 Opus 5)

역할을 능력 티어에 매핑하고, 티어를 모델 식별자에 매핑한다. 단일 출처는 `scripts/lib/model-policy.js`이며, 자세한 배정·전환은 `docs/kr/model-routing.md`를 참조한다.

- `claude-opus-5` (deep-reasoning) — **천장 티어**. 오케스트레이션·아키텍처·보안·근본 원인 분석·리서치 종합·장기 자율 실행(kiro-cli, architect, security-reviewer, deep-researcher, devops, peer-reviewer).
- `claude-sonnet-5` (balanced, 기본 티어) — 코드/언어 리뷰·빌드 오류 해결·리팩터·e2e·문서 등 코딩 주력. 명시되지 않은 역할은 이 티어로 떨어진다.
- `claude-haiku-4.5` (cost-optimized) — 번역·문서·분류 등 비용 최적화 작업.

**Opus 5 위의 티어를 찾지 않는다.** 더 깊은 추론이 필요하면 두 방향으로만 간다.

### 1) 위가 아니라 안 — effort 를 올린다

같은 티어에서 추론 예산만 늘린다: `low` → `medium` → `high` → `xhigh` → `max`. 티어 점프보다 싸다.

```bash
kiro-cli chat --effort max                                  # 세션 단위
kiro-cli settings chat.modelDefaults \
  '{"claude-opus-5":{"output_config":{"effort":"max"}}}'    # 모델 기본값
```

기본값이 곧 최상단이다: **모든 추론·판단 역할은 `max` 로 시작한다**(DEFAULT_EFFORT). 사다리는 올리는 용도가 아니라 기계적 역할(refactor-cleaner·translator-docs → `low`)을 낮추는 용도다. 하네스는 그만큼 가이드레일을 보안 중심 최소(결정적 게이트 2개)로 유지해 모델의 추론 예산이 일하게 한다.

### 2) 위가 아니라 옆 — cross-family 핸드오프

`max` 에 도달하면 위에는 아무것도 없다. 다음 축은 **다른 모델 패밀리**다. 같은 패밀리를 다시 프롬프트해서는 상관된 blind spot을 끊을 수 없다 — 같은 학습, 같은 실패 모드다. Kiro 표면: `peer-reviewer` 에이전트, `--review-backend cross` 설치 시 `bash .kiro/hooks/cross-review.sh`.

| 다른 패밀리로 보낼 것 | 이유 |
|---|---|
| 우리가 쓴 코드의 적대적 리뷰 | 같은 패밀리는 blind spot이 상관돼 있다. 패밀리 교체만이 그 상관을 끊는다 |
| 두 번의 시도가 갈렸을 때 tie-break | 세 번째 같은-패밀리 의견은 앞의 둘과 상관된다 |
| 대규모 기계적 편집(rename·codemod) | 천장 티어의 컨텍스트를 아낀다. diff는 사후 검증 |
| 루프에 빠졌을 때의 두 번째 진단 | 막힌 모델을 다시 프롬프트하는 것보다 낫다 |

| 하네스에 남길 것 | 이유 |
|---|---|
| steering rules·skills·워크로드 태그·프로젝트 관례가 필요한 일 | 외부 CLI는 이 전부를 cold로 시작한다 |
| 도구 오케스트레이션(MCP·훅·서브에이전트 DAG) | |
| 한국어 산출물 | |

**철칙: 외부 패밀리를 유일한 독자로 두지 않는다.** 그쪽만 지적한 것은 코드로 확인해야 하고, 두 패밀리가 독립적으로 잡은 것이 고신뢰 항목이다.

OpenAI GPT-5.6 3종이 Kiro에서 선택 가능하다: deep-reasoning→`gpt-5.6-sol`, balanced→`gpt-5.6-terra`, cost-optimized→`gpt-5.6-luna`. 설치 시 `node install.js <cli|ide> --provider=openai`를 쓰면 저장소 소스를 바꾸지 않고 모델 ID, `reasoning.effort` 안내, 272K 컨텍스트 운영 노트가 함께 적용된다. OpenAI가 주 패밀리면 독립 cross-family 백엔드는 Claude Code이고 Codex는 same-family 보강이다.

**mixed 패턴**(`--provider=mixed`): 오케스트레이터(kiro-cli)만 `claude-fable-5`, 그 외 전 역할은 티어와 무관하게 `gpt-5.6-sol`. 운영 노트는 각 에이전트 **자기 모델의 패밀리**를 따르고, cross-review 는 Codex 를 먼저 부른다(Fable 산출물의 cross-family; Claude Code 는 Sol 산출물 담당). Fable 미서빙 환경이면 Kiro가 `chat.defaultModel` 로 폴백하므로 `claude-opus-5` + effort `max` 를 대체로 지정한다(설치 시 명령 출력).
