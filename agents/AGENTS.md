# AGENTS.md — 글로벌 에이전트 협업 규약 (concise)

이 문서는 모든 워크스페이스가 공유하는 에이전트 협업 규약을 요약한다. 위임(delegation)과 모델 정책만 다루며, 응답 언어·코딩 스타일·보안 규칙 등 기존 글로벌 steering이 정의하는 정책은 재정의하지 않는다.

## 위임(Delegation) 규약

- 오케스트레이터(`kiro-cli`)는 광범위한 탐색·리서치·대규모 코드 읽기를 격리 컨텍스트 서브에이전트에 위임하여 메인 컨텍스트를 가볍게 유지한다. 좁고 명확한 단건 조회는 직접 처리한다.
- 독립 작업은 DAG로 모델링하고, `depends_on` 의존이 없는 스테이지는 격리 서브에이전트에 병렬 위임한다(한 턴에 `invoke_sub_agent` 여러 개).
- 인프라(AWS·Terraform·K8s) 변경은 `devops` 에이전트로 위임한다 — 조회는 직접, 변경은 plan/diff → 승인 → apply 게이트를 거친다.
- 각 위임 산출물은 검증 후 수렴(verify-then-converge): 결과를 합치기 전에 정확성을 확인한 뒤에만 수렴 결과를 사용자에게 제시한다.
- 교차 모델 리뷰·설계 토론·독립 교차 점검이 필요하면 `peer-reviewer`(터미널 `claude -p` + `codex`) 에이전트를 사용한다. 판단 기준은 아래 "cross-family 핸드오프".
- Kiro CLI V3 는 서브에이전트의 도구 호출을 **부모 세션 권한으로도** 검사하고 더 엄격한 쪽을 따른다. 위임 흐름에서 묻지 않을 읽기 전용 허용(웹 리서치·devops 읽기 MCP·`codex review --uncommitted`/`--base`·고정 경로의 `cross-review.sh`)은 오케스트레이터 `permissions` 에 모아 둔다. 쓰기·뮤테이션·쓰기 가능 에이전트 시작, 그리고 임의 프롬프트·플래그를 받는 `claude`/`codex exec` 직접 호출은 사용자 확인을 거친다.

## 모델 정책 요약 (3-티어, 프로바이더 독립 — 천장은 Opus 5.5)

역할을 능력 티어에 매핑하고, 티어를 모델 식별자에 매핑한다. 단일 출처는 `scripts/lib/model-policy.js`이며, 자세한 배정·전환은 `docs/kr/model-routing.md`를 참조한다.

- `claude-opus-5.5` (deep-reasoning) — **천장 티어**. 오케스트레이션·아키텍처·보안·근본 원인 분석·리서치 종합·장기 자율 실행, 그리고 답의 형태가 열린 판정(kiro-cli, architect, security-reviewer, deep-researcher, devops, peer-reviewer, tech-fidelity-auditor, doc-clarity-reviewer).
- `claude-sonnet-5.5` (balanced, 기본 티어) — 코드/언어 리뷰·빌드 오류 해결·리팩터·e2e·문서 등 코딩 주력. 명시되지 않은 역할은 이 티어로 떨어진다.
- `claude-haiku-5.5` (cost-optimized) — 번역·글쓰기·분류 등 비용 최적화 작업. Kiro 에서는 Experimental 이며, 요청이 100K 토큰을 넘으면 요율이 0.06x → 0.3x 로 5배가 되므로 작업을 100K 아래로 쪼갠다.

**Opus 5.5 위의 티어를 찾지 않는다.** 더 깊은 추론이 필요하면 두 방향으로만 간다. Kiro CLI V3 는 목록에 없는 모델로 핀된 에이전트를 기본 모델로 폴백하지 않고 요청을 실패시키므로, 서빙되지 않는 모델(Enterprise 전용 Fable 5.1, Kiro 미서빙 GPT-6.x)은 핀하지 않는다.

### 1) 위가 아니라 안 — effort 를 올린다

같은 티어에서 추론 예산만 늘린다: `low` → `medium` → `high` → `xhigh` → `max`. 티어 점프보다 싸다.

```bash
kiro-cli chat --effort max                    # 세션 단위(V3 는 기본값으로 저장하지 않음)
kiro-cli settings chat.modelDefaults '{"claude-opus-5.5":{"output_config":{"effort":"max"}},"claude-sonnet-5.5":{"output_config":{"effort":"max"}},"claude-haiku-5.5":{"output_config":{"effort":"medium"}}}'
```

Kiro 는 effort 를 에이전트가 아니라 **모델 단위**로 적용하고, `chat.modelDefaults` 는 객체를 통째로 교체한다. 그래서 effort 의 단일 출처는 티어(`TIER_EFFORT`)이고 세 모델을 한 명령에 넣는다. Opus·Sonnet 은 `max` 로 시작해 추론 예산을 아끼지 않는다. Haiku 5.5 는 기본값인 `medium` 이다. `low` 는 어디에도 쓰지 않는다 — 5.5 공식 지침상 긴 에이전트 프롬프트에서 검색·검사를 건너뛰고 일찍 멈춘다. 하네스는 그만큼 가이드레일을 보안 중심 최소(결정적 게이트 2개)로 유지해 모델의 추론 예산이 일하게 한다.

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

**철칙: 외부 패밀리를 유일한 독자로 두지 않는다.** 그쪽만 지적한 것은 코드로 확인해야 하고, 두 패밀리가 독립적으로 잡은 것이 고신뢰 항목이다. Codex 축은 모델을 핀하지 않고 로컬 Codex CLI 기본 모델을 쓴다 — Kiro 가 서빙하지 않는 GPT-6.x 계열도 이 축으로는 쓸 수 있다.

OpenAI GPT-5.6 3종이 Kiro에서 선택 가능하다: deep-reasoning→`gpt-5.6-sol`, balanced→`gpt-5.6-terra`, cost-optimized→`gpt-5.6-luna`. 설치 시 `node install.js <cli|ide> --provider=openai`를 쓰면 저장소 소스를 바꾸지 않고 모델 ID, `reasoning.effort` 안내, 운영 노트(1M 컨텍스트, 272K 토큰 초과 요청은 2배 요율)가 함께 적용된다. OpenAI가 주 패밀리면 독립 cross-family 백엔드는 Claude Code이고 Codex는 same-family 보강이다.

**mixed 패턴**(`--provider=mixed`): 오케스트레이터(kiro-cli)만 `claude-opus-5.5`, 그 외 전 역할은 티어와 무관하게 `gpt-5.6-sol`. 운영 노트는 각 에이전트 **자기 모델의 패밀리**를 따르고, cross-review 는 Codex 를 먼저 부른다(오케스트레이터 산출물의 cross-family; Claude Code 는 Sol 산출물 담당).
