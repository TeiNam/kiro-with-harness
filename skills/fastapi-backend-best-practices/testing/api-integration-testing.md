## API Integration Testing

```python
# tests/users/test_router.py
import pytest
from httpx import AsyncClient


class TestUserRouter:
    async def test_create_user(self, client: AsyncClient):
        response = await client.post(
            "/api/v1/users",
            json={"name": "Alice", "email": "alice@test.com", "password": "secret123"},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Alice"
        assert data["email"] == "alice@test.com"
        assert "password" not in data  # Password not exposed in response
        assert "id" in data

    async def test_create_user_duplicate_email(self, client: AsyncClient):
        payload = {"name": "Bob", "email": "dup@test.com", "password": "pass"}
        await client.post("/api/v1/users", json=payload)

        response = await client.post("/api/v1/users", json=payload)
        assert response.status_code == 409

    async def test_get_user_not_found(self, client: AsyncClient):
        response = await client.get("/api/v1/users/99999")
        assert response.status_code == 404
        assert response.json()["code"] == "NOT_FOUND"

    async def test_list_users_pagination(self, client: AsyncClient):
        # Setup
        for i in range(5):
            await client.post(
                "/api/v1/users",
                json={"name": f"User{i}", "email": f"u{i}@test.com", "password": "p"},
            )

        response = await client.get("/api/v1/users?offset=0&limit=3")
        assert response.status_code == 200
        data = response.json()
        assert len(data["items"]) == 3
        assert data["total"] >= 5

    async def test_update_user_partial(self, client: AsyncClient):
        # Setup
        create_resp = await client.post(
            "/api/v1/users",
            json={"name": "Charlie", "email": "charlie@test.com", "password": "p"},
        )
        user_id = create_resp.json()["id"]

        response = await client.patch(
            f"/api/v1/users/{user_id}",
            json={"name": "Charlie Updated"},
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Charlie Updated"
        assert response.json()["email"] == "charlie@test.com"  # Unchanged

    async def test_delete_user(self, client: AsyncClient):
        create_resp = await client.post(
            "/api/v1/users",
            json={"name": "Delete Me", "email": "del@test.com", "password": "p"},
        )
        user_id = create_resp.json()["id"]

        response = await client.delete(f"/api/v1/users/{user_id}")
        assert response.status_code == 204

        get_resp = await client.get(f"/api/v1/users/{user_id}")
        assert get_resp.status_code == 404
```

---
