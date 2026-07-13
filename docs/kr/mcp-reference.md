# MCP 서버 레퍼런스

큐레이션된 MCP(Model Context Protocol) 서버 카탈로그. 기준 출처: `mcp-configs/mcp-servers.json`.

- **CLI 티어**는 기본적으로 `mcp.json`을 생성하지 않습니다 — CLI 에이전트가 자체 `mcpServers`를 가집니다(예: devops 에이전트가 AWS/Terraform 서버를 임베드). 글로벌 `~/.kiro/settings/mcp.json`은 IDE 전용입니다.
- **IDE 티어**는 활성 워크로드와 매칭되는 general + Docker 서버를 `.kiro/settings/mcp.json`에 기록합니다.
- 컨텍스트 윈도 보호를 위해 **활성 서버는 ~10개 미만**으로 유지하세요.
- 시크릿은 `${VAR}` 환경변수 참조나 `YOUR_*_HERE` 플레이스홀더로 — 실제 토큰은 절대 커밋하지 않습니다.

## MCP Proxy 경유 (`--mcp-proxy`)

로컬 mcp-proxy(tbxark/mcp-proxy, 저장소 `mcp-proxy/`에 번들)를 띄우면 여러 MCP 서버를 컨테이너 한 곳에서 중앙 관리하고, 클라이언트는 `http://localhost:9090/<서버>/mcp` 하나만 바라봅니다. 여러 클라이언트가 같은 서버 프로세스를 중복 기동하지 않아 리소스를 절약할 수 있습니다. 설치와 API 키 설정은 `mcp-proxy/README.md`를 참고하세요.

IDE 설치에 `--mcp-proxy`를 주면 생성되는 `.kiro/settings/mcp.json`이 프록시 가능한 서버를 직접 stdio/docker 대신 `{"type":"http","url":"http://localhost:9090/<서버>/mcp"}` 형태로 기록합니다.

```bash
node install.js ide --workload=cloud,writing --mcp-proxy
```

### 프록시로 들어가는 것 (프록시 가능 — 활성 워크로드 매칭 시)

| 서버 | 워크로드 |
|------|----------|
| fetch, time | (범용, 항상) |
| brave-search, exa | writing |
| drawio | architecture, writing |
| token-optimizer | ai-agent, ai |
| obsidian | obsidian |
| aws-documentation, terraform | cloud |

프록시로 나가는 서버는 general/docker 출력에서 제외됩니다(중복 방지). 예를 들어 cloud 워크로드에서 terraform과 aws-documentation은 docker run이 아닌 프록시 URL로 나갑니다.

### 프록시 밖에 남는 것 (프록시 불가)

- **Kiro 내장** — github, context7, playwright, memory, sequential-thinking. Kiro가 자체 제공하므로 프록시 URL로도 넣지 않습니다(프록시 자체는 비-Kiro 클라이언트용으로 github/context7 백엔드를 계속 제공).
- **자격증명 필요 AWS docker** — aws-core, cloudwatch, aws-ecs, aws-iam, aws-pricing, aws-billing-cost-management. 세션별 AWS 자격증명(AWS_PROFILE/키, SSO 임시 토큰)을 공유 프록시에 중앙화할 수 없어 그대로 docker run으로 남고 devops 에이전트가 직접 띄웁니다.
- **호스트 특정 로컬 stdio** — GitKraken(로컬 바이너리 경로), playwright(로컬 브라우저). 클라이언트가 직접 띄웁니다. 하네스는 관리하지 않습니다.

> `--mcp-proxy`는 IDE 티어에만 적용됩니다(CLI 티어는 mcp.json을 생성하지 않음). 프록시가 안 떠 있으면 프록시 URL은 연결되지 않으므로 먼저 `cd mcp-proxy && docker compose up -d`로 기동하세요. 활성 서버 총합은 ~10개 미만 유지를 권장합니다.

## Kiro 내장 (카탈로그 미포함)

Kiro가 자체 제공하므로 하네스는 나열하지 않습니다: `memory`, `sequential-thinking`, `context7`, `github`, `playwright`.

## General 서버 (워크로드 태그)

| 서버 | 전송 | 워크로드 | 용도 |
|------|------|----------|------|
| cloudflare-docs | http | cloud | Cloudflare 문서 검색 |
| mcpydoc | stdio (기본 비활성) | python | Python 패키지 문서 + 코드 분석 (venv 자동 감지) |

## DevOps / 인프라 (Docker, cloud 워크로드 — devops 에이전트 사용)

| 서버 | 이미지 | 용도 |
|------|--------|------|
| terraform | hashicorp/terraform-mcp-server | Terraform Registry: provider/module 문서 + 버전 |
| aws-documentation | acuvity/mcp-server-aws-documentation | AWS 문서 검색 + 추천 |
| aws-core | acuvity/mcp-server-aws-core | 핵심 AWS API 작업 (S3, EC2, IAM, …) |
| cloudwatch | mcp/cloudwatch-mcp-server | 메트릭, 알람, Logs Insights |
| aws-ecs | acuvity/mcp-server-aws-ecs | ECS 배포/트러블슈팅 |
| aws-iam | mcp/iam-mcp-server | IAM 사용자/역할/정책 (민감 — 작업별 활성화) |

## FinOps / 비용 (Docker, finops 워크로드)

| 서버 | 이미지 | 용도 |
|------|--------|------|
| aws-pricing | mcp/aws-pricing-mcp-server | 배포 전 비용 추정 (Price List API) |
| aws-billing-cost-management | mcp/billing-cost-management-mcp-server | 실제 지출, 예산, Cost Explorer, 최적화 |

> 최초 사용 전 `docker pull <image>`. AWS 서버는 env(`AWS_REGION`/`AWS_PROFILE` + 키)나 마운트된 `~/.aws`로 자격증명이 필요합니다.

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
