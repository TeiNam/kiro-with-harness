# Claude Code vs Kiro (CLI · IDE) 차이점 가이드

> Claude Code와 Kiro의 **CLI·IDE 두 형태**를 각각 공식 문서 기준으로 비교하고,
> Claude Code 기반 하네스를 Kiro에 적용할 때 무엇이 달라지는지 정리한 문서.
> 최초 작성 2026-03-22 · **전면 개정 2026-07-11** (Kiro CLI 추가, 공식 문서 재검증)
>
> **확인 시점**: 2026-07-11. 제품 버전 — Claude Code ~v2.1.x, Kiro IDE 1.0.116, Kiro CLI 2.12.x.
> 참조 출처는 문서 맨 끝 [참조 출처](#6-참조-출처) 절에 정리했다.

---

## 1. 세 제품의 관계와 설정 위치

| | Claude Code | Kiro CLI | Kiro IDE |
|---|---|---|---|
| **형태** | 터미널 코딩 에이전트 (+ IDE 확장) | 터미널 에이전트 | VS Code 기반 에이전틱 IDE |
| **설정 루트** | `.claude/`, `~/.claude/`, `CLAUDE.md` | `.kiro/`, `~/.kiro/` | `.kiro/`, `~/.kiro/` |
| **실행** | `claude`, `claude -p` (headless) | `kiro-cli`, `kiro-cli chat` (레거시 `q`도 동작) | Kiro 앱 |
| **계보** | Anthropic 자체 | **Amazon Q Developer CLI의 후속** | AWS 자체 (VS Code 포크) |

**핵심 1 — Kiro CLI는 Amazon Q Developer CLI의 후속이다.** 공식 문서가 "Kiro CLI is the next update of the Q CLI"라고 명시한다(2025-11-17 출시, 2025-11-24 자동 마이그레이션). 기존 Q CLI 워크플로우·구독·인증은 그대로 동작하고, 진입점이 `q` → `kiro-cli`로 바뀌었으며(`q`/`q chat`도 계속 동작), 라이선스가 Apache 2.0 → AWS IP License로, "Amazon Q rules"가 "Kiro steering"으로 바뀌었다. 즉 하네스의 `agents/cli/*.json`(agent-v1 스키마)이 곧 Kiro CLI의 에이전트 포맷이다.

**핵심 2 — Kiro CLI와 IDE는 `.kiro/` 규약을 공유한다.** 워크스페이스 `.kiro/`와 홈 `~/.kiro/`를 두 형태가 함께 쓴다(steering, agents, hooks, `settings/mcp.json`). CLI 전용 추가 경로만 다르다: `~/.kiro/settings/cli.json`(CLI 설정), `~/.kiro/prompts`. `KIRO_HOME` 환경변수로 `~/.kiro`를 재지정할 수 있다. 레거시 Amazon Q 경로(`~/.aws/amazonq/*`)도 CLI가 하위호환으로 계속 읽지만, 새 설정은 `.kiro`에 쓰고 둘 다 있으면 `.kiro`가 우선한다.

**Q CLI → Kiro CLI 설정 마이그레이션 매핑** (공식 migrating-from-q):

| 설정 | Kiro | 레거시 Amazon Q |
|---|---|---|
| MCP (user) | `~/.kiro/settings/mcp.json` | `~/.aws/amazonq/mcp.json` |
| MCP (workspace) | `.kiro/settings/mcp.json` | `.amazonq/mcp.json` |
| Agents (user) | `~/.kiro/agents` | `~/.aws/amazonq/cli-agents` |
| Agents (workspace) | `.kiro/agents` | `.amazonq/cli-agents` |
| Steering/rules (user) | `~/.kiro/steering` | `~/.aws/amazonq/rules` |
| Prompts (user) | `~/.kiro/prompts` | `~/.aws/amazonq/prompts` |

> 도구명도 단순화됐다(구명칭도 계속 동작): `fs_read→read`, `fs_write→write`, `use_aws→aws`, `execute_bash→shell`, `report_issue→report`. 기본 CLI 에이전트명은 `kiro_default`.

---

## 2. 핵심 차이점 한눈에 보기

| 영역 | Claude Code | Kiro CLI | Kiro IDE |
|------|-------------|----------|----------|
| **규칙/메모리** | `CLAUDE.md` 계층 + `.claude/rules/` + `@import` | `.kiro/steering/*.md` (공유) | `.kiro/steering/*.md` (always/fileMatch/manual/auto) |
| **글로벌 규칙** | `~/.claude/CLAUDE.md`, `~/.claude/rules/` | `~/.kiro/steering/` | `~/.kiro/steering/` |
| **AGENTS.md** | `@AGENTS.md` import으로 지원 | 지원 | 지원 (인클루전 모드 없이 항상 포함) |
| **훅** | `settings.json`의 `hooks` (다수 이벤트) | 에이전트 JSON 임베드 훅 + v3 standalone `.kiro/hooks/*.json` | `.kiro/hooks/*.json` v1 (PascalCase 트리거) |
| **훅 핸들러** | `command`·`http`·`mcp_tool`·`prompt`·`agent` | `command`·`agent` | `command`·`agent` |
| **슬래시 커맨드** | 내장 + 커스텀(`.claude/commands/*.md`, Skills로 통합) | 있음: `/model`,`/plan`,`/agent`,`/compact` 등 다수 | manual 스티어링·서브에이전트를 `/name`으로 노출 |
| **커스텀 에이전트** | `.claude/agents/*.md` | `.kiro/agents/*.json` (또는 v3 md) | `.kiro/agents/*.md` |
| **내장 서브에이전트** | Explore, Plan, general-purpose | 내장 에이전트 `kiro_default`/`kiro_help`/`kiro_planner` | context gathering, general purpose (2개) |
| **스킬** | Agent Skills (`.claude/skills/*/SKILL.md`) | `.kiro/skills/` (슬래시로 노출) | 스티어링으로 대체(자동/조건/수동) |
| **스펙** | 없음 | 없음 | `.kiro/specs/` (요구사항→설계→태스크) — Kiro IDE 고유 |
| **MCP 설정** | `.mcp.json` (scope local/project/user) | `.kiro/settings/mcp.json` + 에이전트 임베드 | `.kiro/settings/mcp.json` |
| **원격(HTTP) MCP** | stdio/SSE/HTTP + OAuth | HTTP + OAuth(clientSecret 지원) | HTTP + OAuth(PKCE public만) |
| **세션/컨텍스트** | `/compact`·auto-compact·`/clear`·체크포인트(`/rewind`) | 자동 compaction + `/compact`·`/rewind`, 세션 자동 저장 | Kiro 내부 관리 |
| **모델 라우팅** | `/model`(영속), `CLAUDE_CODE_SUBAGENT_MODEL` | `/model`(→`cli.json` 저장), `/effort` | 모델 드롭다운, reasoning effort, 에이전트별 `model` |
| **플러그인** | 플러그인·마켓플레이스 | (없음) | Powers (기능 번들) |

---

## 3. 영역별 상세 차이

### 3.1 규칙 / 메모리 ↔ 스티어링

**Claude Code**는 `CLAUDE.md` 계층으로 규칙을 로드한다. managed(정책) > user(`~/.claude/CLAUDE.md`) > project(`./CLAUDE.md` 또는 `./.claude/CLAUDE.md`) > local(`./CLAUDE.local.md`) 순으로 발견되는 파일을 **모두 이어붙인다**(덮어쓰기 아님). `@경로` import로 다른 파일을 끌어오며(재귀 depth 4), `.claude/rules/`는 `paths:` 프론트매터로 경로 스코핑을 지원한다. `/memory`로 로드된 파일을 확인·편집하고 `/init`로 초기 `CLAUDE.md`를 생성한다. 자동 메모리(`MEMORY.md`)도 기본 활성이다.

**Kiro**(CLI·IDE 공통)는 **스티어링(Steering)**을 쓴다. `.kiro/steering/*.md`(워크스페이스), `~/.kiro/steering/`(글로벌, 워크스페이스가 우선). 인클루전 모드는 **네 가지**다:

| 모드 | 동작 | 사용 예 |
|------|------|---------|
| `always` (기본) | 모든 대화에 포함 | 코딩 스타일, 보안 규칙 |
| `fileMatch` | `fileMatchPattern` 매칭 파일 열릴 때 | TypeScript(`**/*.ts`), Python(`**/*.py`) |
| `manual` | `#이름`으로 명시 호출 (IDE에선 `/이름` 슬래시로도 노출) | 리뷰 체크리스트, 계획 템플릿 |
| `auto` | `name`+`description`으로 설명 매칭(스킬 유사) | 상황 감지형 지식 |

기초 파일 `product.md`·`tech.md`·`structure.md`는 항상 포함된다. **AGENTS.md**(agents.md 표준)도 `~/.kiro/steering/` 또는 워크스페이스 루트에서 지원되며 항상 포함(인클루전 모드 미적용)된다. `#[[file:경로]]`로 파일을 참조한다.

```markdown
---
inclusion: fileMatch
fileMatchPattern: "**/*.ts,**/*.tsx"
---
# TypeScript 코딩 규칙
```

---

### 3.2 훅 시스템

세 제품 모두 이벤트 기반 자동화를 지원하지만 등록 위치·이벤트·핸들러가 다르다.

**Claude Code** — `settings.json`의 `hooks` 키(user/project/local/managed) + 플러그인 `hooks/hooks.json` + 스킬/에이전트 프론트매터에 등록. 이벤트가 대폭 늘었다: `PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `Stop`, `SubagentStop`, `SessionStart`, `SessionEnd`, `PreCompact`, `Notification`에 더해 `SubagentStart`, `PostToolUseFailure`, `PermissionRequest`, `TaskCreated`, `TaskCompleted`, `PostCompact` 등. 핸들러 타입도 `command`·`http`·`mcp_tool`·`prompt`·`agent`로 다양하다(과거의 "command + exit 2"만이 아니다). command 훅은 stdin으로 이벤트 JSON을 받고 exit 2로 차단한다.

**Kiro CLI** — 두 방식이 공존한다.
- **에이전트 JSON 임베드 훅**: 에이전트 파일의 `hooks` 필드. 트리거 `agentSpawn`/`userPromptSubmit`/`preToolUse`(차단 가능)/`postToolUse`/`stop`, `matcher`는 **내부 도구명**(`fs_read`,`fs_write`,`execute_bash`,`use_aws`) 매칭.
- **v3 standalone 훅**: `.kiro/hooks/<name>.json`(`"version":"v1"`), 워크스페이스의 **모든 에이전트**에 적용. `kiro-cli agent migrate`로 임베드→standalone 변환.

**Kiro IDE** — `.kiro/hooks/*.json`(`"version":"v1"`). 트리거(PascalCase): `SessionStart`, `Stop`, `PreToolUse`(차단), `PostToolUse`, `PreTaskExec`(차단), `PostTaskExec`, `UserPromptSubmit`(차단), `PostFileCreate`/`PostFileSave`/`PostFileDelete`. 액션은 `{type:"command", command}` 또는 `{type:"agent", prompt}`. exit 0=성공(SessionStart/UserPromptSubmit은 STDOUT→컨텍스트), 2=차단(STDERR→에이전트).

**Kiro 훅 JSON 예시** (IDE·CLI v1 공통 포맷)

```json
{
  "version": "v1",
  "hooks": [
    {
      "name": "쓰기 작업 전 보안 검토",
      "trigger": "PreToolUse",
      "matcher": "write",
      "action": {
        "type": "agent",
        "prompt": "이 쓰기 작업의 보안 준수 확인: 하드코딩 시크릿 없음, 입력 검증됨, SQL 인젝션 방지됨"
      },
      "enabled": true
    }
  ]
}
```

> **참고**: 터미널 블로킹을 피하려면 린트/타입체크는 `command` 대신 `agent` 액션 + 진단 도구로 처리한다.

---

### 3.3 에이전트 / 서브에이전트

**Claude Code** — `.claude/agents/*.md`(project) 및 `~/.claude/agents/`(user). 프론트매터 `name`·`description`(필수), `tools`/`disallowedTools`, `model`(`sonnet|opus|haiku|inherit`, 기본 `inherit`)에 더해 `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `isolation: worktree` 등. 각 서브에이전트는 격리된 컨텍스트에서 돌고 요약만 반환한다. 내장: **Explore, Plan, general-purpose**. `@agent-<name>` 또는 `--agent`로 호출.

**Kiro CLI** — 에이전트는 `.kiro/agents/*.json`(로컬)·`~/.kiro/agents/*.json`(글로벌). JSON 스키마 필드: `name`, `description`, `prompt`(인라인 또는 `file://`), `mcpServers`, `tools`, `allowedTools`, `toolsSettings`, `resources`(`file://`·`skill://`·knowledgeBase), `hooks`, `includeMcpJson`, `model`. 세 가지 tools 관련 필드 구분이 중요하다:
- `tools` — 에이전트가 **볼 수 있는** 도구(`read`, `@server`, `@server/tool`, `@builtin`, `*`)
- `allowedTools` — **승인 없이** 실행되는 도구(glob 패턴; bare `"*"` 불가)
- `toolsSettings` — 도구별 세부 설정(`write.allowedPaths`, `shell.allowedCommands`/`deniedCommands`/`autoAllowReadonly` 등)

내장 에이전트 `kiro_default`/`kiro_help`/`kiro_planner`(편집 불가). Markdown 기반 v3 자체완결 포맷도 있다. `kiro-cli agent set-default <name>`, `kiro-cli chat --agent <name>`.

**Kiro IDE** — 커스텀 에이전트는 `.kiro/agents/*.md`. 프론트매터 `name`(필수)·`description`·`tools`(태그 `read`/`write`/`shell`/`web`/`subagent`/`context`/`@mcp`/`@builtin`/`*`)·`model`(기본: 채팅 모델 상속)·`includeMcpJson`(기본 false)·`includePowers`(기본 false)·`mcpServers`·`permissions.rules`(allow|deny|ask, 기본 ask). 내장 서브에이전트는 **정확히 두 개** — **context gathering**(프로젝트 탐색), **general purpose**(작업 병렬화). 각자 격리 컨텍스트에서 병렬 실행. **제약**: 서브에이전트는 **Specs에 접근 불가**, **Hooks는 서브에이전트 내에서 발화하지 않음**. 호출은 설명 자동매칭·`/name`·"use the X subagent".

---

### 3.4 슬래시 커맨드

이전 판 문서의 "Kiro에는 슬래시 커맨드가 없다"는 서술은 **오류였다**. 실제로는:

- **Claude Code** — 내장 커맨드(`/help`,`/init`,`/memory`,`/compact`,`/clear`,`/model`,`/config`,`/permissions`,`/mcp`,`/plugin`,`/agents`,`/hooks`,`/context`,`/rewind`,`/resume`,`/plan`,`/review`,`/security-review` 등) + 커스텀(`.claude/commands/*.md`). 커스텀 커맨드는 이제 **Agent Skills로 통합**됐다(`.claude/commands/deploy.md`와 `.claude/skills/deploy/SKILL.md` 모두 `/deploy` 생성; 둘 다 있으면 스킬 우선). 내장 커맨드 일부(`/init`,`/review`,`/security-review`)는 모델에 **Skill 도구**로 노출된다.
- **Kiro CLI** — 풍부한 슬래시 커맨드: `/model`, `/effort low|medium|high|xhigh|max`, `/context`, `/compact`, `/spawn`, `/plan`, `/agent`, `/mcp`, `/tools`, `/checkpoint`, `/goal`, `/rewind`, `/tangent`, `/knowledge`, `/usage` 등. `.kiro/skills/`의 스킬이 슬래시로 자동 노출된다.
- **Kiro IDE** — 별도 커맨드 시스템 대신, `manual` 스티어링과 서브에이전트가 **`/name`** 형태로 노출된다.

---

### 3.5 스킬

- **Claude Code** — Agent Skills. 스킬 디렉터리마다 `SKILL.md`(프론트매터 `description` + 본문), 부가 파일은 필요 시 로드. 위치 `~/.claude/skills/`(개인)·`.claude/skills/`(프로젝트)·enterprise·플러그인, 우선순위 enterprise > personal > project. 모델이 매 턴 스킬 목록을 보고 자동 호출(model-invoked)하거나 `/스킬명`으로 호출. 개방형 Agent Skills 표준(agentskills.io) 준수.
- **Kiro CLI** — `.kiro/skills/`의 스킬이 슬래시 커맨드로 노출되고, 에이전트 `resources`의 `skill://`로 참조된다.
- **Kiro IDE** — 별도 스킬 시스템 대신 스티어링으로 대체한다(`always`/`fileMatch`/`manual`/`auto`).

| 스킬 유형 | Kiro 변환 |
|----------|-----------|
| 워크플로우 품질(tdd, verification 등) | 스티어링 `always` 또는 `manual` |
| 프레임워크(django, springboot 등) | 스티어링 `fileMatch`(자동 감지) |
| 도메인(api-design, security 등) | 스티어링 `manual`/`auto` |

---

### 3.6 스펙 (Kiro IDE 고유)

Kiro IDE에만 있는 기능이다(CLI·Claude Code에는 없음). `.kiro/specs/`에 스펙마다 `requirements.md`(또는 `bugfix.md`)·`design.md`·`tasks.md` 세 파일을 두고 **요구사항 → 설계 → 태스크** 3단계로 점진 개발한다. Feature Spec은 요구사항 우선/설계 우선을 고를 수 있고, Quick Plan은 승인 게이트 없이 세 파일을 한 번에 생성한다. "Run all Tasks"는 의존성 그래프를 만들어 독립 태스크를 **웨이브(wave)** 단위로 동시 실행한다.

| Claude Code 워크플로우 | Kiro 스펙 활용 |
|---------------------|--------------|
| 계획 포맷 | 스펙 요구사항(Requirements) 섹션 |
| TDD 단계 | 스펙 태스크를 RED→GREEN→REFACTOR로 구성 |
| 검증 루프 | 태스크 완료 조건에 검증 단계 포함 |

---

### 3.7 MCP

- **Claude Code** — `.mcp.json`(프로젝트 루트, VCS 커밋). 트랜스포트 stdio/SSE(deprecated)/HTTP(권장), 스코프 local(기본)/project/user, `${VAR}`·`${VAR:-default}` 확장, OAuth(HTTP/SSE, 토큰 자동 갱신). `/mcp`로 연결·인증 관리.
- **Kiro CLI** — 로딩 우선순위 **에이전트 `mcpServers` > `.kiro/settings/mcp.json`(워크스페이스) > `~/.kiro/settings/mcp.json`(글로벌)**. 원격 HTTP MCP 지원(`url`, `type:"http"`), OAuth가 IDE보다 풍부해 **`clientSecret`(기밀 클라이언트)** 도 지원. 저장 시 변경 서버만 핫리로드. `kiro-cli mcp add|remove|list|import|status`, `/mcp auth`.
- **Kiro IDE** — `.kiro/settings/mcp.json`(워크스페이스) + `~/.kiro/settings/mcp.json`(글로벌), 워크스페이스 우선 병합. 로컬 키 `command`/`args`/`env`/`disabled`/`autoApprove`/`disabledTools`, 원격 키 `url`/`headers`/`oauth`. 원격 HTTP MCP 지원, 단 **PKCE public 클라이언트만**(client_secret 미지원).

> 이 저장소는 로컬 **mcp-proxy**로 프록시 가능한 MCP를 중앙화할 수 있다. 설치기 `--mcp-proxy` 옵션과 상세는 [mcp-reference.md](./mcp-reference.md) 및 `mcp-proxy/README.md` 참고.

---

### 3.8 모델 · 컨텍스트 · 세션

**Claude Code** — 세션/컨텍스트/모델을 개발자가 직접 제어한다. 컨텍스트: `/compact`(+`autoCompactEnabled` 자동), `/clear`, 체크포인트(`fileCheckpointingEnabled`, `/rewind`로 파일·대화 스냅샷 복원). 모델: `/model`(선택 시 기본값으로 영속 저장, 별칭 `sonnet|opus|haiku|opusplan|sonnet[1m]` 등), `settings.json`의 `model`, 서브에이전트 모델은 `CLAUDE_CODE_SUBAGENT_MODEL` env > 호출별 > 프론트매터 > 메인 순. headless `claude -p --output-format text|json|stream-json`.

**Kiro CLI** — 컨텍스트 윈도 초과 시 **자동 compaction**(+ 수동 `/compact`), 세션은 매 턴 자동 저장(`--resume`). `/model`(선택이 `~/.kiro/settings/cli.json`에 자동 저장), `/effort low|medium|high|xhigh|max`, `/context show|add|remove|clear`. `kiro set-default cli|ide`로 기본 진입점 전환.

**Kiro IDE** — 세션 영속화·컨텍스트 압축을 **내부 관리**(별도 스크립트 불필요). 모델은 채팅 드롭다운 + 모델별 reasoning effort, 에이전트별 `model` 프론트매터로 재정의.

**모델 로스터**(Kiro, 2026-07-11 기준 발췌 — Cost는 Auto=1.0x 대비 배수):

| 모델 | 컨텍스트 | 배수 | 비고 |
|------|---------|------|------|
| Claude Opus 4.8 | 1M | 2.2x | 최대 출력 128K, Active |
| Claude Sonnet 5 | 1M | 1.3x | 최신(Experimental) |
| Claude Sonnet 4.5 | 200K | 1.3x | 무료 티어 |
| Auto | — | 1.0x | 모델 라우터(권장) |
| Claude Haiku 4.5 | 200K | 0.4x | 빠름, 서브에이전트에 적합 |

> 전체 로스터는 훨씬 크다(DeepSeek·MiniMax·GLM·Qwen 등). 최신 목록·가용 리전은 kiro.dev/docs/models 참조.

---

### 3.9 각 제품 고유 기능

| 기능 | 설명 |
|------|------|
| **Claude Code — 플러그인·마켓플레이스** | `.claude-plugin/plugin.json` + `skills/`·`commands/`·`agents/`·`hooks/`·`.mcp.json` 번들. `/plugin`으로 설치, `extraKnownMarketplaces`로 마켓플레이스 등록(공식 `claude-plugins-official`, `claude-community`). |
| **Claude Code — 출력 스타일** | `outputStyle` 설정 / `~/.claude/output-styles`. 시스템 프롬프트의 역할·톤·형식 변경(Default/Proactive/Explanatory/Learning). |
| **Claude Code — Plan 모드** | `--permission-mode plan`, `Shift+Tab`, `/plan`. 읽기 전용 조사 후 계획 제안. |
| **Kiro IDE — Autopilot/Supervised** | Autopilot(기본): 자율 다중 편집(전체 변경 보기/되돌리기/중단). Supervised: 편집마다 청크·파일 단위 수락/거절. |
| **Kiro IDE — Powers** | 온디맨드 기능 번들(`POWER.md` 스티어링 + MCP + 선택적 훅). 키워드로 활성화해 컨텍스트 과부하 방지. Datadog·Figma·Neon·Stripe 등 파트너. |
| **Kiro IDE — Agent Focus (실험적)** | 채팅 우선 레이아웃(v1.0+, 우상단 토글): 에이전트 대화가 중심, 병렬 세션 목록, 스펙/diff용 보조 패널. **컨텍스트 축소 모드가 아니라 UI 뷰** — 스티어링/에이전트/훅/MCP가 그대로 적용되고 `.kiro/` 신규 설정도 없다. 설정·Powers/스킬·MCP 관리·터미널·직접 파일 편집은 IDE 뷰로 전환. |
| **Kiro CLI — 병렬/세션 도구** | `/spawn`(병렬 세션), `/tangent`, `/goal`, `/knowledge`, 세션 자동 저장·재개. |

---

## 4. 하네스(kiro-with-harness) 매핑

이 저장소의 설치기는 **tier(cli|ide) × workload**로 자산을 설치한다.

| 자산 | CLI 티어 | IDE 티어 |
|------|----------|----------|
| 에이전트 | `~/.kiro/agents/*.json` (agent-v1 JSON, verbatim) | `.kiro/agents/*.md` (Markdown) |
| 스티어링 | `~/.kiro/steering/AGENTS.md`, `ponytail.md` (always) | `.kiro/steering/*.md` (always/fileMatch/manual) |
| 훅 | `~/.kiro/hooks/*.sh` + 에이전트 임베드 | `.kiro/hooks/*.json` (v1) |
| MCP | 에이전트가 자체 `mcpServers` 보유 (글로벌 mcp.json 미생성) | `.kiro/settings/mcp.json` (general + docker, `--mcp-proxy` 시 프록시 URL) |
| 스킬 | `~/.kiro/skills/` (progressive) | 스티어링 `manual`로 변환 |

> **주의**: Kiro CLI도 `~/.kiro/settings/mcp.json`을 읽지만(공유 규약), 하네스 CLI 티어는 **의도적으로** 글로벌 mcp.json을 만들지 않는다 — 에이전트가 자체 `mcpServers`를 들고 다녀 IDE 설정을 덮어쓰지 않게 하기 위함. 자세한 MCP·프록시 동작은 [mcp-reference.md](./mcp-reference.md).

**변환이 어려운 Claude Code 전용 자산**

| 구성 요소 | 이유 |
|----------|------|
| `.claude/commands/*.md` (커스텀 커맨드) | Kiro CLI는 슬래시가 있으나 포맷이 다름 — 스티어링/스킬로 지식 이전 |
| Claude Code 훅의 `http`·`mcp_tool` 핸들러 | Kiro 훅은 `command`·`agent`만 지원 |
| `isolation: worktree` 서브에이전트 | Kiro에 동등 개념 없음 |
| 플러그인·마켓플레이스 | Kiro는 Powers(IDE)로 부분 대체 |
| `CLAUDE.md` | `AGENTS.md`(Kiro 지원) 또는 스티어링으로 이전 |

---

## 5. Kiro 프로젝트 구조 (변환 후, IDE 티어 예시)

```
.kiro/
├── steering/
│   ├── coding-style.md          (always)    ← rules/common/coding-style.md
│   ├── security.md              (always)    ← rules/common/security.md
│   ├── testing.md               (always)    ← rules/common/testing.md
│   ├── ponytail.md              (always)    ← rules/common/ponytail.md
│   ├── typescript-rules.md      (fileMatch: **/*.ts,**/*.tsx)
│   ├── python-rules.md          (fileMatch: **/*.py)
│   └── <skill>.md               (manual)    ← skills/<skill>/SKILL.md
├── hooks/                              ← v1 JSON, 티어 설치기가 생성
│   ├── pre-write-guard.json            (PreToolUse/write → agent)
│   └── git-pipeline-guard.json         (PreToolUse/shell → agent)
├── agents/                       ← IDE: *.md / CLI: *.json
├── specs/                        ← Kiro IDE 고유
└── settings/
    └── mcp.json                 ← mcp-configs/mcp-servers.json 에서 선택 (--mcp-proxy 시 프록시 URL)
```

---

## 6. 참조 출처

모두 공식 문서, **확인일 2026-07-11**.

**Claude Code** (docs.claude.com/en/docs/claude-code):
memory · settings · commands · skills · sub-agents · hooks · plugins · mcp · output-styles · permission-modes · checkpointing · model-config · headless

**Kiro** (kiro.dev/docs):
- 제품/설치: /docs/ · /docs/getting-started/installation/ · /docs/cli/
- Kiro CLI ↔ Q CLI: /docs/cli/migrating-from-q/ (2026-07-01)
- IDE: /docs/specs/ · /docs/steering/ · /docs/hooks/ · /docs/custom-agents/ · /docs/chat/subagents/ · /docs/mcp/configuration/ · /docs/models/ · /docs/chat/autopilot/ · /docs/powers/
- CLI: /docs/cli/custom-agents/configuration-reference/ · /docs/cli/v3/agent-config/ · /docs/cli/v3/hooks/ · /docs/cli/mcp/configuration/ · /docs/cli/reference/slash-commands/ · /docs/cli/reference/cli-commands/ · /docs/cli/chat/context/
