# Data Modeling

Core principle of DynamoDB design: **Define access patterns first, then design the table to match them.**
Unlike MongoDB's "add indexes later" approach, this is very expensive and risky in DynamoDB.
GSI addition is possible, but PK/SK changes mean recreating the table.

---

## Step 1 — List Access Patterns (Required Before Design)

Enumerate all read/write patterns before creating the table.

```
# Example: Chat Service Access Pattern List

[Write]
AP-W1. Create user
AP-W2. Send message
AP-W3. Create conversation session

[Read]
AP-R1. Get user profile by user_id
AP-R2. Get user by email
AP-R3. List all conversations by user_id (newest first)
AP-R4. List messages by conversation_id (time order, paginated)
AP-R5. Search messages by user_id + date range
```

This list becomes the basis for PK/SK/GSI design.

---

## Step 2 — Single Table Design vs Multi Table

### Single Table Design (Recommended)

Store multiple entities in **one table**. Overload `pk` and `sk` to distinguish entity types.

**Pros:**
- Fetch multiple entities in one Query (1 round-trip)
- Related data exists in the same partition → minimal latency
- Shared provisioning costs

**Cons:**
- Complex and non-intuitive design
- Requires complete access pattern definition upfront
- Hard to maintain if team DynamoDB understanding is low

### Multi Table (Suitable for Simple Services)

Separate table per entity. Structure similar to RDBMS.

**Recommended when:**
- Access patterns are simple and no cross-entity joins needed
- Team DynamoDB proficiency is low
- Service is in early stages

---

## Single Table Design Implementation

### Entity Overloading — Include type prefix in pk/sk

```python
# Include entity type as prefix in pk, sk values
# → Multiple entity types can coexist in the same partition

# User entity
{
    "pk": "USER#user123",       # Partition Key
    "sk": "PROFILE",            # Sort Key
    "type": "user",
    "email": "user@example.com",
    "name": "John Kim",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "isActive": True
}

# Conversation entity (same table)
{
    "pk": "USER#user123",           # Same partition → can Query with user
    "sk": "CONV#2024-01-15T10:00:00Z#conv456",  # Time sorted + ID
    "type": "conversation",
    "conversationId": "conv456",
    "title": "Travel planning",
    "messageCount": 0,
    "createdAt": "2024-01-15T10:00:00Z"
}

# Message entity (same table)
{
    "pk": "CONV#conv456",           # Conversation partition
    "sk": "MSG#2024-01-15T10:05:00Z#msg789",
    "type": "message",
    "conversationId": "conv456",
    "userId": "user123",
    "role": "user",
    "text": "Plan a 3-day trip",
    "createdAt": "2024-01-15T10:05:00Z"
}
```

### Query Multiple Entities in One Request

```python
# AP-R3: List all conversations for user
# pk = "USER#user123", sk begins_with "CONV#"
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123") &
                           Key("sk").begins_with("CONV#"),
    ScanIndexForward=False  # Newest first
)

# AP-R1 + AP-R3 together: User profile + recent conversations in one Query
# pk = "USER#user123", sk between "CONV#" and "PROFILE"
# → Fetch multiple types in one request based on sk sort order
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123"),
    # sk alphabetical order: CONV# < PROFILE
    # Narrow down range with KeyConditionExpression
)
# Client filters entities by type field
users = [item for item in response["Items"] if item["type"] == "user"]
convs = [item for item in response["Items"] if item["type"] == "conversation"]
```

---

## Embed vs Reference (DynamoDB Perspective)

Decision criteria are similar to MongoDB, but DynamoDB's **400KB Item limit** and **Query unit** constraints are stricter.

### Embed — Always read together, small size, no independent queries

```python
# PASS: Embed: User addresses — always with profile, no independent queries
{
    "pk": "USER#user123",
    "sk": "PROFILE",
    "type": "user",
    "email": "user@example.com",
    "addresses": [                  # Embed as List of Maps
        {"type": "home", "city": "Seoul", "zip": "12345"},
        {"type": "work", "city": "Suwon", "zip": "67890"}
    ]
}

# PASS: Embed: Content metadata — author snapshot needed for list cards
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "type": "content",
    "title": "MongoDB design principles",
    "author": {                     # Snapshot at creation time, no join needed
        "userId": "user123",
        "name": "John Kim",
        "avatarUrl": "https://..."
    },
    "tags": ["mongodb", "database"],
    "stats": {"viewCount": 0, "likeCount": 0}
}
```

### Reference — Independent queries, unbounded growth, shared across multiple

```python
# PASS: Reference: Messages grow unbounded → separate pk partition
# Store messages as separate Items in conversations partition
{
    "pk": "CONV#conv456",
    "sk": "MSG#2024-01-15T10:05:00Z#msg789",
    "type": "message",
    "conversationId": "conv456",    # Back reference
    "userId": "user123"             # Back reference
}

# FAIL: Never do this: Embed messages in conversation Item's List attribute
{
    "pk": "CONV#conv456",
    "sk": "META",
    "messages": [...]  # Exceeds 400KB limit, unbounded growth impossible
}
```

---

## Hierarchical Sort Key Pattern

Design sk hierarchically to support various range queries with begins_with / between.

```python
# sk structure: {type}#{time}#{ID}
# → begins_with("MSG#")          : All messages
# → begins_with("MSG#2024-01")   : January 2024 messages
# → between("MSG#2024-01", "MSG#2024-02") : January range

# Example: Conversation partition sk structure
"sk": "MSG#2024-01-15T10:05:00Z#msg789"

# Example: User partition sk structure
"sk": "PROFILE"                          # Profile (single)
"sk": "CONV#2024-01-15T10:00:00Z#conv1" # Conversation list
"sk": "FOLLOW#user456"                   # Follow list
"sk": "SETTING#notification"            # Settings
```

---

## Denormalization Strategy

DynamoDB has no JOIN, so denormalization is essential. Trade-off between update cost and read convenience.

```python
# Denormalize comment count in content → no aggregation needed on query
async def add_comment(content_id: str, comment: dict):
    async with aioboto3_resource() as dynamodb:
        table = await dynamodb.Table("MyApp")
        async with table.meta.client.get_waiter("table_exists"):
            pass

        # Save comment Item + update content counter atomically in transaction
        await table.meta.client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": "MyApp",
                        "Item": {
                            "pk": f"CONTENT#{content_id}",
                            "sk": f"COMMENT#{comment['createdAt']}#{comment['id']}",
**comment
                        }
                    }
                },
                {
                    "Update": {
                        "TableName": "MyApp",
                        "Key": {"pk": f"CONTENT#{content_id}", "sk": "META"},
                        "UpdateExpression": "ADD #stats.commentCount :inc",
                        "ExpressionAttributeNames": {"#stats": "stats"},
                        "ExpressionAttributeValues": {":inc": 1}
                    }
                }
            ]
        )
```

## Data Modeling Checklist
- [ ] Access Pattern list written before table creation
- [ ] Each Access Pattern processable with Query (or GetItem), no Scan
- [ ] pk/sk include entity type prefix (Single Table)
- [ ] No Unbounded List attributes (unbounded data stored as separate Items)
- [ ] Item size within 400KB
- [ ] Denormalized fields maintained consistently with transactions
- [ ] Entity types identifiable via `type` field
