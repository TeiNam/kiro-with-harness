# Key Design and Index Strategy

---

## Partition Key (PK) Design Principles

PK is DynamoDB's **horizontal partitioning unit**. It impacts performance far more directly than MongoDB's shard key.
All Items with the same PK are stored in the same partition.

### Good PK Criteria

| Criterion | Description |
|-----------|-------------|
| High cardinality | Many distinct values needed for partition distribution |
| Even access | No read/write concentration on specific PKs |
| Immutability | Cannot change after creation (change = delete + recreate) |
| Query isolation | Frequently co-queried data should share the same PK |

### Hot Partition Prevention

```python
# FAIL: Sequential ID: New Items always concentrate in same partition
pk = "USER#1"
pk = "USER#2"
pk = "USER#3"   # Sequential creation → concentrates on recent partition

# FAIL: Date alone: All writes concentrate on today's date partition
pk = "DATE#2024-01-15"

# FAIL: Low cardinality: Only 2-3 distinct values exist
pk = "STATUS#active"
pk = "STATUS#inactive"

# PASS: UUID / ULID: Even distribution
pk = f"USER#{uuid4()}"
pk = f"MSG#{ulid()}"

# PASS: Entity ID based: High cardinality and even
pk = "USER#user_8f3a9b2c"
pk = "CONV#conv_4e7d1f9a"

# PASS: Write concentration mitigation: Write Sharding (random suffix distribution)
import random
shard = random.randint(0, 9)
pk = f"LEADERBOARD#{leaderboard_id}#SHARD{shard}"
# On read query all 0-9 and merge (accept Scatter-Gather cost)
```

---

## Sort Key (SK) Design Principles

SK handles **sorting and range queries** within the same PK.
Similar to the second field in MongoDB compound indexes, but far more critical in DynamoDB.

### SK Design Patterns

```python
# Pattern 1 — Single record (static value)
sk = "PROFILE"
sk = "META"
sk = "SETTINGS"

# Pattern 2 — Time sorting (ISO8601 String)
sk = "MSG#2024-01-15T10:05:00.000Z"     # Ascending time sort
sk = f"MSG#{datetime.utcnow().isoformat()}Z"

# Pattern 3 — Hierarchical structure (begins_with range query)
sk = "MSG#2024-01#msg789"               # Monthly filter
sk = "MSG#2024-01-15#msg789"            # Daily filter
# begins_with("MSG#2024-01") → All January messages

# Pattern 4 — Reverse sort trick (when newest-first is default sort)
# DynamoDB defaults to ascending sort → newest comes last
# ScanIndexForward=False enables reverse, but
# for certain patterns store inverted timestamp
MAX_TIMESTAMP = 9999999999999
inverted_ts = MAX_TIMESTAMP - int(datetime.utcnow().timestamp() * 1000)
sk = f"MSG#{inverted_ts:013d}"  # Ascending sort = newest first
```

---

## GSI (Global Secondary Index) Strategy

GSI is a separate index that queries data with different PK/SK from the base table.
**Maximum 20 per table**, additional cost incurred. Design minimally and reuse.

### GSI Overloading — Handle Multiple Access Patterns with One GSI

```python
# Reuse GSI by populating GSI attributes differently per entity
# GSI1: gsi1pk + gsi1sk

# User entity: Query by email (AP-R2)
{
    "pk": "USER#user123",
    "sk": "PROFILE",
    "gsi1pk": "EMAIL#user@example.com",   # GSI1 PK
    "gsi1sk": "USER#user123",             # GSI1 SK
    "type": "user"
}

# Content entity: Query latest content by status
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "gsi1pk": "STATUS#published",         # Reuse same GSI1
    "gsi1sk": "2024-01-15T10:00:00Z",     # Time sorted
    "type": "content"
}

# Access Patterns supported by GSI1:
# - Query user by email: gsi1pk = "EMAIL#user@example.com"
# - Published content newest first: gsi1pk = "STATUS#published", ScanIndexForward=False
```

```python
# GSI query example
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table("MyApp")

# AP-R2: Query user by email
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("EMAIL#user@example.com")
)
user = response["Items"][0] if response["Items"] else None

# Latest 20 published content
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("STATUS#published"),
    ScanIndexForward=False,
    Limit=20
)
```

### GSI Sparse Index — Index Only Specific Entities

Items without GSI attributes are not included in the GSI. Use this to index only specific types.

```python
# Include only content requiring admin approval in GSI
# → Only Items with pendingApproval field exist in GSI2
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "type": "content",
    "status": "pending_review",
    "gsi2pk": "PENDING",                  # Only pending approval content has this field
    "gsi2sk": "2024-01-15T10:00:00Z"
}
# On approval remove gsi2pk, gsi2sk fields → automatically excluded from GSI2
```

---

## LSI (Local Secondary Index)

Use when you need sorting/range queries with different SK under the same PK.
**Can only be added at table creation time** (cannot add later). More restrictive than GSI.

```python
# LSI definition example at table creation (boto3)
dynamodb.create_table(
    TableName="MyApp",
    KeySchema=[
        {"AttributeName": "pk", "KeyType": "HASH"},
        {"AttributeName": "sk", "KeyType": "RANGE"}
    ],
    LocalSecondaryIndexes=[
        {
            "IndexName": "LSI_updatedAt",
            "KeySchema": [
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "updatedAt", "KeyType": "RANGE"}  # Different SK
            ],
            "Projection": {"ProjectionType": "ALL"}
        }
    ],
    BillingMode="PAY_PER_REQUEST"
)
```

> WARNING: LSI cannot be added/removed after table creation. Use GSI instead if uncertain.
> LSI shares the 10GB partition size limit.

---

## GSI vs LSI Selection Criteria

| Item | GSI | LSI |
|------|-----|-----|
| Add timing | Anytime | Table creation only |
| PK change | Possible (use different PK) | Impossible (shares same PK) |
| Consistency | Eventually consistent | Strongly consistent possible |
| Partition limit | None | 10GB shared per PK |
| Cost | Additional storage/throughput | Shares storage with main table |
| Recommended | **Most cases** | Secondary sorting with strong consistency |

---

## Projection Design (Index Size Optimization)

Decide which fields to copy to GSI/LSI. Trade-off between cost and convenience.

```python
# KEYS_ONLY: Only pk, sk, gsi pk, sk → Cheapest, requires additional GetItem after query
{"ProjectionType": "KEYS_ONLY"}

# INCLUDE: Only specified fields → Only fields needed for list APIs
{"ProjectionType": "INCLUDE", "NonKeyAttributes": ["title", "thumbnailUrl", "createdAt"]}

# ALL: Copy all fields → Most convenient, 2x storage
{"ProjectionType": "ALL"}
```

```python
# Recommended pattern: Use INCLUDE for list API GSIs with only needed fields
# For detail view, get pk/sk from GSI then GetItem for full item
response = table.query(IndexName="GSI1", ...)
pk = response["Items"][0]["pk"]
sk = response["Items"][0]["sk"]
full_item = table.get_item(Key={"pk": pk, "sk": sk})["Item"]
```

## Key and Index Checklist
- [ ] PK cardinality sufficiently high (no sequential int, no date alone)
- [ ] SK designed hierarchically to leverage begins_with / between
- [ ] GSI count minimized via GSI Overloading
- [ ] LSI requirements confirmed before table creation
- [ ] GSI Projection uses INCLUDE with only needed fields
- [ ] No low-cardinality PK causing hot partitions
- [ ] Each Access Pattern mapped to specific index
