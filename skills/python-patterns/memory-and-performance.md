# Memory and Performance

## Contents

- `__slots__` for Many Instances
- Generators Over Lists for Streaming
- Avoid `+=` on Strings in Loops
- Use the Right Container
- `functools.lru_cache` for Pure Functions
- Local-Variable Lookup
- Profile Before Optimizing
- When Pure Python Isn't Enough
- Related

Reach for these only after profiling. `cProfile` + `snakeviz` (CPU) and `tracemalloc` / `memray` (memory) tell you where to spend effort.

## `__slots__` for Many Instances

By default, every instance carries a `__dict__`. For classes with a fixed set of attributes and many instances (geometry, AST nodes, DB rows), `__slots__` cuts memory significantly and speeds up attribute access.

```python
# 56 bytes per instance (CPython, varies)
class Point:
    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y


# ~32 bytes per instance — no __dict__
class Point:
    __slots__ = ("x", "y")

    def __init__(self, x: float, y: float):
        self.x = x
        self.y = y
```

For dataclasses, just pass `slots=True` (3.10+):

```python
from dataclasses import dataclass

@dataclass(slots=True, frozen=True)
class Point:
    x: float
    y: float
```

**Caveats**: forbids new attributes at runtime, can complicate multiple inheritance, and isn't worth the friction unless you're allocating many thousands of instances.

## Generators Over Lists for Streaming

```python
# Bad — full file in memory
def read_lines(path: str) -> list[str]:
    with open(path) as f:
        return [line.strip() for line in f]


# Good — one line at a time
def read_lines(path: str) -> Iterator[str]:
    with open(path) as f:
        for line in f:
            yield line.strip()
```

If the consumer needs all lines anyway, the list version is fine. The win is when the consumer can stop early or works on each item independently.

## Avoid `+=` on Strings in Loops

Strings are immutable; each `+=` allocates a new string. O(n²) total.

```python
# Bad
result = ""
for item in items:
    result += str(item)


# Good — single allocation
result = "".join(str(item) for item in items)


# Good — when building incrementally with logic
from io import StringIO

buf = StringIO()
for item in items:
    buf.write(str(item))
    if some_condition:
        buf.write(", ")
result = buf.getvalue()
```

## Use the Right Container

| Operation | Best | Worst |
|---|---|---|
| Membership test (`x in c`) | `set` / `frozenset` (O(1)) | `list` (O(n)) |
| Order-preserving uniqueness | `dict.fromkeys(items)` (3.7+) | nested `if x not in seen` |
| FIFO queue / both-ends append | `collections.deque` (O(1)) | `list.pop(0)` (O(n)) |
| Counting | `collections.Counter` | manual dict updates |
| Default values | `collections.defaultdict` | `dict.setdefault` repeated |
| Sorted output | `sorted(items)` | manual loop with `bisect` |

## `functools.lru_cache` for Pure Functions

```python
from functools import lru_cache

@lru_cache(maxsize=1024)
def expensive_pure_function(arg: str) -> Result:
    ...
```

Only safe if:

1. The function is **pure** (same args → same result).
2. Args are **hashable**.
3. The result is **safe to share** (not a mutable object the caller will modify).

Use `@functools.cache` (3.9+) for unbounded, or `@functools.cached_property` for per-instance method memoization.

## Local-Variable Lookup

Inside hot loops, accessing module attributes is a dict lookup. Bind to a local once:

```python
# Slightly faster in tight loops
def normalize(values: list[float]) -> list[float]:
    sqrt = math.sqrt
    return [sqrt(v) for v in values]
```

Marginal — only relevant in genuinely hot inner loops.

## Profile Before Optimizing

```bash
python -m cProfile -o profile.out my_script.py
snakeviz profile.out      # interactive flame view

# memory
python -m memray run my_script.py
python -m memray flamegraph memray-*.bin
```

Or in code:

```python
import cProfile, pstats, io
pr = cProfile.Profile()
pr.enable()
hot_function()
pr.disable()
pstats.Stats(pr).sort_stats("cumulative").print_stats(20)
```

## When Pure Python Isn't Enough

- **NumPy/Pandas/Polars**: vectorized array ops, ~100× over Python loops for numerical work.
- **Cython / Mypyc / Codon**: AOT-compile annotated Python.
- **Rust extensions via PyO3 / `maturin`**: drop-in CPython modules with native speed.
- **PyPy**: drop-in alternative interpreter with JIT — works for pure Python, often not for C-extension-heavy code.

Always measure: a single loop replaced with a vectorized NumPy expression often beats the C-extension version that took a week to write.

## Related

- [comprehensions-and-generators.md](comprehensions-and-generators.md) — generator memory patterns
- [concurrency.md](concurrency.md) — when "performance" means "use multiple cores"
