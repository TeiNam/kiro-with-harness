---
name: aws-etl-cdc
description: >
  Decision guide for AWS ETL / data integration / CDC — choose the right service and pattern
  for the user's situation across AWS DMS, AWS Glue, Kinesis Data Streams, Amazon Data Firehose
  (formerly Kinesis Data Firehose), Amazon Managed Service for Apache Flink (formerly Kinesis Data
  Analytics), Amazon MSK + MSK Connect (Debezium), EventBridge Pipes, Lambda, Step Functions, and
  zero-ETL integrations. Routes by batch vs streaming, CDC vs bulk, and — critically — by transform
  type (passthrough/format-only, stateless per-record filter/enrich, stateful windowed aggregation,
  heavy batch). Use when designing a pipeline to move/transform data between databases, streams,
  S3, OpenSearch, Redshift, or a lakehouse. Triggers: AWS ETL, CDC, change data capture, DMS,
  Debezium, MSK Connect, Glue job, Glue streaming, Kinesis, Firehose, Flink, EventBridge Pipes,
  zero-ETL, ingest pipeline, stream processing, batch transform, replicate database.
origin: harness
workloads: [cloud, python-data]
---

# AWS ETL / CDC Decision Guide

There is no single "AWS ETL tool" — there's a toolbox, and picking wrong means either paying for
a Spark cluster to copy bytes, or hand-rolling stateful stream processing that Flink does for free.
**Choose by four questions, then by transform type.** Service availability and zero-ETL
source→target pairs change over time — verify current support per region (see `infra-version-currency`).

## When to Activate

- Designing a pipeline to move/transform data between DBs, streams, S3, OpenSearch, Redshift, lakehouse
- Choosing among DMS / Glue / Kinesis / Firehose / Flink / MSK / EventBridge Pipes / zero-ETL
- Implementing CDC (change data capture) from a database
- Deciding where the transform logic should live

## Step 1: Four routing questions

1. **Latency** — batch/scheduled (minutes–hours) vs streaming (sub-second–seconds)?
2. **Change capture** — full/bulk loads, or ongoing **CDC** (inserts/updates/deletes as they happen)?
3. **Transform complexity** — none/format-only, stateless per-record, or stateful (windows/joins/aggregations)?
4. **Fan-out & replay** — one target, or many consumers that may need to re-read history?

## Step 2: Service map (what each is actually for)

| Service | Sweet spot |
|---|---|
| **AWS DMS** | DB → target replication: **full load + CDC**, low/no transform, broad source/target support, no code. DMS Serverless for variable load. |
| **AWS Glue** | **Transform-heavy batch ETL** on serverless Spark (+ Python shell for small jobs), crawlers + Data Catalog, Glue streaming (micro-batch), DataBrew (visual prep), Iceberg. |
| **Kinesis Data Streams** | Real-time **ordered, multi-consumer** stream store with replay (retention up to 365d). The durable streaming backbone (AWS-native). |
| **Amazon Data Firehose** *(was Kinesis Data Firehose)* | Managed **delivery** to S3/Redshift/OpenSearch/Splunk/HTTP with buffering, Lambda transform, **Parquet/ORC conversion + dynamic partitioning**. Near-real-time, **no replay**. |
| **Managed Service for Apache Flink** *(was Kinesis Data Analytics)* | **Stateful** stream processing — windows, joins, aggregations, CEP, dedup-over-time. SQL or PyFlink/Java. |
| **Amazon MSK + MSK Connect** | Managed **Kafka** backbone for multi-consumer/replay; **MSK Connect** runs Debezium (CDC source) and S3/OpenSearch sink connectors. More control, more ops. |
| **EventBridge Pipes** | Low-code **point-to-point**: source (SQS/Kinesis/DDB Streams/MSK/MQ) → filter → enrich (Lambda/Step Functions/API) → target. |
| **Lambda** | Glue-code transforms and small event-driven moves. |
| **Step Functions** | **Orchestration** of multi-step batch ETL (Glue + Lambda + crawlers + validation). |
| **Zero-ETL integrations** | Managed replication with **no pipeline** for specific pairs (e.g. Aurora/RDS → Redshift, DynamoDB → Redshift/OpenSearch). Least ops — use when your pair is supported. |

## Step 3: Route by transform type (the key decision)

| Transform needed | Use |
|---|---|
| **None / format convert** (JSON→Parquet, partition) | **Amazon Data Firehose** (record-format conversion + dynamic partitioning) |
| **Stateless per-record** (filter, mask, enrich one event) | **EventBridge Pipes**, or **Firehose + Lambda** transform |
| **Stateful streaming** (windowed aggregation, stream joins, dedup, sessionization, CEP) | **Managed Service for Apache Flink** (or Spark Structured Streaming via Glue streaming / EMR) |
| **Heavy batch** (large joins, backfills, multi-source merges) | **AWS Glue** Spark jobs (or EMR for very large / custom) |
| **Light Python batch, small data** | Glue **Python shell** job or **Lambda** |
| **DB replication, minimal transform** | **DMS** or **zero-ETL** |

> Principle: push the transform to the cheapest layer that can express it. Don't spin up Spark to do what Firehose+Lambda does per record; don't hand-code windowing that Flink gives you declaratively.

## Step 4: CDC approach comparison

| Approach | Use when | Tradeoff |
|---|---|---|
| **DMS (full load + CDC)** | DB → S3/Redshift/Kinesis/OpenSearch/Kafka, no/low transform, fastest to stand up | Limited transform; managed but per-task tuning |
| **Debezium on MSK Connect** | Need a Kafka backbone many consumers read + replay; richer CDC control | Most ops (Kafka + Connect + schema registry) |
| **DynamoDB Streams / Kinesis for DynamoDB** | Source is DynamoDB | DDB-specific; pair with Lambda/Pipes/Firehose |
| **Zero-ETL** | Supported source→target pair (e.g. Aurora→Redshift, DynamoDB→OpenSearch) | No transform in-flight; only supported pairs/regions — verify currency |

Default: **DMS CDC** for "replicate this DB elsewhere with little transform"; **Debezium/MSK** when multiple independent consumers need the change stream; **zero-ETL** when the exact pair is supported and you want zero pipeline.

## Reference architectures

- **DB CDC → lakehouse**: DMS (or Debezium/MSK) → S3 (Parquet/Iceberg) → Athena/Spark. See `aws-lakehouse` and `log-data-offloading`.
- **App events → search/observability**: producers → Kinesis/MSK → Firehose → OpenSearch (+ fork to S3 for cold copy).
- **Real-time metrics/aggregation**: Kinesis/MSK → Managed Service for Apache Flink (windowed aggregates) → Firehose → OpenSearch/S3.
- **Scheduled warehouse load (ELT)**: Glue crawler → Data Catalog → Glue Spark transform → Redshift/Iceberg, orchestrated by Step Functions. Or skip the pipeline with **zero-ETL → Redshift** when supported.
- **Point-to-point with light enrich**: DynamoDB Streams → EventBridge Pipes (filter + Lambda enrich) → target.

## Common Pitfalls

- **Glue for byte-copy** — using a Spark job where DMS/Firehose would do is slow and costly. Match the tool to the transform.
- **Firehose when you need replay** — Firehose is delivery, not a stream store. Use Kinesis Data Streams / MSK if consumers must re-read.
- **Hand-rolled windowing in Lambda** — stateful aggregation belongs in Flink; Lambda has no durable cross-event state.
- **Assuming a zero-ETL pair exists** — the supported source→target matrix and regions change; verify before designing around it.
- **DMS for heavy transforms** — DMS does light table mapping only; put real transforms in Glue/Flink downstream.
- **Ignoring CDC delete semantics** — soft vs hard deletes, tombstones (Debezium), and merge-on-read at the target (Iceberg `MERGE`) must be designed, not assumed.
- **Exactly-once assumptions** — most paths are at-least-once; dedup with an event/sequence id (idempotent target or Flink dedup).
- **Schema drift** — register schemas (Glue Schema Registry / MSK) so a source column change doesn't silently break the sink.
- **Stale service/version choices** — confirm current service names, Glue/Flink runtime versions, and zero-ETL availability (see `infra-version-currency`).

## Related

- `aws-lakehouse` — S3 Tables / Iceberg / Athena / Spark as the ETL target (MERGE for CDC upserts)
- `log-data-offloading` — RDBMS log/time-series → S3/OpenSearch (a specific application of these pipelines)
- `infra-version-currency` — verify current Glue/Flink versions, zero-ETL pairs, MSK Kafka versions
- `aws-sdk-patterns` — boto3 calls to DMS/Glue/Kinesis/Firehose APIs
- `aws-cloud` — IAM/VPC/cost foundation; devops agent for provisioning
