## Background Tasks

### FastAPI BackgroundTasks — Simple Post-processing

```python
from fastapi import BackgroundTasks


async def send_welcome_email(email: str, name: str) -> None:
    """Execute asynchronously after request completes."""
    async with httpx.AsyncClient() as client:
        await client.post(
            "https://api.email.com/send",
            json={"to": email, "template": "welcome", "name": name},
        )


@router.post("/users", status_code=201)
async def create_user(
    data: UserCreate,
    background_tasks: BackgroundTasks,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    user = await service.create(data)
    background_tasks.add_task(send_welcome_email, user.email, user.name)
    return user  # Does not wait for email to send
```

### Periodic Background Tasks

```python
import asyncio
from contextlib import asynccontextmanager


class PeriodicTask:
    """Asynchronous task running periodically."""

    def __init__(self, interval_seconds: float):
        self.interval = interval_seconds
        self._task: asyncio.Task | None = None

    async def _run(self) -> None:
        while True:
            try:
                await self.execute()
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("periodic_task_error")
            await asyncio.sleep(self.interval)

    async def execute(self) -> None:
        raise NotImplementedError

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


class CacheWarmupTask(PeriodicTask):
    def __init__(self, cache: Redis, repo: ProductRepository):
        super().__init__(interval_seconds=300)  # Every 5 minutes
        self.cache = cache
        self.repo = repo

    async def execute(self) -> None:
        popular = await self.repo.get_popular_items()
        await self.cache.set("popular_items", popular, ex=600)
```

---
