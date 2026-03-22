## Concurrency Control

### asyncio.gather — Parallel I/O

```python
async def get_dashboard(user_id: int) -> DashboardResponse:
    """Run multiple independent queries in parallel."""
    profile, orders, notifications = await asyncio.gather(
        user_service.get_profile(user_id),
        order_service.get_recent(user_id, limit=5),
        notification_service.get_unread(user_id),
    )
    return DashboardResponse(
        profile=profile,
        recent_orders=orders,
        notifications=notifications,
    )
```

### asyncio.gather — Fault Tolerant

```python
async def get_dashboard_resilient(user_id: int) -> DashboardResponse:
    """Return remaining results even if some fail."""
    results = await asyncio.gather(
        user_service.get_profile(user_id),
        order_service.get_recent(user_id),
        notification_service.get_unread(user_id),
        return_exceptions=True,
    )

    profile = results[0] if not isinstance(results[0], Exception) else None
    orders = results[1] if not isinstance(results[1], Exception) else []
    notifications = results[2] if not isinstance(results[2], Exception) else []

    return DashboardResponse(
        profile=profile,
        recent_orders=orders,
        notifications=notifications,
    )
```

### Semaphore — Limit Concurrency

```python
class RateLimitedClient:
    """Limit concurrency for external API calls."""

    def __init__(self, max_concurrent: int = 10):
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._client = httpx.AsyncClient(timeout=30.0)

    async def fetch(self, url: str) -> httpx.Response:
        async with self._semaphore:
            return await self._client.get(url)

    async def fetch_many(self, urls: list[str]) -> list[httpx.Response]:
        return await asyncio.gather(*[self.fetch(url) for url in urls])

    async def close(self) -> None:
        await self._client.aclose()
```

### TaskGroup — Structured Concurrency (Python 3.11+)

```python
async def process_batch(items: list[Item]) -> list[Result]:
    """TaskGroup limits and guarantees exception propagation."""
    results: list[Result] = []

    async with asyncio.TaskGroup() as tg:
        for item in items:
            tg.create_task(process_and_collect(item, results))

    return results


async def process_and_collect(item: Item, results: list[Result]) -> None:
    result = await process_item(item)
    results.append(result)
    # The whole TaskGroup cancels if any task raises an exception
```

---
