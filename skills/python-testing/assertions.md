# Assertions and Basic Structure

## Contents

- Basic Test
- Assertion Patterns
- Exception Assertions
- Warning Assertions
- Soft Assertions / Multiple Checks
- Custom Assertion Helpers
- Don't Catch and Inspect
- Related

Plain `assert` is the right answer 99% of the time. pytest rewrites assert AST so failures show the values involved.

## Basic Test

```python
import pytest

def test_addition():
    assert 2 + 2 == 4


def test_string_uppercase():
    assert "hello".upper() == "HELLO"
```

No need for `self.assertEqual`, `self.assertTrue`, etc. — that's `unittest.TestCase` baggage.

## Assertion Patterns

```python
# Equality
assert result == expected
assert result != unexpected

# Truthiness — prefer specific
assert result          # truthy
assert not result      # falsy
assert result is True  # exactly True (rarely needed)
assert result is None  # singleton check

# Membership
assert item in collection
assert item not in collection

# Comparisons
assert 0 <= score <= 100

# Type
assert isinstance(result, str)

# Floating point — use pytest.approx
assert result == pytest.approx(0.1 + 0.2)
assert vector == pytest.approx([1.0, 2.0, 3.0], rel=1e-6)

# Subset / superset
assert {"a", "b"}.issubset(result)

# Sequence equality ignoring order
assert sorted(result) == sorted(expected)
```

## Exception Assertions

```python
# Exception type
with pytest.raises(ValueError):
    parse("nope")


# Exception message (regex)
with pytest.raises(ValueError, match=r"^invalid input"):
    parse("nope")


# Inspect the raised exception
with pytest.raises(ValueError) as exc_info:
    parse("nope")
assert exc_info.value.args == ("invalid input",)
assert exc_info.type is ValueError


# Don't accept subclass
with pytest.raises(ValueError) as exc_info:
    parse("nope")
assert type(exc_info.value) is ValueError  # not a subclass
```

`match` is a regex applied via `re.search` to `str(exception)` — partial matches succeed.

## Warning Assertions

```python
import warnings

with pytest.warns(DeprecationWarning, match="will be removed"):
    legacy_function()


# Assert no warning fires
with warnings.catch_warnings():
    warnings.simplefilter("error")
    clean_function()
```

## Soft Assertions / Multiple Checks

When you need several related checks but want to see all failures:

```python
# Built-in: just chain
def test_user_dict():
    user = build_user()
    assert user["name"] == "Alice"
    assert user["age"] == 30
    assert "email" in user
    # First failure stops the test, but each is named in the report.


# pytest-check (third-party) — collect all failures
import pytest_check as check

def test_user_all():
    user = build_user()
    check.equal(user["name"], "Alice")
    check.equal(user["age"], 30)
    check.is_in("email", user)
```

Default to plain `assert`. Reach for `pytest-check` only when one logical check legitimately has multiple sub-conditions.

## Custom Assertion Helpers

When the same assertion repeats, extract — but make `assert` the last line so pytest shows the values.

```python
def assert_user_equal(actual: User, expected: User) -> None:
    __tracebackhide__ = True   # hide this frame in pytest output
    assert actual.id == expected.id
    assert actual.email == expected.email
    assert actual.is_active == expected.is_active


def test_save_then_load():
    saved = repo.save(make_user())
    loaded = repo.load(saved.id)
    assert_user_equal(loaded, saved)
```

`__tracebackhide__ = True` keeps the failure pointing at the test's call site, not the helper.

## Don't Catch and Inspect

```python
# Bad — boilerplate, mismatch reports as "no exception"
def test_divide_by_zero():
    try:
        divide(10, 0)
    except ZeroDivisionError:
        pass
    else:
        pytest.fail("expected ZeroDivisionError")


# Good
def test_divide_by_zero():
    with pytest.raises(ZeroDivisionError):
        divide(10, 0)
```

## Related

- [mocking.md](mocking.md) — `mock.assert_called_with` patterns
- [side-effects.md](side-effects.md) — `caplog` / `capsys` log/output assertions
