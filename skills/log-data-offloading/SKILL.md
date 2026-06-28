---
name: log-data-offloading
description: >
  Offload high-volume log / append-only / time-series data out of an RDBMS into Amazon S3
  (cheap retention + analytics via Iceberg/Athena) or Amazon OpenSearch (full-text search +
  observability dashboards + alerting). Covers the S3-vs-OpenSearch decision, RDBMS-side
  time partitioning and fast purge (DROP PARTITION, not DELETE), offload pipelines (AWS DMS
  full-load+CDC, Kinesis Data Firehose, Debezium/MSK, scheduled export), OpenSearch ingestion
  (Firehose, OpenSearch Ingestion/Data Prepper, Fluent Bit), index rollover & retention (ISM),
  UltraWarm/Cold tiers, and hot-warm-cold tiered architecture. Use when an RDBMS log/event/audit
  table is bloating, slow, or expensive and you want to move it to S3 or OpenSearch.
  Triggers: log table bloat, audit log, event log, time-series in RDBMS, archive old rows,
  DMS to S3, Firehose, OpenSearch ingestion, ISM rollover, UltraWarm, CDC, Debezium,
  partition pruning, cold storage, retention policy, move logs out of Postgres/MySQL.
origin: harness
workloads: [cloud, postgres, mysql]
---

# Log-Type Data Offloading: RDBMS → S3 / OpenSearch

Log, audit, event, and time-series rows are append-heavy, queried by time range, and rarely
updated — the opposite of what an OLTP RDBMS is tuned for. Leaving them in Postgres/MySQL
causes table bloat, index degradation, slow `DELETE`-based purges, autovacuum pressure, and
ballooning storage cost. Offload them to a system built for the access pattern.

## When to Activate

- An RDBMS log/audit/event table is growing unbounded, slow, or expensive
- Time-range queries or full-text search on logs are degrading OLTP
- Deciding between keeping logs in the DB, moving to S3, or moving to OpenSearch
- Designing an ingestion pipeline (DMS, Firehose, CDC) for log data
- Setting retention/rollover on logs

## Step 1: Pick the destination

| Need | Destination |
|---|---|
| Cheap long-term retention, batch/SQL analytics, compliance archive | **S3 (Iceberg/Parquet)** → query with Athena |
| Full-text search, real-time dashboards, alerting, ops/observability | **Amazon OpenSearch** |
| Both: search recent + archive everything | **Tiered** (OpenSearch hot/warm + S3 cold) |
| Truly relational, frequently joined, low volume | **Keep in RDBMS** (just partition it) |

Rule of thumb: **S3 for "store cheaply and analyze later", OpenSearch for "search and watch now".** They are complementary, not competing — many systems send to both.

## Step 2: Fix the RDBMS side first (partition + fast purge)

Before/while offloading, make the source table cheap to trim. The single biggest win:
**range-partition by time and `DROP PARTITION` instead of `DELETE`.**

```sql
-- Postgres: declarative range partitioning by month
CREATE TABLE app_log (id bigint, ts timestamptz NOT NULL, level text, msg text)
  PARTITION BY RANGE (ts);
CREATE TABLE app_log_2026_06 PARTITION OF app_log
  FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- Purge a month in O(1): drop the partition, no row-by-row delete, no bloat
ALTER TABLE app_log DETACH PARTITION app_log_2026_06;  -- then archive, then DROP
```

- **Never** purge logs with `DELETE FROM ... WHERE ts < ...` on a large table — it's slow, bloats the table, and hammers autovacuum/undo. Drop the partition.
- MySQL: `ALTER TABLE app_log DROP PARTITION p202606;` (see `mysql-guideline`); Postgres details in `postgres-guideline`.
- Automate partition creation/retention with `pg_partman` (Postgres) or an event scheduler (MySQL).
- This alone often defers the need to offload — but pair it with offload so dropped partitions are archived first.

## Step 3a: Offload to S3 (retention + analytics)

Land logs as **Parquet in Iceberg tables** partitioned by date, then query with Athena. See `aws-lakehouse` for the S3 Tables / Iceberg / Athena specifics.

Pipelines (pick by freshness need):

- **AWS DMS (full load + CDC)** — point at the RDBMS, target **S3 in Parquet**. Does a one-time full load then streams ongoing changes (CDC). Best for migrating an existing table and keeping it synced. Output partitioned by date for Athena/Iceberg.
- **Kinesis Data Firehose → S3** — for app-emitted log streams. Enable **record format conversion to Parquet** + **dynamic partitioning** (by `ts`/tenant) so files land query-ready; Glue catalogs them.
- **Debezium + MSK (Kafka)** — log-based CDC when you need a stream other consumers also read (e.g. S3 *and* OpenSearch from one pipeline).
- **Scheduled batch export** — simplest: nightly job exports the about-to-be-dropped partition to Parquet on S3 (e.g. via `aws s3` + a Spark/DuckDB convert), then `DROP PARTITION`. Good when near-real-time isn't needed.

After landing: compact small files (S3 Tables auto-compacts; self-managed → Glue optimizer), set S3 lifecycle to Glacier/Deep Archive for cold compliance copies, query with Athena (`$5/TB` scanned — Parquet + date partitioning keeps scans tiny).

## Step 3b: Offload to OpenSearch (search + observability)

Ingestion paths (pick one):

- **Kinesis Data Firehose → OpenSearch** — managed, buffers and bulk-indexes; can **also fork to S3** for backup in the same delivery stream. Lowest-ops for streaming.
- **Amazon OpenSearch Ingestion (managed Data Prepper)** — pipeline-as-config with filtering, enrichment, and parsing before indexing; supports DMS/Kafka/HTTP sources.
- **Fluent Bit / Logstash** — agent-side shipping when logs originate on hosts/containers.
- **DMS → OpenSearch** — for replicating an existing RDBMS table directly.

Index design & lifecycle (this is where log clusters succeed or fail):

- Use a **data stream** (or rollover alias) with a **time-based index pattern** (`logs-app-000001`), write to the alias, never to a fixed index.
- **ISM (Index State Management) policy** does the heavy lifting: **rollover** (by size/age/doc count) → move to **UltraWarm** (S3-backed warm tier, far cheaper) after N days → **Cold storage** → **delete** at retention end. This is the OpenSearch equivalent of S3 lifecycle.
- Define an **index template** with explicit mappings — let the field count and types be controlled, disable dynamic mapping explosions on log JSON, and use `keyword` vs `text` deliberately (search vs aggregate).
- Right-size shards (~10–50GB/shard); too many small shards is the #1 OpenSearch log anti-pattern.
- Consider **OpenSearch Serverless (time-series collection)** to skip shard/capacity management for spiky log volume.

## Step 4: Tiered hot-warm-cold (the common end state)

```
RDBMS (hot, days)  --DMS/CDC/Firehose-->  OpenSearch hot+UltraWarm (searchable, weeks-months)
        |                                          |  ISM rollover
        +----- partition DROP after archive ------>  S3 Iceberg (cold, years) <-- Athena
```

- **Hot**: only the recent window stays in the RDBMS (or OpenSearch hot nodes).
- **Warm**: OpenSearch UltraWarm for searchable recent history at lower cost.
- **Cold**: everything in S3/Iceberg, queryable on demand via Athena; Glacier for compliance-only.
- Drive RDBMS retention by partition drop *after* the archive copy is confirmed in S3.

## Cost & Ops Pitfalls

- **`DELETE`-based log purge** — slow, bloats the table, autovacuum/undo storms. Always `DROP PARTITION`.
- **Dropping a partition before the archive is confirmed** — data loss. Archive → verify → detach → drop.
- **Dynamic mapping explosion in OpenSearch** — unbounded JSON log fields blow up the field count and heap. Use explicit templates + disable dynamic mapping.
- **Too many tiny OpenSearch shards** — heap pressure, slow queries. Size shards and roll over by size.
- **No ISM/lifecycle** — indices and S3 objects grow forever; set rollover→UltraWarm→delete and S3 lifecycle on day one.
- **Small Parquet files on S3** — slow Athena scans + (on S3 Tables) higher compaction/monitoring cost. Buffer in Firehose / compact.
- **Sending only to one tier** — if you delete from the RDBMS but only indexed to OpenSearch (which later rolls off), the long-term record is gone. Send cold copy to S3.
- **Exactly-once assumptions** — Firehose/CDC are at-least-once; logs may duplicate. Dedup on an event id at query time or in the pipeline if it matters.

## Related

- `aws-lakehouse` — S3 Tables / Iceberg / Athena / Spark for the cold tier
- `postgres-guideline` / `mysql-guideline` — time range partitioning + retention on the source
- `aws-cloud` — IAM/networking/cost for the pipeline services
- `aws-sdk-patterns` — boto3 for Firehose/DMS/OpenSearch API calls
- `duckdb-patterns` — query the S3/Parquet archive without a cluster
