# MCP 서버 레퍼런스

큐레이션된 MCP(Model Context Protocol) 서버 카탈로그. 기준 출처: `mcp-configs/mcp-servers.json`.

- **CLI 티어**는 기본적으로 `mcp.json`을 생성하지 않습니다 — CLI 에이전트가 자체 `mcpServers`를 가집니다(예: devops 에이전트가 AWS/Terraform 서버를 임베드). 글로벌 `~/.kiro/settings/mcp.json`은 IDE 전용입니다.
- **IDE 티어**는 활성 워크로드와 매칭되는 general + Docker 서버를 `.kiro/settings/mcp.json`에 기록합니다.
- 컨텍스트 윈도 보호를 위해 **활성 서버는 ~10개 미만**으로 유지하세요.
- 시크릿은 `${VAR}` 환경변수 참조나 `YOUR_*_HERE` 플레이스홀더로 — 실제 토큰은 절대 커밋하지 않습니다.

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

## FinOps / 비용 (Docker, cloud 워크로드)

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
