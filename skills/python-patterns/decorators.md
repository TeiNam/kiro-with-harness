# Decorators

## Contents

- Function Decorators
- Parameterized Decorators
- Class-Based Decorators
- Preserving Type Information
- Common Built-in / stdlib Decorators
- Stacking Decorators
- Pitfalls
- Related

Decorators wrap a function or class to add behavior. Always use `functools.wraps` so introspection (name, docstring, signature) survives.

## Function Decorators

```python
import functools
import time
from collections.abc import Callable

def timer(func: Callable) -> Callable:
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start = time.perf_counter()
        result = func(*args, **kwargs)
        elapsed = time.perf_counter() - start
        print(f"{func.__name__} took {elapsed:.4f}s")
        return result
    return wrapper


@timer
def slow_function():
    time.sleep(1)
```

Without `@functools.wraps`, `slow_function.__name__` becomes `"wrapper"` and the docstring disappears.

## Parameterized Decorators

A decorator that takes arguments is a function that *returns* a decorator:

```python
def repeat(times: int):
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            return [func(*args, **kwargs) for _ in range(times)]
        return wrapper
    return decorator


@repeat(times=3)
def greet(name: str) -> str:
    return f"Hello, {name}!"

greet("Alice")  # ["Hello, Alice!", "Hello, Alice!", "Hello, Alice!"]
```

## Class-Based Decorators

When the decorator needs state across calls:

```python
class CountCalls:
    def __init__(self, func: Callable):
        functools.update_wrapper(self, func)
        self.func = func
        self.count = 0

    def __call__(self, *args, **kwargs):
        self.count += 1
        return self.func(*args, **kwargs)


@CountCalls
def process():
    pass


process()
process()
process.count  # 2
```

Use `functools.update_wrapper(self, func)` instead of `@functools.wraps` here.

## Preserving Type Information

Plain `Callable` annotations lose the wrapped function's signature for type checkers. Use `ParamSpec` (3.10+):

```python
from typing import ParamSpec, TypeVar
from collections.abc import Callable
import functools

P = ParamSpec("P")
R = TypeVar("R")

def timer(func: Callable[P, R]) -> Callable[P, R]:
    @functools.wraps(func)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        return func(*args, **kwargs)
    return wrapper
```

Now `mypy` knows `timer(greet)` has the same signature as `greet`.

## Common Built-in / stdlib Decorators

| Decorator | Purpose |
|---|---|
| `@functools.wraps` | Preserve metadata when wrapping |
| `@functools.lru_cache(maxsize=128)` | Memoize pure functions |
| `@functools.cache` | Unbounded memoize (3.9+) |
| `@functools.cached_property` | Memoize a method as a per-instance attribute |
| `@functools.singledispatch` | Type-based dispatch |
| `@property` / `@x.setter` | Computed attributes |
| `@staticmethod` / `@classmethod` | Methods that don't need `self` / take the class |
| `@dataclass` | Auto-generate `__init__/__repr__/__eq__` |
| `@contextmanager` (`contextlib`) | Generator-style context managers |

## Stacking Decorators

```python
@timer
@retry(max_attempts=3)
def fetch():
    ...
```

Applied bottom-up: `fetch = timer(retry(max_attempts=3)(fetch))`. So `retry` runs around the original `fetch`, and `timer` wraps the retried version.

## Pitfalls

- **Forgetting `functools.wraps`** — break introspection, debugging, and tests that match `__name__`.
- **Heavy work at import time** — decorator runs once at definition. Don't open files or call APIs in the outer function.
- **Sharing mutable state across calls** unless you mean to (class-based decorators do).
- **Overusing decorators** — if the wrapped behavior is non-trivial, an explicit helper function is often clearer.

## Related

- [context-managers.md](context-managers.md) — `@contextmanager` is a decorator
- [type-hints.md](type-hints.md) — `ParamSpec` for typed wrappers
