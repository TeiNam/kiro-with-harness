# Query Patterns

---

## Query vs Scan — Scan is Always Forbidden

| Item | Query | Scan |
|------|-------|------|
| Operation | Query SK range after specifying PK | Read entire table |
| Cost | RCU for items read | RCU for entire table |
| Performance | O(result size) | O(table size) |
| Usage | Always use | **Forbidden** |

```python
from boto3.dynamodb.conditions import Key, Attr

# PASS: Query: PK must be specified
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123")
)

# PASS: Query + SK range
response = table.query(
    KeyConditionExpression=
        Key("pk").eq("CONV#conv456") &
        Key("sk").begins_with("MSG#2024-01")
)

# PASS: Query on GSI
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("EMAIL#user@example.com")
)

# FAIL: Scan: Absolutely forbidden
response = table.scan(
    FilterExpression=Attr("email").eq("user@example.com")
)
# → Reads entire table then filters → same cost, worst performance
```

> WARNING: Be cautious with `FilterExpression` even in Query. It applies after narrowing by Key condition,
> but without Key condition narrowing, it incurs the same cost as Scan.

---

## GetItem / BatchGetItem — Single/Batch Retrieval

```python
# GetItem: When both pk + sk are known (fastest and cheapest)
response = table.get_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"}
)
user = response.get("Item")

# Strongly consistent read (guarantees latest data, 2x cost)
response = table.get_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"},
    ConsistentRead=True
)

# BatchGetItem: Retrieve multiple Items at once (max 100, 16MB)
response = dynamodb.batch_get_item(
    RequestItems={
        "MyApp": {
            "Keys": [
                {"pk": "USER#user123", "sk": "PROFILE"},
                {"pk": "USER#user456", "sk": "PROFILE"},
                {"pk": "CONTENT#abc",  "sk": "META"}
            ],
            "ProjectionExpression": "pk, sk, #name, email",
            "ExpressionAttributeNames": {"#name": "name"}
        }
    }
)
items = response["Responses"]["MyApp"]

# WARNING: BatchGetItem does not guarantee order, must retry UnprocessedKeys
unprocessed = response.get("UnprocessedKeys", {})
while unprocessed:
    response = dynamodb.batch_get_item(RequestItems=unprocessed)
    items.extend(response["Responses"].get("MyApp", []))
    unprocessed = response.get("UnprocessedKeys", {})
```

---

## Cursor Pagination

DynamoDB pagination is based on `LastEvaluatedKey`. There is no `offset` concept.

```python
async def get_messages(
    conversation_id: str,
    last_evaluated_key: dict = None,
    limit: int = 20
) -> dict:
    kwargs = {
        "KeyConditionExpression":
            Key("pk").eq(f"CONV#{conversation_id}") &
            Key("sk").begins_with("MSG#"),
        "ScanIndexForward": False,  # Newest first
        "Limit": limit
    }
    if last_evaluated_key:
        kwargs["ExclusiveStartKey"] = last_evaluated_key

    response = table.query(**kwargs)
    return {
        "items": response["Items"],
        "next_cursor": response.get("LastEvaluatedKey")  # None if last page
    }

# Client passes next_cursor to next request
# → Recommend URL-safe base64 encoding
import base64, json

def encode_cursor(last_evaluated_key: dict) -> str:
    return base64.urlsafe_b64encode(
        json.dumps(last_evaluated_key).encode()
    ).decode()

def decode_cursor(cursor: str) -> dict:
    return json.loads(base64.urlsafe_b64decode(cursor.encode()))
```

---

## Write Patterns

### PutItem — Store Entire Item (Overwrite)

```python
from datetime import datetime, timezone

# New creation: prevent duplicates with condition
try:
    table.put_item(
        Item={
            "pk": "USER#user123",
            "sk": "PROFILE",
            "type": "user",
            "email": "user@example.com",
            "name": "Hong Gildong",
            "isActive": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat()
        },
        ConditionExpression="attribute_not_exists(pk)"  # Prevent duplicates
    )
except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
    raise ValueError("User already exists")
```

### UpdateItem — Partial Update (Recommended)

```python
# PASS: UpdateItem: Change only specified fields (safer than PutItem)
table.update_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"},
    UpdateExpression="SET #name = :name, updatedAt = :updatedAt",
    ExpressionAttributeNames={"#name": "name"},  # Avoid reserved words
    ExpressionAttributeValues={
        ":name": "Kim Younghee",
        ":updatedAt": datetime.now(timezone.utc).isoformat()
    },
    ConditionExpression="attribute_exists(pk)"  # Verify exists
)

# Counter increment (atomic)
table.update_item(
    Key={"pk": f"CONTENT#{content_id}", "sk": "META"},
    UpdateExpression="ADD #stats.viewCount :inc SET updatedAt = :now",
    ExpressionAttributeNames={"#stats": "stats"},
    ExpressionAttributeValues={":inc": 1, ":now": datetime.now(timezone.utc).isoformat()}
)
```

### UPSERT Pattern

```python
# PutItem without attribute_not_exists condition → upsert
# UpdateItem + SET → create if missing, update if exists
table.update_item(
    Key={"pk": f"USER#{user_id}", "sk": f"SETTING#{key}"},
    UpdateExpression=
        "SET settingValue = :val, updatedAt = :now "
        "ADD #v :inc",  # Increment version
    ExpressionAttributeNames={"#v": "version"},
    ExpressionAttributeValues={
        ":val": value,
        ":now": datetime.now(timezone.utc).isoformat(),
        ":inc": 1
    }
)
```

---

## Transaction (TransactWrite / TransactGet)

Max 100 Items, 4MB limit. High performance cost, use only when necessary.

```python
# TransactWrite: Atomic write across multiple tables/Items
dynamodb_client.transact_write_items(
    TransactItems=[
        # 1. Save message
        {
            "Put": {
                "TableName": "MyApp",
                "Item": {
                    "pk": f"CONV#{conv_id}",
                    "sk": f"MSG#{timestamp}#{msg_id}",
                    "type": "message",
                    "text": message_text,
                    "createdAt": timestamp
                }
            }
        },
        # 2. Update conversation message counter (maintain denormalization consistency)
        {
            "Update": {
                "TableName": "MyApp",
                "Key": {"pk": f"CONV#{conv_id}", "sk": "META"},
                "UpdateExpression": "ADD messageCount :inc SET lastMessageAt = :ts",
                "ExpressionAttributeValues": {":inc": 1, ":ts": timestamp},
                "ConditionExpression": "attribute_exists(pk)"
            }
        }
    ]
)
```

---

## BatchWrite — Bulk Write

```python
# BatchWriteItem: Max 25 Items, 16MB
with table.batch_writer() as batch:
    for record in records:
        batch.put_item(Item={
            "pk": f"MSG#{record['id']}",
            "sk": "DATA",
**record
        })
# boto3 batch_writer automatically batches 25 Items + retries UnprocessedItems

# Same for deletion
with table.batch_writer() as batch:
    for key in keys_to_delete:
        batch.delete_item(Key={"pk": key["pk"], "sk": key["sk"]})
```

---

## Condition Expression Patterns

```python
from boto3.dynamodb.conditions import Attr

# Existence check
"attribute_exists(pk)"
"attribute_not_exists(pk)"

# Value comparison
Attr("version").eq(expected_version)          # Optimistic locking
Attr("isActive").eq(True)
Attr("stock").gt(0)                           # Deduct only when stock available

# Optimistic Locking pattern
try:
    table.update_item(
        Key={"pk": pk, "sk": sk},
        UpdateExpression="SET stock = stock - :dec, #v = #v + :inc",
        ConditionExpression=Attr("stock").gte(1) & Attr("version").eq(current_version),
        ExpressionAttributeNames={"#v": "version"},
        ExpressionAttributeValues={":dec": 1, ":inc": 1}
    )
except ConditionalCheckFailedException:
    raise ConcurrentModificationError("Stock already 0 or version mismatch")
```

## Query Checklist
- [ ] No Scan — all queries use Query or GetItem
- [ ] FilterExpression usage sufficiently narrowed by KeyCondition
- [ ] Pagination based on LastEvaluatedKey
- [ ] BatchGetItem UnprocessedKeys retry handling
- [ ] BatchWrite automatic batching via batch_writer()
- [ ] Transactions only for essential atomicity guarantees
- [ ] ExpressionAttributeNames for reserved word conflicts
