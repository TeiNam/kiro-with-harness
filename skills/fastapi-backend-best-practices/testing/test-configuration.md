## Test Configuration

### conftest.py

```python
# tests/conftest.py
import asyncio
from collections.abc import AsyncGenerator
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import create_app
from src.dependencies import get_db


@pytest.fixture(scope="session")
def event_loop():
    """Session-scoped event loop."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def mock_db():
    """DB Mocking — For Service/Router unit testing.
    For actual DB fixtures, refer to the mounted DB skill's testing guide.
    e.g., SQLAlchemy → Transaction rollback isolation
          MongoDB → mongomock or testcontainers
          DynamoDB → moto or localstack
    """
    return AsyncMock()


@pytest_asyncio.fixture
async def client(mock_db) -> AsyncGenerator[AsyncClient, None]:
    """HTTP client for testing."""
    app = create_app()

    async def override_get_db():
        yield mock_db

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
```

### Actual DB Integration Testing

Integration test fixtures using a real DB vary by DB type.
Refer to the mounted DB skill's testing guide and add them to `conftest.py`.

```python
# Example: Integration test fixture pattern provided by DB skills

# RDBMS (SQLAlchemy) → Isolation via transaction rollback
# @pytest_asyncio.fixture
# async def db_session(test_engine):
#     async with session_factory() as session:
#         async with session.begin():
#             yield session
#             await session.rollback()

# MongoDB → testcontainers
# @pytest_asyncio.fixture
# async def mongo_db():
#     async with AsyncMongoClient("mongodb://localhost:27017") as client:
#         db = client.test_db
#         yield db
#         await client.drop_database("test_db")

# DynamoDB → moto mock
# @pytest_asyncio.fixture
# async def dynamo_table():
#     with mock_dynamodb():
#         ...
```

### pyproject.toml Test Configuration

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
addopts = "-v --cov=src --cov-report=term-missing --cov-fail-under=80"
```

---
