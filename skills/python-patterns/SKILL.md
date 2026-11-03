---
name: python-patterns
description: >
  Idiomatic Python coding patterns: PEP 8 readability, EAFP error handling,
  type hints, dataclasses, context managers, comprehensions, decorators,
  concurrency (threading/multiprocessing/asyncio), package layout, performance.
  Trigger keywords: typing, type hints, dataclass, NamedTuple, Protocol,
  contextmanager, with statement, generator, yield, EAFP, decorator,
  functools.wraps, asyncio, concurrent.futures, ProcessPoolExecutor,
  ThreadPoolExecutor, __slots__, pyproject.toml, ruff, mypy, isort,
  pythonic, refactor python, review python.
origin: harness
workloads: [python]
---

# Python Development Patterns

Idiomatic Python patterns for robust, efficient, maintainable applications. Covers PEP 8, type hints, error handling, concurrency, and performance.

## When to Activate

- Writing new Python code (≥3.9)
- Reviewing or refactoring Python code
- Designing Python packages / module boundaries
- Picking the right concurrency primitive (threads vs processes vs asyncio)
- Wiring up project tooling (ruff / mypy / pytest in `pyproject.toml`)

## Python Defaults

- **Version**: Python ≥ 3.9 (use `list[str]`, `dict[str, X]`, `X | None` syntax). Drop `typing.List/Dict/Optional` unless supporting 3.8.
- **Style**: PEP 8, 88-col (black/ruff default).
- **Tooling**: ruff (lint+format) → mypy (type) → pytest (test). All configured in `pyproject.toml`.
- **Strings**: f-strings only. No `%`-formatting, no `.format()`.
- **Paths**: `pathlib.Path`, never `os.path` string concatenation.
- **Imports**: stdlib → third-party → local, separated by blank lines. `isort` enforces.

## Naming Rules

- Modules / files: `snake_case.py`
- Classes: `PascalCase`
- Functions / variables: `snake_case`
- Constants: `UPPER_SNAKE_CASE`
- Private: leading `_underscore`
- Type vars: single uppercase letter or `PascalCase` (`T`, `KeyT`)
- Protocols: end in `-able` or `-ible` when describing capability (`Renderable`, `Comparable`)

## Topic Index

| Topic | File | Use when |
|---|---|---|
| Core principles (readability, EAFP, explicit) | [core-principles.md](core-principles.md) | Reviewing code for "is this Pythonic?" |
| Type hints (PEP 484/585/604, Protocols, generics) | [type-hints.md](type-hints.md) | Annotating signatures, generic containers |
| Error handling (custom hierarchy, chaining) | [error-handling.md](error-handling.md) | Designing exception types, `raise from` |
| Context managers (`with`, `@contextmanager`) | [context-managers.md](context-managers.md) | Resource cleanup, transactions, timers |
| Comprehensions & generators | [comprehensions-and-generators.md](comprehensions-and-generators.md) | Transforming iterables, lazy pipelines |
| Dataclasses & NamedTuples | [dataclasses-and-tuples.md](dataclasses-and-tuples.md) | Data containers, immutable records |
| Decorators (function / parameterized / class) | [decorators.md](decorators.md) | Cross-cutting concerns (timing, retry, count) |
| Concurrency (threads / processes / asyncio) | [concurrency.md](concurrency.md) | Picking the right primitive for I/O vs CPU |
| Package organization (src layout, `__init__`) | [package-organization.md](package-organization.md) | New project, restructuring imports |
| Memory & performance (`__slots__`, joins) | [memory-and-performance.md](memory-and-performance.md) | Reducing allocation, avoiding O(n²) loops |
| Tooling (ruff / mypy / pyproject.toml) | [tooling.md](tooling.md) | Setting up a new project's checks |
| Anti-patterns | [anti-patterns.md](anti-patterns.md) | Catching mutable defaults, bare `except`, etc. |

## Quick Reference: Python Idioms

| Idiom | Description |
|---|---|
| EAFP | Easier to Ask Forgiveness than Permission |
| Context managers | Use `with` for any resource that needs cleanup |
| List comprehensions | Simple `[expr for x in xs if cond]` only — extract complex ones |
| Generators | Lazy evaluation, large/streaming data |
| Type hints | Annotate every public signature |
| Dataclasses | Data containers with auto `__init__/__repr__/__eq__` |
| `__slots__` | Hot-path classes with many instances |
| f-strings | All formatting (Python ≥ 3.6) |
| `pathlib.Path` | All path operations |
| `enumerate` | Loops needing index + element |
| `is None` | Singleton comparisons (never `== None`) |
| `isinstance()` | Type checks (never `type(x) == T`) |

## Related Skills

- `python-testing` — pytest, fixtures, parametrize, async testing
- `fastapi-backend-best-practices` — when building APIs
- `python-data-analysis` — pandas/polars/duckdb workflows
- `mle-workflow`, `pytorch-patterns` — ML pipelines

__Remember__: Python code should be readable, explicit, and follow the principle of least surprise. When in doubt, prioritize clarity over cleverness.
