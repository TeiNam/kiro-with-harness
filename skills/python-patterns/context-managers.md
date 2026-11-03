# Context Managers

## Contents

- The `with` Statement
- Multiple Context Managers
- Custom Context Manager via `@contextmanager`
- Class-Based Context Manager
- Async Context Managers
- ExitStack — Dynamic Composition
- Related

Anything that needs paired setup/teardown — files, locks, transactions, timers, `cd` into a directory — should be a context manager.

## The `with` Statement

```python
# Good
def read_text(path: str) -> str:
    with open(path) as f:
        return f.read()


# Bad — manual cleanup, easy to forget
def read_text(path: str) -> str:
    f = open(path)
    try:
        return f.read()
    finally:
        f.close()
```

`with` calls `__enter__` on entry and `__exit__` on exit even if the block raises.

## Multiple Context Managers

```python
with open(src) as fin, open(dst, "w") as fout:
    fout.write(fin.read())
```

For more than 2-3, use parenthesized form (3.10+):

```python
with (
    open(src) as fin,
    open(dst, "w") as fout,
    LockFile(lock_path),
):
    process(fin, fout)
```

## Custom Context Manager via `@contextmanager`

For one-off context managers, the decorator is easier than writing a class.

```python
from contextlib import contextmanager
import time

@contextmanager
def timer(name: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed = time.perf_counter() - start
        print(f"{name} took {elapsed:.4f}s")


with timer("data processing"):
    process_large_dataset()
```

Anything before `yield` is `__enter__`; the `finally` block is `__exit__`. The value yielded becomes the `as` target.

## Class-Based Context Manager

When you need state or want a clear public interface:

```python
class DatabaseTransaction:
    def __init__(self, connection):
        self.connection = connection

    def __enter__(self):
        self.connection.begin_transaction()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self.connection.commit()
        else:
            self.connection.rollback()
        return False  # don't suppress exceptions


with DatabaseTransaction(conn):
    user = conn.create_user(user_data)
    conn.create_profile(user.id, profile_data)
```

`__exit__` returns `True` to suppress the exception, `False` (or nothing) to let it propagate. **Default to letting it propagate** — silent suppression is almost never right.

## Async Context Managers

```python
from contextlib import asynccontextmanager

@asynccontextmanager
async def db_session(pool):
    conn = await pool.acquire()
    try:
        yield conn
    finally:
        await pool.release(conn)


async def fetch():
    async with db_session(pool) as conn:
        return await conn.fetch("SELECT 1")
```

Use `__aenter__` / `__aexit__` for class-based async.

## ExitStack — Dynamic Composition

When the number of context managers is dynamic (e.g., processing N files), use `contextlib.ExitStack`:

```python
from contextlib import ExitStack

def process_all(paths: list[str]) -> None:
    with ExitStack() as stack:
        files = [stack.enter_context(open(p)) for p in paths]
        merge(files)
```

All files are closed when the `with` block exits, even if one fails to open mid-stream.

## Related

- [error-handling.md](error-handling.md) — exception flow through `__exit__`
- [concurrency.md](concurrency.md) — `async with` for connection pools
