# Tooling

## Contents

- Essential Commands
- `pyproject.toml` Template
- ruff — Replace black + isort + flake8
- mypy
- pytest
- Pre-commit Hooks
- Package Managers (pick one)
- Security Scans
- Related

One-stop config in `pyproject.toml`. Modern stack: `ruff` (lint+format) → `mypy` (type) → `pytest` (test) → `bandit`/`pip-audit` (security).

## Essential Commands

```bash
# Format + lint (ruff replaces black + isort + flake8 + pyupgrade)
ruff format .
ruff check . --fix

# Type check
mypy .

# Test with coverage
pytest --cov=mypackage --cov-report=html

# Security scan
bandit -r src/
pip-audit
```

For one-off scripts, `uv run` (or `pipx run`) drops the install step entirely:

```bash
uv run --with ruff ruff check .
uv run --with mypy mypy .
```

## `pyproject.toml` Template

```toml
[project]
name = "mypackage"
version = "1.0.0"
requires-python = ">=3.9"
dependencies = [
    "requests>=2.31.0",
    "pydantic>=2.0.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-cov>=4.1.0",
    "ruff>=0.4.0",
    "mypy>=1.8.0",
]

[tool.ruff]
line-length = 88
target-version = "py39"

[tool.ruff.lint]
select = [
    "E", "W",   # pycodestyle
    "F",        # pyflakes
    "I",        # isort
    "N",        # pep8-naming
    "UP",       # pyupgrade
    "B",        # bugbear
    "SIM",      # simplify
    "RUF",      # ruff-specific
]
ignore = ["E501"]  # line length — formatter handles

[tool.ruff.format]
quote-style = "double"

[tool.mypy]
python_version = "3.9"
strict = true
# or finer-grained:
# warn_return_any = true
# warn_unused_configs = true
# disallow_untyped_defs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--cov=mypackage --cov-report=term-missing --strict-markers"
markers = [
    "slow: marks tests as slow",
    "integration: integration tests",
]
```

## ruff — Replace black + isort + flake8

ruff is one binary, written in Rust, that handles formatting *and* linting. It's ~100× faster than the equivalent Python tools.

Useful rule sets to enable (`select`):

| Code | What it catches |
|---|---|
| `E`, `W` | pycodestyle (PEP 8) |
| `F` | pyflakes (unused imports/vars) |
| `I` | isort (import order) |
| `N` | naming conventions |
| `UP` | pyupgrade (`Optional[X]` → `X \| None`, etc.) |
| `B` | bugbear (mutable defaults, `len(x) == 0`, etc.) |
| `SIM` | simplify (`if x: return True else: return False`) |
| `RUF` | ruff-specific |
| `S` | bandit-style security checks |
| `D` | pydocstyle docstring conventions |
| `C90` | mccabe complexity |

## mypy

`mypy --strict` is fine for new projects. For an existing codebase, ratchet up gradually:

```toml
[tool.mypy]
python_version = "3.9"

# Start here
warn_redundant_casts = true
warn_unused_ignores = true
warn_return_any = true

# Add these one at a time
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
no_implicit_optional = true

# Per-module overrides for legacy code
[[tool.mypy.overrides]]
module = "mypackage.legacy.*"
ignore_errors = true
```

For libraries that don't ship type stubs, use `[[tool.mypy.overrides]]` with `ignore_missing_imports = true`.

## pytest

Beyond defaults, two flags carry their weight:

- `-x` — stop at first failure (fast feedback).
- `--lf` — re-run only the last failed tests.

Configure markers in `pyproject.toml` (see template above) and use `--strict-markers` so a typo'd `@pytest.mark.intgration` becomes an error instead of being silently ignored.

## Pre-commit Hooks

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.8.0
    hooks:
      - id: mypy
        additional_dependencies: [pydantic, types-requests]
```

```bash
pre-commit install
pre-commit run --all-files
```

## Package Managers (pick one)

| Tool | Best for |
|---|---|
| `uv` | Speed; modern default, replaces pip + venv + pip-tools |
| `poetry` | App with lockfile, opinionated, mature |
| `pdm` | PEP 582 + standards-first |
| `hatch` | Library, build backend, env management |
| pip + `pip-compile` | Minimal, scripted environments |

Recommendation for new projects in 2026: **`uv`** — installs Python, manages venvs, resolves with a lockfile, and runs ad-hoc tools.

## Security Scans

```bash
# Static analysis on your code
bandit -r src/

# Audit pinned dependencies for CVEs
pip-audit
# or
safety check
```

Wire one of these into CI on every PR.

## Related

- [package-organization.md](package-organization.md) — `pyproject.toml` project metadata
