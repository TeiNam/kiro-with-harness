# Common Patterns

## Contents

- FastAPI (sync `TestClient`)
- FastAPI (async `httpx.AsyncClient`)
- Database — Transaction Rollback per Test
- Database — In-Memory SQLite
- Real Postgres via testcontainers
- Class-Based Tests
- Service + Repository (Hexagonal)
- CLI Tests with Click / Typer
- Error Path Testing
- Snapshot Testing
- Related

Templates for the situations that come up in every project: API tests, DB tests, class-based tests, and the transaction-rollback pattern.

## FastAPI (sync `TestClient`)

```python
import pytest
from fastapi.testclient import TestClient
from myapp.main import app

@pytest.fixture
def client():
    return TestClient(app)


def test_get_user(client):
    r = client.get("/api/users/1")
    assert r.status_code == 200
    assert r.json()["id"] == 1


def test_create_user(client):
    r = client.post("/api/users", json={"name": "Alice", "email": "a@x"})
    assert r.status_code == 201
    assert r.json()["name"] == "Alice"
```

## FastAPI (async `httpx.AsyncClient`)

```python
import pytest_asyncio
from httpx import AsyncClient
from myapp.main import app

@pytest_asyncio.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as c:
        yield c


async def test_get_user(client):
    r = await client.get("/api/users/1")
    assert r.status_code == 200
```

Use the async client when the app does meaningful async work (DB pools, downstream HTTP). The sync `TestClient` spins up a thread and can hide async bugs.

## Database — Transaction Rollback per Test

For SQLAlchemy:

```python
import pytest
from sqlalchemy.orm import Session
from myapp.db import engine

@pytest.fixture
def db_session():
    """Each test runs in a transaction that rolls back at the end."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)

    yield session

    session.close()
    transaction.rollback()
    connection.close()


def test_create_user(db_session):
    user = User(name="Alice", email="alice@x")
    db_session.add(user)
    db_session.flush()                      # flush, don't commit

    found = db_session.query(User).filter_by(name="Alice").one()
    assert found.email == "alice@x"
```

Every test starts with a clean DB regardless of what the previous test wrote. Faster than truncating tables; avoids cross-test pollution.

## Database — In-Memory SQLite

When the code under test only needs minimal SQL:

```python
@pytest.fixture
def db():
    conn = sqlite3.connect(":memory:")
    conn.executescript(open("schema.sql").read())
    yield conn
    conn.close()
```

For Postgres-only features (jsonb, partial indexes, RLS), use a real Postgres via `pytest-postgresql` or `testcontainers`.

## Real Postgres via testcontainers

```python
import pytest
from testcontainers.postgres import PostgresContainer
from sqlalchemy import create_engine

@pytest.fixture(scope="session")
def pg_url():
    with PostgresContainer("postgres:16") as pg:
        yield pg.get_connection_url()


@pytest.fixture(scope="session")
def engine(pg_url):
    eng = create_engine(pg_url)
    Base.metadata.create_all(eng)
    return eng
```

Real DB, real types, real SQL. Slower than SQLite but closer to production.

## Class-Based Tests

Group related tests by subject. Use `setup_method` or an autouse fixture for per-test setup.

```python
class TestCalculator:
    @pytest.fixture(autouse=True)
    def _setup(self):
        self.calc = Calculator()

    def test_add(self):
        assert self.calc.add(2, 3) == 5

    def test_divide_by_zero(self):
        with pytest.raises(ZeroDivisionError):
            self.calc.divide(10, 0)
```

Don't add `__init__` to test classes — pytest will refuse to collect them.

## Service + Repository (Hexagonal)

Mock the **port**, not the adapter:

```python
class FakeUserRepo:
    def __init__(self):
        self.users: dict[int, User] = {}

    def save(self, user: User) -> None:
        self.users[user.id] = user

    def get(self, user_id: int) -> User | None:
        return self.users.get(user_id)


def test_create_user_persists():
    repo = FakeUserRepo()
    service = UserService(repo)

    service.create_user(name="Alice")

    assert any(u.name == "Alice" for u in repo.users.values())
```

A fake repo gives you behavior; you don't have to assert "save was called" — you assert the user actually exists.

## CLI Tests with Click / Typer

```python
from click.testing import CliRunner
from myapp.cli import cli

def test_cli_help():
    runner = CliRunner()
    result = runner.invoke(cli, ["--help"])
    assert result.exit_code == 0
    assert "Usage:" in result.output


def test_cli_command():
    runner = CliRunner()
    with runner.isolated_filesystem():
        result = runner.invoke(cli, ["init", "myproj"])
        assert result.exit_code == 0
        assert os.path.exists("myproj")
```

`isolated_filesystem()` chdirs into a temp directory.

## Error Path Testing

For each public function with a non-trivial error path:

```python
@pytest.mark.parametrize("payload,error,match", [
    ({}, ValidationError, "name is required"),
    ({"name": ""}, ValidationError, "name must be non-empty"),
    ({"name": "x", "age": -1}, ValidationError, "age must be"),
])
def test_validate_user_errors(payload, error, match):
    with pytest.raises(error, match=match):
        validate_user(payload)
```

One parametrized test covers the entire error surface — easier to maintain than 5 separate tests.

## Snapshot Testing

For complex outputs (rendered HTML, JSON responses, AST), `syrupy` records the first run and compares afterwards:

```python
def test_render(snapshot):
    assert render_page(user) == snapshot
```

Update with `pytest --snapshot-update` after intentional changes. Use sparingly — snapshot tests rot fast if the output is noisy.

## Related

- [fixtures.md](fixtures.md) — fixture patterns
- [side-effects.md](side-effects.md) — file/HTTP/log/time isolation
