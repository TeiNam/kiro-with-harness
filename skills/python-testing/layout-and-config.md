# Project Layout and Configuration

## Contents

- Directory Layout
- `__init__.py` in tests
- `pyproject.toml`
- Coverage Config
- conftest.py — Where Things Go
- Useful Plugins
- CI Configuration
- `--strict-markers` Workflow
- Related

## Directory Layout

```
myproject/
├── src/
│   └── mypackage/
│       ├── __init__.py
│       └── ...
├── tests/
│   ├── conftest.py            # shared fixtures (project-wide)
│   ├── unit/
│   │   ├── conftest.py        # unit-only fixtures (optional)
│   │   ├── test_models.py
│   │   └── test_services.py
│   ├── integration/
│   │   ├── conftest.py
│   │   ├── test_api.py
│   │   └── test_database.py
│   └── e2e/
│       └── test_workflow.py
├── pyproject.toml
└── README.md
```

Tests live **outside** `src/` so they don't ship in the wheel. Each subdirectory can carry its own `conftest.py` for narrower fixtures.

Use `src/` layout — it forces tests to run against the *installed* package, not whatever happens to be on `sys.path`. With a flat layout, tests can pass against the working tree but break when installed.

## `__init__.py` in tests

Two valid styles:

**A. With `__init__.py` everywhere** — pytest treats tests as a package. Necessary if test modules import each other.

**B. No `__init__.py`** (rootdir auto-discovery) — pytest finds tests via `testpaths`. Cleaner, but every test file's name must be unique across the tree.

Pick one and stick with it. Style B is the modern default.

## `pyproject.toml`

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "--strict-markers",
    "--strict-config",
    "-ra",                          # report short summary of all but passed
    "--cov=mypackage",
    "--cov-report=term-missing",
    "--cov-branch",
]
markers = [
    "slow: marks tests as slow (>1s)",
    "integration: requires external services",
    "unit: pure logic, no I/O",
]
filterwarnings = [
    "error",                        # all warnings = errors by default
    "ignore::DeprecationWarning:third_party_lib",
]
asyncio_mode = "auto"               # if using pytest-asyncio
```

`--strict-markers` and `--strict-config` make typos in markers and config errors instead of silent skips. Always on.

`filterwarnings = ["error"]` turns warnings into test failures — a clean codebase that hides nothing. Whitelist specific upstream noise.

## Coverage Config

```toml
[tool.coverage.run]
source = ["src/mypackage"]
branch = true
omit = [
    "*/tests/*",
    "*/__main__.py",
]

[tool.coverage.report]
show_missing = true
skip_covered = false
exclude_lines = [
    "pragma: no cover",
    "raise NotImplementedError",
    "if TYPE_CHECKING:",
    "if __name__ == .__main__.:",
]
fail_under = 80
```

`branch = true` enables branch coverage — without it, an `if`/`else` where you only hit one side counts as covered.

## conftest.py — Where Things Go

| Where | Visibility | Use for |
|---|---|---|
| `tests/conftest.py` | Every test | Project-wide fixtures (app, settings, isolation hooks) |
| `tests/unit/conftest.py` | Tests under `tests/unit/` | Unit-only fixtures (in-memory fakes) |
| `tests/integration/conftest.py` | Tests under `tests/integration/` | Real DB / HTTP fixtures |
| Module-level | That module only | Single-file fixtures |

Inner `conftest.py` can override outer fixtures by defining one with the same name.

## Useful Plugins

| Plugin | Purpose |
|---|---|
| `pytest-cov` | Coverage |
| `pytest-asyncio` | `async def` tests |
| `pytest-xdist` | Parallel runs (`pytest -n auto`) |
| `pytest-randomly` | Randomize test order — surfaces ordering bugs |
| `pytest-mock` | `mocker` fixture (alternative to `@patch`) |
| `pytest-freezer` (or `freezegun`) | Freeze time |
| `pytest-postgresql` | Real Postgres per session |
| `hypothesis` | Property-based testing |
| `respx` / `responses` | HTTP mocking |
| `pytest-clarity` / `pytest-icdiff` | Better assertion diffs |
| `pytest-sugar` | Prettier output (taste-dependent) |

Avoid stacking too many plugins — each one is one more thing that can fail in CI.

## CI Configuration

Run pytest at least twice in CI:

1. **Fast lane** — unit tests on every push.
   ```bash
   pytest -m "not slow and not integration" --cov-fail-under=80
   ```
2. **Full lane** — every commit on main, every PR before merge.
   ```bash
   pytest --cov-fail-under=80
   ```

Add a `pytest --collect-only` step in CI to catch import errors and missing markers without running the suite.

## `--strict-markers` Workflow

Without it, `@pytest.mark.intgration` (typo) silently does nothing. With it, the test errors at collection. Always on, plus register every marker in `pyproject.toml`.

## Related

- [running-tests.md](running-tests.md) — CLI reference
- [markers.md](markers.md) — selection by marker
