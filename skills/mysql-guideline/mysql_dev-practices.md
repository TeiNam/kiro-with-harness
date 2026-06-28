# MySQL Development Practices

Principles to follow and anti-patterns to avoid in MySQL projects.
Order: normalization → optimal data types → avoid SP/Trigger → indexes → anti-patterns.

## 1. Data Normalization Required

The essence of relational DB is "split, store, join to output".

- MySQL is an RDBMS — normalization is the fundamental strategy for performance, consistency, and integrity.
- More blocks to read one row increases I/O.
- **Stuffing JSON/HTML into one column is an anti-pattern** (see 5.5).
- Use `rdbms-data-modeler` agent for normalization level and denormalization decisions.

## 2. Data Type Selection

### 2.1 Use the Smallest Type

Smaller types bring four benefits: storage space (`TINYINT` 1B vs `INT` 4B → 100 million
rows = 100MB vs 400MB), reduced index size (higher memory load rate → faster searches),
buffer pool and cache efficiency, network bandwidth. Choose the minimal type without
exceeding representable range.

### 2.2 String Types

| | CHAR | VARCHAR | TEXT |
|---|------|---------|------|
| Length | Fixed (≤255) | Variable (≤65,535) | Variable, stored separately with pointer reference |
| Pros | Consistent performance, index efficiency | Space efficient | Very large strings |
| Cons | Space wasted on short values | Inconsistent insert/update performance | Index limitations, search degradation |

Fixed-length codes → `CHAR`, general variable strings → `VARCHAR`, large content not
used in search conditions → `TEXT`.

### 2.3 DATETIME vs TIMESTAMP

| | DATETIME | TIMESTAMP |
|---|----------|-----------|
| Format | `YYYY-MM-DD HH:MM:SS` | Unix timestamp |
| Range | 1000 ~ 9999 | 1970 ~ 2038-01-19 |
| Timezone | Agnostic (stores value as-is) | Server timezone conversion |
| Space | 8B | 4B |
| Use case | Wide range, fixed timezone | Global services, before 2038, automatic time |

Due to the 2038 problem (TIMESTAMP), DATETIME is safer for long-term data retention.

### 2.4 Space and Integrity via Functions

- **`INET_ATON` / `INET_NTOA`** — Store IP as `INT UNSIGNED`(4B). Space savings vs string
  + blocks malformed IP (integrity).
  ```sql
  INSERT INTO ip_log (ip) VALUES (INET_ATON('192.168.0.1'));  -- 3232235521
  SELECT INET_NTOA(ip) FROM ip_log;
  ```
- **`UUID_TO_BIN` / `BIN_TO_UUID`** — UUID as `BINARY(16)`(36B→16B). Binary comparison is
  faster for performance. But readability drops if used as JOIN key → integers recommended
  for PK (5.2).

## 3. Avoid Stored Procedure · Trigger · Event Scheduler

MySQL does not cache SP in memory — **recompiled on every call** (unique weakness vs other
DBMS). SQL parsing overhead also repeats per execution (literals not cached).

Problem areas: maintenance (logic scattered, IDE debugging impossible), portability (DBMS
vendor lock-in), performance (caching integration with Redis etc. difficult, scale-out
limitations), productivity (version control, testing, deployment automation absent), logic
duplication (app<->SP consistency degraded), security (complex permissions). Keep business
logic in application layer.

## 4. Indexes

### Why They Slow DML

INSERT/UPDATE triggers B-tree node split, merge, reorganization. More indexes = each
updated individually, costs accumulate. Composite indexes consider multiple columns,
making updates costlier than single-column.

### Creation Guidelines

- Create only needed indexes (DML cost <-> query benefit tradeoff).
- Write-heavy LOG tables → single-column index on high-cardinality columns.
- Read speed critical → composite index (ESR/order see `index-and-query`).
- **Function in WHERE clause → index invalidated** (`WHERE DATE(col)=...` → index not used).
  Work around with generated column or functional index.
- **`LIKE '%word'` (leading wildcard) → Full Table Scan** → load, failures. If text search
  is frequent, use Fulltext index; if insufficient, migrate to Elasticsearch.

## 5. Anti-Patterns (What Not to Do)

### 5.1 Using `COUNT(*)` in Validation Logic

MySQL (InnoDB) does not store row count separately — counting approaches full scan.
For "existence check", use `EXISTS` / `LIMIT 1` instead of `COUNT(*)`.

### 5.2 Random Keys as PK

MySQL PK is a **clustered index** — physically sorted by PK order. Random keys (UUIDv4 etc.)
trigger page reorganization and splits on every insert, degrading write performance.
**PK should be `INT` family + `AUTO_INCREMENT`** by default. If distributed generation is
essential, use UUIDv1/v7 + `UUID_TO_BIN` (time-sortable), but accept reduced FK JOIN
readability.

### 5.3 Composite Keys as PK

Composite PK increases index size and search cost, reduces query simplicity and readability,
complicates FK references (multiple columns required), and introduces performance traps via
column order dependencies. **Use single surrogate key (`AUTO_INCREMENT`) as PK**, express
composite uniqueness via UNIQUE constraint/index.

### 5.4 Physical FK Constraints

Physical FK adds integrity check overhead on every write, lock contention on referenced
tables (reduced concurrency), migration and distributed environment constraints, DBMS-specific
implementation differences (reduced portability). **Manage referential integrity at application
layer**, document FK relationships logically via `COMMENT` (see Application-Level Referential
Integrity in schema-design).

### 5.5 JSON Column Overuse

JSON columns add parsing overhead, cannot be directly indexed (Generated Column required),
lack schema validation (reduced integrity), limit complex queries and JOINs, store inefficiently
as strings. Normalize if structure is fixed. **If data is inherently document-oriented,
consider MongoDB** (`mongodb-guideline`).

## Dev Practices Checklist

- [ ] Prioritize normalization, no monolithic JSON/HTML columns
- [ ] Select smallest type within representable range
- [ ] IP → `INET_ATON`, UUID storage → `UUID_TO_BIN`
- [ ] Choose DATETIME/TIMESTAMP based on range and timezone requirements
- [ ] No SP/Trigger/Event, logic in app layer
- [ ] Don't invalidate indexes with function conditions or `LIKE '%x'`
- [ ] Existence check with `EXISTS` instead of `COUNT(*)`
- [ ] PK is `INT`+`AUTO_INCREMENT` (avoid random and composite PK)
- [ ] No physical FK, referential integrity in app
