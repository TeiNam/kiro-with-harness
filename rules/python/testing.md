---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

> This file extends [common/testing.md](../common/testing.md) with Python-specific content.

## Framework: pytest

Use `pytest` as the default test framework. Avoid `unittest.TestCase` unless integrating with legacy code.

```python
def test_calculate_total():
    order = Order(items=[Item(price=10), Item(price=20)])
    assert order.total == 30
```

## Fixtures

Use fixtures for setup/teardown. Prefer function-scoped fixtures; use broader scopes only when setup is expensive:

```python
import pytest

@pytest.fixture
def db_session():
    session = create_test_session()
    yield session
    session.rollback()
    session.close()

@pytest.fixture(scope="module")
def api_client():
    """Expensive setup — shared across module."""
    client = TestClient(app)
    yield client

def test_create_user(db_session):
    user = create_user(db_session, name="Alice")
    assert user.id is not None
```

## Parametrize

Use `@pytest.mark.parametrize` to test multiple inputs without duplicating test functions:

```python
@pytest.mark.parametrize("input_val,expected", [
    ("hello@example.com", True),
    ("not-an-email", False),
    ("", False),
    ("a@b.c", True),
])
def test_validate_email(input_val, expected):
    assert validate_email(input_val) == expected
```

## Mocking

Use `unittest.mock` or `pytest-mock`. Patch at the point of import, not at the source:

```python
def test_send_notification(mocker):
    mock_send = mocker.patch("myapp.notifications.smtp_client.send")
    notify_user(user_id="123", message="Hello")
    mock_send.assert_called_once()
```

## Async Tests

Use `pytest-asyncio` for testing async code:

```python
import pytest

@pytest.mark.asyncio
async def test_fetch_user():
    user = await fetch_user("123")
    assert user.name == "Alice"
```

## Exception Testing

Use `pytest.raises` as a context manager:

```python
def test_invalid_age():
    with pytest.raises(ValueError, match="must be positive"):
        create_user(name="Bob", age=-1)
```

## Test Organization

```
tests/
  conftest.py          # Shared fixtures
  test_models.py       # Unit tests
  test_services.py
  integration/
    conftest.py        # Integration-specific fixtures
    test_api.py
```

- Name test files `test_*.py`
- Name fixtures in `conftest.py` at the appropriate directory level
- Keep test helpers in `tests/helpers/` if shared across multiple test files

## Coverage

```bash
pytest --cov=myapp --cov-report=term-missing
```

Focus coverage on business logic, not boilerplate.
