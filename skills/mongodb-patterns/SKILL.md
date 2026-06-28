---
name: mongodb-patterns
description: MongoDB runtime patterns — aggregation pipelines, query/index usage, transactions, async (motor) connection pools, and diagnostics. Complements mongodb-guideline (which owns schema/naming/shard-key design).
origin: harness
workloads: [mongodb]
---

# MongoDB Patterns

Runtime query and operations reference. Schema design, naming rules, field
types, and shard-key *selection* live in `mongodb-guideline` — this skill
covers how to **query, aggregate, index, transact, and connect** at runtime.
For deep review use the `database-reviewer` agent.

## Activation

Use when writing MongoDB queries, aggregation pipelines, index hints,
transactions, or `motor`/`pymongo` connection code — or when diagnosing slow
queries, unbounded result sets, or pool exhaustion.

## Version Check

Confirm the server version before using version-gated features:

```js
db.version()                       // shell
// motor / pymongo
info = await client.server_info()  # info["version"]
```

- Multi-document transactions: replica set (4.0+) or sharded cluster (4.2+).
- `$lookup` on sharded collections: 5.1+.
- Time-series collections: 5.0+. Use for append-only metrics/logs.

## Query Patterns

### Projection first

Always project to the fields you need — never ship whole documents to the app
for one field.

```js
db.users.find({ active: true }, { email: 1, _id: 0 })
```

### Pagination — range, not skip

`skip()` scans and discards; it degrades linearly. Use a range cursor on an
indexed, monotonic field.

```js
// BAD: skip grows O(n)
db.events.find().sort({ _id: 1 }).skip(100000).limit(20)

// GOOD: keyset on indexed _id
db.events.find({ _id: { $gt: lastSeenId } }).sort({ _id: 1 }).limit(20)
```

### Upsert

```js
db.counters.updateOne(
  { _id: key },
  { $inc: { n: 1 }, $setOnInsert: { createdAt: new Date() } },
  { upsert: true }
)
```

### Bulk writes

Batch heterogeneous mutations in one round trip; `ordered: false` keeps going
past a single failure.

```js
db.items.bulkWrite([
  { updateOne: { filter: { sku: "a" }, update: { $set: { qty: 5 } } } },
  { insertOne: { document: { sku: "b", qty: 1 } } },
], { ordered: false })
```

## Aggregation

Order stages to shrink the working set as early as possible:
`$match` → `$sort` (index-backed) → `$project`/`$group` → `$lookup` last.

```js
db.orders.aggregate([
  { $match: { status: "paid", createdAt: { $gte: since } } },  // uses index, cuts docs first
  { $group: { _id: "$customerId", total: { $sum: "$amount" } } },
  { $sort: { total: -1 } },
  { $limit: 20 },
])
```

- `$match` and `$sort` before `$group` so a compound index serves them; after
  `$group` (or `$project`/`$unwind`) the data is synthetic and the `$sort` can
  no longer use an index.
- The optimizer already reorders some stages (`$sort`+`$match` → `$match`
  first; coalesces `$sort`+`$limit` when nothing in between changes the count),
  but don't rely on it — author `$match` first so the index is used regardless.
- `$lookup` is a nested loop — filter both sides first; prefer embedding when
  the join is always needed (see mongodb-guideline document-design).
- `allowDiskUse: true` for large `$group`/`$sort`, but treat spilling to disk
  as a signal to add an index or pre-aggregate.

## Indexes at Runtime

Index *strategy* is in mongodb-guideline; at runtime, verify usage:

```js
db.coll.find(query).explain("executionStats")
// winningPlan.stage must be IXSCAN, not COLLSCAN.
// totalDocsExamined ≈ nReturned means the index is selective.
```

- ESR rule for compound indexes: **E**quality, then **S**ort, then **R**ange.
  Equality keys must come first (any order among themselves). Exception
  (**ERS**): if the range predicate is *very selective*, placing it before sort
  can win by shrinking the set before an in-memory sort — measure both.
- Range operators include `$ne`, `$nin`, `$regex`, and `$in` with ≥ 200/201
  elements (small `$in` behaves as equality). Treat them as the R in ESR.
- A covered query (all fields in the index) skips document fetch entirely.
- TTL index for expiring data: `createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 })`.

## Transactions

Only when a write spans multiple documents/collections and must be atomic.
Single-document writes are already atomic — do not wrap them. Requires a
replica set (`featureCompatibilityVersion` ≥ 4.0) or sharded cluster (≥ 4.2);
standalone deployments do not support transactions.

Prefer the **callback API** (`with_transaction`) — it incorporates retry logic
for `TransientTransactionError` and `UnknownTransactionCommitResult` for you:

```python
async def transfer(session):
    await accounts.update_one({"_id": a}, {"$inc": {"bal": -amt}}, session=session)
    await accounts.update_one({"_id": b}, {"$inc": {"bal":  amt}}, session=session)

async with client.start_session() as s:
    await s.with_transaction(transfer)   # auto-commit, auto-retry on transient errors
```

- The **core API** (`start_transaction()`) does **not** auto-retry — you must
  handle `TransientTransactionError` (retry the whole txn) and
  `UnknownTransactionCommitResult` (retry the commit) yourself. Prefer the
  callback API unless you need manual control.
- Individual write ops inside a transaction are never retried regardless of
  `retryWrites`; only the whole transaction is retryable.
- Default runtime limit is 60s (`transactionLifetimeLimitSeconds`); longer txns
  are aborted by a cleanup process. Since MongoDB 6.2, a `TransactionTooLarge­ForCache`
  error (>75% of cache) is not retried — split the work instead.

## Connection Pools (async)

Use **PyMongo Async** (`AsyncMongoClient`) for new async code. Motor is
deprecated (end of support announced for 2026-05); the official path forward is
PyMongo's built-in async client, which has the same pooling semantics.

Create **one** client per process and reuse it — never per request.

```python
from pymongo import AsyncMongoClient

client = AsyncMongoClient(
    uri,
    maxPoolSize=50,          # cap concurrent sockets (driver default: 100)
    minPoolSize=0,           # default 0; raise to keep warm sockets
    maxConnecting=2,         # concurrent new-connection establishment (default 2)
    serverSelectionTimeoutMS=5000,
    retryWrites=True,
)
```

- The client is thread-safe and pools internally; sharing one across
  coroutines is correct. Re-creating it per request exhausts connections.
- Requests block once `maxPoolSize` is reached until a connection frees — size
  it to the app's real concurrency, not higher (idle sockets cost server memory).
- A single session/`AsyncClientSession` is **not** concurrency-safe — don't use
  one session across concurrent operations.
- Set `serverSelectionTimeoutMS` low enough to fail fast on an unreachable node.
- On network error the driver raises `ConnectionFailure` and reconnects in the
  background; handle the exception and retry the operation.

## Diagnostics

```js
db.currentOp({ "secs_running": { $gt: 5 } })   // long-running ops
db.coll.aggregate([{ $indexStats: {} }])        // unused indexes (drop them)
db.setProfilingLevel(1, { slowms: 100 })         // log queries > 100ms
```

- COLLSCAN in `explain` on a hot path → missing/unused index.
- Rising `totalDocsExamined / nReturned` ratio → index lost selectivity.

## Anti-Patterns

- **Unbounded `find()`** with no `limit` on a user-facing path — always cap.
- **`skip()`-based pagination** at scale — use keyset.
- **`$where` / JS evaluation** in queries — no index, injection risk.
- **`$lookup` as a default join** — model embedding first; lookups don't scale.
- **Client per request** (motor) — pool exhaustion; reuse one client.
- **Wrapping a single-document write in a transaction** — needless overhead.
- **Unanchored regex** (`/foo/`) — can't use an index; anchor it (`/^foo/`).

## Output Expectations

When producing MongoDB code: show the query/pipeline, name the index it relies
on, and (for non-trivial reads) include an `explain` expectation (IXSCAN, not
COLLSCAN). Flag any unbounded result set.

## Related

- `mongodb-guideline` — schema design, naming, field types, shard-key selection, index strategy.
- `database-reviewer` agent — deep query/schema review.
- `database-migrations` — schema/version migration patterns.

## Sources

Verified against the MongoDB Manual (mongodb.com/docs/manual):

- ESR/ERS guideline — `/tutorial/equality-sort-range-guideline/`
- Aggregation pipeline optimization — `/core/aggregation-pipeline-optimization/`
- Transactions in applications (callback vs core API) — `/core/transactions-in-applications/`
- Transaction production considerations (FCV, 60s limit) — `/core/transactions-production-consideration/`
- PyMongo connection pools — `/languages/python/pymongo-driver/current/connect/connection-options/connection-pools/`
- Motor deprecation → PyMongo Async successor — motor.readthedocs.io / pymongo async `AsyncMongoClient`
