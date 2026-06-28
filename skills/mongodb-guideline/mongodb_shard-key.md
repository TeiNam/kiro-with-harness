# Shard Key Selection

Sharding is the method for horizontal scaling when single-server limits are exceeded.
**Shard keys are immutable**, so initial design is critical.
Try index optimization → replica set scale-up before sharding.

---

## Four Conditions for Good Shard Keys

| Condition | Description | Bad Example |
|-----------|-------------|-------------|
| High cardinality | Sufficient value variety for distribution | `status`, `is_active`, `country` |
| Even write distribution | Writes should not concentrate on specific shard | `created_at` alone (time-ordered hotspot) |
| Query isolation | Most queries complete within single shard | Field unrelated to query conditions |
| Immutability | Value unchanged after document creation | `status`, `email` (mutable) |

---

## Pattern-Specific Shard Key Guide

### Pattern 1 — User Data (chat, settings, activity)

If data is isolated per user and most queries are `user_id`-based, use `user_id` as shard key.

```javascript
// Hashed sharding: hash user_id for even distribution
sh.shardCollection("myapp.messages", {"user_id": "hashed"})

// Range sharding: shard by user_id ranges — beneficial for specific user range queries
sh.shardCollection("myapp.messages", {"user_id": 1})
```

```python
# Advantage: All data for one user on same shard → single shard completion without $lookup
await db.messages.find({"user_id": user_id})       # PASS: single shard query
await db.messages.find({"user_id": user_id, "conversation_id": conv_id})  # PASS: single shard

# Disadvantage: Hotspot possible if writes surge for specific user (whale user problem)
# → If write distribution important, consider compound shard key (user_id, _id)
```

### Pattern 2 — Time-Series/Log Data (access_log, events)

```python
# FAIL: created_at alone: writes concentrate on latest shard (monotonic hotspot)
sh.shardCollection("myapp.access_logs", {"created_at": 1})

# PASS: (hashed _id): ObjectId in _id is time-based, distributed via hash
sh.shardCollection("myapp.access_logs", {"_id": "hashed"})

# PASS: (user_id + created_at): per-user isolation + time range query efficiency
sh.shardCollection("myapp.access_logs", {"user_id": 1, "created_at": 1})
```

### Pattern 3 — Content Data (articles, videos, products)

```python
# Content often involves global search rather than specific user ownership
# → category + _id compound: per-category isolation + even distribution

# PASS: (category_id hashed): per-category distribution
sh.shardCollection("myapp.contents", {"category_id": "hashed"})

# PASS: (_id hashed): simplest and most even distribution, range query inefficient
sh.shardCollection("myapp.contents", {"_id": "hashed"})
```

### Pattern 4 — Multi-Tenant (SaaS, Organization/Team Isolation)

```python
# Complete data isolation by tenant_id
sh.shardCollection("myapp.documents", {"tenant_id": 1, "_id": 1})

# Advantage: All queries per tenant complete within single shard
# Disadvantage: Size imbalance between tenants → can compensate with Zone sharding
await db.documents.find({"tenant_id": tenant_id})  # PASS: single shard
```

---

## Hashed vs Range Sharding Comparison

| Item | Hashed | Range |
|------|--------|-------|
| Write distribution | PASS: even | WARNING: hotspot possible |
| Range query | FAIL: global scan | PASS: single shard |
| Sort query | FAIL: global | PASS: efficient |
| Suitable case | Many random writes | Many range/sort queries |

```python
# Hashed: write distribution top priority, few range queries
sh.shardCollection("myapp.events", {"user_id": "hashed"})

# Range: many user_id range queries or sorting
sh.shardCollection("myapp.orders", {"user_id": 1, "created_at": 1})
```

---

## Prevent Global Queries (Scatter-Gather)

Queries without shard key broadcast to all shards (scatter-gather).
Queries not including shard key **must be identified and minimized in advance**.

```python
# FAIL: Query without shard key (user_id) → scan all shards
await db.messages.find({"conversation_id": conv_id})  # scatter-gather

# PASS: Include shard key → single shard completion
await db.messages.find({"user_id": user_id, "conversation_id": conv_id})

# If conversation_id alone query needed?
# → Embed user_id in conversation_id and pass user_id together when querying
# Query user_id from conversations collection first, then query messages
conv = await db.conversations.find_one({"_id": conv_id}, {"user_id": 1})
messages = await db.messages.find({"user_id": conv["user_id"], "conversation_id": conv_id})
```

---

## Shard Key Selection Checklist

- [ ] Cardinality sufficiently high (minimum thousands of values)
- [ ] Writes not concentrated on specific shard (prohibit monotonic value alone)
- [ ] Shard key included in most queries (minimize scatter-gather)
- [ ] Shard key value unchanged after document creation
- [ ] Selected Hashed vs Range according to query pattern
- [ ] Tried index optimization and replica set scale-up before sharding
