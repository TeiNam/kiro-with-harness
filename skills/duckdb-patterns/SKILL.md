---
name: duckdb-patterns
description: DuckDB usage for local analytics, parquet/csv/json ingestion, embedded OLAP in Python/Node, federated queries across files, Postgres, and S3.
origin: harness
workloads: [python-data]
---

# DuckDB Patterns

In-process analytical SQL. Treat DuckDB as a SQL-fluent replacement for the pandas-only pipeline when the dataset stops fitting comfortably in memory or you want to query parquet/csv/Postgres/S3 from one engine without standing up infrastructure.

## When to Activate

- Reading or aggregating parquet / csv / json larger than RAM, or fast enough that pandas startup is the bottleneck
- Replacing a pandas script with SQL for clarity, joins, or window functions
- Embedded OLAP inside Python / Node code (no separate server)
- Federated queries: parquet on disk + S3 + Postgres in one statement
- DataFrame <-> SQL interop with Arrow zero-copy (no serialisation cost)

Don't reach for it as a transactional store — it's an OLAP engine, single writer. Use Postgres / SQLite for OLTP.

## Connection Modes

```python
import duckdb

# In-memory: ephemeral, perfect for ad-hoc analysis
con = duckdb.connect()

# Persistent on disk: catalog + indexes + data survive restarts
con = duckdb.connect("warehouse.duckdb")

# Read-only: safe to share a file across processes (writers still single-process)
con = duckdb.connect("warehouse.duckdb", read_only=True)
```

CLI:
```bash
duckdb warehouse.duckdb            # interactive
duckdb -c "SELECT 1"               # one-shot
duckdb -json -c "SELECT 1"         # JSON output for piping
```

## Reading Files Without Loading

DuckDB can query files directly — no `CREATE TABLE` step required.

```sql
-- Auto-detect schema, headers, types
SELECT * FROM read_csv_auto('events.csv') LIMIT 10;

-- Glob across many parquet files (most common case)
SELECT user_id, sum(amount) AS total
FROM read_parquet('s3://bucket/sales/year=2026/*/*.parquet')
GROUP BY user_id;

-- Hive-style partitioning is auto-detected
SELECT * FROM read_parquet('data/**/*.parquet', hive_partitioning=true);

-- Read JSON lines / nested
SELECT * FROM read_json_auto('events.jsonl', format='newline_delimited');
```

For repeated queries, materialise once:

```sql
CREATE TABLE sales AS
  SELECT * FROM read_parquet('s3://bucket/sales/*/*.parquet');
```

Or create a view that re-reads each time (cheap for parquet thanks to column pruning + row-group pruning):

```sql
CREATE VIEW sales AS SELECT * FROM read_parquet('data/sales/*.parquet');
```

## Writing Out

```sql
-- Single file
COPY (SELECT * FROM sales WHERE year = 2026)
  TO 'sales_2026.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);

-- Partitioned write — directories created from the column values
COPY (SELECT * FROM sales)
  TO 'out/' (FORMAT PARQUET, PARTITION_BY (year, region), OVERWRITE_OR_IGNORE);

-- CSV with explicit options
COPY sales TO 'sales.csv' (HEADER, DELIMITER '|');
```

`OVERWRITE_OR_IGNORE` is the safe default for partitioned writes — without it, an existing directory aborts the write.

## DataFrame Interop

DuckDB sees pandas / polars / pyarrow tables as if they were SQL tables — no copy, no temp file.

```python
import duckdb
import pandas as pd
import polars as pl

df = pd.read_csv("orders.csv")
result = duckdb.sql("SELECT region, sum(total) FROM df GROUP BY region").df()

# polars: use lazy frames for the largest wins (predicate pushdown)
lf = pl.scan_parquet("orders.parquet")
duckdb.sql("SELECT region, sum(total) FROM lf GROUP BY region").pl()

# Arrow → DuckDB → back to Arrow with no copy
arrow_table = some_pyarrow_table
duckdb.sql("SELECT * FROM arrow_table WHERE amount > 100").arrow()
```

`con.register("name", df)` makes the binding explicit; in module-level `duckdb.sql(...)` calls, locals/globals are auto-bound by name.

## Window Functions and ASOF Joins

These are the two SQL features that justify DuckDB over pandas for most analytics work.

```sql
-- Running totals + rolling averages in one pass
SELECT
  date,
  amount,
  sum(amount) OVER (PARTITION BY user_id ORDER BY date) AS running_total,
  avg(amount) OVER (
    PARTITION BY user_id ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS rolling_7d
FROM transactions;

-- ASOF JOIN: nearest-prior match (perfect for prices <-> trades)
SELECT trades.*, prices.price
FROM trades
ASOF LEFT JOIN prices
  ON trades.symbol = prices.symbol
  AND trades.ts >= prices.ts;
```

ASOF without an equi-key (`ON trades.ts >= prices.ts`) also works for sparse time-series alignment.

## Nested Types: list / struct / map

DuckDB has first-class composite types — much nicer than pandas' `object` columns.

```sql
-- Aggregate into a list per group, then expand
SELECT
  user_id,
  list(item ORDER BY ts) AS history
FROM events
GROUP BY user_id;

-- Struct = named columns inside a column
SELECT {'lat': 37.5, 'lng': 127.0, 'tz': 'KST'} AS location;

-- UNNEST flattens lists for ad-hoc joins
SELECT user_id, tag
FROM users, UNNEST(tags) AS t(tag);
```

## PIVOT / UNPIVOT

Built-in, no extension dance:

```sql
PIVOT sales ON region USING sum(amount) GROUP BY year;

UNPIVOT wide_table
  ON jan, feb, mar, apr
  INTO NAME month VALUE amount;
```

## Federated Queries

```sql
-- Postgres <-> DuckDB in one query
INSTALL postgres; LOAD postgres;
ATTACH 'host=localhost dbname=app user=me' AS pg (TYPE POSTGRES, READ_ONLY);
SELECT count(*) FROM pg.public.users;

-- S3 / httpfs
INSTALL httpfs; LOAD httpfs;
SET s3_region='ap-northeast-2';
SET s3_access_key_id='...';
SET s3_secret_access_key='...';
SELECT * FROM read_parquet('s3://bucket/key.parquet');

-- Iceberg / Delta — separate extensions
INSTALL iceberg; LOAD iceberg;
SELECT * FROM iceberg_scan('s3://bucket/iceberg-table/');
```

For S3 in production, prefer the `aws` extension with the credential chain:

```sql
INSTALL aws; LOAD aws;
CALL load_aws_credentials();   -- picks up env / shared-credentials / IAM role
```

## Performance Knobs

```sql
-- Default is core count; lower if running alongside other workloads
SET threads = 4;

-- Memory limit; spills to temp when exceeded
SET memory_limit = '8GB';
SET temp_directory = '/tmp/duckdb_spill';

-- Profile a query (per-operator timing + cardinality)
EXPLAIN ANALYZE
SELECT region, sum(amount) FROM sales GROUP BY region;
```

Rules of thumb:
- **Parquet > CSV** for anything you'll query more than once. Column pruning + row-group statistics often turn 10s of GB into ms-scale scans.
- **Filter on partitioned columns first** — predicate pushdown eliminates whole files.
- **`PRAGMA enable_progress_bar`** on long CLI scans.
- Profiling: `EXPLAIN ANALYZE` shows actual rows + per-operator timing. The `PROFILE` syntax (`PRAGMA enable_profiling='json'; PRAGMA profile_output='out.json'`) produces a flame-graph-friendly JSON.
- **Avoid round-tripping to pandas in a loop.** Push the loop into SQL or use the Arrow path.

## Python API Idioms

```python
import duckdb

con = duckdb.connect("warehouse.duckdb")

# Parameterized — never string-format SQL
con.execute("SELECT * FROM users WHERE id = ?", [user_id])

# Relations: lazy, chainable, deferred until materialised
rel = con.table("sales").filter("year = 2026").project("region, amount")
df = rel.aggregate("region, sum(amount) AS total").df()

# Streaming results for queries larger than memory
for batch in con.execute("SELECT * FROM huge_table").fetch_record_batch(10_000):
    process(batch)
```

`fetch_record_batch` gives Arrow batches (zero-copy); `fetchnumpy` / `fetchdf` / `pl()` are convenience accessors when the result fits in RAM.

## Node.js Driver

```javascript
import { Database } from 'duckdb-async';

const db = await Database.create('warehouse.duckdb');
const rows = await db.all('SELECT region, sum(amount) AS total FROM sales GROUP BY region');
await db.close();
```

`duckdb-async` wraps the sync driver in promises. For streaming, `db.stream(sql)` returns an async iterator over batches.

## Testing & Reproducibility

- Use an in-memory connection per test — fast and isolated.
- For deterministic snapshots, sort the result and write to parquet: `COPY (SELECT ... ORDER BY ...) TO 'expected.parquet'`.
- Schema drift: `DESCRIBE SELECT * FROM read_parquet('...')` is the cheapest way to inspect a file's schema without loading it.

## Common Pitfalls

- **`read_csv_auto` mistyping floats as integers** when the first chunk has no decimals — pin types with `columns={...}` for production reads.
- **Single-writer per file** — concurrent writers to the same `.duckdb` file corrupt it. Use one writer + many readers.
- **Implicit string-to-date casts** are stricter than pandas — explicit `strptime(col, '%Y-%m-%d')` for nonstandard formats.
- **Memory blow-up on cross joins** — DuckDB doesn't fault you for `SELECT * FROM a, b`. Always include a join condition.

## Related

- python-data-analysis — when to pick DuckDB vs pandas vs polars
- postgres-patterns — for the OLTP side of a hybrid pipeline
