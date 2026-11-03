# TDD and Test Philosophy

## Contents

- The Cycle
- Test Behavior, Not Implementation
- What to Test
- What Not to Test
- One Behavior Per Test
- Coverage Targets
- Test Pyramid
- Related

## The Cycle

1. **RED** — write a failing test that pinpoints the desired behavior. Run it, see it fail. The fail message should be informative.
2. **GREEN** — write the minimum code to pass. "Minimum" means no speculative generality.
3. **REFACTOR** — improve names, structure, duplication while tests stay green. Don't refactor with red tests.

```python
# RED — does not exist yet
def test_add_returns_sum():
    assert add(2, 3) == 5


# GREEN
def add(a: int, b: int) -> int:
    return a + b


# REFACTOR — only if needed
```

The test commits the contract. The implementation is replaceable.

## Test Behavior, Not Implementation

A good test breaks when **behavior** changes, not when internal structure changes.

```python
# Bad — tied to private method names
def test_internal_state():
    parser = Parser()
    parser._tokens = [...]   # poking internals
    assert parser._cursor == 0


# Good — observable behavior only
def test_parser_returns_ast_for_valid_input():
    ast = Parser().parse("1 + 2")
    assert ast == BinaryOp(Num(1), "+", Num(2))
```

If you find yourself mocking three private methods to test one public one, the test (or the design) is wrong.

## What to Test

- **Public API of every module** — every exported function, every public method, every CLI command.
- **Branches** — every `if`, including the false case. `pytest --cov-branch` enforces this.
- **Edge cases** — empty, None, zero, negative, max int, unicode, very long, very nested.
- **Error paths** — assert that bad input raises the right exception with the right message.
- **Integrations at boundaries** — DB, HTTP, filesystem. Use real implementations against a sandbox where feasible.

## What Not to Test

- **Third-party libraries.** Trust `requests.get`, `pydantic.BaseModel`, etc. Don't write tests that assert pandas works.
- **Trivial getters/setters / dataclass equality.** The framework gives you that.
- **Generated code** (proto, Pydantic-from-OpenAPI, ORM scaffolds).
- **Things you don't control.** Tests for "what AWS does" belong in integration tests with mocks, not unit tests.

## One Behavior Per Test

```python
# Bad — three behaviors, single failure hides which broke
def test_user_workflow():
    user = create_user("alice")
    assert user.id is not None
    user.activate()
    assert user.is_active
    user.delete()
    assert not user.exists()


# Good
def test_create_user_assigns_id():
    user = create_user("alice")
    assert user.id is not None


def test_activate_user_sets_is_active():
    user = create_user("alice")
    user.activate()
    assert user.is_active


def test_delete_user_removes_record():
    user = create_user("alice")
    user.delete()
    assert not user.exists()
```

When one breaks, the test name tells you which behavior regressed without reading the body.

## Coverage Targets

| Code area | Target |
|---|---|
| Critical path (auth, money, data integrity) | 100% line + branch |
| Standard business logic | 80%+ |
| Glue / wiring / DI | best effort |
| Generated code | exclude with `# pragma: no cover` |

100% coverage doesn't mean correct — only that every line ran. Combine with mutation testing (`mutmut`, `cosmic-ray`) on the critical paths if it matters.

## Test Pyramid

```
       ___
      / E2E \      ← few, slow, brittle, high value (real workflows)
     /_______\
    /Integration\  ← moderate (DB, HTTP, filesystem, real components)
   /_____________\
  /     Unit      \ ← many, fast, isolated, run on every keystroke
 /___________________\
```

Unit tests should run in seconds. Push slow tests to a `@pytest.mark.slow` lane that runs in CI but not on every save.

## Related

- [parametrize.md](parametrize.md) — covering many inputs cheaply
- [markers.md](markers.md) — separating fast/slow lanes
