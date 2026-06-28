# Index Strategy

MongoDB indexes share the same concept as RDBMS, but require completely different strategies based on **document structure and query patterns**.

---

## Key Differences from RDBMS

| Item | RDBMS (MySQL/PostgreSQL) | MongoDB |
|------|--------------------------|---------|
| Index unit | Column | Field (including nested fields, array elements) |
| Array index | Requires separate table | Multikey index automatic support |
| Conditional index | Partial index (PostgreSQL only) | `partialFilterExpression` |
| Compound index direction | Unidirectional (ASC/DESC mix allowed) | Sort direction directly affects index efficiency |
| Covering index | INCLUDE columns | Include projection fields in index |
| Cardinality | Higher is better | Same, but Partial compensates low cardinality |
| Auto-creation | Not auto-created on FK | None — explicit creation required |
| `_id` index | PK index automatic | Unique index auto-created on `_id` |

---

## Index Types

### 1. Single Field — Basic

```python
# Simple equality / range queries
await db.users.create_index("email", name="idx_users_email")

# Nested fields also indexable (not possible in RDBMS)
await db.users.create_index("profile.location", name="idx_users_location")
await db.contents.create_index("author.user_id", name="idx_contents_author_id")
```

### 2. Compound Index — ESR Rule Required

Unlike RDBMS "equality first, range last", MongoDB follows **E → S → R** order.

```
E (Equality)  : Exact match fields first
S (Sort)      : Sort fields in middle
R (Range)     : Range condition fields last
```

```python
# Query: user_id = x AND status = "published" ORDER BY published_at DESC
# ESR: Not user_id(E) → published_at(S) → status(R)
# But user_id(E) → status(E) → published_at(S) order
await db.contents.create_index(
    [("user_id", ASCENDING), ("status", ASCENDING), ("published_at", DESCENDING)],
    name="idx_contents_user_status_published"
)

# FAIL: Wrong order: Putting Range before Sort prevents index-based sort
await db.contents.create_index(
    [("user_id", ASCENDING), ("created_at", ASCENDING), ("status", ASCENDING)]
    # If created_at is range condition, status sort cannot use index
)
```

### 3. Multikey Index — Array Field (Concept Not in RDBMS)

When indexing an array field, **each array element is stored as a separate index entry**.

```python
# Index each element of tags array
await db.contents.create_index("tags", name="idx_contents_tags")

# Query: documents containing "mongodb" in tags array
await db.contents.find({"tags": "mongodb"})              # Single tag
await db.contents.find({"tags": {"$all": ["mongodb", "database"]}})  # Contains all

# Nested array fields also possible
await db.users.create_index("addresses.city", name="idx_users_city")
```

> WARNING: Multikey index cannot include two or more array fields in compound index.
> `[("tags", 1), ("categories", 1)]` → ERROR (simultaneous multikey on two array fields prohibited)

### 4. Partial Index — Solution for Low-Cardinality Fields

In RDBMS, indexing fields like `is_active`, `status` has no effect.
MongoDB's Partial Index solves this by **indexing only documents matching a condition**.

```python
# Index email only for is_active = true documents → excludes deleted users
await db.users.create_index(
    "email",
    partialFilterExpression={"is_active": {"$eq": True}},
    unique=True,
    name="uidx_users_active_email"
)

# Index only status = "published" content → excludes drafts
await db.contents.create_index(
    [("published_at", DESCENDING)],
    partialFilterExpression={"status": "published"},
    name="idx_contents_published_at"
)

# WARNING: Partial index activates only when query includes partialFilterExpression condition
# Below query does not use idx_contents_published_at (status condition missing)
await db.contents.find({"published_at": {"$gte": since}})  # FAIL: COLLSCAN
# Below query uses it
await db.contents.find({"status": "published", "published_at": {"$gte": since}})  # PASS:
```

### 5. TTL Index — Auto-Expiration

```python
# MongoDB auto-deletes in background when expired_at time is reached
await db.sessions.create_index(
    "expired_at",
    expireAfterSeconds=0,
    name="idx_sessions_expired_at"
)

# Fixed TTL: delete N seconds after created_at
await db.temp_tokens.create_index(
    "created_at",
    expireAfterSeconds=60 * 60 * 24,  # Delete after 24 hours
    name="idx_temp_tokens_created_at"
)
```

### 6. Text Index — Full-Text Search

```python
from pymongo import TEXT

# Multi-field text index (weights configurable)
await db.contents.create_index(
    [("title", TEXT), ("body", TEXT), ("tags", TEXT)],
    weights={"title": 10, "tags": 5, "body": 1},
    name="idx_contents_text"
)

# Text search query
await db.contents.find(
    {"$text": {"$search": "MongoDB index"}},
    {"score": {"$meta": "textScore"}}   # Relevance score
).sort([("score", {"$meta": "textScore"})])
```

> WARNING: Only one Text index per collection. Must combine multiple fields into one Text index.
> For Korean morphological analysis, Atlas Search recommended.

---

## Covering Index (Index-Only Scan)

If all fields needed by query are in the index, document is not fetched.
More effective than RDBMS — savings increase with larger, more nested documents.

```python
# Index: (user_id, status, published_at) + title, thumbnail_url needed for projection
# → List API processed with index only, no document fetch
await db.contents.create_index(
    [
        ("user_id", ASCENDING),
        ("status", ASCENDING),
        ("published_at", DESCENDING),
        ("title", ASCENDING),           # projection field
        ("thumbnail_url", ASCENDING)    # projection field
    ],
    name="idx_contents_feed_covering"
)

# This query + projection processed with index only (no FETCH stage)
await db.contents.find(
    {"user_id": user_id, "status": "published"},
    {"title": 1, "thumbnail_url": 1, "published_at": 1, "_id": 0}
).sort("published_at", DESCENDING)
```

---

## Cursor Pagination (Prohibit skip)

```python
# FAIL: skip is O(n): scans entire front portion as pages get deeper
cursor = db.contents.find({"status": "published"}).skip(1000).limit(20)

# PASS: _id-based cursor: ObjectId has built-in time-ordered sorting
async def get_contents(last_id: ObjectId = None, limit: int = 20):
    query = {"status": "published"}
    if last_id:
        query["_id"] = {"$lt": last_id}
    return await db.contents.find(query).sort("_id", DESCENDING).limit(limit).to_list(limit)

# PASS: Compound cursor: when sort criterion is published_at (tie-breaking for same time)
async def get_feed(last_published_at: datetime = None, last_id: ObjectId = None, limit: int = 20):
    query = {"status": "published"}
    if last_published_at and last_id:
        query["$or"] = [
            {"published_at": {"$lt": last_published_at}},
            {"published_at": last_published_at, "_id": {"$lt": last_id}}
        ]
    return await db.contents.find(query).sort(
        [("published_at", DESCENDING), ("_id", DESCENDING)]
    ).limit(limit).to_list(limit)
```

---

## EXPLAIN Analysis

```python
explanation = await db.contents.find(
    {"user_id": user_id, "status": "published"}
).explain()

stage = explanation["queryPlanner"]["winningPlan"]["stage"]
# COLLSCAN → No index, dangerous
# IXSCAN   → Index used, normal
# FETCH    → Document fetch after index (not covering index)
# PROJECTION → Projection processing (if covering, comes directly without FETCH)
```

## Index Checklist
- [ ] ESR order (Equality → Sort → Range) followed
- [ ] No single index on `is_active`, `status` → replace with Partial index
- [ ] Array field index designed after understanding Multikey characteristics (two array fields compound not allowed)
- [ ] Covering index considered for frequently queried list APIs
- [ ] No `skip()` → use cursor pagination
- [ ] Confirmed no COLLSCAN with `EXPLAIN`
- [ ] Collections needing TTL use `expired_at` + TTL index
- [ ] One Text index per collection, multi-field integrated
