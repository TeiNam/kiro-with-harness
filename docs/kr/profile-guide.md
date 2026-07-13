# 설치 가이드

> 이 문서는 기존 프로파일 기반 모델을 대체합니다. 설치기는 이제 명명된 프로파일이 아니라
> **티어 × 카테고리 트리**(대분류 → 중분류 → 소분류)로 자산을 선택하며, 호환성을 위해 저수준
> **워크로드** 표면을 유지합니다. 전체 레퍼런스는 [README](../../README-KR.md)를 참고하세요.

## 모델

```
node install.js <cli|ide> [--scope global|workspace] [--category <list>] [--<category>=<list>] [--<category>-<sub>=<list>] [--workload a,b|all] [--review-backend kiro|claude|cross] [--dry-run]
```

- **티어(tier)** — `cli`(`kiro-cli chat`용: JSON 에이전트, 에이전트 JSON 내부 훅, `skill://` 스킬) 또는 `ide`(Kiro IDE용: Markdown 에이전트, `.kiro/hooks/*.json` v1 JSON 훅, 스티어링).
- **스코프(scope)** — `global`(`~/.kiro`, CLI 기본) 또는 `workspace`(프로젝트 `.kiro`, IDE 기본).
- **카테고리(category)** — 대분류(dev, cloud, ai, data, research, writing) + 중분류 드릴다운(--dev=rust,python) + 소분류 옵션(--dev-apple=core). `core`는 항상 설치되고, 미선택 레벨은 모든 하위 옵션을 기본값으로 사용합니다. 하위 호환성을 위해 `--workload`도 저수준 워크로드 키 직접 지정으로 남아 있습니다.

## 카테고리

**카테고리 트리**로 선택합니다: 대분류(dev, cloud, ai, data, research, writing) → 중분류 → 소분류(선택). `core`는 항상 설치됩니다.

| 대분류 | 중분류 | 소분류 | 매핑 워크로드 |
|--------|--------|--------|------|
| **dev** | frontend | — | frontend, typescript |
| | python | — | python |
| | rust | — | rust |
| | nodejs | — | node, javascript |
| | go | — | go |
| | java | — | java |
| | kotlin | — | kotlin |
| | cpp | — | cpp |
| | csharp | — | csharp |
| | php | — | php |
| | perl | — | perl |
| | apple | core / platform / product | swift |
| | mobile | — | mobile |
| | architecture | — | architecture |
| | domain | — | domain |
| | obsidian | — | obsidian, frontend |
| | chrome | — | frontend |
| | claude | — | ai-agent |
| **cloud** | infra | — | cloud |
| | finops | — | finops |
| | integration | — | cloud |
| **ai** | llm | — | ai |
| | agent | — | ai-agent |
| **data** | duckdb | — | python-data |
| | python-data | — | python-data, ai |
| | aws-analytics | — | cloud, python-data |
| | mysql | — | mysql |
| | postgres | — | postgres |
| | mongodb | — | mongodb |
| | dynamodb | — | dynamodb |
| | aws-rds | — | mysql, postgres |
| **research** | websearch | — | research |
| | report | — | report |
| **writing** | general | — | writing |
| | social | voice / content / visual | writing |

**선택 규칙:**
- `--category=dev,cloud` — 대분류 전체 선택.
- `--dev=rust,python` — 중분류 선택(dev 자동 활성화).
- `--dev-apple=core` — 소분류 선택(dev·apple 자동 활성화).
- 미선택 레벨은 모든 하위 옵션 기본값.
- `--workload=<키,...>` — 저수준 워크로드 키 직접 지정(레거시 표면, 카테고리와 합집합).
- `lab`은 숨김; `--workload=lab`으로만 옵트인.

## 예시

```bash
# Rust 백엔드, Kiro 네이티브 리뷰, 워크스페이스
node install.js cli --scope workspace --dev=rust --review-backend kiro

# 클라우드 / IaC 작업 (DevOps + FinOps + 데이터 엔지니어링)
node install.js cli --scope global --category=cloud

# IDE 프로젝트: TypeScript + 프론트엔드
node install.js ide --dev=frontend,nodejs

# 데이터 엔지니어링: PostgreSQL + AWS 분석
node install.js cli --scope workspace --data=postgres,aws-analytics

# 여러 전문 영역 조합
node install.js ide --category=dev,cloud --dev=python --review-backend claude

# 저수준 워크로드 직접 지정 (레거시, 하위 호환성)
node install.js cli --scope global --workload rust,postgres,cloud
```

## 리뷰 백엔드

`--review-backend`는 코드 리뷰에만 적용됩니다:

- `claude`(기본) — 리뷰를 `peer-reviewer`로 라우팅하여 터미널 Claude Code(`claude -p`)로 교차 모델 검토를 받습니다(Kiro + Claude, 2-way).
- `cross` — `claude`와 동일하게 라우팅하되, `peer-reviewer`가 Claude Code(`claude -p`)와 Codex CLI(`codex`) **양쪽**을 모아 Kiro + Claude + Codex 3-way로 종합하고, 온디맨드 `cross-review.sh`(`bash .kiro/hooks/cross-review.sh`)를 설치합니다. 자동 훅이 아닌 선택 실행이며, 각 외부 CLI는 없으면 graceful하게 건너뜁니다.
- `kiro` — 네이티브 Kiro 리뷰어 에이전트(code-reviewer, security-reviewer, 언어별 `*-reviewer`)를 설치합니다.

프로그래밍·빌드·오케스트레이터 에이전트는 이 토글과 무관하게 항상 Kiro 네이티브입니다.

## 글로벌 ↔ 워크스페이스 상속

워크스페이스 설치는 글로벌에 이미 설치된 파일과 바이트 단위로 동일한 파일을 상속(스킵)하므로, `--scope workspace`는 글로벌 베이스라인과 다른 것만 추가합니다. `node install.js --status --scope global`로 글로벌 매니페스트를 확인하세요.

## 프로파일에서 마이그레이션

| 구 프로파일 | 새 대응 |
|------------|---------|
| `install.js global` | `install.js cli --scope global --category=core` |
| `install.js developer` | `install.js cli --scope workspace --dev=<사용 언어>` |
| `install.js backend` | `install.js cli --scope workspace --category=dev --dev=rust,python,go` |
| `install.js frontend` | `install.js ide --dev=frontend` |
| `install.js full` | `install.js cli --scope global --category=dev,cloud,ai,data,research,writing` |
