# Concurrency

## Contents

- Decision Table
- Threads (I/O-Bound)
- Processes (CPU-Bound)
- asyncio
- Mixing CPU into asyncio
- Shared State
- Cancellation and Timeouts
- Pitfalls
- Related

Three primitives, three workloads. Pick by what's blocking, not by what feels modern.

## Decision Table

| Workload | Primitive | Why |
|---|---|---|
| Many slow I/O calls (HTTP, DB, disk) | `asyncio` if libs are async; else `ThreadPoolExecutor` | GIL doesn't matter — threads block waiting on I/O |
| CPU-heavy work (encoding, parsing, math) | `ProcessPoolExecutor` | Bypasses the GIL |
| Mix (I/O + CPU) | asyncio for I/O + `loop.run_in_executor()` for CPU chunks | Keeps the event loop free |
| Need shared mutable state across workers | Threads with `threading.Lock`, or single-process actor model | Processes have separate memory |

## Threads (I/O-Bound)

```python
import concurrent.futures
import urllib.request

def fetch_url(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode()


def fetch_all_urls(urls: list[str]) -> dict[str, str]:
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_url = {executor.submit(fetch_url, url): url for url in urls}
        results: dict[str, str] = {}
        for future in concurrent.futures.as_completed(future_to_url):
            url = future_to_url[future]
            try:
                results[url] = future.result()
            except Exception as e:
                results[url] = f"Error: {e}"
        return results
```

`as_completed` returns futures in finish order — better for streaming progress than `executor.map`.

## Processes (CPU-Bound)

```python
def process_data(data: list[int]) -> int:
    return sum(x ** 2 for x in data)


def process_all(datasets: list[list[int]]) -> list[int]:
    with concurrent.futures.ProcessPoolExecutor() as executor:
        return list(executor.map(process_data, datasets))
```

Things to know:

- Args and return values must be **picklable**. Lambdas, local functions, and open file handles are not.
- Each worker pays a startup cost (forking + module imports). For very short tasks, overhead dominates.
- On macOS/Windows, child processes use `spawn` and re-import the module — guard top-level code with `if __name__ == "__main__":`.

## asyncio

```python
import asyncio
import aiohttp

async def fetch_async(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url) as response:
        response.raise_for_status()
        return await response.text()


async def fetch_all(urls: list[str]) -> dict[str, str | Exception]:
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_async(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
    return dict(zip(urls, results))
```

- Reuse a single `ClientSession` across the batch — making one per request is the #1 asyncio mistake.
- `return_exceptions=True` lets you collect failures without the whole `gather` blowing up.
- `asyncio.TaskGroup` (3.11+) is the modern replacement for many `gather` patterns:

```python
async def fetch_all(urls: list[str]) -> list[str]:
    results: list[str] = []
    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(fetch(url)) for url in urls]
    return [t.result() for t in tasks]
```

If any task raises, the group cancels the rest — much harder to do correctly with raw `gather`.

## Mixing CPU into asyncio

The event loop is single-threaded. CPU-heavy work blocks every other task on the same loop.

```python
import asyncio

async def process_request(payload: bytes) -> bytes:
    loop = asyncio.get_running_loop()
    # offload CPU work to a process pool
    return await loop.run_in_executor(process_pool, encode, payload)
```

Use a `ProcessPoolExecutor` for CPU, `ThreadPoolExecutor` for blocking sync I/O libraries.

## Shared State

- **Threads**: shared memory; protect with `threading.Lock` (or `RLock`, `Semaphore`, `Event`, `Condition`).
- **Processes**: separate memory; share via `multiprocessing.Queue`, `multiprocessing.Manager`, or pass data through pickle.
- **asyncio**: single-threaded by default; race conditions only happen across `await` boundaries. Use `asyncio.Lock`, `asyncio.Queue`, `asyncio.Semaphore`.

## Cancellation and Timeouts

```python
# asyncio (3.11+)
async with asyncio.timeout(5):
    result = await slow_call()

# concurrent.futures
future = executor.submit(work)
try:
    result = future.result(timeout=5)
except concurrent.futures.TimeoutError:
    future.cancel()
```

asyncio cancellation is cooperative — your code must `await` something for the cancel to land. Long synchronous loops inside `async def` won't cancel.

## Pitfalls

- **GIL**: threads don't help CPU-bound Python. Use processes or `asyncio.to_thread` only for I/O.
- **Forgotten `await`**: silently returns a coroutine object. Add `mypy --strict` or `RuntimeWarning: coroutine was never awaited` will save you.
- **Mixing sync and async carelessly**: calling `requests.get` inside an async coroutine blocks the entire loop. Use `httpx.AsyncClient` or `aiohttp`.

## Related

- [error-handling.md](error-handling.md) — exception flow in `gather` / TaskGroup
- [context-managers.md](context-managers.md) — `async with`
