---
name: python-testing
description: >
  Python testing with pytest: TDD workflow, fixtures, parametrize, markers,
  mocking, async tests, coverage, project layout. Trigger keywords: pytest,
  conftest.py, fixture, parametrize, mark.parametrize, pytest.raises,
  monkeypatch, mock, patch, MagicMock, pytest-asyncio, anyio, tmp_path,
  caplog, capsys, hypothesis, freezegun, factory_boy, coverage, --cov,
  TDD, red-green-refactor, test python, write tests, assert.
origin: harness
workloads: [python]
---

# Python Testing Patterns

Pytest-first testing for Python ≥ 3.9. TDD workflow, fixtures, parametrize, mocking, async, coverage.

## When to Activate

- Writing new Python code under TDD (red → green → refactor)
- Adding tests to an untested module
- Reviewing coverage gaps or flaky tests
- Setting up `pytest` infrastructure for a new project
- Picking the right mocking strategy (monkeypatch vs `unittest.mock` vs fakes)

## Testing Defaults

- **Runner**: `pytest` (≥ 7). Don't use `unittest.TestCase` for new code.
- **Coverage**: 80% target overall, 100% on critical paths. `pytest --cov`.
- **Async**: `pytest-asyncio` (auto mode) or `anyio` if you also support trio.
- **Property tests**: `hypothesis` for invariants and parsing.
- **Time / randomness**: `freezegun` / fixed `random.seed()` — never let tests depend on wall clock.
- **Markers strict**: `--strict-markers` so a typo'd `@pytest.mark.intgration` errors instead of silently skipping.
- **Test isolation**: each test starts from a clean state; no order dependencies.

## Naming Rules

- Files: `test_<module>.py`
- Classes: `Test<Subject>` (no `__init__`)
- Functions: `test_<behavior>_<expected>` — read as a sentence (`test_login_with_invalid_password_returns_401`)
- Fixtures: noun describing the produced object (`user`, `db_session`, `tmp_repo`), not `make_*` or `setup_*`

## Topic Index

| Topic | File | Use when |
|---|---|---|
| TDD workflow & test philosophy | [tdd-and-philosophy.md](tdd-and-philosophy.md) | Starting a new feature, deciding what to test |
| Assertions & basic structure | [assertions.md](assertions.md) | Day-to-day test writing |
| Fixtures (scope, autouse, params, conftest) | [fixtures.md](fixtures.md) | Sharing setup, dependency-injecting test deps |
| Parametrize (data tables, IDs, indirect) | [parametrize.md](parametrize.md) | Running same test against many inputs |
| Markers & test selection | [markers.md](markers.md) | Slow/integration tagging, CI matrices |
| Mocking & patching | [mocking.md](mocking.md) | Isolating from APIs, DBs, time, randomness |
| Async testing (pytest-asyncio, anyio) | [async-testing.md](async-testing.md) | `async def` code, FastAPI clients |
| File / temp dir / env / log capture | [side-effects.md](side-effects.md) | I/O, env vars, stdout/stderr, logging assertions |
| Project layout & configuration | [layout-and-config.md](layout-and-config.md) | New project, restructuring tests |
| Common patterns (API, DB, classes) | [common-patterns.md](common-patterns.md) | Templates for FastAPI / SQLAlchemy / class tests |
| CLI cheat sheet | [running-tests.md](running-tests.md) | `pytest -k`, `--lf`, `-x`, `--pdb`, etc. |

## Quick Reference

| Need | Pattern |
|---|---|
| Expect exception | `with pytest.raises(ValueError, match="..."):` |
| Reusable setup | `@pytest.fixture` (function/module/session scope) |
| Same test, many inputs | `@pytest.mark.parametrize("a,b", [...])` |
| Auto-applied setup | `@pytest.fixture(autouse=True)` |
| Tag and filter | `@pytest.mark.slow` + `pytest -m "not slow"` |
| Mock import target | `@patch("pkg.module.func")` (path of *use*, not *definition*) |
| Async test | `async def test_x(): ...` with `pytest-asyncio` auto mode |
| Temp file/dir | `tmp_path` (pathlib) — preferred over `tmpdir` |
| Capture stdout | `capsys.readouterr().out` |
| Capture logs | `caplog.records` / `caplog.text` |
| Patch env var | `monkeypatch.setenv("KEY", "value")` |
| Run last failed only | `pytest --lf` |

## Related Skills

- `python-patterns` — language idioms tests should reflect
- `fastapi-backend-best-practices/testing/` — API integration tests, factory pattern
- `tdd-workflow` — universal red/green/refactor cadence

**Remember**: tests are production code. They prove behavior, document intent, and catch regressions. Brittle tests that break on every refactor are worse than no tests.
