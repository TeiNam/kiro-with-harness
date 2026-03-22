## Service Unit Testing

```python
# tests/users/test_service.py
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.users.service import UserService
from src.users.schemas import UserCreate
from src.domain.exceptions import NotFoundError


class TestUserService:
    @pytest.fixture
    def mock_repo(self):
        repo = AsyncMock()
        return repo

    @pytest.fixture
    def service(self, mock_repo):
        return UserService(mock_repo)

    async def test_get_by_id_found(self, service, mock_repo):
        mock_user = MagicMock(id=1, name="Alice", email="alice@test.com")
        mock_repo.get_by_id.return_value = mock_user

        result = await service.get_by_id(1)
        assert result.name == "Alice"
        mock_repo.get_by_id.assert_awaited_once_with(1)

    async def test_get_by_id_not_found(self, service, mock_repo):
        mock_repo.get_by_id.return_value = None

        with pytest.raises(NotFoundError):
            await service.get_by_id(999)

    async def test_create(self, service, mock_repo):
        data = UserCreate(name="Bob", email="bob@test.com", password="secret")
        mock_repo.create.return_value = MagicMock(id=1, name="Bob")

        result = await service.create(data)
        assert result.name == "Bob"
        mock_repo.create.assert_awaited_once()
```

---
