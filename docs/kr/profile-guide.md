# 워크로드 가이드

> 이 문서는 기존 프로파일 기반 모델을 대체합니다. 설치기는 이제 명명된 프로파일이 아니라
> **티어 × 워크로드**로 자산을 선택합니다. 전체 레퍼런스는 [README](../../README-KR.md)를 참고하세요.

## 모델

```
node install.js <cli|ide> [--scope global|workspace] [--workload a,b|all] [--review-backend kiro|claude] [--dry-run]
```

- **티어(tier)** — `cli`(`kiro-cli chat`용: JSON 에이전트, 에이전트 JSON 내부 훅, `skill://` 스킬) 또는 `ide`(Kiro IDE용: Markdown 에이전트, `.kiro/hooks/*.json` v1 JSON 훅, 스티어링).
- **스코프(scope)** — `global`(`~/.kiro`, CLI 기본) 또는 `workspace`(프로젝트 `.kiro`, IDE 기본).
- **워크로드(workload)** — 오늘 무슨 작업을 하는가. `core`는 항상 설치되고, 필요한 것을 추가합니다.

## 워크로드 목록

`core`는 항상 포함됩니다. 추가 워크로드를 이름으로 선택합니다(콤마 구분, 또는 `all`로 `lab` 제외 전체).

| 분류 | 워크로드 |
|------|----------|
| 언어 | python, rust, go, java, javascript, typescript, node, kotlin, cpp, csharp, php, perl, swift |
| 특화 | ai-agent, ai, cloud, frontend, mobile, python-data |
| 데이터베이스 | mysql, postgres, mongodb, dynamodb |
| 기타 | architecture, writing, domain, obsidian |
| 특수 | lab (숨김; `--workload lab`로만 설치) |

언어는 함께 쓰는 경우가 드물어 언어별로 분리했습니다 — `rust`를 골라도 `go` 자산은 끌려오지 않습니다. 자산은 `workloads:` frontmatter가 활성 집합과 교집합일 때 설치됩니다.

## 예시

```bash
# Rust 백엔드 서비스, Kiro 네이티브 리뷰
node install.js cli --scope workspace --workload rust --review-backend kiro

# 클라우드 / IaC 작업 (devops + FinOps MCP, Terraform, AWS 스킬)
node install.js cli --scope global --workload cloud

# IDE 프로젝트: TypeScript + 프론트엔드
node install.js ide --workload typescript,frontend

# 전체 (lab 제외)
node install.js cli --scope global --workload all
```

## 리뷰 백엔드

`--review-backend`는 코드 리뷰에만 적용됩니다:

- `claude`(기본) — 리뷰를 `peer-reviewer`로 라우팅하여 터미널 Claude Code(`claude -p`)로 교차 모델 검토를 받습니다.
- `kiro` — 네이티브 Kiro 리뷰어 에이전트(code-reviewer, security-reviewer, 언어별 `*-reviewer`)를 설치합니다.

프로그래밍·빌드·오케스트레이터 에이전트는 이 토글과 무관하게 항상 Kiro 네이티브입니다.

## 글로벌 ↔ 워크스페이스 상속

워크스페이스 설치는 글로벌에 이미 설치된 파일과 바이트 단위로 동일한 파일을 상속(스킵)하므로, `--scope workspace`는 글로벌 베이스라인과 다른 것만 추가합니다. `node install.js --status --scope global`로 글로벌 매니페스트를 확인하세요.

## 프로파일에서 마이그레이션

| 구 프로파일 명령 | 새 대응 |
|------------------|---------|
| `install.js global` | `install.js cli --scope global --workload core` |
| `install.js developer` | `install.js cli --scope workspace --workload <사용 언어>` |
| `install.js backend` | `install.js cli --scope workspace --workload python,cloud` 등 |
| `install.js frontend` | `install.js ide --workload typescript,frontend` |
| `install.js full` | `install.js cli --scope global --workload all` |
