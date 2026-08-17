# MCP 서버 레퍼런스

큐레이션된 MCP(Model Context Protocol) 서버 카탈로그. 기준 출처: `mcp-configs/mcp-servers.json`.

- **CLI 티어**는 기본적으로 `mcp.json`을 생성하지 않습니다 — CLI 에이전트가 자체 `mcpServers`를 가집니다(devops 에이전트는 아래의 devops 프록시 URL을 가리킴). 글로벌 `~/.kiro/settings/mcp.json`은 IDE 전용입니다.
- **IDE 티어**는 활성 워크로드와 매칭되는 general + DevOps 서버를 `.kiro/settings/mcp.json`에 기록합니다.
- 컨텍스트 윈도 보호를 위해 **활성 서버는 ~10개 미만**으로 유지하세요.
- 시크릿은 `${VAR}` 환경변수 참조나 `YOUR_*_HERE` 플레이스홀더로 — 실제 토큰은 절대 커밋하지 않습니다.

## 중앙 프록시 2개

하네스는 MCP 서버를 클라이언트당 프로세스 하나씩 띄우는 대신 [mcp-proxy](https://github.com/tbxark/mcp-proxy) 컨테이너(저장소 `mcp-proxy/`에 번들) 뒤에서 실행합니다. 클라이언트는 streamable HTTP로 연결합니다: `{"type":"http","url":"http://localhost:<포트>/<서버>/mcp"}`.

| 프록시 | 포트 | 설정 | 내용 | 기동 시점 |
|--------|------|------|------|----------|
| General | 9090 | `mcp-proxy/config.json` | fetch, time, brave-search, exa, drawio, token-optimizer, obsidian | `--mcp-proxy` 플래그로 opt-in (IDE 티어) |
| DevOps | 9092 | `mcp-proxy/config.devops.json` | terraform + AWS 서버들 (아래 표 참고) | `cloud` 또는 `finops` 워크로드 활성 시 자동 (티어 무관) |

**자격증명 격리**를 위해 나뉜 것입니다: devops 컨테이너만 `~/.aws`를 읽기전용으로 마운트하므로, brave/github/obsidian 같은 범용 백엔드는 AWS 프로필·SSO 토큰과 같은 filesystem을 절대 공유하지 않습니다. 둘 다 `127.0.0.1`로만 바인드되며, 엔드포인트는 인증 없으므로 바인딩을 확대하지 마세요.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy   # 두 프록시 모두
node install.js cli --scope global --workload=cloud        # devops 프록시만
cd mcp-proxy && docker compose up -d devops-mcp-proxy      # 수동 기동
```

설치기는 필요한 프록시를 자동 보장합니다: `docker ps`로 확인해 컨테이너가 없으면 `mcp-proxy/`에서 `docker compose up -d <service>`를 실행하고, 이미 떠 있으면 스킵합니다. 범용 프록시의 경우 활성 워크로드에 맞는 백엔드만 담은 **`config.generated.json`**도 생성하므로 프록시가 "필요한 것만" 서빙하고(전체 `config.json`은 템플릿/수동 fallback으로 남음), 클라이언트 `mcp.json`과 서빙 목록이 정합합니다. Docker 미설치면 "Docker 설치 후 재실행", 데몬 미실행이면 "데몬 시작 후 재실행"을 안내하며, `--dry-run`·기동 실패는 graceful하게 넘어갑니다(설치는 계속됩니다).

### DevOps 서버가 선택 프록시가 아닌 이유

과거에는 서버당 `docker run -i --rm <image>`로 클라이언트가 띄웠습니다. 첫 사용 시 실패했습니다: 각 이미지 pull이 14~20초 걸려 MCP 초기화 타임아웃을 초과했기 때문에 **devops MCP 전부가 한 번에 실패**했습니다. 상주 프록시는 그 비용을 컨테이너 시작 때 한 번만 지불합니다.

### Range 프록시 라우팅 (`--mcp-proxy`, 활성 워크로드 매칭 시 가능)

| 서버 | 워크로드 |
|------|----------|
| fetch, time | (범용, 항상) |
| brave-search, exa | writing |
| drawio | architecture, writing |
| token-optimizer | ai-agent, ai |
| obsidian | obsidian |

프록시로 나가는 서버는 general/stdio 출력에서 제외됩니다(중복 방지).

### 프록시 밖에 남는 것

- **Kiro 내장** — github, context7, playwright, memory, sequential-thinking. Kiro가 자체 제공하므로 프록시 URL로도 넣지 않습니다(범용 프록시 자체는 비-Kiro 클라이언트용으로 github/context7 백엔드를 계속 제공).
- **범용 AWS API** — 이를 위한 MCP 서버는 없습니다. `awslabs.core-mcp-server`(구 `aws-core` 항목)는 상위에서 yanked("load individual MCPs"로 이유)되었고, 그 대체 후보인 `awslabs.aws-api-mcp-server`는 기동 시 `~/.aws/aws-api-mcp/`를 무조건 생성해 읽기전용 마운트와 충돌하며, Kiro 내장 `use_aws`와도 중복입니다. 대신 `use_aws` 또는 `aws` CLI를 사용하세요 — 그러면 변경도 devops 에이전트의 plan → approval → execute 흐름에 머물게 됩니다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저). 클라이언트가 직접 띄웁니다. 하네스는 관리하지 않습니다.

> `--mcp-proxy`는 IDE 티어에만 적용됩니다(CLI 티어는 mcp.json을 생성하지 않음). devops 프록시는 그 플래그와 독립합니다. 프록시가 안 떠 있으면 프록시 URL은 연결되지 않으므로 `cd mcp-proxy && docker compose up -d <mcp-proxy|devops-mcp-proxy>`로 기동하세요. 활성 서버 총합은 ~10개 미만 유지를 권장합니다.

## Kiro 내장 (카탈로그 미포함)

Kiro가 자체 제공하므로 하네스는 나열하지 않습니다: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## General 서버 (워크로드 태그)

| 서버 | 전송 | 워크로드 | 용도 |
|------|------|----------|------|
| cloudflare-docs | http | cloud | Cloudflare 문서 검색 |
| mcpydoc | stdio (기본 비활성) | python | Python 패키지 문서 + 코드 분석 (venv 자동 감지) |

## DevOps / 인프라 (devops 프록시 :9092, cloud 워크로드 — devops 에이전트 사용)

백엔드는 **AWS 공식 `awslabs` 서버**를 프록시 내에서 `uvx`로 버전 핀해 실행합니다. 초기 릴리스는 서드파티 `acuvity/*` 미러를 썼으나, 이들은 같은 awslabs 소스를 `minibridge` 프로세스로 감싸 HTTP 기본값이고 stdio 위에서는 불안정했습니다.

| 서버 | 백엔드 | 용도 |
|------|--------|------|
| terraform | `hashicorp/terraform-mcp-server:1.0.0` sidecar (내부 HTTP) | Terraform Registry: provider/module 문서 + 버전 |
| aws-documentation | `uvx awslabs.aws-documentation-mcp-server@1.1.30` | AWS 문서 검색 + 추천 |
| cloudwatch | `uvx awslabs.cloudwatch-mcp-server@0.1.8` | 메트릭, 알람, Logs Insights |
| aws-ecs | `uvx --from awslabs-ecs-mcp-server@0.1.34 ecs-mcp-server` | ECS 검사 (`ALLOW_WRITE=false`) |
| aws-iam | `uvx awslabs.iam-mcp-server@1.0.25` | IAM 사용자/역할/정책 (민감 — 읽기전용, 기본 비활성) |

## FinOps / 비용 (devops 프록시 :9092, finops 워크로드)

| 서버 | 백엔드 | 용도 |
|------|--------|------|
| aws-pricing | `uvx awslabs.aws-pricing-mcp-server@1.0.34` | 배포 전 비용 추정 (Price List API) |
| aws-billing-cost-management | `uvx awslabs.billing-cost-management-mcp-server@0.0.33` | 실제 지출, 예산, Cost Explorer, 최적화 |

> **자격증명.** devops 프록시는 `~/.aws`를 읽기전용으로 마운트하고 `AWS_PROFILE` / `AWS_REGION`을 받습니다(셸이나 `mcp-proxy/.env`로 override 가능). SSO 프로필은 호스트에서 새로고쳐야 합니다 — `aws sso login --profile <name>` — 컨테이너는 읽기전용 마운트에 쓸 수 없기 때문입니다. terraform, aws-documentation, aws-pricing은 자격증명이 불필요합니다.
>
> **쓰기 정책.** 세트는 읽기 편향입니다: aws-ecs는 `ALLOW_WRITE=false`로 실행되고, `awslabs.iam-mcp-server`는 `--allow-write` 없으면 읽기전용(기본값 — `uvx awslabs.iam-mcp-server@1.0.25 --help`로 확인)이므로 그 플래그를 절대 추가하지 마세요. 변경은 devops 에이전트의 plan → approval → execute 흐름에 속하며, 자동 승인 MCP 도구에 속하지 않습니다. `test/mcp-proxy.test.js`가 쓰기 플래그를 감지하면 빌드를 실패시킵니다.
>
> **버전 갱신.** 버전은 재현성을 위해 핀됩니다(떠다니는 `@latest`는 컨테이너 시작할 때마다 다시 resolve). 올리려면 `mcp-proxy/config.devops.json`을 수정한 뒤 `docker compose up -d --force-recreate devops-mcp-proxy`를 실행하세요.

## Opt-in 카탈로그 (`_disabled` — `mcpServers`로 복사해 활성화)

주요 항목 (전체는 `mcp-configs/mcp-servers.json`):

| 서버 | 전송 | 용도 |
|------|------|------|
| brave-search | stdio (`BRAVE_API_KEY`) | 독립 웹/로컬 검색 (exa 보완) |
| sentry | http (remote OAuth) | Sentry 에러/이슈 — 최초 사용 시 OAuth 승인 |
| time | stdio (uvx) | 현재 시각 + IANA 타임존 변환 |
| exa-web-search | stdio (`EXA_API_KEY`) | Exa 웹 검색/리서치 |
| vercel / railway | http / stdio | 배포/호스팅 |
| supabase / clickhouse | stdio / http | 데이터베이스 & 분석 |
| firecrawl | stdio (`FIRECRAWL_API_KEY`) | 웹 스크래핑/크롤링 |

> `brave-search`, `sentry`, `time`은 상위 Claude 하네스와 맞추려고 opt-in 카탈로그에 추가했습니다. 필요한 것만 활성화하고 활성 총합은 ~10개 미만으로 유지하세요.
