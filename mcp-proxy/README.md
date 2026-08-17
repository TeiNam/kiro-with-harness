# MCP Proxy (하네스 번들)

여러 MCP 클라이언트(Kiro, Claude Code, Obsidian 등)가 각자 MCP 서버 프로세스를 중복으로 띄우지 않도록,
[tbxark/mcp-proxy](https://github.com/tbxark/mcp-proxy)로 MCP 서버를 **한 곳(도커 컨테이너)에서 중앙 관리**한다.
클라이언트는 `http://localhost:<포트>/<서버>/mcp` 만 바라본다.

프록시는 **두 개**다 — 자격증명 격리를 위해 나눴다.

```
클라이언트들 ──HTTP──▶ mcp-proxy(:9090)        ──▶ fetch / brave / exa / time / drawio / context7 / obsidian ...
             └───────▶ devops-mcp-proxy(:9092) ──▶ terraform / aws-documentation / cloudwatch / aws-ecs /
                                                    aws-iam / aws-pricing / aws-billing-cost-management
```

`~/.aws`(프로필·SSO 토큰)를 마운트하는 컨테이너는 **devops-mcp-proxy 하나뿐**이다. brave/github/obsidian 같은
범용 백엔드는 AWS 자격증명과 같은 파일시스템에 놓이지 않는다.

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
docker compose up -d mcp-proxy          # 범용 프록시 :9090
docker compose up -d devops-mcp-proxy   # devops 프록시 :9092 (terraform-mcp 도 함께 뜸)
docker compose up -d                    # 둘 다
docker compose logs -f devops-mcp-proxy # 기동 확인 (Ctrl+C로 로그만 빠져나옴)
```

- 서비스는 셋이다: `mcp-proxy`(:9090), `devops-mcp-proxy`(:9092), `terraform-mcp`(내부 전용).
- `restart: unless-stopped` — 재부팅/크래시 시 자동 재기동.
- devops 프록시 첫 기동은 awslabs 서버를 `uvx`로 받는 동안 **30~60초** 걸린다. 이후엔 `devops-uv-cache`
  볼륨에 남아 즉시 뜬다. 로그에 서버별 `Handling requests at /<서버>/` 가 7개 찍히면 준비된 것이다.

> **보안:** 두 프록시 모두 루프백(`127.0.0.1:9090`, `127.0.0.1:9092`)에만 바인딩된다. **무인증**이며
> github(PAT)/obsidian/brave, 그리고 AWS 자격증명 백엔드를 프론트하므로 LAN에 노출하면 같은 네트워크의
> 임의 호스트가 그 권한을 쓸 수 있다. 원격 접근이 꼭 필요하면 `config.json`에 `authTokens`를 설정하고
> 바인딩을 조정할 것. terraform-mcp는 호스트 포트를 발행하지 않는다(내부망 전용).
>
> devops 프록시는 `~/.aws`를 **읽기 전용**으로 마운트한다. 그래서 SSO 토큰 갱신은 호스트에서 해야 한다:
> `aws sso login --profile <이름>`. 프로필/리전은 `AWS_PROFILE`/`AWS_REGION`(셸 또는 `.env`)로 주입된다.

## 3. 확인

```bash
# 프록시가 응답하는지 (405/mcp 관련 응답이면 정상 기동)
curl -i http://localhost:9090/time/mcp

# devops 프록시 서버별 handshake — 7개 모두 serverInfo 를 돌려주면 정상
for s in terraform aws-documentation cloudwatch aws-ecs aws-pricing aws-billing-cost-management aws-iam; do
  printf '%-30s ' "$s"
  curl -sS --max-time 30 -X POST "http://localhost:9092/$s/mcp" \
    -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
    | grep -o '"serverInfo":{"name":"[^"]*"' || echo FAIL
done
```

## 하네스 연동 (`--mcp-proxy`)

하네스 IDE 설치에 `--mcp-proxy`를 주면, 생성되는 `.kiro/settings/mcp.json`이 범용 프록시 경유 서버를
직접 stdio 대신 `{"type":"http","url":"http://localhost:9090/<서버>/mcp"}` 형태로 기록한다.

**devops 프록시는 이 플래그와 무관하다.** `cloud`/`finops` 워크로드가 활성이면 티어와 관계없이 설치기가
`devops-mcp-proxy`를 보장하고, devops MCP 는 항상 `http://localhost:9092/<서버>/mcp` 를 가리킨다.
이유는 성능이 아니라 **동작 여부**다 — 예전에는 클라이언트가 서버마다 `docker run -i --rm <이미지>` 를
띄웠는데, 첫 이미지 pull 이 14~20초 걸려 MCP 초기화 타임아웃을 넘겼고 그래서 devops MCP 가 **전부** 실패했다.
상주 프록시는 그 비용을 컨테이너 기동 때 한 번만 낸다.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
```

설치기는 이때 **프록시 컨테이너까지 보장**한다: `docker ps`로 해당 컨테이너가 떠 있는지 확인해 — 떠 있으면 스킵, 없으면 이 디렉터리에서 `docker compose up -d <서비스>`를 자동 실행한다(서비스명을 명시하므로 필요한 프록시만 뜬다). **Docker 가 설치돼 있지 않으면 "Docker 설치 후 다시 실행"**, 데몬이 꺼져 있으면 "데몬 시작 후 다시 실행"하라고 안내한다. 기동 실패·`--dry-run`이면 안내만 출력하고 설치는 계속된다(수동 기동: `cd mcp-proxy && docker compose up -d`). 키가 필요한 백엔드(brave/github/obsidian)는 위 "1. API 키 설정"을 먼저 해두면 컨테이너 기동 시 함께 주입된다.

**워크로드 선별 (`config.generated.json`):** `--mcp-proxy` 설치는 활성 워크로드에 맞는 백엔드만 담은 `config.generated.json`을 이 디렉터리에 생성하고, 컨테이너가 그것을 마운트하도록 `MCP_PROXY_CONFIG`로 주입한다(전체 `config.json`은 템플릿이자 수동 `up` 시 기본값으로 유지). 그래서 프록시도 **"필요한 백엔드만"** 서빙하며, 클라이언트 `mcp.json`과 동일한 워크로드 게이트라 서빙 목록과 구독 목록이 정합한다. 프록시가 이미 실행 중이면 공유 안정성을 위해 자동 재기동하지 않는다 — 새 구성을 반영하려면 `MCP_PROXY_CONFIG=./config.generated.json docker compose up -d`로 재적용한다. Kiro 내장(github/context7)은 선별 config 에서 제외되므로, 비-Kiro 클라이언트용으로 전체를 서빙하려면 수동 `docker compose up -d`(기본값 = 전체 `config.json`)를 쓴다.

**범용 프록시(:9090)로 들어가는 것:** fetch, time, brave-search, exa, drawio, token-optimizer,
obsidian — 활성 워크로드에 맞는 것만.

**devops 프록시(:9092)로 들어가는 것:** terraform, aws-documentation, cloudwatch, aws-ecs, aws-iam
(cloud 워크로드), aws-pricing, aws-billing-cost-management (finops 워크로드). 백엔드는 AWS 공식
`awslabs` 서버를 `uvx`로 버전 핀해 실행한다 — 종전의 서드파티 `acuvity/*` 미러는 같은 awslabs 소스를
`minibridge` 래퍼로 감싸 기본 HTTP 모드로 뜨기 때문에 stdio 경로가 불안정했다.

**프록시 밖에 남는 것:**
- **Kiro 내장** — `github`, `context7`, `playwright`, `memory`, `sequential-thinking`. Kiro가 자체 제공하므로
  Kiro 구성에는 프록시 URL로도 넣지 않는다. (프록시 자체는 Claude Code/Obsidian 등 비-Kiro 클라이언트를 위해
  github/context7 백엔드를 계속 제공한다.)
- **범용 AWS API 서버** — 없다. 구 `aws-core`(= `awslabs.core-mcp-server`)는 upstream 에서
  yanked 됐고(사유: 'load individual MCPs'), 대체 후보 `awslabs.aws-api-mcp-server`는 기동 시
  `~/.aws/aws-api-mcp/` 를 무조건 만들어 읽기전용 마운트와 충돌하며 Kiro 내장 `use_aws` 와 기능이 겹친다.
  임의 AWS API 호출은 `use_aws` 또는 `aws` CLI 로 하며, 그래야 뮤테이션이 devops 에이전트의
  plan → 승인 → execute 흐름 안에 남는다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저) 등은 프록시를 안 거치고
  클라이언트가 직접 띄운다. 하네스는 이를 관리하지 않는다.

## 서버 추가/변경

1. 범용 서버는 `config.json`, AWS/인프라 서버는 `config.devops.json`의 `mcpServers`에 항목 추가
2. 시크릿이 필요하면 셸 프로필 export(또는 `.env`) + `docker-compose.yaml`의 `environment:`에 키 추가
3. `docker compose up -d <서비스>` (config는 `:ro` 마운트라 재기동만 하면 반영)
4. 하네스에서도 쓰려면 `mcp-configs/mcp-servers.json`의 `mcpProxy.servers`(범용) 또는
   `mcpProxyDevops.servers`(devops)에 이름 추가 — 두 곳이 어긋나면 `npm test` 가 죽은 URL 로 잡아낸다

### 버전 갱신 (devops 백엔드)

`config.devops.json`의 awslabs 패키지 버전은 재현성을 위해 핀돼 있다(`@latest`는 컨테이너가 뜰 때마다
재해석되고, 테스트가 이를 금지한다). 올릴 때:

```bash
# 최신 버전 확인
curl -s https://pypi.org/pypi/awslabs.cloudwatch-mcp-server/json | python3 -c 'import json,sys;print(json.load(sys.stdin)["info"]["version"])'
# config.devops.json 수정 후 재생성
docker compose up -d --force-recreate devops-mcp-proxy
```

`aws-iam` 에 `--allow-write` 를 추가하면 안 된다 — 서버 기본값이 read-only 이며, 쓰기는 devops 에이전트의
승인 흐름(`use_aws`/`aws` CLI)이 담당한다. 테스트가 쓰기 플래그를 금지한다.

## 트러블슈팅

| 증상 | 원인 / 조치 |
|---|---|
| 컨테이너→호스트 접속 실패 (Obsidian 등) | `host.docker.internal` 사용. compose의 `extra_hosts`로 Colima에서도 매핑됨 |
| `${VAR}`가 치환 안 됨 | 셸 프로필 export 후 `source` 했는지, 또는 `.env` 키가 `docker-compose.yaml`의 `environment:`에도 있는지 확인 후 `up -d` 재실행 |
| terraform 서버 안 붙음 | 별도 컨테이너(`terraform-mcp`)로 뜸. 프록시가 내부망 `terraform-mcp:8080`으로 접근 — 호스트엔 미노출 |
| 설정 바꿨는데 반영 안 됨 | `docker compose up -d <서비스>` (또는 `restart <서비스>`)로 재기동 |
| devops `@`-도구가 **전부** 안 붙음 | `devops-mcp-proxy` 컨테이너가 없다. `docker compose up -d devops-mcp-proxy` 후 로그에서 `Handling requests at` 7개 확인 |
| devops 서버 일부만 안 붙음 | 첫 기동 중 `uvx` 다운로드가 아직 진행 중일 수 있다(30~60초). `docker compose logs devops-mcp-proxy \| grep -E 'Connecting\|Handling'` 로 확인 |
| AWS 도구가 자격증명 오류 | SSO 토큰 만료. 호스트에서 `aws sso login --profile <이름>` (컨테이너는 ro 마운트라 갱신 불가). 프로필이 다르면 `AWS_PROFILE` 을 export 후 `up -d --force-recreate devops-mcp-proxy` |
| `:9092` 포트 충돌 | 다른 프로세스가 점유 중. `lsof -nP -iTCP:9092 -sTCP:LISTEN` 로 확인 후 정리하거나, `docker-compose.yaml`·`config.devops.json`·`mcp-configs/mcp-servers.json` 세 곳의 포트를 함께 바꾼다(테스트가 정합성을 검사한다) |
