# Parametrize

## Contents

- Basic Parametrize
- Multiple Parameters
- Custom Test IDs
- Stacked Parametrize → Cartesian Product
- Parametrize Over Fixtures (Indirect)
- Generating Cases
- Filtering Parametrize Rows
- When Not to Parametrize
- Related

Run the same test against many inputs. The single most leverage-y feature in pytest.

## Basic Parametrize

```python
import pytest

@pytest.mark.parametrize("text,expected", [
    ("hello", "HELLO"),
    ("World", "WORLD"),
    ("PyThOn", "PYTHON"),
])
def test_uppercase(text, expected):
    assert text.upper() == expected
```

Each row runs as its own test. Failures report exactly which input failed.

## Multiple Parameters

```python
@pytest.mark.parametrize("a,b,expected", [
    (2, 3, 5),
    (0, 0, 0),
    (-1, 1, 0),
    (100, 200, 300),
])
def test_add(a, b, expected):
    assert add(a, b) == expected
```

## Custom Test IDs

By default pytest generates IDs from the values. Override when values are unreadable:

```python
@pytest.mark.parametrize("email,expected", [
    ("valid@example.com", True),
    ("missing-at.com", False),
    ("@no-local.com", False),
    ("trailing@domain.", False),
], ids=[
    "valid",
    "missing-at",
    "missing-local",
    "trailing-dot",
])
def test_email_validation(email, expected):
    assert is_valid_email(email) is expected
```

Or per-row with `pytest.param`:

```python
@pytest.mark.parametrize("payload", [
    pytest.param({"x": 1}, id="minimal"),
    pytest.param({"x": 1, "y": 2}, id="full",
                 marks=pytest.mark.slow),
    pytest.param({"x": 1, "y": None}, id="null-y",
                 marks=pytest.mark.xfail(reason="bug #42")),
])
def test_validate(payload):
    assert validate(payload)
```

`pytest.param` lets you mark individual rows xfail/skip without splitting the table.

## Stacked Parametrize → Cartesian Product

```python
@pytest.mark.parametrize("locale", ["en", "ko", "ja"])
@pytest.mark.parametrize("device", ["mobile", "desktop"])
def test_layout(locale, device):
    ...   # runs 6 times: 3 locales × 2 devices
```

When the matrix isn't square (some combinations are invalid), use a single parametrize with explicit rows.

## Parametrize Over Fixtures (Indirect)

Pass param values *through* a fixture instead of the test body:

```python
@pytest.fixture
def db(request):
    cfg = request.param
    return Database(cfg)


@pytest.mark.parametrize("db", ["sqlite", "postgres"], indirect=True)
def test_query(db):
    assert db.query("SELECT 1").one() == (1,)
```

This is also achievable with parameterized fixtures (see `fixtures.md`); use indirect when only some tests need the variation.

## Generating Cases

When the table is large or computed:

```python
def _cases():
    for n in range(1, 11):
        yield pytest.param(n, n * n, id=f"sq-{n}")


@pytest.mark.parametrize("n,expected", list(_cases()))
def test_square(n, expected):
    assert n ** 2 == expected
```

For genuinely large input spaces, drop parametrize and use **Hypothesis** instead:

```python
from hypothesis import given, strategies as st

@given(st.integers(min_value=0, max_value=10_000))
def test_square_is_non_negative(n):
    assert n ** 2 >= 0
```

Hypothesis explores randomly, shrinks counterexamples, and surfaces edge cases parametrize will miss.

## Filtering Parametrize Rows

Combine with markers to skip combinations that don't apply on a platform / config:

```python
@pytest.mark.parametrize("backend", [
    pytest.param("native", marks=pytest.mark.skipif(
        sys.platform == "win32", reason="not on Windows")),
    "fallback",
])
def test_render(backend): ...
```

## When Not to Parametrize

- Each input requires very different setup. Two separate tests are clearer.
- The parametrize body has branches per param. The test isn't really one test — split.
- The "parameters" are slight variations of behavior, not data. Separate `test_*` names tell a better story.

## Related

- [fixtures.md](fixtures.md) — parameterized fixtures + indirect
- [tdd-and-philosophy.md](tdd-and-philosophy.md) — coverage of edges via parametrize
