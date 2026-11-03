# Dataclasses and NamedTuples

## Contents

- Plain Dataclass
- Frozen Dataclass — Default to This
- Validation with `__post_init__`
- Inheritance and Defaults
- NamedTuple
- TypedDict
- Pydantic (External — Worth Knowing)
- Decision Quick Reference
- Related

Pick the simplest container that fits the data. In order of preference: `NamedTuple` (immutable, light) → `@dataclass(frozen=True)` (immutable + flexible) → `@dataclass` (mutable) → custom class (only when you have non-trivial behavior).

## Plain Dataclass

```python
from dataclasses import dataclass, field
from datetime import datetime

@dataclass
class User:
    id: str
    name: str
    email: str
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True


user = User(id="123", name="Alice", email="alice@example.com")
```

Auto-generates `__init__`, `__repr__`, `__eq__`. Use `field(default_factory=...)` for mutable defaults — never `field(default=[])`.

## Frozen Dataclass — Default to This

If the object isn't supposed to change after creation, freeze it. Frozen dataclasses are hashable (usable as dict keys / set members).

```python
@dataclass(frozen=True, slots=True)
class Point:
    x: float
    y: float
```

`slots=True` (3.10+) gives you `__slots__` for free, dropping memory and forbidding accidental new attributes.

## Validation with `__post_init__`

```python
@dataclass
class User:
    email: str
    age: int

    def __post_init__(self):
        if "@" not in self.email:
            raise ValueError(f"Invalid email: {self.email}")
        if not 0 <= self.age <= 150:
            raise ValueError(f"Invalid age: {self.age}")
```

For richer validation (cross-field, type coercion), reach for **Pydantic** instead of writing this by hand.

## Inheritance and Defaults

```python
@dataclass
class Animal:
    name: str

@dataclass
class Dog(Animal):
    breed: str
    name: str = "Rex"  # ERROR — non-default after default in parent
```

Either keep all fields with defaults at the bottom, or pass `kw_only=True` (3.10+):

```python
@dataclass(kw_only=True)
class Animal:
    name: str = "anonymous"
```

## NamedTuple

For lightweight immutable records — especially function returns and tuples that need names:

```python
from typing import NamedTuple

class Point(NamedTuple):
    x: float
    y: float

    def distance(self, other: "Point") -> float:
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5


p1 = Point(0, 0)
p2 = Point(3, 4)
p1.distance(p2)  # 5.0
p1.x  # 0
p1[0]  # 0 — still tuple-indexable
```

NamedTuple instances are real tuples — they unpack, hash, compare, and serialize like tuples.

## TypedDict

When the data already lives as a `dict` (e.g., parsed JSON) and you want types without restructuring:

```python
from typing import TypedDict, NotRequired

class UserDict(TypedDict):
    id: str
    name: str
    email: str
    is_active: NotRequired[bool]
```

`NotRequired` (3.11+) marks optional keys. Use TypedDict for the *boundary* (parsing/serialization) and a dataclass for the internal model.

## Pydantic (External — Worth Knowing)

When the data crosses an untrusted boundary (HTTP body, config file, env vars), Pydantic gives you parsing + validation + JSON Schema in one type:

```python
from pydantic import BaseModel, EmailStr, Field

class User(BaseModel):
    id: str
    name: str
    email: EmailStr
    age: int = Field(ge=0, le=150)
```

Use FastAPI? You're already using Pydantic — keep going. Pure stdlib? Plain dataclass + `__post_init__` is enough.

## Decision Quick Reference

| Need | Pick |
|---|---|
| Function return tuple with names | `NamedTuple` |
| Immutable record, hashable | `@dataclass(frozen=True, slots=True)` |
| Mutable internal model | `@dataclass` |
| Parsing untrusted input (API/config) | `pydantic.BaseModel` |
| Typing existing dict shapes | `TypedDict` |

## Related

- [type-hints.md](type-hints.md) — Protocols vs. dataclass inheritance
- [memory-and-performance.md](memory-and-performance.md) — `__slots__` and `slots=True`
