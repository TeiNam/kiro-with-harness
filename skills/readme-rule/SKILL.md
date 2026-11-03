---
name: readme-rule
description: "README.md 를 새로 쓰거나 고칠 때(생성·업데이트·배지 추가·오픈소스 준비) 프로젝트 파일을 분석해 실제 쓰는 기술만 상단 배지 배너로 올린다. 후원 배지는 git remote owner 가 teinam 일 때만 붙인다."
origin: harness
workloads: [core]
---

# README Rule — 프로젝트 배지 배너

## 적용 시점

README.md 를 **새로 만들 때와 기존 README 를 고칠 때 모두** 적용한다.

1. README.md 생성 요청
2. README 업데이트 — 기능·설치법·의존성이 바뀌어 README 를 손볼 때 배지도 함께 다시 맞춘다
3. README 배지/배너 추가·정리 요청
4. 프로젝트 초기 설정·문서화
5. 오픈소스 프로젝트 준비

업데이트일 때는 기존 배지를 지우고 새로 쓰지 않는다. 아래 매핑으로 다시 계산한 집합과 비교해서
**빠진 배지는 추가하고, 더 이상 쓰지 않는 기술의 배지는 빼고, 버전이 바뀐 배지는 버전만 고친다.**
배지와 상관없는 본문은 손대지 않는다.

## 개요

프로젝트 소스 코드를 분석하여 README.md 상단의 **배지(badge) 배너**를 구성한다.
배지는 프로젝트에서 실제 사용 중인 기술 스택만 포함한다.

## 후원 배지 — 개인 레포에서만

Buy Me A Coffee 배지는 **레포 owner 가 본인 계정(`teinam`)일 때만** 붙인다.
모든 README 에 자동으로 넣으면 클라이언트·회사·외부 오픈소스 레포까지 개인 링크가 새어 나가기 때문이다.

```bash
git remote get-url origin   # github.com/teinam/<repo> 또는 github.com:teinam/<repo> 이면 개인 레포
```

owner 비교는 **대소문자를 무시한다** — GitHub 계정명은 대소문자를 구분하지 않고, 실제 remote 는 `TeiNam/...` 으로 찍힌다.

| 판정 | 처리 |
|------|------|
| origin owner 가 `teinam` | 기술 배지 줄 아래 빈 줄 1개를 두고 후원 배지를 붙인다 |
| owner 가 다르거나(조직·회사 레포) remote 가 없음 | 넣지 않는다. 이미 있으면 그대로 두고, 빼야 할 것 같으면 사용자에게 알린다 |
| 사용자가 명시적으로 넣으라고/빼라고 함 | 그 지시를 따른다 |

```markdown
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/teinam)
```

---

## 배지 배너 구조

배너는 항상 다음 순서로 구성한다:

```
[언어 배지] [프레임워크 배지] [DB 배지] [인프라 배지] [라이선스 배지]

[후원 배지]   ← 개인 레포일 때만
```

---

## 코드 분석 → 배지 매핑 규칙

README 를 생성하거나 업데이트할 때 반드시 프로젝트 파일을 분석하여 배지를 결정한다.

### 1단계: 프로젝트 파일 탐색

다음 파일들을 우선 확인한다:

| 파일 | 용도 |
|------|------|
| `pyproject.toml` | Python 의존성, 버전 |
| `requirements.txt` | Python 의존성 |
| `package.json` | Node.js 의존성, 버전 |
| `Pipfile` | Python 의존성 (pipenv) |
| `Cargo.toml` | Rust 의존성 |
| `go.mod` | Go 의존성 |
| `pom.xml` / `build.gradle` | Java 의존성 |
| `Dockerfile` / `docker-compose.yml` | Docker 사용 여부 |
| `*.tf` / `terraform/` | Terraform 사용 여부 |
| `.github/workflows/` | GitHub Actions |
| `LICENSE` / `LICENSE.md` | 라이선스 종류 |

### 2단계: 배지 카테고리별 매핑

#### 언어 (Language)

소스 코드 파일 확장자 및 설정 파일로 판별한다.

| 감지 조건 | 배지 |
|-----------|------|
| `*.py` 파일 존재 또는 `pyproject.toml` | `![Python](https://img.shields.io/badge/Python-{version}-blue.svg)` |
| `*.ts` / `*.tsx` 파일 존재 | `![TypeScript](https://img.shields.io/badge/TypeScript-{version}-blue.svg)` |
| `*.js` / `*.jsx` 파일 존재 (TS 없을 때) | `![JavaScript](https://img.shields.io/badge/JavaScript-ES{version}-yellow.svg)` |
| `*.go` 파일 존재 | `![Go](https://img.shields.io/badge/Go-{version}-00ADD8.svg)` |
| `*.rs` 파일 존재 | `![Rust](https://img.shields.io/badge/Rust-{version}-orange.svg)` |
| `*.java` 파일 존재 | `![Java](https://img.shields.io/badge/Java-{version}-red.svg)` |

**버전 탐지**: `pyproject.toml` 의 `python_requires`, `package.json` 의 `engines`, `go.mod` 의 모듈 버전 등에서 추출. 찾을 수 없으면 주요 버전만 표기 (예: `3.x`).

#### 프레임워크 (Framework)

의존성 파일에서 프레임워크를 감지한다.

| 감지 조건 (의존성 이름) | 배지 |
|------------------------|------|
| `fastapi` | `![FastAPI](https://img.shields.io/badge/FastAPI-{version}-009688.svg)` |
| `django` | `![Django](https://img.shields.io/badge/Django-{version}-092E20.svg)` |
| `flask` | `![Flask](https://img.shields.io/badge/Flask-{version}-000000.svg)` |
| `react` | `![React](https://img.shields.io/badge/React-{version}-61DAFB.svg)` |
| `next` | `![Next.js](https://img.shields.io/badge/Next.js-{version}-000000.svg)` |
| `vue` | `![Vue.js](https://img.shields.io/badge/Vue.js-{version}-4FC08D.svg)` |
| `express` | `![Express](https://img.shields.io/badge/Express-{version}-000000.svg)` |
| `spring-boot` | `![Spring Boot](https://img.shields.io/badge/Spring%20Boot-{version}-6DB33F.svg)` |

**버전 탐지**: 의존성 파일에서 명시된 버전을 사용. `^`, `~`, `>=` 등의 접두사는 제거하고 주요 버전(major.minor)만 표기한다.

#### 데이터베이스 (Database)

의존성 또는 설정 파일(docker-compose, .env 등)에서 감지한다.

| 감지 조건 | 배지 |
|-----------|------|
| `mysql`, `pymysql`, `mysqlclient`, `mysql` 이미지 | `![MySQL](https://img.shields.io/badge/MySQL-{version}-4479A1.svg)` |
| `psycopg2`, `asyncpg`, `postgres` 이미지 | `![PostgreSQL](https://img.shields.io/badge/PostgreSQL-{version}-336791.svg)` |
| `redis`, `aioredis`, `redis` 이미지 | `![Redis](https://img.shields.io/badge/Redis-{version}-DC382D.svg)` |
| `pymongo`, `motor`, `mongo` 이미지 | `![MongoDB](https://img.shields.io/badge/MongoDB-{version}-47A248.svg)` |
| `sqlalchemy` | `![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-{version}-D71F00.svg)` |
| `sqlite3` import 또는 `*.db` 파일 | `![SQLite](https://img.shields.io/badge/SQLite-3-003B57.svg)` |
| `oracledb`, `cx_Oracle` | `![Oracle](https://img.shields.io/badge/Oracle-{version}-F80000.svg)` |

**버전 탐지**: docker-compose 의 이미지 태그에서 추출 (예: `mysql:8.0` → `8.0`). 의존성에서만 감지 시 버전 생략 가능.

#### 인프라 (Infrastructure)

| 감지 조건 | 배지 |
|-----------|------|
| `Dockerfile` 또는 `docker-compose.yml` 존재 | `![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)` |
| `*.tf` 파일 존재 | `![Terraform](https://img.shields.io/badge/Terraform-IaC-7B42BC.svg)` |
| `.github/workflows/` 존재 | `![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-CI/CD-2088FF.svg)` |
| `kubernetes/`, `k8s/`, `*.yaml` (k8s 리소스) | `![Kubernetes](https://img.shields.io/badge/Kubernetes-Ready-326CE5.svg)` |
| AWS 관련 설정 (`aws-cdk`, `serverless`, `sam`) | `![AWS](https://img.shields.io/badge/AWS-Cloud-FF9900.svg)` |
| `nginx.conf` 또는 nginx 관련 설정 | `![Nginx](https://img.shields.io/badge/Nginx-Proxy-009639.svg)` |

#### 라이선스 (License)

| 감지 조건 | 배지 |
|-----------|------|
| `LICENSE` 파일 내 "MIT" | `![License](https://img.shields.io/badge/License-MIT-green.svg)` |
| `LICENSE` 파일 내 "Apache" | `![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)` |
| `LICENSE` 파일 내 "GPL" | `![License](https://img.shields.io/badge/License-GPL%20v3-blue.svg)` |
| LICENSE 파일 없음 | 라이선스 배지 생략 |

---

## 출력 형식

배지 배너는 README.md 의 **최상단** (제목 바로 아래)에 위치한다.

```markdown
# 프로젝트 이름

![Python](https://img.shields.io/badge/Python-3.13-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)
![MySQL](https://img.shields.io/badge/MySQL-8.0-4479A1.svg)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)
![License](https://img.shields.io/badge/License-MIT-green.svg)

## 개요
...
```

### 배치 규칙

1. 기술 배지들은 한 줄에 나열 (빈 줄 없이 연속)
2. 배지 줄 아래 **빈 줄 1개** 후 본문 시작
3. 배지가 너무 많으면 (6개 초과) 카테고리별로 줄바꿈 가능

배지를 쓴 뒤 각 배지마다 근거 파일(의존성·설정·LICENSE)을 다시 대조한다. 근거를 못 찾은 배지는 빼고, 버전이 근거와 다르면 고친 뒤 다시 대조한다.

---

## 주의사항

- **실제 사용 기술만 표시**: 프로젝트에서 감지되지 않는 기술의 배지는 포함하지 않는다.
- **버전은 가능한 한 구체적으로**: major.minor 수준까지 표기 (예: `3.13`, `0.115`).
- **후원 배지는 개인 레포에서만**: origin owner 가 `teinam` 이 아니면 넣지 않는다 (위 "후원 배지" 절).
- **shields.io 형식 준수**: 모든 배지는 `https://img.shields.io/badge/` 기반.
- **색상 일관성**: 각 기술의 공식 브랜드 컬러 사용 (위 매핑 테이블 참고).
