# MCP Proxy (하네스 번들)

여러 MCP 클라이언트(Kiro, Claude Code, Obsidian 등)가 각자 MCP 서버 프로세스를 중복으로 띄우지 않도록,
[tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy)로 MCP 서버를 **한 곳(도커 컨테이너)에서 중앙 관리**한다.
클라이언트는 `http://localhost:9090/<서버>/mcp` 하나만 바라본다.

```
클라이언트들 ──HTTP──▶ mcp-proxy(:9090) ──▶ fetch / brave / exa / time / drawio / github / context7 / obsidian ...
```

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
docker compose up -d
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

## 하네스 연동 (`--mcp-proxy`)

하네스 IDE 설치에 `--mcp-proxy`를 주면, 생성되는 `.kiro/settings/mcp.json`이 프록시 경유 서버를
직접 stdio/docker 대신 `{"type":"http","url":"http://localhost:9090/<서버>/mcp"}` 형태로 기록한다.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
```

설치기는 이때 **프록시 컨테이너까지 보장**한다: `docker ps`로 `mcp-proxy`가 떠 있는지 확인해 — 떠 있으면 스킵, 없으면 이 디렉터리에서 `docker compose up -d`를 자동 실행한다. **Docker 가 설치돼 있지 않으면 "Docker 설치 후 다시 실행"**, 데몬이 꺼져 있으면 "데몬 시작 후 다시 실행"하라고 안내한다. 기동 실패·`--dry-run`이면 안내만 출력하고 설치는 계속된다(수동 기동: `cd mcp-proxy && docker compose up -d`). 키가 필요한 백엔드(brave/github/obsidian)는 위 "1. API 키 설정"을 먼저 해두면 컨테이너 기동 시 함께 주입된다.

**프록시로 들어가는 것(프록시 가능):** fetch, time, brave-search, exa, drawio, token-optimizer,
obsidian, aws-documentation, terraform — 활성 워크로드에 맞는 것만.

**프록시 밖에 남는 것(프록시 불가):**
- **Kiro 내장** — `github`, `context7`, `playwright`, `memory`, `sequential-thinking`. Kiro가 자체 제공하므로
  Kiro 구성에는 프록시 URL로도 넣지 않는다. (프록시 자체는 Claude Code/Obsidian 등 비-Kiro 클라이언트를 위해
  github/context7 백엔드를 계속 제공한다.)
- **자격증명이 필요한 AWS 서버** — `aws-core`, `cloudwatch`, `aws-ecs`, `aws-iam`, `aws-pricing`,
  `aws-billing-cost-management`. 세션별 AWS 자격증명(`AWS_PROFILE`/키, SSO 임시 토큰)을 공유 프록시 컨테이너에
  중앙화할 수 없으므로 devops 에이전트가 `docker run`으로 직접 띄운다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저) 등은 프록시를 안 거치고
  클라이언트가 직접 띄운다. 하네스는 이를 관리하지 않는다.

## 서버 추가/변경

1. `config.json`의 `mcpServers`에 항목 추가
2. 시크릿이 필요하면 셸 프로필 export(또는 `.env`) + `docker-compose.yaml`의 `environment:`에 키 추가
3. `docker compose up -d` (config는 `:ro` 마운트라 재기동만 하면 반영)
4. 프록시 경유로 하네스에서도 쓰려면 `mcp-configs/mcp-servers.json`의 `mcpProxy.servers`에 이름 추가

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| 컨테이너→호스트 접속 실패 (Obsidian 등) | `host.docker.internal` 사용. compose의 `extra_hosts`로 Colima에서도 매핑됨 |
| `${VAR}`가 치환 안 됨 | 셸 프로필 export 후 `source` 했는지, 또는 `.env` 키가 `docker-compose.yaml`의 `environment:`에도 있는지 확인 후 `up -d` 재실행 |
| terraform 서버 안 붙음 | 별도 컨테이너(`terraform-mcp`)로 뜸. 프록시가 내부망 `terraform-mcp:8080`으로 접근 — 호스트엔 미노출 |
| 설정 바꿨는데 반영 안 됨 | `docker compose up -d` (또는 `restart mcp-proxy`)로 재기동 |
