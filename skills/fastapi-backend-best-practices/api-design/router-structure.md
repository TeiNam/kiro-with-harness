## Router Structure

### Router Separation Principles

```python
# src/users/router.py
from fastapi import APIRouter, Depends, Query, status

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=PaginatedResponse[UserResponse])
async def list_users(
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    service: UserService = Depends(get_user_service),
) -> PaginatedResponse[UserResponse]:
    users, total = await service.get_list(offset=offset, limit=limit)
    return PaginatedResponse(items=users, total=total, offset=offset, limit=limit)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    return await service.get_by_id(user_id)


@router.post("", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def create_user(
    data: UserCreate,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    return await service.create(data)


@router.patch("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    data: UserUpdate,
    service: UserService = Depends(get_user_service),
) -> UserResponse:
    return await service.update(user_id, data)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int,
    service: UserService = Depends(get_user_service),
) -> None:
    await service.delete(user_id)
```

### Router Rules
- `GET` — Read (idempotent)
- `POST` — Create (201)
- `PATCH` — Partial update (idempotent)
- `PUT` — Full replace (idempotent)
- `DELETE` — Delete (204, no body)
- Paths: Plural, kebab-case (`/user-profiles`, `/order-items`)
- Delegate business logic to the Service layer (keep routers thin)

---
