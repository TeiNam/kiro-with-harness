---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Patterns

> This file extends [common/patterns.md](../common/patterns.md) with Python-specific content.

## Module Organization

Structure packages by domain, not by type:

```
# WRONG: grouped by type
models/
  user.py
  order.py
services/
  user.py
  order.py

# CORRECT: grouped by domain
users/
  __init__.py
  models.py
  services.py
  repository.py
orders/
  __init__.py
  models.py
  services.py
```

Keep `__init__.py` files minimal — use them for public API re-exports, not logic.

## Protocol (Structural Typing)

Use `Protocol` for duck-typed interfaces:

```python
from typing import Protocol

class Repository(Protocol):
    def find_by_id(self, id: str) -> dict | None: ...
    def save(self, entity: dict) -> dict: ...
```

## Dataclasses and Pydantic

Use `dataclasses` for internal value objects. Use Pydantic for external data validation:

```python
from dataclasses import dataclass
from pydantic import BaseModel, EmailStr, Field

# Internal value object
@dataclass(frozen=True)
class Coordinate:
    lat: float
    lon: float

# External input validation
class CreateUserRequest(BaseModel):
    name: str
    email: EmailStr
    age: int = Field(ge=0, le=150)
```

## Dependency Injection

Pass dependencies explicitly. Use constructor injection or function parameters:

```python
class OrderService:
    def __init__(self, repo: OrderRepository, notifier: Notifier):
        self._repo = repo
        self._notifier = notifier

    def place_order(self, order: Order) -> Order:
        saved = self._repo.save(order)
        self._notifier.send(f"Order {saved.id} placed")
        return saved
```

For FastAPI, use `Depends()`:

```python
from fastapi import Depends

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/users/{user_id}")
def get_user(user_id: str, db: Session = Depends(get_db)):
    return db.query(User).get(user_id)
```

## Error Handling

Define domain-specific exceptions. Catch specific exceptions, not bare `except`:

```python
class AppError(Exception):
    """Base for all application errors."""

class NotFoundError(AppError):
    def __init__(self, entity: str, entity_id: str):
        super().__init__(f"{entity} {entity_id} not found")
        self.entity = entity
        self.entity_id = entity_id

class ValidationError(AppError):
    def __init__(self, field: str, message: str):
        super().__init__(f"{field}: {message}")
        self.field = field
```

## Configuration

Use environment variables with typed defaults:

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    debug: bool = False
    max_connections: int = 10

    model_config = {"env_prefix": "APP_"}

settings = Settings()
```

## Logging

Use the standard `logging` module with structured context:

```python
import logging

logger = logging.getLogger(__name__)

def process_order(order_id: str):
    logger.info("Processing order", extra={"order_id": order_id})
```
