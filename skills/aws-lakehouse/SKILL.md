---
name: aws-lakehouse
description: >
  S3-based lakehouse on Apache Iceberg — Amazon S3 Tables (managed Iceberg table buckets
  with auto compaction/snapshot maintenance), self-managed Iceberg on plain S3 (Glue/REST
  catalogs), querying with Athena (engine v3, MERGE/UPDATE/DELETE), and processing with
  Spark on EMR/Glue/EMR Serverless. Covers catalog choice, Iceberg V3 (deletion vectors,
  row lineage) and its Athena incompatibility, Spark engine/language speed (Scala vs PySpark
  vs Kotlin), native accelerators (Comet/Gluten/Photon), and S3 Tables cost pitfalls.
  Use when building or querying a data lake on S3, choosing between S3 Tables and self-managed
  Iceberg, picking a query engine, or tuning Spark performance. Triggers: S3 Tables, table bucket,
  s3tables, Apache Iceberg, Iceberg REST catalog, Glue Data Catalog, Athena Iceberg, MERGE INTO,
  time travel, deletion vectors, Iceberg V3, EMR Spark, Glue ETL, PySpark slow, Spark accelerator,
  Comet, Gluten, lakehouse, partition projection.
origin: harness
workloads: [cloud, python-data]
---

# AWS Lakehouse on S3 (Iceberg)

Build analytics tables on S3 with Apache Iceberg. Pick the storage model first (managed
**S3 Tables** vs **self-managed Iceberg** on your own bucket), then the **catalog**, then the
**engine** (Athena for SQL, Spark for heavy transforms). Architecture/IAM basics live in
`aws-cloud`; DB-side modeling in the DB guideline skills; this skill is the lakehouse layer.

> Verified against AWS S3 Tables / Athena / EMR docs and Apache Iceberg 1.11 (2026-06). Pin
> exact library versions (iceberg-spark-runtime, s3-tables-catalog) from Maven/AWS Labs before building.

## When to Activate

- Building a data lake / lakehouse on S3
- Choosing between S3 Tables and self-managed Iceberg
- Querying Iceberg with Athena or processing with Spark/EMR/Glue
- "PySpark is slow" / Spark performance tuning
- Iceberg version (V2 vs V3) decisions and engine compatibility

## Storage model: S3 Tables vs self-managed Iceberg

| | **S3 Tables** (managed) | **Self-managed Iceberg** (your bucket) |
|---|---|---|
| Bucket | Managed *table bucket* | Your S3 bucket/prefix |
| Maintenance | Built-in auto (compaction, snapshot expiry, orphan cleanup) | Glue table optimizer (opt-in) or DIY |
| Layout control | Limited (AWS manages physical layout) | Full (file size, partitioning, tiering) |
| Setup | Low — create bucket, write | Higher — configure optimizer + IAM |
| Best for | New analytics tables, no-ops | Existing lakes, strict storage/compliance control |

Both interoperate via the **Glue Iceberg REST** endpoint. **Rule: one catalog per table** — pointing two catalogs at the same prefix corrupts concurrent writes.

## S3 Tables (managed Iceberg)

Hierarchy: **table bucket → namespace (single level) → table (Iceberg)**. Names must be
**lowercase** (uppercase breaks Glue/Lake Formation federation → `Unsupported Federation Resource` in Athena). Requires AWS CLI v2.23.10+.

```bash
# 1) table bucket
aws s3tables create-table-bucket --name my-table-bucket --region us-east-1
# 2) namespace
aws s3tables create-namespace \
  --table-bucket-arn arn:aws:s3tables:us-east-1:111122223333:bucket/my-table-bucket \
  --namespace analytics
# 3) table (Iceberg schema via JSON)
aws s3tables create-table --cli-input-json file://table.json
aws s3tables list-tables --table-bucket-arn <arn>
```

- **Auto maintenance** (no optimizer config): compaction (`binpack` default; `sort`/`z-order` available), snapshot expiration, unreferenced-file removal, Intelligent-Tiering.
- **analytics integration**: console-created buckets auto-integrate; **CLI/SDK/REST-created buckets need manual integration** (Lake Formation registers the bucket, adds the `s3tablescatalog` catalog to Glue). Then Athena/Redshift/EMR/QuickSight discover tables automatically.
- IAM: `AmazonS3TablesFullAccess` + Lake Formation grants for fine-grained access.
- Quotas (adjustable): 10 table buckets/region, 10k namespaces & 10k tables per bucket.
- **Cost pitfalls** (beyond storage $0.0265/GB-mo): **object monitoring $0.025/1,000 objects-mo** and **compaction $0.002/1,000 objects + $0.005/GB** scale with object *count* → many tiny files = higher cost AND slower queries. Auto-compaction mitigates, but batch writes to avoid small-file storms.
- Native REST endpoint limits: no CTAS, single-level namespace only, no views, `metadata.json` capped at 50MB (managed by maintenance).

## Apache Iceberg essentials

- **Catalog choice** (pick one per table): **REST** (modern standard — Glue Iceberg REST, S3 Tables, Nessie); **Glue Data Catalog** (most common on AWS, table optimizer for compaction); **Hive/JDBC**; avoid **Hadoop catalog** on S3 (no atomic rename → unsafe concurrent writes).
- **Schema evolution** (add/drop/rename/reorder, ID-based, no rewrite), **partition evolution** + **hidden partitioning** (no Hive-style partition columns in queries), **snapshots / time travel** (ACID, snapshot isolation).
- **Iceberg V3** (1.11, production-ready 2026): **deletion vectors** (Puffin, replace V2 positional deletes → less write amplification), **row lineage** (`_row_id`). **Single-direction upgrade.**

### ⚠ V3 ↔ Athena incompatibility (decide up front)

**Athena (Trino) does NOT support Iceberg V3.** V3 tables are writable/queryable only from **EMR 7.12+, Glue ETL, SageMaker, and S3 Tables / Glue catalogs**. In a mixed environment, **keep tables at V2** unless every engine that touches them supports V3. Upgrade is one-way:

```sql
ALTER TABLE ns.t SET TBLPROPERTIES (
  'format-version'='3',
  'write.delete.mode'='merge-on-read',
  'write.update.mode'='merge-on-read',
  'write.merge.mode'='merge-on-read');
```

## Querying with Athena (serverless SQL)

- Engine v3 (Trino): full Iceberg read, time travel, schema evolution, and DML — **MERGE INTO / UPDATE / DELETE**. **Writes are merge-on-read only**; for copy-on-write use Spark.
- Query S3 Tables via 3-part name:
  ```sql
  SELECT * FROM "s3tablescatalog/my-table-bucket"."analytics"."orders" LIMIT 10;
  ```
- **MERGE** (upsert):
  ```sql
  MERGE INTO orders t USING staged s ON t.order_id = s.order_id
    WHEN MATCHED THEN UPDATE SET status = s.status
    WHEN NOT MATCHED THEN INSERT (order_id, status) VALUES (s.order_id, s.status);
  ```
- Cost: **$5/TB scanned** (10MB min/query). Cut cost with Parquet + partitioning/hidden partitioning; Iceberg prunes without Hive **partition projection**. For Hive-style tables, partition projection avoids Glue partition lookups.

## Processing with Spark (EMR / Glue / EMR Serverless)

Use Spark for backfills, copy-on-write, and complex transforms. **V3 (deletion vectors/row lineage) needs EMR 7.12+** or Glue ETL.

Connect Spark to **S3 Tables** — three options:

```bash
# (a) S3 Tables Catalog client JAR (simple read/write to one bucket)
spark-sql \
 --packages org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.6.1,software.amazon.s3tables:s3-tables-catalog-for-iceberg-runtime:0.1.4 \
 --conf spark.sql.catalog.s3t=org.apache.iceberg.spark.SparkCatalog \
 --conf spark.sql.catalog.s3t.catalog-impl=software.amazon.s3tables.iceberg.S3TablesCatalog \
 --conf spark.sql.catalog.s3t.warehouse=arn:aws:s3tables:us-east-1:111122223333:bucket/my-table-bucket \
 --conf spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions
```

- **(b) S3 Tables native REST** (`type=rest`, `rest.signing-name=s3tables`, uri `https://s3tables.<region>.amazonaws.com/iceberg`) — for single-bucket or custom catalogs.
- **(c) Glue Iceberg REST** (`rest.signing-name=glue`, warehouse `<account>:s3tablescatalog/<bucket>`) — **AWS-recommended** for central governance + Lake Formation fine-grained access.

## Spark performance: what is actually fast

**PySpark is not inherently slow.** DataFrame/SQL operations compile to the same JVM
Catalyst/Tungsten plan as Scala — identical execution speed. Slowness comes from:

1. **Python UDFs** — row-by-row JVM↔Python serialization. Fix: use built-in SQL functions; if a UDF is unavoidable, use **Arrow-vectorized Pandas UDFs** (`spark.sql.execution.arrow.pyspark.enabled=true`).
2. **RDD APIs / `collect()` to driver** — avoid; stay in DataFrame/SQL.

Speed ranking for real work:

- **Scala** — the native Spark language and the fastest, most complete choice: full API + latest-version coverage, zero Python interop overhead, and the only language that tracks new Spark releases 1:1. Use Scala for the heaviest transforms and when you want the highest ceiling.
- **PySpark with only built-in functions** — effectively equal to Scala for DataFrame/SQL (same JVM plan); the gap appears only with Python UDFs/RDDs.
- (Aside: the Kotlin Spark API is stuck at v1.2.4 / Spark ≤3.3.2 with no Spark 3.4+/Connect support — not a viable choice; use Scala or PySpark.)

**The genuinely fastest Spark = native vectorized accelerators** (language-agnostic, drop-in, stack on top of Scala or PySpark):

- **Apache DataFusion Comet** (Apple → Apache) or **Apache Gluten + Velox/ClickHouse backend** — replace Spark's JVM execution with a native vectorized engine, typically **2–4x** faster. Plug in as a Spark plugin; no query rewrite.
- **Databricks Photon** (Databricks only), **EMR runtime** optimizations (EMR Spark).

**When Spark is overkill**: for medium data, querying Iceberg directly with **DuckDB** (see `duckdb-patterns`) or **Athena/Trino** is often faster end-to-end than spinning up a Spark cluster.

## Engine ↔ write-mode cheat sheet

| Need | Engine |
|---|---|
| Serverless SQL, merge-on-read DML | **Athena** |
| Copy-on-write, large backfills, complex transforms | **EMR Spark** (Scala/PySpark) |
| Streaming CDC (equality deletes) | **Flink on EMR** |
| Medium data, fast ad-hoc, no cluster | **DuckDB / Athena** |
| Max Spark throughput | **Spark + Comet/Gluten** (or Photon on Databricks) |

## Common Pitfalls

- **Iceberg V3 + Athena** — silently incompatible; keep V2 unless all engines support V3.
- **Small-file storms on S3 Tables** — object monitoring + compaction cost scale with object count; batch writes.
- **Two catalogs on one prefix** — concurrent-write corruption. One catalog per table.
- **Uppercase names in S3 Tables** — break Glue federation; use lowercase.
- **Python UDFs** — the real cause of "PySpark is slow"; replace with built-ins or Arrow Pandas UDFs.
- **Hadoop catalog on S3** — no atomic rename; use Glue or REST.
- **CLI/SDK-created S3 Tables bucket** — remember to run analytics integration manually.

## Related

- `aws-cloud` — S3/IAM/networking/cost foundation
- `aws-sdk-patterns` — boto3 `s3tables` client, credential chain, retries
- `duckdb-patterns` — single-node Iceberg/Parquet querying without a cluster
- `clickhouse-io` — alternative columnar analytics engine
- `dynamodb-guideline` / `postgres-guideline` / `mysql-guideline` — OLTP-side modeling
