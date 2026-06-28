# Connection Management and DynamoDB Features

## boto3 / aioboto3 Client Configuration

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr

# Sync (boto3) — Simple scripts, Lambda (sync)
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-2"
)
table = dynamodb.Table("MyApp")

# Environment-specific configuration (based on environment variables)
import os

dynamodb = boto3.resource(
    "dynamodb",
    region_name=os.environ.get("AWS_REGION", "ap-northeast-2"),
    # Local development: DynamoDB Local
    endpoint_url=os.environ.get("DYNAMODB_ENDPOINT")  # "http://localhost:8000"
)
```

```python
# Async (aioboto3) — Recommended for FastAPI, async services
import aioboto3
from contextlib import asynccontextmanager

session = aioboto3.Session()

@asynccontextmanager
async def get_table(table_name: str = "MyApp"):
    async with session.resource(
        "dynamodb",
        region_name="ap-northeast-2",
        endpoint_url=os.environ.get("DYNAMODB_ENDPOINT")
    ) as dynamodb:
        table = await dynamodb.Table(table_name)
        yield table

# FastAPI lifespan pattern
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.dynamodb_session = aioboto3.Session()
    yield
    # aioboto3 session does not require explicit close

app = FastAPI(lifespan=lifespan)

# Usage example
async def get_user(user_id: str) -> dict:
    async with get_table() as table:
        response = await table.get_item(
            Key={"pk": f"USER#{user_id}", "sk": "PROFILE"}
        )
        return response.get("Item")
```

---

## TTL (Time To Live)

DynamoDB's automatic expiration feature. Same concept as MongoDB TTL index.

```python
# Enable TTL on table (one-time setup via console or CLI)
dynamodb_client.update_time_to_live(
    TableName="MyApp",
    TimeToLiveSpecification={
        "Enabled": True,
        "AttributeName": "ttl"  # epoch seconds (Unix timestamp)
    }
)

# Add ttl field to document
from datetime import datetime, timedelta, timezone
import time

# Session: Expire after 24 hours
session_item = {
    "pk": f"SESSION#{session_id}",
    "sk": "DATA",
    "type": "session",
    "userId": user_id,
    "token": token,
    "createdAt": datetime.now(timezone.utc).isoformat(),
    "ttl": int(time.time()) + 60 * 60 * 24  # epoch after 24 hours
}

# Temporary auth code: Expire after 10 minutes
otp_item = {
    "pk": f"OTP#{email}",
    "sk": "VERIFY",
    "code": otp_code,
    "ttl": int(time.time()) + 60 * 10  # 10 minutes
}
```

> WARNING: TTL expiration deletes within up to 48 hours after expiration, not immediately.
> If precise expiration timing matters, check `ttl` field directly on query.

```python
# Direct expiration check
import time

def is_expired(item: dict) -> bool:
    ttl = item.get("ttl")
    return ttl is not None and ttl < int(time.time())
```

---

## DynamoDB Streams

Process table change events in real-time. Similar to MongoDB Change Streams.

```python
# Enable Streams (table configuration)
dynamodb_client.update_table(
    TableName="MyApp",
    StreamSpecification={
        "StreamEnabled": True,
        "StreamViewType": "NEW_AND_OLD_IMAGES"  # NEW_IMAGE / OLD_IMAGE / KEYS_ONLY
    }
)
```

```python
# Process Stream with Lambda (most common pattern)
def handler(event, context):
    for record in event["Records"]:
        event_name = record["eventName"]  # INSERT / MODIFY / REMOVE

        new_image = record["dynamodb"].get("NewImage", {})
        old_image = record["dynamodb"].get("OldImage", {})

        # Unpack DynamoDB type descriptor
        from boto3.dynamodb.types import TypeDeserializer
        deserializer = TypeDeserializer()

        new_item = {k: deserializer.deserialize(v) for k, v in new_image.items()}
        old_item = {k: deserializer.deserialize(v) for k, v in old_image.items()}

        if event_name == "INSERT" and new_item.get("type") == "message":
            # New message → send notification
            send_notification(new_item)

        elif event_name == "MODIFY":
            # Change detected → invalidate cache, update search index, etc.
            invalidate_cache(new_item["pk"])

        elif event_name == "REMOVE":
            # Delete event (includes TTL expiration)
            handle_deletion(old_item)
```

---

## Error Handling

```python
from botocore.exceptions import ClientError

async def safe_put_item(table, item: dict, condition: str = None):
    kwargs = {"Item": item}
    if condition:
        kwargs["ConditionExpression"] = condition

    try:
        await table.put_item(**kwargs)
    except ClientError as e:
        code = e.response["Error"]["Code"]

        if code == "ConditionalCheckFailedException":
            raise ValueError("Condition check failed (duplicate or version mismatch)")

        elif code == "ProvisionedThroughputExceededException":
            # Rare in PAY_PER_REQUEST, but possible during burst
            raise RetryableError("Throughput exceeded, retry with backoff")

        elif code == "TransactionCanceledException":
            reasons = e.response["CancellationReasons"]
            raise ValueError(f"Transaction cancelled: {reasons}")

        elif code == "ResourceNotFoundException":
            raise ValueError(f"Table not found")

        else:
            raise
```

```python
# Exponential backoff retry (RetryableError handling)
import asyncio

async def with_retry(func, max_attempts: int = 3):
    for attempt in range(max_attempts):
        try:
            return await func()
        except RetryableError:
            if attempt == max_attempts - 1:
                raise
            await asyncio.sleep(2 ** attempt * 0.1)  # 0.1s, 0.2s, 0.4s
```

---

## DynamoDB Local (Local Development)

```yaml
# docker-compose.yml
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    ports:
      - "8000:8000"
    command: "-jar DynamoDBLocal.jar -sharedDb -inMemory"
```

```python
# Local connection
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-2",
    endpoint_url="http://localhost:8000",
    aws_access_key_id="dummy",      # Use dummy value for local
    aws_secret_access_key="dummy"
)

# Table creation script (local initialization)
def create_table():
    try:
        dynamodb.create_table(
            TableName="MyApp",
            KeySchema=[
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "sk", "KeyType": "RANGE"}
            ],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
                {"AttributeName": "gsi1pk", "AttributeType": "S"},
                {"AttributeName": "gsi1sk", "AttributeType": "S"}
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "GSI1",
                    "KeySchema": [
                        {"AttributeName": "gsi1pk", "KeyType": "HASH"},
                        {"AttributeName": "gsi1sk", "KeyType": "RANGE"}
                    ],
                    "Projection": {"ProjectionType": "ALL"}
                }
            ],
            BillingMode="PAY_PER_REQUEST"
        )
        print("Table created")
    except dynamodb.meta.client.exceptions.ResourceInExistsException:
        print("Table already exists")
```

## Performance Checklist
- [ ] PAY_PER_REQUEST vs Provisioned mode selected (Provisioned if traffic predictable)
- [ ] TTL enabled where appropriate (sessions, temporary data)
- [ ] Streams requirement confirmed (cache invalidation, search index sync)
- [ ] ClientError code-specific branching
- [ ] Exponential backoff applied to RetryableError
- [ ] DynamoDB Local used for local development
- [ ] ProjectionExpression to query only needed fields
