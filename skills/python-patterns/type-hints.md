# Type Hints

## Contents

- Modern Syntax (Python ≥ 3.9 / 3.10)
- Common Annotations
- Type Aliases
- Generics with TypeVar
- Protocols (Structural Subtyping)
- Literal & Final
- Self-Referential Types
- When to skip type hints
- Related

Annotate every public signature. Type hints are documentation, IDE help, and a contract — `mypy` makes them enforceable.

## Modern Syntax (Python ≥ 3.9 / 3.10)

```python
# 3.9+ — built-in generics
def process_items(items: list[str]) -> dict[str, int]:
    return {item: len(item) for item in items}


# 3.10+ — union with `|`
def find_user(user_id: str) -> User | None:
    ...
```

Don't write `from typing import List, Dict, Optional` unless you must support Python ≤ 3.8.

## Common Annotations

```python
from collections.abc import Callable, Iterable, Iterator, Mapping, Sequence
from typing import Any

def process(
    user_id: str,
    data: Mapping[str, Any],
    callback: Callable[[str], None] | None = None,
    active: bool = True,
) -> User | None:
    ...
```

Prefer `Mapping`/`Sequence`/`Iterable` (read-only protocols) for parameters; use `dict`/`list` for return types you own.

## Type Aliases

```python
from typing import TypeAlias

JSON: TypeAlias = dict[str, "JSON"] | list["JSON"] | str | int | float | bool | None

def parse_json(data: str) -> JSON:
    return json.loads(data)
```

`TypeAlias` (PEP 613) makes the alias intent explicit. In 3.12+, prefer the new `type` statement: `type JSON = dict[str, JSON] | ...`.

## Generics with TypeVar

```python
from typing import TypeVar

T = TypeVar("T")

def first(items: list[T]) -> T | None:
    """Return the first item or None if list is empty."""
    return items[0] if items else None
```

In 3.12+, prefer the inline syntax:

```python
def first[T](items: list[T]) -> T | None:
    return items[0] if items else None
```

## Protocols (Structural Subtyping)

Use `Protocol` for duck typing — describe *what an object does*, not what it is. Especially useful when the caller doesn't own the types.

```python
from typing import Protocol

class Renderable(Protocol):
    def render(self) -> str: ...

def render_all(items: list[Renderable]) -> str:
    return "\n".join(item.render() for item in items)
```

Any class with a `render(self) -> str` method satisfies the protocol — no inheritance needed.

## Literal & Final

```python
from typing import Literal, Final

LogLevel = Literal["debug", "info", "warning", "error"]

DEFAULT_TIMEOUT: Final[int] = 30


def log(message: str, level: LogLevel = "info") -> None:
    ...
```

`Literal` constrains to specific values; `Final` says "don't reassign."

## Self-Referential Types

```python
from __future__ import annotations  # makes all annotations strings (lazy eval)

class Node:
    def __init__(self, value: int, next: Node | None = None):
        self.value = value
        self.next = next
```

`from __future__ import annotations` (PEP 563) makes annotations lazy strings, so `Node` can refer to itself without quotes. In 3.11+, prefer `typing.Self` for return types: `def clone(self) -> Self: ...`.

## When to skip type hints

- Throwaway scripts and one-shot notebooks.
- `*args, **kwargs` pass-through (use `ParamSpec` if you need it typed).
- Test helpers that fixtures already document.

For everything else, annotate. `mypy --strict` is a fine default for libraries.

## Related

- [dataclasses-and-tuples.md](dataclasses-and-tuples.md) — typed data containers
- [tooling.md](tooling.md) — mypy configuration
