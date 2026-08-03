# Plugins — Claude Code 플러그인을 Kiro 자산으로

**Kiro CLI 에는 플러그인 시스템이 없다.** `kiro-cli plugin` 서브커맨드가 존재하지 않고(실측: `error: unrecognized subcommand 'plugin'`), 마켓플레이스·`enabledPlugins` 같은 개념도 없다. Claude Code 쪽 하네스가 `claude plugin install <name>@<marketplace>` 로 7종을 붙여 쓰는데, 그 목록을 Kiro 에 그대로 옮길 수는 없다.

그래서 이 디렉터리는 플러그인을 "설치"하지 않는다. 각 플러그인이 **실제로 무엇을 제공하는지** 확인해, Kiro 네이티브 구조(skills / steering / agents / MCP)로 옮길 수 있는 것만 옮기고, 옮길 수 없는 것은 **옮기지 않고 이유를 남긴다**.

서드파티 소스는 벤더링하지 않는다 — [mcp-proxy](../mcp-proxy/README.md) 와 같은 원칙이다. 이 레포는 카탈로그·브리지 스크립트·문서만 담고, 자산은 설치 시 상위 리포에서 얕은 clone 으로 가져온다.

## 사용

```bash
# 카탈로그와 처리 방식만 본다 (네트워크 접근 없음)
node scripts/install-plugins.js --list

# 무엇을 할지 미리 본다 (기본 동작 — 쓰기 없음)
node scripts/install-plugins.js

# 실제 설치 (~/.kiro/skills/ 로)
node scripts/install-plugins.js --apply

# 일부만
node scripts/install-plugins.js --apply --only=superpowers,obsidian

# 브리지가 설치한 것만 제거 (하네스·사용자 자산은 건드리지 않는다)
node scripts/install-plugins.js --apply --uninstall
```

단일 출처는 [`catalog.json`](catalog.json) 이다. 무엇을 어떤 워크로드로 옮기고 무엇을 왜 제외하는지가 전부 거기 선언되어 있다.

## 처리 방식 4가지

| mode | 뜻 | 대상 |
|------|-----|------|
| `bridge` | 상위 git 리포에서 스킬을 가져와 Kiro 형식으로 변환 설치 | superpowers, obsidian |
| `external-cli` | 상위 공식 설치기가 Kiro 를 이미 지원 → 그 명령을 쓴다(재구현 금지) | ui-ux-pro-max |
| `native` | Kiro 가 이미 동등 기능 제공 → 설치하지 않고 대응물을 안내 | rust-analyzer-lsp, ponytail, codex |
| `incompatible` | Claude Code 전용 포맷/프로토콜에 묶여 이식이 무의미 | claude-dashboard |

## 플러그인별 판정

### bridge — 가져와서 변환한다

**superpowers** (obra/superpowers, MIT) — 개발 규율 스킬 라이브러리 14종. 거의 전부 순수 마크다운이고, 헬퍼가 붙은 4종도 범용 런타임(node/bash, 선택적 graphviz)만 쓴다. 독점 바이너리가 없어 이식성이 높다. 11종을 설치하고 3종은 제외한다:

- `using-superpowers` — Claude 플러그인 전용 스킬 발견 부트스트랩이다. `superpowers:<skill>` 네임스페이스 호출과 "모든 응답 전 스킬 호출" 강제를 담는데, Kiro 는 오케스트레이터의 `skill://~/.kiro/skills/**/SKILL.md` 리소스로 이미 스킬을 자동 발견하고 네임스페이스가 없다. 강제 조항은 `ponytail`(최소 코드)·`AGENTS.md`(위임 규약)와 충돌한다.
- `test-driven-development` — 하네스 `tdd-workflow` 와 같은 주제. **이중 노출을 만들지 않는다.**
- `verification-before-completion` — 하네스 `verification-loop` 와 같은 주제. 동일.

> 상위 쪽 TDD 문서가 더 두껍다(320줄 vs 157줄). 그쪽을 쓰고 싶으면 `catalog.json` 의 해당 exclude 항목을 지우고 하네스 `skills/tdd-workflow` 를 제거하라 — **둘 중 하나만** 남긴다.

`using-git-worktrees` 는 하네스 `git-workflow` 와 겹치지 않는다(전자는 격리 워크스페이스 확보 기법, 후자는 브랜치·커밋·PR 파이프라인). 함께 설치한다.

**obsidian** (kepano/obsidian-skills, MIT) — 볼트 콘텐츠 스킬 5종. 3종(`obsidian-markdown` / `obsidian-bases` / `json-canvas`)은 파일 포맷 지식만 담은 순수 지시문이라 의존 없이 동작하고, 2종(`obsidian-cli` / `defuddle`)은 외부 CLI 가 없으면 그 스킬만 무동작이다. 하네스 `obsidian-plugin-develop`(플러그인 저작·리뷰·빌드)과 영역이 달라 중복이 아니다 — 이쪽은 볼트 콘텐츠 편집이다.

### external-cli — 상위 설치기를 쓴다

**ui-ux-pro-max** — 공식 CLI 가 `kiro` 를 1급 타깃으로 지원한다(`cli/src/types` 의 `AIType` 에 `'kiro'`, `detect.ts` 가 `.kiro` 자동 감지, 설치 위치 `.kiro/steering/`). 브리지로 재구현하지 않고 상위 것을 그대로 쓴다:

```bash
npx -y ui-ux-pro-max-cli init --ai kiro
```

워크스페이스 `.kiro/steering/` 에 설치되므로 프로젝트 단위다(상위가 글로벌 배치를 지원하지 않는다). 핵심 스킬이 로컬 검색 DB 를 `scripts/search.py` 로 조회하므로 **Python 3.x 가 필요**하다. 브리지는 이 명령을 자동 실행하지 않고 안내만 한다.

### native — Kiro 에 이미 있다

| 플러그인 | Kiro 대응 |
|---|---|
| **rust-analyzer-lsp** | `code` 툴의 LSP 연산(`find_references` / `goto_definition` / `get_hover` / `get_diagnostics` / `rename_symbol`). 이 플러그인은 로직이 없다 — `lspServers.rust-analyzer` 를 선언하는 설정일 뿐이다(리포에 README+LICENSE 만 존재). `rust-analyzer` 바이너리는 Kiro 쪽에서도 여전히 필요하다. |
| **ponytail** | `rules/common/ponytail.md` → CLI 글로벌 설치 시 `~/.kiro/steering/ponytail.md`(항상로딩). 플러그인으로 또 넣으면 같은 규칙이 두 곳에서 로드된다. |
| **codex** | `peer-reviewer` 에이전트 + `--review-backend cross` 설치 시 `bash .kiro/hooks/cross-review.sh`. 상위 구현은 `codex app-server`(JSON-RPC stdio)를 상주시키는 node 래퍼에 묶여 있어 그대로 옮길 수 없고, 하네스는 더 단순한 `codex review` 를 쓴다. |

### incompatible — 옮겨도 읽을 데이터가 없다

**claude-dashboard** — Claude Code 전용 런타임에 전면 의존한다: statusLine stdin 프로토콜(Claude Code 가 렌더마다 JSON 을 파이프), `~/.claude/history.jsonl`, `transcript.jsonl`, `~/.claude/.credentials.json`. Kiro 에는 이 프로토콜도 이 포맷의 데이터도 없다. 컨텍스트 사용량은 Kiro 의 `/context`, 모델 확인은 `/model` 로 대체한다 — 요금·한도 대시보드는 동등물이 없다.

## 변환 규칙 (Claude 스킬 → Kiro 스킬)

1. **`workloads: [...]` 주입** — Kiro 설치기가 스킬을 고르는 기준이다. Claude 스킬에는 이 필드가 없다. 어떤 워크로드를 붙일지는 `catalog.json` 의 `defaultWorkloads` / `skillWorkloads` 가 정한다.
2. **`origin: plugin:<id>` 주입** — 하네스 자산과 구분한다. 재실행이 멱등이고 `--uninstall` 이 자기 것만 지울 수 있는 근거다.
3. **`<pluginId>:<skill>` 네임스페이스 제거** — Kiro 에는 플러그인 네임스페이스가 없다. 실재하는 형제 스킬 참조만 벗기고 그 외 문자열은 건드리지 않는다.

보조 파일(추가 `.md`, 스크립트, CSV 데이터)은 그대로 복사한다 — `SKILL.md` 만 변환한다.

## 안전 규칙

- **기본은 dry-run.** 실제 쓰기는 `--apply` 를 명시해야 한다.
- **하네스·사용자 자산을 덮지 않는다.** 설치 대상 이름이 이미 존재하면 그 스킬의 `origin` 을 보고, `plugin:<자기 id>` 가 아니면 건너뛰고 보고한다. `origin` 이 없는(사용자가 손으로 넣었을 수 있는) 스킬도 건너뛴다.
- **매니페스트 분리.** 브리지는 `~/.kiro/.plugin-manifest.json` 에, 하네스 설치기는 `~/.kiro/.harness-manifest.json` 에 기록한다. 하네스 재설치가 플러그인 자산을 지우지 않고, 그 역도 성립한다.
- **부분 실패를 허용한다.** git clone 실패·의존 바이너리 부재는 그 플러그인만 건너뛰고 나머지를 계속한다.

## 왜 `core` 워크로드로 넣는가

superpowers 스킬 대부분은 `core` 태그를 받아 모든 설치에 포함된다. 컨텍스트 비용을 걱정할 필요는 없다:

- **CLI 티어**는 스킬을 `skill://` progressive 리소스로 로드한다 — 실제로 쓰일 때까지 컨텍스트를 먹지 않는다.
- **IDE 티어**는 `inclusion: manual` steering 으로 변환한다 — `#` 컨텍스트 키로 명시 호출할 때만 로드된다.

즉 "설치되어 있다"와 "항상 컨텍스트에 있다"가 Kiro 에서는 다르다. 그래서 글로벌 기본 배치가 안전하다.
