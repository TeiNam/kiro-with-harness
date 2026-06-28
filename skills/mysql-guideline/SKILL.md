---
name: mysql-guideline
description: >
  MySQL 8.0+ schema design, table/index creation, query optimization, partitioning,
  connection management, development principles and anti-patterns, JDBC driver selection.
  Triggers: CREATE TABLE, ALTER TABLE, slow query analysis, index design, RANGE partition,
  MySQL migration, utf8mb4, InnoDB, transaction management, UPSERT, Covering Index,
  composite index, normalization, data type selection, INET_ATON, UUID_TO_BIN,
  DATETIME TIMESTAMP, stored procedure, COUNT(*), random PK, JSON column,
  JDBC, Connector/J, AWS Advanced JDBC Wrapper, Aurora failover related tasks.
origin: custom
workloads: [mysql]
---

# MySQL Database Guideline

## When to Activate

- Writing MySQL queries or migrations
- Designing MySQL database schemas
- Troubleshooting slow queries
- Creating partitioned tables
- Setting up connection management

## MySQL Version and Defaults
- MySQL 8.0.40+
- Character set: utf8mb4, utf8mb4_general_ci
- Engine: InnoDB

## Naming Rules

Common RDBMS naming conventions (snake_case, singular form, active voice with date column
exceptions, prefix/postfix rules, abbreviation dictionary, column prefix/suffix system,
data types) follow the **`rdbms-naming` skill as the single source of truth.** Summary:

- Tables/Columns: snake_case, tables in singular form (e.g. `user`, `user_chat_setting`, `user_id`)
- Active voice: `create_date` — but date+time columns use `created_at`/`updated_at` as exceptions
- Indexes: table+column in condition order, **uppercase suffix**
  - Regular `<table>_<col>_IDX` · Unique `_UIDX` · Fulltext `_FTX`
  - Examples: `book_like_user_id_IDX`, `book_uuid_UIDX`, `book_name_FTX`

## Data Type Guide

| Use Case | Recommended Type | Notes |
|----------|-----------------|-------|
| Tiny PK/flag | `tinyint unsigned` | 0~255 |
| Small PK | `smallint unsigned` | 0~65535 |
| Standard PK | `int unsigned` | 0~4.2 billion |
| Large PK | `bigint unsigned` | Log tables |
| Boolean | `char(1)` 'Y'/'N' (recommended) or `tinyint(1)` 0/1 | CHAR recommended to avoid 0→NULL/falsy confusion. MySQL has no native boolean → tinyint also viable. Unify within one schema |
| Variable string | `varchar(n)` | Specify max length |
| Long text | `text` | No length limit |
| Fixed string | `char(n)` | Fixed-length codes |
| Timestamp | `datetime` | With DEFAULT CURRENT_TIMESTAMP |
| JSON data | `json` | MySQL 8.0+ native JSON |
| Money | `decimal(p,s)` | Never use float / `decimal(15,2)`: KRW, `decimal(10,2)`: USD, `decimal(5,4)`: ratio (0.1234=12.34%) |

## Prohibited Items
- Stored Procedures: prohibited
- Triggers: prohibited
- Events: prohibited
- Complex Views: discouraged, simple read-only only

## Reference Files
- `schema-design.md` — PK/FK policy, checklists
- `index-and-query.md` — Index strategy, query patterns
- `partitioning.md` — Partitioning strategy, management
- `connection-and-features.md` — Connection management, transactions
- `dev-practices.md` — Development principles and anti-patterns: normalization, minimal types, INET_ATON/UUID_TO_BIN, DATETIME vs TIMESTAMP, avoid SP/Trigger, index anti-patterns, avoid COUNT(*), random PK, composite PK, physical FK, JSON
- `jdbc-driver.md` — Java driver selection: AWS Advanced JDBC Wrapper (recommended, v4.1.0) vs Connector/J, failover tuning
