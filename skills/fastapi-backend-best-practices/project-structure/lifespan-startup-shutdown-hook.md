## Lifespan (Startup/Shutdown Hook)

```python
# src/main.py
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI

from src.config import get_settings
from src.infra.database import init_db, close_db
from src.shared.cache import init_redis, close_redis
from src.core.logging import setup_logging


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Manage resources upon app startup/shutdown."""
    settings = get_settings()
    setup_logging(settings.environment)

    # Startup — DB initialization is implemented in infra/database.py (refer to DB skill)
    await init_db(settings.database_url)
    await init_redis(settings.redis_url)

    yield

    # Shutdown
    await close_redis()
    await close_db()


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
    )

    # Middleware
    from src.shared.middleware import register_middleware
    register_middleware(app, settings)

    # Routers
    from src.users.router import router as users_router
    from src.orders.router import router as orders_router

    app.include_router(users_router, prefix="/api/v1")
    app.include_router(orders_router, prefix="/api/v1")

    return app


app = create_app()
```
