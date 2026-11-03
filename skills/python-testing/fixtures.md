# Fixtures

## Contents

- Basic Fixture
- Setup / Teardown via `yield`
- Scopes
- Multiple Fixtures
- Parameterized Fixtures
- Autouse Fixtures
- `conftest.py` — Shared Fixtures
- Built-in Fixtures Worth Knowing
- Factory Fixtures
- Common Mistakes
- Related

Fixtures are pytest's dependency-injection. Test asks for `db_session` by name; pytest finds the fixture and provides it. Setup, teardown, scope, parameterization all flow from there.

## Basic Fixture

```python
import pytest

@pytest.fixture
def sample_user():
    return User(id=1, name="Alice", email="alice@example.com")


def test_user_name(sample_user):
    assert sample_user.name == "Alice"
```

The function name is the injection key. Tests request fixtures by parameter name.

## Setup / Teardown via `yield`

```python
@pytest.fixture
def db():
    conn = sqlite3.connect(":memory:")
    conn.executescript("CREATE TABLE users (id INTEGER, name TEXT);")
    yield conn          # everything before yield = setup
    conn.close()        # everything after yield = teardown


def test_insert(db):
    db.execute("INSERT INTO users VALUES (1, 'Alice')")
    assert db.execute("SELECT name FROM users").fetchone() == ("Alice",)
```

Teardown runs even if the test fails. For multi-step cleanup, use `try/finally` after the yield.

## Scopes

```python
@pytest.fixture                       # default: function — runs per test
def per_test(): ...

@pytest.fixture(scope="class")        # once per test class
def per_class(): ...

@pytest.fixture(scope="module")       # once per .py file
def per_module(): ...

@pytest.fixture(scope="package")      # once per package (3.5+)
def per_package(): ...

@pytest.fixture(scope="session")      # once per `pytest` invocation
def per_session(): ...
```

Pick the **broadest scope that's still safe**. Wider scope = faster run, but state leaks between tests are deadly. Anything that holds mutable state should be `function`. Connection pools, started servers, large compiled artifacts → `session`.

## Multiple Fixtures

```python
@pytest.fixture
def user():
    return User(id=1, name="Alice")


@pytest.fixture
def admin():
    return User(id=2, name="Admin", role="admin")


def test_admin_can_manage(user, admin):
    assert admin.can_manage(user)
```

Fixtures can request other fixtures:

```python
@pytest.fixture
def authed_client(client, user):
    client.login(user)
    return client
```

pytest builds a DAG and resolves it.

## Parameterized Fixtures

The same fixture, run multiple times with different inputs. Every test that uses it runs once per param.

```python
@pytest.fixture(params=["sqlite", "postgres", "mysql"])
def db(request):
    return Database(request.param)


def test_query_returns_one(db):
    assert db.query("SELECT 1").one() == (1,)
# runs 3 times — db[sqlite], db[postgres], db[mysql]
```

For nicer test IDs:

```python
@pytest.fixture(params=[
    pytest.param("sqlite", id="sqlite"),
    pytest.param("postgres", id="pg", marks=pytest.mark.slow),
])
def db(request): ...
```

## Autouse Fixtures

Run automatically without being requested.

```python
@pytest.fixture(autouse=True)
def reset_singleton():
    Config.reset()
    yield
    Config.cleanup()
```

Use sparingly — autouse fixtures are invisible at the call site and surprise people. Best for **pure cleanup** (resetting global state, freezing time, isolating temp dirs).

## `conftest.py` — Shared Fixtures

Fixtures defined in `tests/conftest.py` are available to **every test under `tests/`** without import. Subdirectories can have their own `conftest.py`.

```python
# tests/conftest.py
import pytest
from myapp import create_app

@pytest.fixture
def app():
    return create_app(testing=True)


@pytest.fixture
def client(app):
    return app.test_client()


# tests/api/conftest.py — only API tests get these
@pytest.fixture
def auth_headers(client):
    response = client.post("/login", json={"u": "test", "p": "test"})
    return {"Authorization": f"Bearer {response.json['token']}"}
```

Lookup is bottom-up: closest `conftest.py` wins. Use this to override a global fixture for a subtree.

## Built-in Fixtures Worth Knowing

| Fixture | Returns | Use for |
|---|---|---|
| `tmp_path` | `pathlib.Path` | Temp dir per test, auto cleanup |
| `tmp_path_factory` | factory | Session-scoped temp dirs |
| `monkeypatch` | object | Patch attrs / env vars / `sys.path` |
| `capsys` / `capfd` | object | Capture stdout/stderr |
| `caplog` | object | Capture log records |
| `request` | object | Introspect requesting test |
| `pytestconfig` | config | Read `pytest.ini` / CLI args |
| `recwarn` | warning list | Capture warnings |

## Factory Fixtures

When you need to **build many objects per test** with varying attrs, return a factory:

```python
@pytest.fixture
def make_user():
    created = []

    def _make(**overrides):
        defaults = {"id": len(created) + 1, "name": "Alice", "is_active": True}
        user = User(**(defaults | overrides))
        created.append(user)
        return user

    yield _make
    for u in created:
        u.delete()


def test_two_users(make_user):
    a = make_user(name="A")
    b = make_user(name="B", is_active=False)
    assert a.is_active and not b.is_active
```

For objects with many fields, `factory_boy` or `polyfactory` give you this pattern with batteries.

## Common Mistakes

- **Too-wide scope on stateful fixtures.** A `module`-scoped DB shared by mutating tests fails non-deterministically by test order.
- **Yielding before setup is complete.** Setup exceptions become teardown errors.
- **Heavy work in `function`-scoped fixtures.** If the build is expensive, raise scope and clone/reset state per test.
- **Fixture that hides what's being tested.** If a fixture configures the entire test scenario, the test body becomes trivial — split the scenario into the test instead.

## Related

- [parametrize.md](parametrize.md) — `parametrize` vs parametrized fixtures
- [common-patterns.md](common-patterns.md) — DB / FastAPI client fixtures
