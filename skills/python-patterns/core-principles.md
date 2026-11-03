# Core Principles

The three principles that drive idiomatic Python: readability counts, explicit is better than implicit, and EAFP over LBYL.

## 1. Readability Counts

Code should be obvious. Spell out what you mean — clever one-liners that you can't read at a glance are not Pythonic.

```python
# Good
def get_active_users(users: list[User]) -> list[User]:
    """Return only active users from the provided list."""
    return [user for user in users if user.is_active]


# Bad: clever but cryptic
def get_active_users(u):
    return [x for x in u if x.a]
```

## 2. Explicit is Better Than Implicit

Avoid magic and hidden side effects. Configuration, dependency wiring, and lifecycle should be visible at the call site.

```python
# Good — call site shows what happens
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Bad — what does setup() do? You have to read the module.
import some_module
some_module.setup()
```

## 3. EAFP — Easier to Ask Forgiveness Than Permission

Python prefers `try/except` over guard checks. EAFP is faster (one operation in the happy path) and avoids race conditions (the file/key/attribute can disappear between the check and the use).

```python
# Good — EAFP
def get_value(d: dict, key: str, default: Any) -> Any:
    try:
        return d[key]
    except KeyError:
        return default


# Bad — LBYL (Look Before You Leap), races possible
def get_value(d: dict, key: str, default: Any) -> Any:
    if key in d:
        return d[key]
    return default
```

**When LBYL is fine:** when the check is cheap, doesn't race, and makes intent clearer (e.g., validating a positional argument before doing real work).

## Companion Idioms

- **Truthiness over equality**: `if items:` not `if len(items) > 0:`. `if value is None:` not `if value == None:`.
- **`isinstance` over `type()`**: `isinstance(x, int)` accepts subclasses; `type(x) is int` does not (and is rarely what you want).
- **`in` over `.has_key()`**: `if key in d:` — `dict.has_key` was removed in Python 3.
- **Unpacking**: `a, *rest = items` instead of `a = items[0]; rest = items[1:]`.

## Related

- [error-handling.md](error-handling.md) — EAFP in practice with custom exception hierarchies
- [anti-patterns.md](anti-patterns.md) — common violations of these principles
