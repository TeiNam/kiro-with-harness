# Mocking and Patching

## Contents

- Where to Patch
- Three Tools
- monkeypatch
- `@patch` Decorator
- `patch` as Context Manager
- Configuring Mock Behavior
- Asserting Call Patterns
- `autospec=True` — Enforce the Signature
- Mocking Classes
- Mocking Context Managers
- Async Mocks
- Fakes Over Mocks (When Reasonable)
- Anti-Patterns
- Related

Mock the **boundary** — anything that crosses a process or network. Don't mock your own code's internals.

## Where to Patch

`patch("path")` replaces the name *at the path you give*. The path must be the place where the function is **looked up at call time**, not where it's defined.

```python
# myapp/email.py
def send(to, body): ...


# myapp/notifier.py
from myapp.email import send

def notify_user(user, body):
    send(user.email, body)
```

```python
# Wrong — patches the definition site, but notifier already imported `send`
@patch("myapp.email.send")
def test_notify(send_mock): ...   # send still real inside notifier!


# Right — patch the use site
@patch("myapp.notifier.send")
def test_notify(send_mock):
    notify_user(User(email="a@x"), "hi")
    send_mock.assert_called_once_with("a@x", "hi")
```

## Three Tools

| Tool | When |
|---|---|
| `monkeypatch` (pytest fixture) | Patch attrs, env vars, `sys.path` — auto-undone after test |
| `unittest.mock.patch` | Patch import targets, used as decorator or context manager |
| `MagicMock` / `Mock` | Build standalone fake objects |

## monkeypatch

```python
def test_uses_default_url(monkeypatch):
    monkeypatch.setenv("API_URL", "http://test")
    monkeypatch.delenv("DEBUG", raising=False)
    monkeypatch.setattr("myapp.config.timeout", 1)
    monkeypatch.setattr(requests, "get", fake_get)
    ...   # auto-undo at end of test
```

Use monkeypatch for ad-hoc replacements, especially env vars, where `@patch` is overkill.

## `@patch` Decorator

```python
from unittest.mock import patch

@patch("myapp.notifier.send")
def test_notify(send_mock):
    send_mock.return_value = None
    notify_user(User(email="a@x"), "hi")
    send_mock.assert_called_once_with("a@x", "hi")
```

Multiple patches stack **bottom-up** (closest decorator → first arg):

```python
@patch("myapp.notifier.send")
@patch("myapp.notifier.log")
def test_notify(log_mock, send_mock):    # note order!
    ...
```

## `patch` as Context Manager

Easier when you only need to patch part of a test:

```python
def test_notify_then_real():
    real_thing()
    with patch("myapp.notifier.send") as send_mock:
        notify_user(User(email="a@x"), "hi")
        send_mock.assert_called_once()
    real_thing()    # send is real again
```

## Configuring Mock Behavior

```python
mock = MagicMock()

# Return value
mock.return_value = "result"
mock()                          # → "result"

# Different value per call
mock.side_effect = [1, 2, 3]
mock(); mock(); mock()          # → 1, 2, 3

# Raise an exception
mock.side_effect = ConnectionError("boom")

# Compute from arguments
mock.side_effect = lambda x: x * 2
mock(5)                          # → 10
```

## Asserting Call Patterns

```python
mock.assert_called()                          # called at least once
mock.assert_called_once()                     # exactly once
mock.assert_not_called()
mock.assert_called_with(1, key="v")           # last call's args
mock.assert_called_once_with(1, key="v")      # exactly one call with those args
mock.assert_any_call(1, 2)                    # any call matched

mock.call_count                               # int
mock.call_args                                # last call's call_args
mock.call_args_list                           # all calls
```

For partial argument matching, `unittest.mock.ANY`:

```python
from unittest.mock import ANY
mock.assert_called_with(ANY, key="v")   # don't care about the positional
```

## `autospec=True` — Enforce the Signature

```python
@patch("myapp.notifier.send", autospec=True)
def test_notify(send_mock):
    notify_user(User(email="a@x"), "hi")
    # send_mock now has the same signature as the real send;
    # calling with wrong args raises TypeError
```

Without `autospec`, mocks accept any call. Always use `autospec=True` when patching a function or class — catches API drift.

## Mocking Classes

```python
@patch("myapp.repo.Database", autospec=True)
def test_service(db_class_mock):
    instance = db_class_mock.return_value     # the instance Database() returns
    instance.query.return_value = [User(1, "Alice")]

    service = UserService(Database())
    users = service.list_users()
    assert users[0].name == "Alice"
    instance.query.assert_called_once_with("SELECT * FROM users")
```

`db_class_mock` is the class; `.return_value` is what `Database()` returns.

## Mocking Context Managers

```python
from unittest.mock import mock_open, patch

@patch("builtins.open", new_callable=mock_open, read_data="hello")
def test_read_file(mock_file):
    assert read_file("x.txt") == "hello"
    mock_file.assert_called_once_with("x.txt", "r")
```

## Async Mocks

`AsyncMock` (3.8+) is awaitable. `@patch` auto-wraps async targets:

```python
from unittest.mock import AsyncMock, patch

@patch("myapp.service.fetch", new_callable=AsyncMock)
async def test_fetch(fetch_mock):
    fetch_mock.return_value = {"ok": True}
    assert await get_status() == {"ok": True}
    fetch_mock.assert_awaited_once()
```

Use `assert_awaited*` (not `assert_called*`) for async expectations.

## Fakes Over Mocks (When Reasonable)

A **fake** is a real implementation that's good enough for tests — in-memory DB, fake clock, in-memory message bus. Fakes give you behavior; mocks only give you call records.

```python
class FakeRepo:
    def __init__(self):
        self.users: dict[int, User] = {}

    def save(self, user: User) -> None:
        self.users[user.id] = user

    def get(self, user_id: int) -> User | None:
        return self.users.get(user_id)


def test_service_uses_repo():
    repo = FakeRepo()
    service = UserService(repo)
    service.create("Alice")
    assert repo.get(1).name == "Alice"
```

Prefer fakes for collaborator interfaces you own. Use mocks for code at the system boundary that's expensive to wire up.

## Anti-Patterns

- **Mocking what you're testing.** If `service.create_user` is the unit under test, don't patch it.
- **Forgetting `autospec`.** `mock.do_anything()` quietly succeeds. Tests stay green when the real API breaks.
- **Patching at the definition site.** See "Where to Patch" — first thing to check when a mock isn't taking effect.
- **Mocks asserting their own setup.** `mock.return_value = X; assert mock.return_value == X` proves nothing.
- **Over-asserting.** Asserting every internal method call locks the implementation. Test the **outcome**.

## Related

- [async-testing.md](async-testing.md) — `AsyncMock` patterns
- [side-effects.md](side-effects.md) — when to use `monkeypatch` vs `patch`
