# Side Effects: Files, Env, Stdout, Logs, Time

## Contents

- Filesystem — `tmp_path`
- Env Vars — `monkeypatch`
- CWD
- Stdout / Stderr — `capsys` and `capfd`
- Logs — `caplog`
- Time — Freeze It
- Randomness — Seed It
- Subprocess
- HTTP — `responses` / `respx` / `httpx_mock`
- Database
- Pitfalls
- Related

For anything that touches the world, pytest gives you a fixture that captures or sandboxes it.

## Filesystem — `tmp_path`

```python
def test_write_then_read(tmp_path):
    p = tmp_path / "out.txt"
    p.write_text("hello")
    assert p.read_text() == "hello"
```

`tmp_path` is a `pathlib.Path` to a per-test temp dir, automatically deleted. Use it for any test that reads/writes files.

For session-scoped temp dirs:

```python
@pytest.fixture(scope="session")
def shared_workspace(tmp_path_factory):
    return tmp_path_factory.mktemp("shared")
```

Avoid `tmpdir` — it returns a legacy `py.path.local` object. `tmp_path` is the modern Path-based replacement.

## Env Vars — `monkeypatch`

```python
def test_reads_env(monkeypatch):
    monkeypatch.setenv("API_TOKEN", "secret")
    monkeypatch.delenv("DEBUG", raising=False)
    assert load_config().token == "secret"
```

Auto-restored after the test. Use this for **any** env var manipulation — never `os.environ[...] = ...` directly.

## CWD

```python
def test_runs_from_dir(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    main()                       # CWD is tmp_path; auto-restored
```

## Stdout / Stderr — `capsys` and `capfd`

```python
def test_prints_greeting(capsys):
    print("hello")
    print("error", file=sys.stderr)

    captured = capsys.readouterr()
    assert captured.out == "hello\n"
    assert captured.err == "error\n"
```

- `capsys` captures Python-level stdout/stderr.
- `capfd` captures at the file-descriptor level — needed when subprocess output is involved.
- `capsysbinary` / `capfdbinary` for bytes.

## Logs — `caplog`

```python
import logging

def test_logs_warning(caplog):
    with caplog.at_level(logging.WARNING):
        process_invalid_input()

    assert "invalid input" in caplog.text
    assert any(r.levelname == "WARNING" for r in caplog.records)
```

- `caplog.records` — list of `logging.LogRecord`.
- `caplog.text` — concatenated formatted output.
- `caplog.set_level(...)` — set minimum level for all loggers.

For a specific logger:

```python
caplog.set_level(logging.INFO, logger="myapp.payments")
```

## Time — Freeze It

```python
from freezegun import freeze_time

@freeze_time("2026-01-01 12:00:00")
def test_timestamp():
    assert now().isoformat() == "2026-01-01T12:00:00"


# Move the clock during a test
def test_expiry():
    with freeze_time("2026-01-01") as frozen:
        token = issue_token(ttl_hours=1)
        assert verify(token).valid

        frozen.tick(delta=timedelta(hours=2))
        assert not verify(token).valid
```

For pure stdlib testing without freezegun: `monkeypatch.setattr(time, "time", lambda: 1234567890.0)` works for narrow cases.

## Randomness — Seed It

```python
import random

@pytest.fixture(autouse=True)
def fixed_random_seed():
    random.seed(0)
    yield
```

For numpy:

```python
import numpy as np

@pytest.fixture(autouse=True)
def fixed_numpy_seed():
    np.random.seed(0)
    yield
```

For libraries with their own RNG (PyTorch, TensorFlow), seed them in the same fixture.

## Subprocess

```python
def test_cli(tmp_path):
    result = subprocess.run(
        ["python", "-m", "myapp", "--out", str(tmp_path / "out.txt")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "done" in result.stdout
    assert (tmp_path / "out.txt").exists()
```

Prefer importing and calling Python code directly. Drop to subprocess only when testing actual command-line behavior.

## HTTP — `responses` / `respx` / `httpx_mock`

For mocking outbound HTTP without a real server:

```python
# requests
import responses

@responses.activate
def test_fetch():
    responses.add(responses.GET, "https://api.example.com/users",
                  json=[{"id": 1}], status=200)
    assert fetch_users()[0]["id"] == 1


# httpx (sync or async)
def test_async_fetch(respx_mock):
    respx_mock.get("https://api.example.com/users").mock(
        return_value=httpx.Response(200, json=[{"id": 1}])
    )
    ...
```

Don't roll your own HTTP fakes when these libraries exist.

## Database

For a small fast suite, use SQLite in-memory or `pytest-postgresql` for a real Postgres per session. See `common-patterns.md` for the transaction-rollback pattern that keeps each test's writes isolated.

## Pitfalls

- **Forgetting auto-restore.** `os.environ[...] = ...` persists across tests. Always `monkeypatch`.
- **Capturing the wrong stream.** Subprocess output → `capfd`, not `capsys`.
- **Logger config not picked up.** `caplog` requires propagation enabled; if you `disable_existing_loggers=True` in dictConfig, `caplog` may see nothing.
- **Real network calls leaking through.** Add a fixture that fails the test on any unmocked outbound HTTP:

```python
@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def fail(*a, **kw):
        raise RuntimeError("network call leaked into tests")
    monkeypatch.setattr("socket.socket", fail)
```

## Related

- [mocking.md](mocking.md) — `monkeypatch` vs `unittest.mock.patch`
- [common-patterns.md](common-patterns.md) — DB / API patterns
