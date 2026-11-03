# Running Tests — CLI Cheat Sheet

## Contents

- Selection
- Failure Triage
- Output
- Coverage
- Debugging
- Parallel
- Performance / Profiling
- Environment
- Random / Repro
- Continuous
- CI Combinations
- My Defaults (in `pyproject.toml`)
- Related

## Selection

```bash
pytest                                # everything under testpaths
pytest tests/test_utils.py            # one file
pytest tests/test_utils.py::test_foo  # one test
pytest tests/test_utils.py::TestUser  # one class
pytest -k "user and not delete"       # by name substring (boolean)
pytest -m "not slow"                  # by marker (see markers.md)
pytest tests/integration              # one directory
```

## Failure Triage

```bash
pytest -x                  # stop at first failure
pytest --maxfail=3         # stop after 3 failures
pytest --lf                # re-run only last failed
pytest --ff                # run last failed first, then the rest
pytest --nf                # new files first
pytest --sw                # stepwise: stop at first failure, resume from there next run
```

`--lf` is the daily driver. Fix the failing test, re-run with `--lf` until it passes, then run the full suite.

## Output

```bash
pytest -v                  # one line per test, full names
pytest -vv                 # very verbose (full diff on assertion failures)
pytest -q                  # quiet
pytest -s                  # don't capture stdout — print() is visible live
pytest -ra                 # short summary of all non-passed
pytest --tb=short          # short tracebacks
pytest --tb=line           # one-liner per failure
pytest --tb=no             # suppress tracebacks
pytest --no-header         # skip the platform/plugin header
```

`-ra` (or `-rA`) shows a digest of every skip / xfail / fail at the end — turn it on by default.

## Coverage

```bash
pytest --cov=mypackage
pytest --cov=mypackage --cov-report=term-missing       # show missed lines
pytest --cov=mypackage --cov-report=html               # htmlcov/index.html
pytest --cov=mypackage --cov-branch                    # branch coverage
pytest --cov=mypackage --cov-fail-under=80             # CI gate
```

Combine multiple sources: `--cov=mypackage --cov=otherpkg`.

## Debugging

```bash
pytest --pdb               # drop into pdb on failure
pytest --pdbcls=IPython.terminal.debugger:TerminalPdb
pytest -s                  # see prints (combine with --pdb)
pytest --trace             # pdb on every test entry (rare)
```

Or in code:

```python
def test_thing():
    breakpoint()       # pytest respects PYTHONBREAKPOINT, drops into pdb
```

## Parallel

```bash
pytest -n auto             # one worker per core (pytest-xdist)
pytest -n 4
```

Caveats: shared resources (DB, sockets, files) need per-worker isolation. The `--dist=loadfile` mode keeps tests in the same file on the same worker.

## Performance / Profiling

```bash
pytest --durations=10      # 10 slowest tests
pytest --durations=0       # all tests (sorted)
pytest --profile           # with pytest-profiling
```

Watch for tests >1s — they don't belong in the unit lane.

## Environment

```bash
pytest --co                # collect only, don't run (catch import errors)
pytest --collect-only -q   # tree of test IDs
pytest --setup-show        # show fixture setup/teardown
pytest --setup-only        # run setup, no tests (debug fixtures)
pytest -p no:cacheprovider # disable cache (e.g. to repro a CI bug)
```

## Random / Repro

```bash
pytest -p randomly --randomly-seed=12345    # pytest-randomly
pytest --hypothesis-seed=42                 # hypothesis
```

Always log the seed in CI so flaky failures are reproducible.

## Continuous

```bash
pytest-watch                 # watch mode (third-party)
ptw -- -x --lf               # ptw with extra args
```

Or use your editor's "run tests on save" — `pytest --testmon` (third-party) only runs tests affected by changed code.

## CI Combinations

```bash
# Fast lane (every push)
pytest -m "not slow and not integration" --cov-fail-under=80 -ra

# Full lane (PR / main)
pytest --cov-fail-under=80 -ra --tb=short
```

## My Defaults (in `pyproject.toml`)

```toml
[tool.pytest.ini_options]
addopts = [
    "--strict-markers",
    "--strict-config",
    "-ra",
    "--cov-branch",
]
```

Then on the command line you only add the bits that change: `pytest -x --lf`, `pytest -k user`, etc.

## Related

- [layout-and-config.md](layout-and-config.md) — `pyproject.toml` template
- [markers.md](markers.md) — `-m` selection
