---
name: rdbms-naming
description: >
  Common RDBMS naming and data type conventions (single source for MySQL and PostgreSQL).
  Table/column snake_case, singular, active voice (with date/time column exceptions), prefix/postfix,
  abbreviation dictionary, column prefix/suffix system, index naming (_IDX/_UIDX/_FTX), data type
  selection. Triggers: table/column/index design, DDL authoring, schema review, naming conventions,
  snake_case, abbreviations, PK/FK naming, boolean columns, DECIMAL, settlement amount columns.
origin: custom
workloads: [mysql, postgres]
---

# RDBMS Naming Conventions

**Naming governance** (snake_case, singular, active voice, prefix/postfix, abbreviations, index naming) is
common across MySQL and PostgreSQL, making this skill the **single source**. **Data types** differ by
engine, so apply only the target DB column from the "Data Types (by DB)" table below; see
`mysql-guideline` / `postgres-guideline` for deeper details.

## When to Activate

When creating tables, columns, or indexes; authoring or reviewing DDL; or deciding naming conventions.
Target: RDBMS (MySQL/PostgreSQL).

## Common Rules

- **snake_case**: All identifiers are lowercase with underscores. `authUser` → `auth_user`.
- **Descriptive and intuitive**: Names should be self-explanatory. Use `delivery_log` / `order_log` instead of vague `log`. Prefer simple words.
- **Active voice**: Use active voice for verbs. `create_date` (not `created_date`). Gerunds are allowed.
  - **Exception — date/time columns**: Idiomatic expressions like `created_at` / `updated_at` remain as-is. Strong ORM and framework conventions exempt these from the active voice rule.
- **No reserved words**: Do not use DB-specific reserved words as identifiers.
  (MySQL: dev.mysql.com/doc/refman/8.0/en/keywords.html)

## Table / Column

- **Singular form**: Table names are singular. `users` → `user`.
- **No postfix / limited prefix**: `tb_user`, `user_tbl` → `user`. Use prefix only to distinguish attribute tables subordinate to a master table. Examples: `user_auth` (child of master `user`), `book_like` (child of master `book`).
- **Limited abbreviations**: Avoid abbreviations when possible. If necessary, use lowercase and register in the **abbreviation dictionary** for team-wide distribution. `create_dt` → `create_date`, `user_cd` → `user_code`.

### Column Prefix/Suffix System

| Purpose | Rule | Example |
|---------|------|---------|
| PK | `<table>_id` | `user_id` |
| FK | `<parent_table>_id` | `user_id` |
| Date (DATE) | `<purpose>_date` | `create_date` |
| Date+Time (DATETIME) | `<purpose>_at` | `created_at` |
| Code | `<purpose>_code` | `user_code` |
| Number | `<purpose>_no` | `order_no` |
| Boolean | `<column>_yn` | `use_yn` |

## Abbreviation Dictionary

Principle: Use abbreviations only for overly long words where the abbreviation is sufficient and agreed upon. Keep rules **minimal**.

| Full Term | Abbreviation |
|-----------|--------------|
| number | `no` |
| address | `addr` |
| episode | `ep` |
| transaction | `tx` |
| count | `cnt` |
| authentication | `auth` |
| introduce | `intro` |

## Index Naming

Structure: Describe the table and included columns **in condition order**, and append the **suffix in uppercase**.

```
<table>_<col1>_<col2>_..._IDX
```

| Type | Suffix | Example |
|------|--------|---------|
| General | `_IDX` | `book_like_user_id_IDX` |
| Unique | `_UIDX` | `book_uuid_UIDX` |
| Fulltext | `_FTX` | `book_name_FTX` |

Composite index example: `actor(first_name, last_name, last_update)` →
`actor_first_name_last_name_last_update_IDX`.

## Data Types (by DB)

Type selection varies by DB engine. Follow the **common principles** (below), but refer to the target DB column for concrete types. See `mysql-guideline` / `postgres-guideline` for deeper type tables.

### Common Principles (DB-agnostic)

- **PK is integer-based (avoid UUID)**: The first-column PK `id` should be an auto-increment integer
  (`int`/`bigint`). Ordering, index locality, and storage favor integers over UUIDs.
  Use UUID **only when distributed generation across multiple DBs or shards** is required (no central sequence).
  For a single DB, integer PK is the default.
  - **MySQL**: `AUTO_INCREMENT` (e.g., `id int unsigned NOT NULL AUTO_INCREMENT PRIMARY KEY`)
  - **PostgreSQL**: `GENERATED ALWAYS AS IDENTITY` (e.g., `id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY`)
- **Amounts / settlement**: Floating-point (`float`/`double`/`real`) is **absolutely prohibited** → use fixed-point.
  Default scale `(10,2)`; adjust for currency and precision (KRW `(15,2)`, ratios `(5,4)`).
- **JOIN keys**: Use integer types and ensure **both sides of the join have identical types**.
- **Strings**: Fixed-length `CHAR(n)`, variable `VARCHAR(n)`.
- **Avoid NULL**: For indexed columns, avoid NULL — prefer normalization into separate tables and JOIN.
  Allow NULL only when size is small or usage is minimal.

### Type Mapping

| Purpose | MySQL | PostgreSQL |
|---------|-------|------------|
| Boolean | `CHAR(1)` 'Y'/'N' recommended (avoids 0→NULL/falsy confusion) or `tinyint(1)` 0/1. No native boolean | **native `boolean`**. 'Y'/'N' strings prohibited |
| PK (auto, integer) | **`AUTO_INCREMENT`** — `int`/`bigint unsigned` (standard method) | **`GENERATED ALWAYS AS IDENTITY`** — `int`/`bigint` (standard method). Do not use `SERIAL` (proprietary; IDENTITY is SQL standard, safer, simpler permissions) |
| Amount | `DECIMAL(p,s)` | `numeric(p,s)` |
| Date+Time | `datetime` (+`DEFAULT CURRENT_TIMESTAMP`) | `timestamptz` (timezone required) |
| Date | `date` | `date` |
| Long text | `TINYTEXT`(256B)/`TEXT`(64KB)/`MEDIUMTEXT`(16MB)/`LONGTEXT`(4GB) 4 tiers | Variable `text` **single** (no length distinction) |
| JSON | `json` (8.0+ native) | `jsonb` (indexing support, not `json`) |
| Positive-only | `UNSIGNED` option | No UNSIGNED → `CHECK (col >= 0)` |
| Fixed display width | `INT(n) ZEROFILL` | No display width/ZEROFILL concept → handle in app or `LPAD` |
| External ID (not PK) | `char(36)`/`binary(16)` UUID | `uuid` (`gen_random_uuid()`) |
| IP address | `varchar(45)` | `inet` (native) |
| Array | (none → normalize or JSON) | `type[]` (e.g., `text[]`) |

> MySQL-specific: `UNSIGNED`, `ZEROFILL`, TEXT 4 tiers, `AUTO_INCREMENT`.
> PostgreSQL-specific: native `boolean`, `timestamptz`, `jsonb`, `inet`, arrays,
> `IDENTITY`, `numeric`. Do not mix; apply only the target DB column.

## Bad / Good Summary

| Bad | Good | Reason |
|-----|------|--------|
| `authUser` | `auth_user` | snake_case |
| `users` | `user` | singular |
| `tb_user` | `user` | unnecessary prefix |
| `created_date` | `create_date` | active voice (date columns like `created_at` are exceptions) |
| `create_dt` | `create_date` | abbreviation overuse |
| `idx_book_user` | `book_user_id_IDX` | uppercase suffix, table+column order |

## Related

- `mysql-guideline` — MySQL-specific defaults, types, and prohibitions. Based on these rules.
- `postgres-guideline` — PostgreSQL-specific differences (single text type, IDENTITY, no UNSIGNED, etc.).
- `rdbms-data-modeler` agent — Applies these conventions for normalization and table design.
