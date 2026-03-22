## Healthcheck

```python
# src/health/router.py
from typing import Protocol
from fastapi import APIRouter, Depends

router = APIRouter(tags=["Health"])


class HealthChecker(Protocol):
    """DB-agnostic healthcheck interface."""
    async def ping(self) -> bool: ...


class HealthStatus(BaseModel):
    status: str
    database: str
    redis: str
    version: str


@router.get("/health")
async def health_check(
    db_health: HealthChecker = Depends(get_db_health_checker),
    redis: Redis = Depends(get_redis),
) -> HealthStatus:
    # DB check — Implementation provided in infra/database.py
    db_status = "ok"
    try:
        await db_health.ping()
    except Exception:
        db_status = "error"

    # Redis check
    redis_status = "ok"
    try:
        await redis.ping()
    except Exception:
        redis_status = "error"

    overall = "ok" if db_status == "ok" and redis_status == "ok" else "degraded"

    return HealthStatus(
        status=overall,
        database=db_status,
        redis=redis_status,
        version="0.1.0",
    )


# Lightweight liveness probe (for load balancers)
@router.get("/health/live")
async def liveness() -> dict[str, str]:
    return {"status": "ok"}
```

---
