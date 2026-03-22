## Dependency Injection Pattern

```python
# src/dependencies.py
from collections.abc import AsyncGenerator
from fastapi import Depends

from src.config import Settings, get_settings


# DB Session DI — Implemented in infra/database.py (refer to DB skill)
# Below is an interface example. The actual implementation varies based on the DB used.
async def get_db() -> AsyncGenerator:
    """DI that provides a DB session/connection.
    Implementation examples:
    - RDBMS: async with session_factory() as session: yield session
    - MongoDB: yield db_client.get_database()
    - DynamoDB: yield dynamodb_resource
    """
    raise NotImplementedError("Implement in infra/database.py")


# Module-specific DI chain
# src/users/dependencies.py
from src.users.repository import UserRepository  # Implementation
from src.users.service import UserService


async def get_user_repository(
    db=Depends(get_db),
) -> UserRepository:
    return UserRepository(db)


async def get_user_service(
    repo: UserRepository = Depends(get_user_repository),
) -> UserService:
    return UserService(repo)
```
