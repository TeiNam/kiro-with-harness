---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

> This file extends [common/coding-style.md](../common/coding-style.md) with Python-specific content.

## Type Hints

Add type hints to public APIs; let internal code remain concise:

```python
# WRONG: No hints on public function
def fetch_users(ids, active_only):
    ...

# CORRECT: Explicit parameter and return types
def fetch_users(ids: list[str], active_only: bool = True) -> list[User]:
    ...
```

Use `typing` imports only when needed (Python 3.10+ supports `X | None` natively):

```python
def find_user(user_id: str) -> User | None:
    ...
```

## Comprehensions and Generators

Prefer comprehensions for simple transforms. Use generators for large or lazy sequences:

```python
# List comprehension — clear and concise
names = [u.name for u in users if u.active]

# Generator — avoids loading everything into memory
def read_large_file(path: str):
    with open(path) as f:
        yield from (line.strip() for line in f if line.strip())
```

Keep comprehensions to one level of nesting. If it needs two loops or complex conditions, use a regular loop.

## Context Managers

Use `with` for any resource that needs cleanup:

```python
# File I/O
with open("data.json") as f:
    data = json.load(f)

# Custom context managers
from contextlib import contextmanager

@contextmanager
def temp_directory():
    d = tempfile.mkdtemp()
    try:
        yield d
    finally:
        shutil.rmtree(d)
```

## Async / Await

Use `asyncio` for I/O-bound concurrency. Do not mix sync blocking calls in async code:

```python
import asyncio

async def fetch_all(urls: list[str]) -> list[Response]:
    async with aiohttp.ClientSession() as session:
        tasks = [session.get(url) for url in urls]
        return await asyncio.gather(*tasks)
```

Use `asyncio.TaskGroup` (Python 3.11+) for structured concurrency:

```python
async def process_batch(items: list[Item]) -> list[Result]:
    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(process(item)) for item in items]
    return [t.result() for t in tasks]
```

## Decorators

Use decorators to separate cross-cutting concerns from business logic:

```python
import functools

def retry(max_attempts: int = 3, delay: float = 1.0):
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            for attempt in range(max_attempts):
                try:
                    return func(*args, **kwargs)
                except Exception:
                    if attempt == max_attempts - 1:
                        raise
                    time.sleep(delay * (2 ** attempt))
        return wrapper
    return decorator
```

## Immutability

Prefer tuples over lists for fixed collections. Use `@dataclass(frozen=True)` for value objects:

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float
```

## Formatting

- **black** for code formatting
- **isort** for import sorting
- **ruff** for linting

## Naming Conventions

- `snake_case` for functions, variables, modules
- `PascalCase` for classes
- `UPPER_SNAKE_CASE` for module-level constants
- Prefix private attributes with `_`

## String Formatting

Use f-strings:

```python
# WRONG
message = "Hello, %s. You have %d items." % (name, count)

# CORRECT
message = f"Hello, {name}. You have {count} items."
```
