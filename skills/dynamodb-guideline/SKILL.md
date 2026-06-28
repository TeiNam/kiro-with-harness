---
name: dynamodb-guideline
description: >
  Applied to DynamoDB table design, key/index strategy, query patterns, and boto3/aioboto3
  connection management. Triggers: DynamoDB table design, PK/SK, GSI, LSI, Single Table
  Design, access pattern, partition key, sort key, overloading, Query vs Scan, TTL,
  DynamoDB Streams, boto3, aioboto3, TransactWrite, BatchWrite related tasks.
origin: custom
workloads: [dynamodb]
---

# DynamoDB Guideline

## When to Activate

- Designing DynamoDB table schemas
- Defining access patterns before modeling
- Selecting partition key / sort key / GSI
- Writing Query, GetItem, PutItem, UpdateItem expressions
- Troubleshooting hot partitions or slow scans
- Setting up boto3 / aioboto3 client
- Implementing TTL or DynamoDB Streams

## DynamoDB Defaults
- AWS SDK: `boto3` 4.x (sync) / `aioboto3` 12.x (async)
- Billing mode: `PAY_PER_REQUEST` (default for unpredictable traffic)
- Table class: `STANDARD`
- Encryption: AWS managed key (default)

## Naming Rules
- Tables: PascalCase (e.g. `ChatHistory`, `UserSetting`, `Content`)
- Single Table: service name singular (e.g. `MyApp`)
- Attribute (field): camelCase (e.g. `userId`, `createdAt`, `sk`)
- GSI: `GSI_{number}` or purpose-specific (e.g. `GSI_email`, `GSI_status_created`)
- LSI: `LSI_{number}` or purpose-specific

## Key Attribute Naming (Single Table Design)

| Attribute | Role | Example Value |
|-----------|------|---------------|
| `pk` | Partition Key | `USER#user123`, `CONTENT#abc` |
| `sk` | Sort Key | `PROFILE`, `MSG#2024-01-01T00:00:00Z` |
| `gsi1pk` | GSI 1 PK | `EMAIL#user@example.com` |
| `gsi1sk` | GSI 1 SK | `USER#user123` |
| `type` | Entity type identifier | `"user"`, `"message"`, `"content"` |

## Data Type Guide

| Use Case | DynamoDB Type | Notes |
|----------|--------------|-------|
| ID / String | `S` (String) | All IDs are String |
| Number | `N` (Number) | Both integers and decimals |
| Boolean | `BOOL` | True/False |
| Timestamp | `S` (ISO8601) or `N` (epoch) | Use ISO8601 String if sorting needed |
| Nested object | `M` (Map) | For embedding |
| Array | `L` (List) | Ordered array |
| Tags/Set | `SS` / `NS` (Set) | Duplicate-free set |
| Binary | `B` | Binary data |
| Money | `N` (integer, smallest unit) | Avoid floating-point errors: store as integer cents |

## Prohibited Items
- `Scan` operation: Forbidden (reads entire table, worst cost/performance)
- `FilterExpression` on non-key attributes without Query: Same cost as Scan
- Sequential numeric PK (1, 2, 3...): Hot partition risk
- Unbounded List attribute: Risk exceeding 16KB item limit
- Schema-less design: Never create tables without defining access patterns first

## Reference Files
- `data-modeling.md` — Single Table Design, access pattern first design, Entity Overloading
- `key-and-index.md` — Partition Key / Sort Key design, GSI/LSI strategy, hot partition prevention
- `query-patterns.md` — Query vs Scan, pagination, condition expressions, Batch/Transaction
- `connection-and-features.md` — boto3/aioboto3, TTL, DynamoDB Streams, error handling
