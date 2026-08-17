# MCP Proxy (하네스 번들)

여러 MCP 클라이언트(Kiro, Claude Code, Obsidian 등)가 각자 MCP 서버 프로세스를 중복으로 띄우지 않도록,
[tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy)로 MCP 서버를 **한 곳(도커 컨테이너)에서 중앙 관리**한다.
클라이언트는 `http://localhost:9090/<서버>/mcp` 하나만 바라본다.

```
클라이언트들 ──HTTP──▶ mcp-proxy(:9090) ──▶ fetch / brave / exa / time / drawio / context7 / obsidian ...
```

> **devops/AWS MCP 는 이 프록시에 없다.** terraform 과 AWS 서버는 온디맨드 stdio 프로세스로 돈다 —
> 호스트 `uvx`(awslabs 공식, 버전 핀)와 terraform 의 `docker run -i --rm`(핀된 이미지)이다. 상주
> 컨테이너가 없어 평소 리소스를 쓰지 않고, 지킬 HTTP 엔드포인트도 없다. 이유와 실측 지연은
> `docs/kr/mcp-reference.md` 의 "왜 프록시가 아니라 stdio 인가" 참고.

이 디렉터리는 하네스에 번들된 배포 단위다. 하네스 설치기(`install.js`)의 `--mcp-proxy` 옵션은
여기서 뜬 프록시를 가리키도록 Kiro MCP 구성을 생성한다(아래 "하네스 연동" 참고).

## 사전 준비

- Docker (macOS는 Colima 또는 Docker Desktop)
- `uvx`, `npx` 는 프록시 컨테이너 이미지 안에 포함 — 호스트에 없어도 됨

## 1. API 키 설정

키가 필요한 서버: `brave-search`(`BRAVE_API_KEY`), `github`(`GITHUB_PAT`), `obsidian`(`OBSIDIAN_API_KEY`).
나머지(fetch/time/drawio/context7/token-optimizer/aws-documentation/terraform/exa)는 키가 필요 없다.

키를 주입하는 방법은 두 가지다. **둘 중 하나만** 쓰면 된다.

### 방법 A — 셸 프로필에 export (권장)

`~/.zshrc`(zsh) 또는 `~/.bashrc`(bash)에 export 를 추가한다. `docker-compose.yaml`이 `${VAR:-}`로
셸 환경변수를 그대로 컨테이너에 주입한다. 프록시를 안 거치고 클라이언트가 직접 띄우는 stdio 서버에도
같은 키가 공유되는 장점이 있다.

```bash
# ~/.zshrc 또는 ~/.bashrc 에 추가
export BRAVE_API_KEY="발급받은_brave_키"
export GITHUB_PAT="발급받은_github_pat"
export OBSIDIAN_API_KEY="발급받은_obsidian_키"
```

```bash
# 저장 후 현재 셸에 반영 (또는 터미널 재시작)
source ~/.zshrc   # bash면 source ~/.bashrc
```

> 셸 프로필은 홈 디렉터리 권한(`chmod 600 ~/.zshrc` 권장)으로 보호하고, 절대 저장소에 커밋하지 않는다.

### 방법 B — `.env` 파일

레포-로컬 시크릿을 쓰려면 `.env.example`을 복사해 채운다. `.env`는 `.gitignore`에 있어 커밋되지 않는다.

```bash
cp .env.example .env
# 편집기로 .env 를 열어 값 입력
```

`config.json`의 `${BRAVE_API_KEY}` 등은 실행 시 컨테이너 안에서 이 값으로 치환된다.

## 2. 실행

```bash
docker compose up -d mcp-proxy     # 범용 프록시 :9090 (terraform-mcp 사이드카도 함께 뜸)
docker compose logs -f mcp-proxy   # 기동 확인 (Ctrl+C로 로그만 빠져나옴)
```

- `mcp-proxy` (:9090) + `terraform-mcp` (내부 전용) 두 컨테이너가 뜬다.
- `restart: unless-stopped` — 재부팅/크래시 시 자동 재기동.

> **보안:** 프록시는 `127.0.0.1:9090` (루프백)에만 바인딩된다. github(PAT)/obsidian/brave 등 자격증명
> 백엔드를 프론트하므로 무인증으로 LAN에 노출되면 안 된다. 원격 접근이 꼭 필요하면 `config.json`에
> `authTokens`를 설정하고 바인딩을 조정할 것. terraform-mcp는 호스트 포트를 발행하지 않는다(내부망 전용).

## 3. 확인

```bash
# 프록시가 응답하는지 (405/mcp 관련 응답이면 정상 기동)
curl -i http://localhost:9090/time/mcp
```

devops/AWS MCP 는 프록시를 안 거치므로 stdio 로 직접 확인한다:

```bash
req='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}'
printf '%s\n' "$req" | uvx awslabs.cloudwatch-mcp-server@0.1.8 2>/dev/null | head -1
printf '%s\n' "$req" | docker run -i --rm hashicorp/terraform-mcp-server:1.0.0 2>/dev/null | head -1
```

## 하네스 연동 (`--mcp-proxy`)

하네스 IDE 설치에 `--mcp-proxy`를 주면, 생성되는 `.kiro/settings/mcp.json`이 프록시 경유 서버를
직접 stdio 대신 `{"type":"http","url":"http://localhost:9090/<서버>/mcp"}` 형태로 기록한다.

devops/AWS 서버는 이 플래그와 무관하게 항상 온디맨드 stdio 로 기록된다(프록시 대상이 아니다).

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
```

설치기는 이때 **프록시 컨테이너까지 보장**한다: `docker ps`로 `mcp-proxy`가 떠 있는지 확인해 — 떠 있으면 스킵, 없으면 이 디렉터리에서 `docker compose up -d mcp-proxy`를 자동 실행한다. (`KIRO_HARNESS_SKIP_PROXY_PROVISION=1` 을 주면 이 단계를 건너뛴다 — e2e 테스트가 호스트 도커 상태를 바꾸지 않도록 쓰는 탈출구다.) **Docker 가 설치돼 있지 않으면 "Docker 설치 후 다시 실행"**, 데몬이 꺼져 있으면 "데몬 시작 후 다시 실행"하라고 안내한다. 기동 실패·`--dry-run`이면 안내만 출력하고 설치는 계속된다(수동 기동: `cd mcp-proxy && docker compose up -d`). 키가 필요한 백엔드(brave/github/obsidian)는 위 "1. API 키 설정"을 먼저 해두면 컨테이너 기동 시 함께 주입된다.

**워크로드 선별 (`config.generated.json`):** `--mcp-proxy` 설치는 활성 워크로드에 맞는 백엔드만 담은 `config.generated.json`을 이 디렉터리에 생성하고, 컨테이너가 그것을 마운트하도록 `MCP_PROXY_CONFIG`로 주입한다(전체 `config.json`은 템플릿이자 수동 `up` 시 기본값으로 유지). 그래서 프록시도 **"필요한 백엔드만"** 서빙하며, 클라이언트 `mcp.json`과 동일한 워크로드 게이트라 서빙 목록과 구독 목록이 정합한다. 프록시가 이미 실행 중이면 공유 안정성을 위해 자동 재기동하지 않는다 — 새 구성을 반영하려면 `MCP_PROXY_CONFIG=./config.generated.json docker compose up -d`로 재적용한다. Kiro 내장(github/context7)은 선별 config 에서 제외되므로, 비-Kiro 클라이언트용으로 전체를 서빙하려면 수동 `docker compose up -d`(기본값 = 전체 `config.json`)를 쓴다.

**프록시로 들어가는 것:** fetch, time, brave-search, exa, drawio, token-optimizer, obsidian —
활성 워크로드에 맞는 것만.

**프록시 밖에 남는 것:**
- **Kiro 내장** — `github`, `context7`, `playwright`, `memory`, `sequential-thinking`. Kiro가 자체 제공하므로
  Kiro 구성에는 프록시 URL로도 넣지 않는다. (프록시 자체는 Claude Code/Obsidian 등 비-Kiro 클라이언트를 위해
  github/context7 백엔드를 계속 제공한다.)
- **devops/AWS 서버** — terraform, aws-documentation, cloudwatch, aws-ecs, aws-iam, aws-pricing,
  aws-billing-cost-management. 온디맨드 stdio(호스트 `uvx` / `docker run -i --rm`)로 돌아 상주 컨테이너가
  없다. 정의는 `mcp-configs/mcp-servers.json` 의 `mcpServersDevops`.
- **범용 AWS API 서버** — 없다. 구 `aws-core`(= `awslabs.core-mcp-server`)는 upstream 에서
  yanked 됐고(사유: 'load individual MCPs'), 대체 후보 `awslabs.aws-api-mcp-server`는 Kiro 내장
  `use_aws` 와 기능이 겹친다. 임의 AWS API 호출은 `use_aws` 또는 `aws` CLI 로 하며, 그래야 뮤테이션이
  devops 에이전트의 plan → 승인 → execute 흐름 안에 남는다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저) 등은 프록시를 안 거치고
  클라이언트가 직접 띄운다. 하네스는 이를 관리하지 않는다.

## 서버 추가/변경

1. `config.json`의 `mcpServers`에 항목 추가
2. 시크릿이 필요하면 셸 프로필 export(또는 `.env`) + `docker-compose.yaml`의 `environment:`에 키 추가
3. `docker compose up -d mcp-proxy` (config는 `:ro` 마운트라 재기동만 하면 반영)
4. 프록시 경유로 하네스에서도 쓰려면 `mcp-configs/mcp-servers.json`의 `mcpProxy.servers`에 이름 추가
   — 두 곳이 어긋나면 `npm test` 가 죽은 URL 로 잡아낸다

### devops 백엔드 버전 갱신

devops/AWS 서버는 이 프록시가 아니라 `mcp-configs/mcp-servers.json` 의 `mcpServersDevops` 가 정의한다.
버전은 재현성을 위해 핀돼 있다(`@latest`는 실행마다 재해석되어 콜드스타트를 되살리고, 테스트가 이를 금지한다):

```bash
# 최신 버전 확인
curl -s https://pypi.org/pypi/awslabs.cloudwatch-mcp-server/json | python3 -c 'import json,sys;print(json.load(sys.stdin)["info"]["version"])'
```

`mcpServersDevops.servers` 와 `agents/cli/global/devops.json` 을 함께 고친 뒤 재설치한다(테스트가 두 곳의
일치를 검사한다). `aws-iam` 에 `--allow-write` 를 추가하면 안 된다 — 서버 기본값이 read-only 이며, 쓰기는
devops 에이전트의 승인 흐름(`use_aws`/`aws` CLI)이 담당한다.

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| 컨테이너→호스트 접속 실패 (Obsidian 등) | `host.docker.internal` 사용. compose의 `extra_hosts`로 Colima에서도 매핑됨 |
| `${VAR}`가 치환 안 됨 | 셸 프로필 export 후 `source` 했는지, 또는 `.env` 키가 `docker-compose.yaml`의 `environment:`에도 있는지 확인 후 `up -d` 재실행 |
| terraform 서버 안 붙음 | 별도 컨테이너(`terraform-mcp`)로 뜸. 프록시가 내부망 `terraform-mcp:8080`으로 접근 — 호스트엔 미노출 |
| 설정 바꿨는데 반영 안 됨 | `docker compose up -d mcp-proxy` (또는 `restart mcp-proxy`)로 재기동 |
| devops `@`-도구가 **전부** 안 붙음 | 프록시 문제가 아니다. 호스트에 `uv` 가 없을 가능성이 크다 — `command -v uvx` 확인 후 `brew install uv`. terraform 만 안 붙으면 Docker 를 확인한다 |
| devops 첫 호출이 느림(~30초) | `uv` 캐시가 비어 있어 핀된 버전을 받는 중이다. 한 번 받으면 이후 0.5~5초. 미리 워밍하려면 `docs/kr/mcp-reference.md` 의 콜드스타트 절 참고 |
| AWS 도구가 자격증명 오류 | SSO 토큰 만료. `aws sso login --profile <이름>` — stdio 는 호스트 프로세스라 즉시 반영된다. 프로필을 바꾸려면 `AWS_PROFILE` 을 export 하고 세션을 다시 시작 |
