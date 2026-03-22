---
name: fastapi-backend-best-practices
description: |
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
---

# FastAPI Backend Best Practices

## Overview

A practical guide for Async-first FastAPI backend development.
All code is async/await based, choosing appropriate modeling patterns according to business complexity.

## Reference Guide

Read and apply references suited to business needs:

| File | Content | When to read |
|------|---------|--------------|
| `project-structure/README.md` | Project layout, config, Lifespan, DI | Starting a new project, structural refactoring |
| `async-patterns/README.md` | Async patterns, concurrency, background tasks, SSE/WebSocket | Designing async processing, performance optimization |
| `domain-modeling/README.md` | Pydantic modeling for CRUD/CQRS/Event-Driven/Saga/DDD | Domain model design, structuring business logic |
| `api-design/README.md` | Routers, middleware, error handling, pagination, versioning | API endpoint design, error handling |
| `testing/README.md` | httpx AsyncClient, fixtures, mocking, integration testing | Writing tests, TDD |
| `security/README.md` | JWT, OAuth2, CORS, Rate Limiting, input validation | Implementing auth, security checks |
| `deployment/README.md` | Docker, uvicorn tuning, health checks, monitoring | Deployment, performance tuning, operations |

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
1. Requirements → Pattern Selection (refer to domain-modeling/README.md)
2. Project Structure Setup (refer to project-structure/README.md)
3. Implement in order: Domain Model → Repository → Service → Router
4. Write Tests (refer to testing/README.md)
5. Security Audit (refer to security/README.md)
6. Deployment (refer to deployment/README.md)
