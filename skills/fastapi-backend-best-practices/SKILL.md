---
name: fastapi-backend-best-practices
description: >
  Best practices guide for FastAPI asynchronous backend development. Includes project structure, async patterns, domain modeling (CRUD/CQRS/Event-Driven/Saga), API design, testing, security, and deployment. Database implementation is delegated to a separate DB skill, and this skill provides DB-agnostic patterns and interfaces.

  Use this skill in the following situations:
  - FastAPI project creation, design, code review, and refactoring requests
  - Questions related to Python async backend API development
  - Pydantic modeling, domain model design, Repository interface design
  - Keywords such as "FastAPI", "backend API", "async server", "async pattern"
  - Microservices, CQRS, Event-Driven Architecture design
  - API Authentication/Authorization, middleware, error handling, performance optimization
  - pytest-asyncio based testing, Docker deployment
metadata:
  author: tei
  version: "2.0.0"
origin: harness
workloads: [python]
---

# FastAPI Backend Best Practices

## Overview

A practical guide for Async-first FastAPI backend development.
All code is async/await based, choosing appropriate modeling patterns according to business complexity.

## Reference Guide

Every reference file is linked here directly — open only the one the current step needs.

### Project structure

| File | Content | When to read |
|------|---------|--------------|
| `project-structure/project-layout.md` | Directory layout | Starting a new project |
| `project-structure/vertical-slice-vs-layered.md` | Feature slices vs layers | Choosing or refactoring structure |
| `project-structure/pydantic-settings-config.md` | `pydantic-settings` config | Env/config handling |
| `project-structure/lifespan-startup-shutdown-hook.md` | Lifespan startup/shutdown | Pools, clients, warmup |
| `project-structure/dependency-injection-pattern.md` | `Depends` wiring | Service/repository injection |
| `project-structure/structlog-config.md` | structlog setup | Logging |
| `project-structure/pyproject-toml-fastapi-project.md` | pyproject.toml | Dependencies, ruff, mypy, pytest config |

### Async patterns

| File | Content | When to read |
|------|---------|--------------|
| `async-patterns/basic-principles.md` | async/await ground rules | Any async handler |
| `async-patterns/concurrency-control.md` | gather, semaphores, limits | Fan-out, throttling |
| `async-patterns/background-tasks.md` | BackgroundTasks vs task queues | Work after the response |
| `async-patterns/streaming-responses.md` | SSE / WebSocket / streaming | Streaming output |
| `async-patterns/external-api-calls.md` | httpx client, retries, timeouts | Calling other services |
| `async-patterns/blocking-code.md` | `to_thread`, sync libraries | Sync I/O or CPU work |
| `async-patterns/graceful-shutdown.md` | Draining on shutdown | Deploy/restart safety |

### Domain modeling

Start with the simplest pattern and evolve it as complexity grows; patterns compose (e.g. CRUD + an event to notify afterwards).

| File | Pattern — use when | When to read |
|------|--------------------|--------------|
| `domain-modeling/crud.md` | Repository + Service — simple CRUD (e.g. config) | Default starting point |
| `domain-modeling/cqrs.md` | CQRS — reads ≫ writes (dashboards) | Separate read/write models |
| `domain-modeling/event-driven.md` | Event-Driven — loose inter-service coupling | Publishing/consuming events |
| `domain-modeling/saga.md` | Saga — distributed transactions | Multi-service consistency |
| `domain-modeling/ddd.md` | DDD Aggregate — complex business rules | Invariants, aggregates |
| `domain-modeling/pydantic-patterns.md` | Common Pydantic modeling | Any schema design |

### API design

| File | Content | When to read |
|------|---------|--------------|
| `api-design/router-structure.md` | Router organization | Adding endpoints |
| `api-design/error-handling.md` | Domain → HTTP error mapping | Exception handlers |
| `api-design/pagination.md` | Offset/cursor pagination | List endpoints |
| `api-design/middleware.md` | Middleware | Cross-cutting request handling |
| `api-design/api-versioning.md` | Versioning | Breaking API changes |
| `api-design/standardized-responses.md` | Response envelopes | Response shape |
| `api-design/openapi-documentation.md` | Tags, summaries, auth wiring, OpenAPI contract tests | Every new router (see Core Principle 5) |

### Security

Route-level auth discipline (router-level `dependencies=[Security(...)]`, `Security` not `Depends`) lives in `api-design/openapi-documentation.md` §4; the files below cover token issuing/verification and RBAC *implementation*.

| File | Content | When to read |
|------|---------|--------------|
| `security/jwt-authentication.md` | JWT issue/verify | Token auth |
| `security/oauth2-password-hashing.md` | OAuth2 flow, password hashing | Login, credentials |
| `security/rbac-authorization.md` | Role-based authorization | Permission checks |
| `security/rate-limiting.md` | Rate limiting | Abuse protection |
| `security/security-headers-cors.md` | Security headers, CORS | Browser-facing APIs |
| `security/input-validation-defense.md` | Input validation & defense | Untrusted input |

### Testing

| File | Content | When to read |
|------|---------|--------------|
| `testing/test-configuration.md` | pytest / pytest-asyncio config | Setting up tests |
| `testing/api-integration-testing.md` | httpx AsyncClient integration tests | Endpoint tests |
| `testing/service-unit-testing.md` | Service unit tests, mocking | Business logic tests |
| `testing/factory-pattern.md` | Test data factories | Fixtures and test data |
| `testing/async-testing-patterns.md` | Async test patterns | Async edge cases |

### Deployment

| File | Content | When to read |
|------|---------|--------------|
| `deployment/docker-build.md` | Dockerfile build | Containerizing |
| `deployment/uvicorn-tuning.md` | Workers, timeouts | Performance tuning |
| `deployment/healthcheck.md` | Health/readiness endpoints | Orchestrator probes |
| `deployment/monitoring.md` | Metrics, tracing | Operations |
| `deployment/docker-compose.md` | Local compose stack | Local/dev environment |

> **Mounting DB Skill**: Database implementations (ORM, drivers, migrations, query optimization) rely on mounting a separate DB skill. This skill only provides DB-agnostic Repository Protocols and domain patterns.

## Core Principles

### 1. Async-First
```python
# ✅ Async-first
async def get_users(repo: UserRepository) -> list[User]:
    return await repo.get_list()

# ❌ Calling sync code directly in an async handler
def get_users_sync(repo):  # Blocks the event loop
    return repo.get_list_sync()
```

### 2. Pattern Selection based on Business Complexity

```
Simple CRUD          → Repository + Service (domain-modeling/crud.md)
Read/Write Sep.      → CQRS (domain-modeling/cqrs.md)
Event Couplings      → Event-Driven (domain-modeling/event-driven.md)
Distributed Tx       → Saga (domain-modeling/saga.md)
Complex Domain       → DDD Aggregate (domain-modeling/ddd.md)
```

### 3. Layered Architecture
```
Router (API)     → Request/Response transformation, validation
Service          → Business logic, orchestration
Repository       → Data access abstraction (Protocol based)
Domain Model     → Pydantic schemas
Infrastructure   → DB implementation, Cache, External API (Provided by DB skill)
```

### 4. Dependency Injection
```python
from fastapi import Depends
from typing import Protocol


class UserRepository(Protocol):
    async def get_by_id(self, user_id: int) -> User | None: ...
    async def get_list(self, *, offset: int, limit: int) -> tuple[list[User], int]: ...
    async def create(self, data: UserCreate) -> User: ...


# DB implementation varies by the mounted DB skill
# e.g., PostgresUserRepository, MongoUserRepository, DynamoUserRepository

async def get_user_service(
    repo: UserRepository = Depends(get_user_repository),  # Implementation injected
    cache: Redis = Depends(get_redis),
) -> UserService:
    return UserService(repo, cache)

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    return await service.get_by_id(user_id)
```

### 5. 문서와 인증은 라우터를 만들 때 함께 박는다

Swagger 정리와 인증 배선을 "나중에" 로 미루면 반드시 빠진다. 라우터를 선언하는 순간 셋을 같이 쓴다.

```python
router = APIRouter(
    prefix="/orders",
    tags=["Orders"],                            # 그룹은 라우터가 정한다(라우트에서 반복 금지)
    dependencies=[Security(get_current_user)],  # 보호는 라우터 레벨 — 신규 라우트가 상속한다
    responses={401: {"model": ErrorResponse, "description": "인증 필요"}},
)

@router.post("", status_code=201, summary="주문 생성", response_model=OrderResponse)
async def create_order(...): ...               # summary·response_model 은 라우트마다 필수
```

- **`Depends` 가 아니라 `Security`** — `Depends` 는 검증은 하지만 OpenAPI 의 `security` 로
  올라가지 않아 스펙과 Swagger 가 무인증처럼 보인다.
- **개별 라우트에만 인증을 붙이지 않는다** — 나중에 추가된 형제 라우트가 무인증으로 열린다.
- 기본은 잠그고 공개만 뚫는다(`/auth/login`·`/health`). 반대로 하면 새 라우트가 기본 노출된다.
- **이걸 잊지 않는 방법은 테스트다**: OpenAPI 스펙을 순회해 `summary`·`tags` 누락과
  허용 목록에 없는 무인증 라우트를 실패시킨다 → `api-design/openapi-documentation.md` §5.

## Coding Conventions

### Type Hinting (Required)
Specify parameter types and return types for all functions.

### Logging (No pure prints)
```python
import structlog
logger = structlog.get_logger(__name__)
```

### Exception Handling
```python
# ✅ Domain Exception → HTTP Exception Translation
try:
    user = await service.get_by_id(user_id)
except UserNotFoundError:
    raise HTTPException(status_code=404, detail="User not found")

# ❌ Ignoring exceptions
try:
    user = await service.get_by_id(user_id)
except Exception:
    pass
```

### Naming Conventions
- Module: `snake_case.py`
- Class: `PascalCase`
- Function/Variable: `snake_case`
- Constant: `UPPER_SNAKE_CASE`
- Router Path: `kebab-case` (`/user-profiles`)
- Pydantic Model: `{Entity}{Action}` (`UserCreate`, `OrderResponse`)

## Technology Stack

```
Framework:  FastAPI, uvicorn
Validation: Pydantic v2
HTTP:       httpx (async)
Cache:      Redis (aioredis)
Task:       Celery / ARQ / SAQ
Testing:    pytest, pytest-asyncio, httpx
Logging:    structlog
Linting:    ruff, mypy
DB:         Mount separate DB skill (PostgreSQL, MongoDB, DynamoDB, etc.)
```

## Strict Prohibitions
1. Calling sync I/O directly in an async handler → Use async drivers or `to_thread`
2. Omitting type hints → Use explicit type declarations
3. Ignoring exceptions (`try-except-pass`) → Handle exceptions appropriately
4. `print` debugging → Use `structlog`
5. Writing business logic directly in the router → Isolate in the Service layer
6. Exposing DB implementation in Repository → Abstract with Protocol interfaces
7. Hardcoded configuration values → Use `pydantic-settings`

## Development Workflow
1. Requirements → Pattern Selection (Domain modeling table above)
2. Project Structure Setup (`project-structure/project-layout.md`)
3. Implement in order: Domain Model → Repository → Service → Router
4. Write Tests (`testing/test-configuration.md`)
5. Security Audit (Security table above)
6. Deployment (`deployment/docker-build.md`)

If tests (including the OpenAPI auth/summary contract test) or the security audit fail, return to step 3 for the failing layer and re-run steps 4–5; deploy only when both pass.
