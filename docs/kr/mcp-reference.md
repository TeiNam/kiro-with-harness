# MCP 서버 레퍼런스

큐레이션된 MCP(Model Context Protocol) 서버 카탈로그. 기준 출처: `mcp-configs/mcp-servers.json`.

- **CLI 티어**는 기본적으로 `mcp.json`을 생성하지 않습니다 — CLI 에이전트가 자체 `mcpServers`를 가집니다(devops 에이전트는 아래의 온디맨드 stdio 정의를 내장). 글로벌 `~/.kiro/settings/mcp.json`은 IDE 전용입니다.
- **IDE 티어**는 활성 워크로드와 매칭되는 general + DevOps 서버를 `.kiro/settings/mcp.json`에 기록합니다.
- 컨텍스트 윈도 보호를 위해 **활성 서버는 ~10개 미만**으로 유지하세요.
- 시크릿은 `${VAR}` 환경변수 참조나 `YOUR_*_HERE` 플레이스홀더로 — 실제 토큰은 절대 커밋하지 않습니다.

## 서버 기동 방식

| 그룹 | 전송 | 수명 | 기동자 |
|------|------|------|--------|
| General (fetch, time, brave-search, exa, drawio, token-optimizer, obsidian) | stdio, 또는 `--mcp-proxy` 사용 시 HTTP(로컬 프록시 경유) | opt-in 시 프록시 상주 | 클라이언트, 또는 `:9090`의 `mcp-proxy` 컨테이너 |
| DevOps / FinOps (terraform + AWS 서버들) | **stdio, 온디맨드** | 도구 사용 중에만 프로세스 존속 | 클라이언트 — 호스트 `uvx`, 또는 terraform용 `docker run -i --rm` |

DevOps 서버는 **아무것도 상주하지 않습니다**: 도구를 사용 중이 아니면 `docker ps`에 컨테이너 없고, 보안해야 할 HTTP 엔드포인트도 없습니다. 필요한 것: 호스트의 `uv` (`brew install uv`), 그리고 terraform만 Docker.

### 왜 프록시가 아니라 stdio인가

과거 버전은 `:9092`의 상주 프록시 컨테이너를 경유했습니다. 그것은 콜드스타트 문제를 '우회'하기 위해 존재했지, **해결**하기 위해서가 아니었습니다: 옛날 백엔드는 호출당 버전 핀 없는 `docker run`이었고, **첫 이미지 pull이 14~20초 걸려** MCP 초기화 타임아웃을 초과했으므로 *모든* devops MCP 서버가 한 번에 실패했습니다.

버전을 핀하고 호스트 `uvx`로 옮기면 pull이 완전히 사라집니다. 측정된 warm-cache handshake 지연:

| 서버 | 지연 |
|------|------|
| terraform (`docker run --rm`, 버전 핀 이미지) | 0.47초 |
| aws-documentation | 0.58초 |
| cloudwatch | 1.6초 |
| aws-pricing | 2.0초 |
| aws-iam | 2.1초 |
| aws-billing-cost-management | 3.1초 |
| aws-ecs | 4.9초 |

따라서 프록시는 불필요했습니다. 이를 제거하면서 `~/.aws`를 마운트한 인증 없는 `:9092` 엔드포인트도 사라졌고, SSO 토큰 새로고침(`aws sso login --profile <name>`)이 읽기전용 마운트에 막히지 않고 즉시 반영된다는 뜻입니다.

> **Cold start.** 버전이 핀된 것의 첫 실행은 uv 캐시로 다운로드됩니다(최악의 경우 ~30초). 첫 devops 호출이 빠르기를 원하면 미리 warm up하세요:
> ```bash
> for p in awslabs.aws-documentation-mcp-server@1.1.30 awslabs.cloudwatch-mcp-server@0.1.8 \
>          awslabs.aws-pricing-mcp-server@1.0.34 awslabs.billing-cost-management-mcp-server@0.0.33 \
>          awslabs.iam-mcp-server@1.0.25; do uvx "$p" --help >/dev/null 2>&1; done
> docker pull hashicorp/terraform-mcp-server:1.0.0
> ```

## 범용 프록시(`--mcp-proxy`, IDE 계층)

로컬 [mcp-proxy](https://github.com/tbxark/mcp-proxy) 인스턴스(`mcp-proxy/`에 번들)를 실행하면 범용 서버들을 하나의 컨테이너에 집중화하므로, 클라이언트가 각각 중복을 띄우지 않습니다. `mcp.json` 항목은 `{"type":"http","url":"http://localhost:9090/<server>/mcp"}`로 변환됩니다.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
cd mcp-proxy && docker compose up -d mcp-proxy   # 수동 기동
```

설치기는 자동 보장합니다: `docker ps`로 확인해 컨테이너가 없으면 `docker compose up -d mcp-proxy`를 실행하고, 이미 떠 있으면 스킵합니다. 활성 워크로드에 맞는 백엔드만 담은 **`config.generated.json`**도 생성하므로 프록시가 "필요한 것만" 서빙합니다. Docker 미설치, 데몬 미실행, `--dry-run`은 모두 graceful하게 넘어갑니다.

| 서버 | 워크로드 |
|------|----------|
| fetch, time | (범용, 항상) |
| brave-search, exa | writing |
| drawio | architecture, writing |
| token-optimizer | ai-agent, ai |
| obsidian | obsidian |

프록시로 나가는 서버는 stdio 출력에서 제외됩니다(중복 방지). 프록시는 `127.0.0.1`로만 바인드되며 인증 없습니다 — 바인딩을 확대하지 마세요.

### 프록시 밖에 남는 것

- **Kiro 내장** — github, context7, playwright, memory, sequential-thinking. Kiro가 자체 제공하므로 프록시 URL로도 넣지 않습니다(프록시 자체는 비-Kiro 클라이언트용으로 github/context7 백엔드를 계속 제공).
- **DevOps / AWS** — 위에서 설명한 대로 온디맨드 stdio.
- **범용 AWS API** — 이를 위한 MCP 서버는 없습니다. `awslabs.core-mcp-server`(구 `aws-core` 항목)는 상위에서 yanked("load individual MCPs"로 이유)되었고, 그 권장 대체 `awslabs.aws-api-mcp-server`는 Kiro 내장 `use_aws` 도구와 중복됩니다. 대신 `use_aws` 또는 `aws` CLI를 사용하세요 — 그러면 변경도 devops 에이전트의 plan → approval → execute 흐름에 머물게 됩니다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저). 클라이언트가 직접 시작합니다. 하네스는 관리하지 않습니다.

> `--mcp-proxy`는 IDE 티어에만 적용됩니다(CLI 티어는 mcp.json을 생성하지 않음). 활성 서버 총합을 ~10개 미만으로 유지하세요.

## Kiro 내장 (카탈로그 미포함)

Kiro가 자체 제공하므로 하네스는 나열하지 않습니다: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## 범용 서버 (워크로드 태그)

| 서버 | 전송 | 워크로드 | 용도 |
|------|------|----------|------|
| cloudflare-docs | http | cloud | Cloudflare 문서 검색 |
| mcpydoc | stdio (기본 비활성) | python | Python 패키지 문서 + 코드 분석 (venv 자동 감지) |

## DevOps / 인프라 (온디맨드 stdio, cloud 워크로드 — devops 에이전트 사용)

백엔드는 버전 핀된 **AWS 공식 `awslabs` 서버**입니다. 초기 릴리스는 서드파티 `acuvity/*` 미러를 썼으나, 이들은 같은 awslabs 소스를 `minibridge` 프로세스로 감싸 HTTP 기본값이고 stdio 위에서는 불안정했습니다.

| 서버 | 백엔드 | 용도 |
|------|--------|------|
| terraform | `docker run -i --rm hashicorp/terraform-mcp-server:1.0.0` | Terraform Registry: provider/module 문서 + 버전 |
| aws-documentation | `uvx awslabs.aws-documentation-mcp-server@1.1.30` | AWS 문서 검색 + 추천 |
| cloudwatch | `uvx awslabs.cloudwatch-mcp-server@0.1.8` | 메트릭, 알람, Logs Insights |
| aws-ecs | `uvx --from awslabs-ecs-mcp-server@0.1.34 ecs-mcp-server` | ECS 검사 (`ALLOW_WRITE=false`) |
| aws-iam | `uvx awslabs.iam-mcp-server@1.0.25` | IAM 사용자/역할/정책 (민감 — 읽기전용, 기본 비활성) |

## FinOps / 비용 (온디맨드 stdio, finops 워크로드)

| 서버 | 백엔드 | 용도 |
|------|--------|------|
| aws-pricing | `uvx awslabs.aws-pricing-mcp-server@1.0.34` | 배포 전 비용 추정 (Price List API) |
| aws-billing-cost-management | `uvx awslabs.billing-cost-management-mcp-server@0.0.33` | 실제 지출, 예산, Cost Explorer, 최적화 |

> **자격증명.** 이들은 호스트 프로세스로 실행되므로 `~/.aws`를 직접 읽고, `AWS_PROFILE` / `AWS_REGION`은 셸에서 옵니다. `aws sso login --profile <name>`이 즉시 반영됩니다. terraform, aws-documentation, aws-pricing은 자격증명이 불필요합니다.
>
> **쓰기 정책.** 세트는 읽기 편향입니다: aws-ecs는 `ALLOW_WRITE=false`로 실행되고, `awslabs.iam-mcp-server`는 `--allow-write` 없으면 읽기전용(기본값 — `uvx awslabs.iam-mcp-server@1.0.25 --help`로 확인)이므로 그 플래그를 절대 추가하지 마세요. 변경은 devops 에이전트의 plan → approval → execute 흐름에 속하며, 자동 승인 MCP 도구에 속하지 않습니다. `test/mcp-proxy.test.js`가 쓰기 플래그를 감지하면 빌드를 실패시킵니다.
>
> **버전 갱신.** 버전은 재현성을 위해 핀됩니다 — 떠다니는 `@latest`는 매번 시작할 때마다 다시 resolve되므로, 바로 이것이 콜드스타트 실패를 야기했습니다. 올리려면 `mcp-configs/mcp-servers.json`의 `mcpServersDevops.servers`를 수정한 뒤 `agents/cli/global/devops.json`에 미러하고 설치기를 다시 실행하세요. 두 파일이 일치하도록 보장하는 테스트가 있습니다.

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

> `brave-search`, `sentry`, `time`은 상위 Claude 하네스와 맞추기 위해 opt-in 카탈로그에 추가했습니다. 필요한 것만 활성화하고 활성 총합은 ~10개 미만으로 유지하세요.
