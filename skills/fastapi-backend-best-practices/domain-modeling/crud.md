# CRUD

## Basic CRUD Structure

```python
# schemas.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    price: int = Field(ge=0, description="in Won")
    category: str


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    """Make all fields Optional for partial updates."""
    name: str | None = None
    price: int | None = None
    category: str | None = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    updated_at: datetime
```

## Repository Protocol

```python
# repository.py
from typing import Protocol


class ProductRepository(Protocol):
    """DB-agnostic Repository interface.
    Specific implementation depends on the mounted DB skill.
    """

    async def get_by_id(self, product_id: int) -> Product | None: ...

    async def get_list(
        self,
        *,
        offset: int = 0,
        limit: int = 20,
        category: str | None = None,
    ) -> tuple[list[Product], int]: ...

    async def create(self, data: ProductCreate) -> Product: ...

    async def update(
        self, product_id: int, data: ProductUpdate
    ) -> Product | None: ...

    async def delete(self, product_id: int) -> bool: ...
```

## Service

```python
# service.py
class ProductService:
    """Business logic. Depends only on the Repository Protocol."""

    def __init__(self, repo: ProductRepository):
        self.repo = repo

    async def get_by_id(self, product_id: int) -> Product:
        product = await self.repo.get_by_id(product_id)
        if not product:
            raise ProductNotFoundError(product_id)
        return product

    async def create(self, data: ProductCreate) -> Product:
        return await self.repo.create(data)

    async def update(
        self, product_id: int, data: ProductUpdate
    ) -> Product:
        product = await self.repo.update(product_id, data)
        if not product:
            raise ProductNotFoundError(product_id)
        return product

    async def delete(self, product_id: int) -> None:
        deleted = await self.repo.delete(product_id)
        if not deleted:
            raise ProductNotFoundError(product_id)
```
