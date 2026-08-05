# Kiro Crew와 하네스

`kiro-cli crew`는 CLI 2.x 서브명령으로 등장했다(`kiro-cli --help-all`로 표시됨; CLI 2.16.1에서 검증). **채팅 기능이 아니라 런처(launcher)**다:

```
crew    Kiro Crew 시작, 설치되지 않은 경우 설치
        옵션: -y/--yes (설치 프롬프트 없이); ARGS는 Kiro Crew CLI로 전달
```

Kiro Crew는 별도 상품 — Apache-2.0, 자가호스팅, 영구 에이전트 런타임. **Gateway**(기본 포트 `5476`)를 실행하며, 데스크톱 앱, 웹 대시보드, `kirocrew` CLI, 또는 채팅 채널(Slack, Discord, Telegram, Teams, Webex, WeCom, WeChat)에서 접근한다. 다단계 작업은 무인으로 실행되고, cron 작업은 일정에 따라 실행되며, 하트비트는 시스템을 모니터링한다([Quick start](https://kiro.dev/docs/crew/)).

## 하네스에 중요한 이유

**Crew는 에이전트 정의를 `~/.kiro/agents/`에서 읽는다 — 하네스가 설치하는 그 디렉토리.**

> 파일 기반 설정의 경우 JSON 파일을 생성하고 ... `~/.kiro/agents/` 아래에 두거나 대시보드에서 참조하세요.
> — [Agents](https://kiro.dev/docs/crew/capabilities/agents/)

따라서 `node install.js cli --scope global`을 실행하면 이미 Crew의 에이전트 소스를 채운다. 하네스 함대(kiro-cli, architect, deep-researcher, devops, peer-reviewer, code-reviewer, security-reviewer, refactor-cleaner, translator-docs)는 별도 통합 단계 없이 Crew 에이전트로 선택 가능해진다. ponytail 주입도 함께 이동한다. steering 대신 `prompt` 필드에 살기 때문이다.

Crew의 기본 `kirocrew` 에이전트는 모델 `auto`를 사용하는데, 이는 "kiro-cli에 설정된 모델"을 의미하고, `config.json`은 `agent.provider: "acp"`로 설정한다 — Crew는 Agent Client Protocol을 통해 백엔드 에이전트와 통신하며, `kiro-cli acp`가 존재한다(`--agent`, `--model`, `--effort`, `--agent-engine v1|v2|v3`). 따라서 하네스는 Crew의 옆이 아니라 **밑**에 위치한다.

## 설치 및 실행

```bash
# Kiro CLI 런처를 통해 (없으면 Crew 설치)
kiro-cli crew            # -y를 추가하면 설치 프롬프트 스킵

# 또는 문서에 나온 원라이너 (pipx 또는 ~/.kiro/crew/venv의 관리형 venv)
curl -fsSL https://download.crew.kiro.dev/cli.sh | sh

kirocrew setup           # 대화형: 데이터 디렉토리, 에이전트, 자격증명
kirocrew doctor          # 배선 검증
kirocrew gateway         # 서버 시작 -> http://localhost:5476
```

설정은 `~/.kiro/crew/config.json`에, 채널 토큰은 `~/.kiro/crew/.env`에 mode 600으로 존재한다. `KIROCREW_HOME`(기본 `~/.kiro/crew`)과 `KIROCREW_PORT`(기본 `5476`)라는 두 환경변수는 설정 파일에 존재할 수 없다. 헤드리스 등가: `kirocrew config get|set|edit` ([Configuration](https://kiro.dev/docs/crew/configuration/)).

## 자산 매핑

| 하네스 자산 | Crew 상태 |
|---|---|
| `~/.kiro/agents/*.json` (CLI 글로벌 티어) | **공유 디렉토리** — 파일 기반 에이전트 위치로 문서화됨 |
| 에이전트 `model` 핀(`claude-opus-5` 등) | Crew의 기본값은 `auto`; 핀된 식별자를 인정하는지는 **문서에 명시되지 않음** |
| 하네스 JSON의 `resources`, `toolsSettings`, `hooks`, `mcpServers` | Crew 문서 예제는 `name`/`description`/`model`/`prompt`/`tools`만 사용; 여분 필드의 처리는 **문서에 명시되지 않음** |
| `~/.kiro/steering/` (AGENTS.md, ponytail) | Crew는 자체 Steering 표면 ("모든 세션이 상속하는 워크스페이스 레벨 규칙")을 가짐; CLI 글로벌 steering 경로를 읽는지는 **문서에 명시되지 않음** |
| `~/.kiro/skills/` (138개 패키지) | Crew는 자체 Skills 표면을 가짐; 하네스 기술은 `workloads:` 메타데이터를 사용하는데, 이는 하네스 관례 — 호환성 **미검증** |
| `.kiro/settings/mcp.json` | Crew는 Integrations 아래에서 MCP를 관리하고 `kirocrew-core` + `kirocrew-cron`을 제공; 병합 동작 **문서에 명시되지 않음** |
| `.kiro/hooks/*.json` (IDE v1 훅) | Crew는 자체 Hooks 표면을 가짐; 동일 디렉토리의 스키마 겹침 **미검증** |

"문서에 명시되지 않음"으로 표기한 모든 것은 설치된 Gateway에 대한 실시간 점검이 필요하다. 상속을 가정하지 마라.

## Crew와 하네스 사이의 작업 분할

Crew의 서브에이전트는 구체적 제약이 있으니 설계할 때 염두에 둬라 ([Subagents](https://kiro.dev/docs/crew/features/subagents/)):

- 동시성은 기계에 맞춰 자동 조정되며, 보통 3–32; 초과 요청은 큐(queue)에 들어간다.
- 각 서브에이전트는 **30분 하드 타임아웃**을 가지며, ~2분 무활동 후 정지 경고를 받는다(자동 중단 아님).
- 서브에이전트는 메인 세션의 승인 모드를 상속한다. Autopilot 아래서 도구 호출은 자동 승인된다 — 거부된 명령과 민감 경로 차단은 여전히 적용된다.
- 결과는 배포 후 약 1시간 동안 유지된다.

| Crew로 보낼 것 | 이유 |
|---|---|
| 반복 작업(cron), 하트비트 모니터링, 웹훅 | 하네스에는 스케줄러가 없음; Crew는 재시작을 넘어 영구함 |
| 오래 무인 다단계 작업 | Task Runner가 체크포인트와 재시도; 터미널에 앉을 필요 없음 |
| Slack/Telegram/휴대폰에서 도달하고 싶은 작업 | 채널은 Crew만 노출 |
| 넓은 병렬 팬아웃 | 런타임 강제 동시성, 오케스트레이터 규약 아님 |

| 하네스에 유지할 것 | 이유 |
|---|---|
| 워크로드 스코프 설치(`--dev=rust`, `--category=cloud`) | Crew에는 워크로드 선택 모델이 없음 |
| 역할 기반 모델 티어(Opus/Sonnet/Haiku 에이전트별) | Crew의 기본값은 단일 `auto` 모델 |
| **크로스 패밀리 리뷰** (`peer-reviewer`, `cross-review.sh`) | Crew의 자가 리뷰는 같은 모델 가족을 실행하므로 상관된 맹점이 남아있다. 이 축은 대체되지 않음 |
| IDE 티어 자산(Markdown 에이전트, v1 훅, fileMatch steering) | Crew는 CLI/Gateway 런타임 |
| MCP 프록시 | 별도 관심사; Crew는 자체 MCP 서버를 생성 |

신경 쓸 겹침은 **lessons**이다: 하네스는 `capture-lessons` 훅과 `lessons-learned` 기술을 가지고, Crew는 교정을 자체 영구 lessons로 전환한다. 동일 저장소에서 둘 다 실행하면 조정 없이 동일 지식의 두 저장소가 된다. 워크스페이스마다 소유자를 하나 고르라.

## 보안

Gateway는 **로컬 네트워크 서비스**. 노출하기 전에:

- 로컬에 바인드하고 **SSH 터널**을 통해 원격 인스턴스에 도달한다 — 데스크톱 앱이 정확히 이를 지원한다([Quick start](https://kiro.dev/docs/crew/)). 공용 인터페이스에 포트를 두지 마라.
- `~/.kiro/crew/.env`는 채널 봇 토큰을 가지고 mode 600으로 강제된다. git에서, 공유하는 스냅샷에서 꺼내라.
- Autopilot은 세션의 도구 호출을 자동 승인하며, 서브에이전트는 그 모드를 상속한다. 거부된 명령과 민감 경로 차단은 여전히 적용되지만, Autopilot + 채팅 채널은 그 채널에 게시할 수 있는 누구나 도구 실행을 구동할 수 있음을 뜻한다 — 채널을 자신에게만 한정하라.
- Sandbox 모드, 거부된 명령, 거버넌스는 Settings → Security 아래; 첫 무인 실행 전에 검토하라.

전체 모델은 [Security](https://kiro.dev/docs/crew/security/)를 보라.

## 이 저장소의 상태

하네스는 Crew를 설치하거나 설정하지 **않는다**. 관계는 일방향이며 이미 작동 중: CLI 글로벌 티어를 설치하면 Crew가 그 에이전트를 사용할 수 있다. 그 너머의 모든 것 — steering 상속, 기술 로드, MCP 병합, 훅 공존 — 은 이 환경에 Crew가 설치되지 않아서 미검증이다. 자동화를 배선하기 전에 실제 세션에서 `kirocrew config get`으로 검증하라.
