# Async Testing

## Contents

- Setup
- Basic Async Test
- Async Fixtures
- Mocking Async Functions
- Testing Cancellation
- Testing TaskGroups (3.11+)
- anyio (Backend-Agnostic Async)
- FastAPI / httpx AsyncClient
- Pitfalls
- Related

Pytest needs a plugin to run `async def` tests. `pytest-asyncio` is the default; `anyio` if you also support trio.

## Setup

```toml
# pyproject.toml
[project.optional-dependencies]
dev = ["pytest", "pytest-asyncio>=0.23"]

[tool.pytest.ini_options]
asyncio_mode = "auto"   # or "strict"
```

- `auto` mode: every `async def test_*` is treated as async automatically.
- `strict` mode: requires `@pytest.mark.asyncio` on each async test.

Use `auto` for new projects.

## Basic Async Test

```python
async def test_async_add():
    result = await async_add(2, 3)
    assert result == 5
```

(In `strict` mode, prefix with `@pytest.mark.asyncio`.)

## Async Fixtures

```python
import pytest_asyncio

@pytest_asyncio.fixture
async def async_client():
    app = create_app()
    async with httpx.AsyncClient(app=app, base_url="http://test") as client:
        yield client


async def test_get_users(async_client):
    response = await async_client.get("/api/users")
    assert response.status_code == 200
```

In `auto` mode you can usually use plain `@pytest.fixture`; check the version's docs.

## Mocking Async Functions

```python
from unittest.mock import AsyncMock, patch

@patch("myapp.service.fetch", new_callable=AsyncMock)
async def test_fetch(fetch_mock):
    fetch_mock.return_value = {"status": "ok"}
    result = await get_status()
    assert result == {"status": "ok"}
    fetch_mock.assert_awaited_once()
```

Use `assert_awaited*` (not `assert_called*`) — they verify the coroutine was actually awaited, not just instantiated.

## Testing Cancellation

```python
import asyncio
import pytest

async def test_cancellation_releases_resource():
    resource = Resource()
    task = asyncio.create_task(resource.use_for_long())
    await asyncio.sleep(0)        # yield once so the task starts

    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    assert resource.closed
```

For timeout assertions:

```python
async def test_times_out():
    with pytest.raises(TimeoutError):
        async with asyncio.timeout(0.1):
            await never_completes()
```

`asyncio.timeout` is 3.11+. On older versions use `asyncio.wait_for`.

## Testing TaskGroups (3.11+)

```python
async def test_taskgroup_propagates_first_failure():
    with pytest.raises(ExceptionGroup) as exc_info:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(asyncio.sleep(0.05))
            tg.create_task(_raise(ValueError("boom")))

    assert any(isinstance(e, ValueError) for e in exc_info.value.exceptions)
```

Use `pytest.raises(ExceptionGroup)` and inspect `.exceptions` — TaskGroup wraps every error.

## anyio (Backend-Agnostic Async)

If you target both asyncio and trio:

```toml
[project.optional-dependencies]
dev = ["pytest", "anyio[trio]"]
```

```python
import pytest

@pytest.mark.anyio
async def test_runs_on_both_backends():
    ...

# Run only asyncio backend
@pytest.fixture
def anyio_backend():
    return "asyncio"
```

By default the test runs on every installed backend.

## FastAPI / httpx AsyncClient

```python
import pytest_asyncio
from httpx import AsyncClient
from myapp.main import app

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c


async def test_get_users(client):
    r = await client.get("/users")
    assert r.status_code == 200
```

Don't use the synchronous `TestClient` — it spins up a thread and starts hiding async bugs.

## Pitfalls

- **Forgetting `await`.** A coroutine object is truthy; `assert async_func()` always passes. Run `mypy --strict` and watch for `RuntimeWarning: coroutine was never awaited`.
- **Mixing sync I/O.** `requests.get` inside an async test blocks the loop. Use `httpx.AsyncClient` or `aiohttp`.
- **`session`-scoped event loop with per-test cleanup.** Some libraries spawn background tasks tied to the loop; restart the loop between tests if you see flakiness.
- **`@patch` without `AsyncMock`.** Patches an async function with a `MagicMock` that returns a coroutine-shaped object you can't await. Always `new_callable=AsyncMock`.

## Related

- [mocking.md](mocking.md) — `AsyncMock` reference
- [common-patterns.md](common-patterns.md) — FastAPI test client patterns
