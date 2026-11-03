# Error Handling

## Contents

- Catch the Narrowest Exception
- Chain Exceptions with `raise ... from`
- Custom Exception Hierarchy
- Don't Use Exceptions for Control Flow
- `else` and `finally`
- Logging Exceptions
- Related

Catch specific exceptions, chain causes, and design a small custom hierarchy at the package boundary.

## Catch the Narrowest Exception

```python
# Good — specific
def load_config(path: str) -> Config:
    try:
        with open(path) as f:
            return Config.from_json(f.read())
    except FileNotFoundError as e:
        raise ConfigError(f"Config file not found: {path}") from e
    except json.JSONDecodeError as e:
        raise ConfigError(f"Invalid JSON in {path}") from e


# Bad — bare except swallows KeyboardInterrupt, SystemExit, and bugs
def load_config(path: str) -> Config | None:
    try:
        with open(path) as f:
            return Config.from_json(f.read())
    except:
        return None
```

Bare `except` is almost always a bug. If you really mean "any exception except the system-level ones," write `except Exception`.

## Chain Exceptions with `raise ... from`

`raise ... from e` preserves the traceback chain so the original cause is still visible.

```python
def process_data(data: str) -> Result:
    try:
        parsed = json.loads(data)
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse data: {data!r}") from e
```

Use `from None` to *suppress* the chain (rare — only when the original exception is implementation noise).

## Custom Exception Hierarchy

Define a single base for your package, then specific subclasses for each error category callers might handle differently.

```python
class AppError(Exception):
    """Base exception for all application errors."""


class ValidationError(AppError):
    """Raised when input validation fails."""


class NotFoundError(AppError):
    """Raised when a requested resource is not found."""


class ExternalServiceError(AppError):
    """Raised when a downstream service fails."""


def get_user(user_id: str) -> User:
    user = db.find_user(user_id)
    if not user:
        raise NotFoundError(f"User not found: {user_id}")
    return user
```

Callers can then `except AppError` for "anything from this package" or `except NotFoundError` for the specific case.

## Don't Use Exceptions for Control Flow

```python
# Bad — using exceptions as a goto
def find_first_negative(numbers: list[int]) -> int:
    try:
        return next(n for n in numbers if n < 0)
    except StopIteration:
        return 0  # disguised "not found"


# Good — explicit
def find_first_negative(numbers: list[int]) -> int | None:
    return next((n for n in numbers if n < 0), None)
```

Exceptions are fine for *exceptional* conditions. Returning `None` or a sentinel is better for predictable absences.

## `else` and `finally`

```python
def load_user(path: str) -> User:
    try:
        f = open(path)
    except FileNotFoundError:
        raise NotFoundError(f"User file missing: {path}")
    else:
        # runs only if no exception
        with f:
            return User.from_json(f.read())
    finally:
        # runs no matter what
        log_attempt(path)
```

Use `else` to keep the `try` block as small as possible — only the operations that can raise the exception you're catching.

## Logging Exceptions

```python
import logging

logger = logging.getLogger(__name__)

try:
    risky()
except OperationFailed:
    # logs the exception with traceback automatically
    logger.exception("operation failed")
    raise
```

`logger.exception()` includes the traceback. Don't manually concatenate `str(e)` into the log message.

## Related

- [core-principles.md](core-principles.md) — EAFP rationale
- [context-managers.md](context-managers.md) — exception-aware resource cleanup
