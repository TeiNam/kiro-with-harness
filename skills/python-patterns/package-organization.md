# Package Organization

## Contents

- Standard Project Layout
- Import Order (PEP 8)
- Absolute vs Relative Imports
- `__init__.py` — Keep It Narrow
- Project Metadata in `pyproject.toml`
- Lockfiles & Environments
- Tests Directory
- Common Mistakes
- Related

`src/` layout, explicit imports, narrow `__init__.py`.

## Standard Project Layout

```
myproject/
├── src/
│   └── mypackage/
│       ├── __init__.py
│       ├── main.py
│       ├── api/
│       │   ├── __init__.py
│       │   └── routes.py
│       ├── models/
│       │   ├── __init__.py
│       │   └── user.py
│       └── utils/
│           ├── __init__.py
│           └── helpers.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api.py
│   └── test_models.py
├── pyproject.toml
├── README.md
└── .gitignore
```

**Why `src/`?** It guarantees tests run against the *installed* package, not the working copy. Without `src/`, `import mypackage` may pick up the directory next to `tests/` even when the package isn't actually installed correctly.

## Import Order (PEP 8)

```python
# 1. Standard library
import os
import sys
from pathlib import Path

# 2. Third-party
import requests
from fastapi import FastAPI

# 3. Local application
from mypackage.models import User
from mypackage.utils import format_name
```

Run `ruff check --select I --fix` (or `isort .`) to enforce automatically.

## Absolute vs Relative Imports

Prefer **absolute** imports for clarity. Relative imports (`from .models import User`) are fine inside a package but hide the location at a glance.

```python
# Good
from mypackage.models import User

# OK inside mypackage/api/routes.py
from ..models import User

# Avoid — `import *` hides what's actually being used
from mypackage.models import *
```

## `__init__.py` — Keep It Narrow

`__init__.py` is the public API surface of the package. Two valid styles:

**Style A: empty `__init__.py`** — callers must do `from mypackage.models import User`. Best for libraries with many submodules.

**Style B: curated re-exports** — promote a small public API:

```python
# mypackage/__init__.py
"""mypackage — A sample Python package."""

__version__ = "1.0.0"

from mypackage.models import User, Post
from mypackage.utils import format_name

__all__ = ["User", "Post", "format_name"]
```

`__all__` controls what `from mypackage import *` exports and signals "this is the API." It is *not* enforced for explicit imports, so tools like `ruff` use it to detect unused private names.

**Anti-pattern**: doing real work (DB connections, network calls, logging setup) at module top level. It runs on every import, including by `mypy`/`ruff`/IDE indexers, and causes confusing failures.

## Project Metadata in `pyproject.toml`

PEP 621 standard project config. Single source of truth — no `setup.py`, no `setup.cfg` for new projects.

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
    "ruff>=0.1.0",
    "mypy>=1.5.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/mypackage"]
```

## Lockfiles & Environments

- **Library** (something others install): `pyproject.toml` lists ranges, no lockfile.
- **Application** (something you deploy): use a lockfile — `uv.lock`, `poetry.lock`, `pdm.lock`, or `requirements.lock` from `pip-compile`.

## Tests Directory

```
tests/
├── conftest.py        # shared fixtures
├── unit/
│   └── test_models.py
├── integration/
│   └── test_api.py
└── e2e/
    └── test_workflow.py
```

Tests outside `src/` so they don't ship with the package. Add `pytest.ini` or `[tool.pytest.ini_options]` to point to `testpaths = ["tests"]`.

## Common Mistakes

- **Importing from `tests/` into `src/`** — circular and wrong.
- **`pyproject.toml` listing the package as a top-level dep on itself** (`mypackage` in `dependencies`).
- **Missing `__init__.py` in `tests/`** when running with pytest's rootdir auto-discovery; symptom: `ModuleNotFoundError` on a sibling test file.
- **Editable install pointing to the wrong directory.** With src layout, the editable install must target `src/`. Tools like `hatch`, `uv`, `poetry` handle this automatically; raw `pip install -e .` may need a config nudge.

## Related

- [tooling.md](tooling.md) — `ruff`, `mypy`, `pytest` configuration in `pyproject.toml`
