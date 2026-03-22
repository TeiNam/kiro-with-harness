## Basic Principles

### async vs sync Endpoints

```python
# ✅ I/O bound → async def
@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
):
    return await service.get_by_id(user_id)

# ✅ CPU bound / sync library → def (runs automatically in threadpool)
@router.post("/reports")
def generate_report(data: ReportRequest):
    return create_pdf(data)  # Sync CPU task

# ❌ Sync blocking call in async def
@router.get("/bad")
async def bad_endpoint():
    time.sleep(5)  # Event loop blocked!
    requests.get("https://api.example.com")  # Blocking!
```

### Async Context Manager

```python
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator
from typing import Protocol


class UnitOfWork(Protocol):
    """DB-agnostic transaction interface.
    Implementation provided by DB skill.
    """
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...


@asynccontextmanager
async def managed_transaction(
    uow: UnitOfWork,
) -> AsyncGenerator[UnitOfWork, None]:
    """Context manager ensuring transaction completion."""
    try:
        yield uow
        await uow.commit()
    except Exception:
        await uow.rollback()
        raise


# Usage
async def transfer_funds(
    from_id: int, to_id: int, amount: Decimal, uow: UnitOfWork
) -> None:
    async with managed_transaction(uow):
        await debit_account(uow, from_id, amount)
        await credit_account(uow, to_id, amount)
```

---
