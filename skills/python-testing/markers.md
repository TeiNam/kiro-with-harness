# Markers and Test Selection

## Contents

- Custom Markers
- Register Markers (Required with `--strict-markers`)
- Selection Expressions
- Built-in Markers
- Skip / Skipif
- Xfail
- Marker on a Class
- Marker on a Module
- Combining with Parametrize
- Selection by Keyword (`-k`)
- Related

Markers tag tests so you can run subsets. Slow vs fast, integration vs unit, platform-specific, expected-fail.

## Custom Markers

```python
import pytest

@pytest.mark.slow
def test_full_pipeline():
    time.sleep(5)
    ...


@pytest.mark.integration
def test_real_api():
    response = requests.get("https://api.example.com/health")
    assert response.ok


@pytest.mark.unit
def test_pure_logic():
    assert calculate(2, 3) == 5
```

## Register Markers (Required with `--strict-markers`)

```toml
# pyproject.toml
[tool.pytest.ini_options]
addopts = ["--strict-markers"]
markers = [
    "slow: marks tests as slow (>1s)",
    "integration: requires external services",
    "unit: pure logic, no I/O",
    "smoke: minimal sanity-check suite",
]
```

`--strict-markers` makes a typo'd marker (`@pytest.mark.intgration`) an error instead of a silent miss. Always on.

## Selection Expressions

```bash
# Run only fast tests
pytest -m "not slow"

# Run only integration tests
pytest -m integration

# Boolean expressions
pytest -m "integration or slow"
pytest -m "unit and not slow"
pytest -m "(unit or integration) and not slow"
```

In CI, run the fast lane on every push and the slow lane on a schedule.

## Built-in Markers

| Marker | Use |
|---|---|
| `@pytest.mark.skip(reason="...")` | Always skip |
| `@pytest.mark.skipif(condition, reason="...")` | Conditional skip |
| `@pytest.mark.xfail(reason="...")` | Expected to fail; passes only if it does fail (`strict=True` to require) |
| `@pytest.mark.parametrize(...)` | See `parametrize.md` |
| `@pytest.mark.usefixtures("name")` | Use a fixture without injecting it as a parameter |
| `@pytest.mark.filterwarnings(...)` | Per-test warning filter |

## Skip / Skipif

```python
@pytest.mark.skip(reason="not yet implemented")
def test_future_feature():
    ...


@pytest.mark.skipif(sys.version_info < (3, 11), reason="needs TaskGroup")
async def test_taskgroup():
    ...


# Inline skip
def test_platform():
    if not has_gpu():
        pytest.skip("no GPU available")
    ...
```

`pytest.skip()` inside the body lets you decide *after* expensive setup. `skipif` does it at collection.

## Xfail

```python
@pytest.mark.xfail(reason="bug #123 — fix in next release")
def test_known_bug():
    assert buggy_function() == 42


@pytest.mark.xfail(strict=True, reason="must stay failing until fixed")
def test_security_regression():
    ...
```

- Without `strict`: passing tests show as XPASS but don't fail the suite.
- With `strict=True`: passing tests fail (so you remove the marker once the bug is fixed). Use this for security regressions and known broken contracts.

## Marker on a Class

```python
@pytest.mark.integration
class TestHTTPClient:
    def test_get(self): ...
    def test_post(self): ...
```

Applies the marker to every method.

## Marker on a Module

```python
# tests/integration/test_db.py
import pytest

pytestmark = pytest.mark.integration
# or for multiple:
pytestmark = [pytest.mark.integration, pytest.mark.slow]
```

## Combining with Parametrize

```python
@pytest.mark.parametrize("backend", [
    "sqlite",
    pytest.param("postgres", marks=pytest.mark.integration),
])
def test_query(backend):
    ...
```

The `postgres` row is tagged `integration`; `sqlite` is unmarked.

## Selection by Keyword (`-k`)

Marker-free filtering by test name substring:

```bash
pytest -k "user and not delete"
pytest -k "test_login"
pytest -k "TestUserService"
```

`-k` matches against test IDs (which include parametrize ids). Use it interactively; markers in CI.

## Related

- [running-tests.md](running-tests.md) — full CLI cheat sheet
- [parametrize.md](parametrize.md) — `pytest.param(..., marks=...)`
