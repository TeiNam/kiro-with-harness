---
name: python-data-analysis
description: Python data analysis stack — pandas, polars, duckdb, numpy, jupyter — exploratory and reproducible workflows.
origin: harness
workloads: [python-data]
---

# Python Data Analysis

Pick the right engine for the size and shape of the data, then keep the notebook reproducible. The stack splits cleanly into three jobs:

- **pandas** — everything < a few hundred MB, the default for ad-hoc EDA
- **polars** — same shape as pandas, lazy + multithreaded, memory-friendly
- **duckdb** — SQL across files / Postgres / dataframes, embedded OLAP

Pick by the bottleneck:

| Symptom | Pick |
|---|---|
| Easy interop with sklearn / statsmodels | pandas |
| Single machine, dataset > RAM | polars (lazy) or duckdb |
| Already SQL-shaped: joins, windows, group-by-then-pivot | duckdb |
| Streaming / chunked transforms | polars `LazyFrame` or duckdb `fetch_record_batch` |
| Need to ship to a notebook reader who knows pandas | pandas |

## Project Layout

```
analysis/
  data/
    raw/         # immutable, never edited (source files, exports)
    interim/     # cleaned but not yet final (parquet checkpoints)
    processed/   # the inputs the notebooks actually consume
  notebooks/
    01-explore.ipynb
    02-features.ipynb
    03-report.ipynb
  src/
    loaders.py     # read_* helpers + schema enforcement
    features.py    # transforms (pure functions)
    metrics.py     # business definitions
  pyproject.toml
  uv.lock
```

Rules:
- `data/raw/` is read-only — overwriting it loses provenance.
- Notebooks import from `src/`. Long functions don't belong in cells.
- Numbered notebook prefixes make the run order obvious.
- Checkpoints live as parquet, not pickle (pickle ≠ portable, ≠ language-stable).

## Environment Management

Default to **`uv`** for speed and lockfile fidelity:

```bash
uv init
uv add pandas polars duckdb pyarrow matplotlib jupyter
uv run jupyter lab
```

`pyproject.toml` + `uv.lock` is the source of truth — anyone with the repo gets bit-identical packages. Avoid mixing `pip install` into a uv-managed env.

Conda only when a binary dependency demands it (older GDAL, CUDA-pinned torch, etc.).

## pandas Idioms

```python
import pandas as pd

# Read with explicit dtypes — auto-inference loses precision and silently
# upcasts on missing values
df = pd.read_csv(
    "events.csv",
    dtype={"user_id": "int64", "amount": "float64", "region": "category"},
    parse_dates=["created_at"],
)

# Method chaining keeps the intent linear and avoids shadow variables
result = (
    df
    .query("status == 'completed' and amount > 0")
    .assign(month=lambda d: d["created_at"].dt.to_period("M"))
    .groupby(["region", "month"], observed=True)
    .agg(total=("amount", "sum"), n=("amount", "size"))
    .reset_index()
)
```

**Pitfalls to avoid:**

- **`SettingWithCopyWarning`** — assignments to a slice may or may not write through. Either copy explicitly (`df = df.copy()`) or use `.loc[mask, col] = ...`.
- **`object` dtype for strings** — slow + memory-hungry. Use `string` dtype (pyarrow-backed) or `category` for low-cardinality columns.
- **Implicit float on integer columns with NaN** — every nullable integer becomes `float64`. Use `Int64` (capital I) for nullable integers.
- **`apply` is the slowest path** — vectorise with arithmetic, `np.where`, `.map`, or push into duckdb.
- **Index merging** — `pd.merge` on indexes is footgun-prone; prefer `.merge(other, on=[...])` with explicit keys.

## polars: When to Switch

polars wins when:
- Dataset > a few GB and pandas pages or OOMs
- The pipeline is a chain of filters / joins / aggs (great fit for `.lazy()`)
- You want predictable memory + multi-threaded scans for free

```python
import polars as pl

# Lazy — nothing executes until .collect()
result = (
    pl.scan_parquet("events/*.parquet")
    .filter(pl.col("status") == "completed")
    .with_columns(month=pl.col("created_at").dt.truncate("1mo"))
    .group_by(["region", "month"])
    .agg(total=pl.col("amount").sum(), n=pl.len())
    .collect()
)
```

Translation table for common pandas → polars:

| pandas | polars |
|---|---|
| `df["x"]` | `df["x"]` (eager) / `pl.col("x")` (lazy expr) |
| `df.assign(y=...)` | `df.with_columns(y=...)` |
| `df.query("...")` | `df.filter(...)` |
| `df.groupby([...]).agg(...)` | `df.group_by([...]).agg(...)` |
| `df.merge(other, on=...)` | `df.join(other, on=...)` |
| `df.dropna()` | `df.drop_nulls()` |
| `df["x"].str.contains("...")` | `pl.col("x").str.contains("...")` |

For mixed shops, `.to_pandas()` round-trips at the end of a pipeline.

## duckdb: SQL on Dataframes

When the cleanest expression is SQL — joins, windows, pivots, federated reads — reach for duckdb. See `duckdb-patterns` for the engine-side detail. The python integration is the headline:

```python
import duckdb
import polars as pl

lf = pl.scan_parquet("orders.parquet")          # polars LazyFrame
ref = pl.read_csv("region_lookup.csv")          # polars DataFrame
result = duckdb.sql("""
    SELECT r.label, sum(o.amount) AS total
    FROM lf o
    LEFT JOIN ref r USING (region_id)
    GROUP BY r.label
""").pl()                                        # back to polars, zero-copy
```

Variables in the calling scope are auto-registered. No `INSERT`s, no temp files.

## Caching Expensive Steps

The cheapest cache is a parquet checkpoint:

```python
from pathlib import Path

CHECKPOINT = Path("data/interim/features.parquet")

if CHECKPOINT.exists():
    df = pd.read_parquet(CHECKPOINT)
else:
    df = build_features(load_raw())
    df.to_parquet(CHECKPOINT)
```

For function-level caching, `joblib.Memory` survives kernel restarts and keys on argument hashes:

```python
from joblib import Memory
memory = Memory("data/cache", verbose=0)

@memory.cache
def heavy_compute(year: int) -> pd.DataFrame:
    ...
```

`functools.lru_cache` is per-process only — fine for in-notebook reuse, useless across runs.

## Plotting

Pick by audience:

- **Static report / paper**: matplotlib (`plt.subplots`) — full control, PDF/SVG output
- **Quick exploration**: seaborn — sane defaults on top of matplotlib
- **Web / dashboard / interactive**: plotly — hover, zoom, share as HTML
- **Layered grammar of graphics**: altair — declarative, JSON-serialisable

```python
# Always create the figure explicitly — `plt.plot` on the global figure is
# the source of half the "why is my plot wrong" questions.
fig, ax = plt.subplots(figsize=(8, 4))
ax.plot(df["date"], df["amount"])
ax.set_xlabel("Date"); ax.set_ylabel("Amount (KRW)")
fig.tight_layout()
fig.savefig("report.pdf")
```

### Korean text in matplotlib

The default font on most systems can't render Hangul, producing tofu (□).
Set a font that has Korean glyphs:

```python
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm

# macOS
plt.rcParams["font.family"] = "AppleGothic"
# Windows
# plt.rcParams["font.family"] = "Malgun Gothic"
# Linux (install fonts-nanum first)
# plt.rcParams["font.family"] = "NanumGothic"

# Negative numbers render as boxes when a Korean font replaces the default —
# this restores the minus sign
plt.rcParams["axes.unicode_minus"] = False
```

For plotly, set the layout font instead: `fig.update_layout(font_family="Noto Sans KR")`.

## Jupyter Conventions

- **One concept per cell.** Long cells become unreviewable in diffs.
- **Run-all must work top-to-bottom** before commit. A notebook that only runs out of order is broken.
- **Strip outputs from version control.** Configure `nbstripout` once:
  ```bash
  uv add --dev nbstripout
  uv run nbstripout --install
  ```
  Now `git diff` on notebooks shows only code changes, not megabytes of PNG output.
- **Parameterise + automate** with papermill when a notebook becomes a recurring report:
  ```bash
  papermill report.ipynb out/2026-05.ipynb -p month "2026-05"
  ```

## Statistical Testing

`scipy.stats` for classical tests, `statsmodels` for regression / time series, `pingouin` if you want a friendlier API on top.

```python
from scipy import stats

# A/B comparison — Welch's t-test (unequal variance) is almost always
# safer than Student's t
result = stats.ttest_ind(group_a, group_b, equal_var=False)

# Effect size (Cohen's d) tells you whether the test result matters in
# practice — p-values alone don't
import pingouin as pg
pg.compute_effsize(group_a, group_b, eftype="cohen")
```

A p-value without an effect size and a CI is a half-finished claim.

## Locale + Time Zones

- Always store timestamps as UTC; convert at display time. `pd.Timestamp` with `tz="UTC"`, polars `dt.replace_time_zone("UTC")`, duckdb `TIMESTAMPTZ`.
- Korean reports: format with `Asia/Seoul` after analysis is done; never do business logic in local time.
- Currency formatting in Korean reports: `f"{amount:,.0f}원"` for KRW.

## Common Pitfalls

- **Mixing pandas + polars in a hot loop** — every `.to_pandas()` / `.from_pandas()` is a copy. Pick one engine for the pipeline.
- **`object` dtype creep** — operations on string columns silently upcast to `object`. Check with `.dtypes` before plotting.
- **Pickled checkpoints** — break across pandas/polars versions. Parquet is the portable format.
- **Notebook hidden state** — fix by restarting the kernel before claiming a result. The cell that ran is not always the cell that's visible.

## Related

- duckdb-patterns — engine-side detail when SQL is the right tool
- postgres-patterns — when the source data lives in Postgres
- tech-writer — for reports that ship the analysis as prose
