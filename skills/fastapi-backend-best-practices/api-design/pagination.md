## Pagination

### Offset-based (Simple Lists)

```python
# shared/pagination.py
from pydantic import BaseModel, Field
from fastapi import Query


class PaginationParams(BaseModel):
    offset: int = Field(0, ge=0)
    limit: int = Field(20, ge=1, le=100)


def get_pagination(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
) -> PaginationParams:
    return PaginationParams(offset=offset, limit=limit)


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    offset: int
    limit: int
```

### Cursor-based (Infinite Scroll, High Volume)

```python
from pydantic import BaseModel
from datetime import datetime
import base64
import json


class CursorParams(BaseModel):
    cursor: str | None = None
    limit: int = Field(20, ge=1, le=100)


class CursorResponse[T](BaseModel):
    items: list[T]
    next_cursor: str | None
    has_next: bool


def encode_cursor(created_at: datetime, id: int) -> str:
    data = {"c": created_at.isoformat(), "i": id}
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode()


def decode_cursor(cursor: str) -> tuple[datetime, int]:
    data = json.loads(base64.urlsafe_b64decode(cursor))
    return datetime.fromisoformat(data["c"]), data["i"]


# Used in Repository Protocol
class PostRepository(Protocol):
    async def get_feed(
        self,
        cursor: str | None,
        limit: int,
    ) -> CursorResponse[PostResponse]: ...


# Cursor utility — Used in DB implementations
async def build_cursor_response(
    items: list,
    limit: int,
    cursor_factory: Callable,  # Generates cursor from the last item
) -> CursorResponse:
    """Invoked after fetching limit+1 items from DB.
    The specific query logic is handled in the repository implementation of the DB skill.
    """
    has_next = len(items) > limit
    if has_next:
        items = items[:limit]

    next_cursor = cursor_factory(items[-1]) if has_next and items else None

    return CursorResponse(
        items=items,
        next_cursor=next_cursor,
        has_next=has_next,
    )
```

---
