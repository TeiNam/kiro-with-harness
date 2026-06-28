# Connection Management and MongoDB Features

## Async Connection Pool (Python)

> New code should use **PyMongo Async (`AsyncMongoClient`)**. motor is
> deprecated as of 2026-05, with official recommendation to migrate to PyMongo Async. Pooling
> semantics are identical (`maxPoolSize` default 100, `minPoolSize` default 0).

```python
from pymongo import AsyncMongoClient

# Create once at app startup (singleton)
client = AsyncMongoClient(
    "mongodb://app:password@localhost:27017/myapp",
    maxPoolSize=10,
    minPoolSize=4,
    serverSelectionTimeoutMS=5000,
    socketTimeoutMS=30000,
    w="majority",
    readPreference="primaryPreferred"
)

db = client["myapp"]
```

> WARNING: Create only one client per process (prohibit per-request creation → pool exhaustion).
> For FastAPI, recommended to manage create/close in `lifespan` event.

```python
# FastAPI lifespan pattern
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pymongo import AsyncMongoClient

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo = AsyncMongoClient("mongodb://localhost:27017")
    app.state.db = app.state.mongo["myapp"]
    yield
    await app.state.mongo.close()

app = FastAPI(lifespan=lifespan)
```

> Legacy motor code (`from motor.motor_asyncio import AsyncIOMotorClient`) still
> works but migrate to PyMongo Async for new code and migrations.

## Node.js Native Driver (Async)

```javascript
import { MongoClient } from "mongodb";

// Singleton client
const client = new MongoClient("mongodb://localhost:27017", {
  maxPoolSize: 10,
  minPoolSize: 4,
  serverSelectionTimeoutMS: 5000,
  writeConcern: { w: "majority" },
  readPreference: "primaryPreferred",
});

await client.connect();
const db = client.db("myapp");

// Usage example
const user = await db.collection("users").findOne(
  { _id: new ObjectId(userId), is_active: true },
  { projection: { email: 1, created_at: 1 } }
);
```

## Application Layer Schema Validation

Using raw driver without ODM, so schema validation performed directly in app.

```python
# Python: Input validation with Pydantic
from pydantic import BaseModel, EmailStr
from datetime import datetime
from bson import ObjectId

class UserCreate(BaseModel):
    email: EmailStr
    display_name: str

def to_user_doc(data: UserCreate) -> dict:
    now = datetime.utcnow()
    return {
        "email": data.email,
        "display_name": data.display_name,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
```

```javascript
// Node.js: Input validation with Zod
import { z } from "zod";

const UserCreateSchema = z.object({
  email: z.string().email(),
  display_name: z.string().min(1).max(50),
});

function toUserDoc(data) {
  const now = new Date();
  return { ...data, is_active: true, created_at: now, updated_at: now };
}
```

## Transaction Management

```python
# Multi-document transaction (requires replica set or sharded cluster)
async def transfer_credits(from_user_id: ObjectId, to_user_id: ObjectId, amount: int):
    async with await client.start_session() as session:
        async with session.start_transaction():
            await db.users.update_one(
                {"_id": from_user_id, "credits": {"$gte": amount}},
                {"$inc": {"credits": -amount}, "$set": {"updated_at": datetime.utcnow()}},
                session=session
            )
            await db.users.update_one(
                {"_id": to_user_id},
                {"$inc": {"credits": amount}, "$set": {"updated_at": datetime.utcnow()}},
                session=session
            )
            # Auto commit on normal with block exit, auto rollback on exception
```

> WARNING: MongoDB transactions have high performance cost. Prohibit transaction use if resolvable with single-document atomic operations (`$set`, `$inc`, etc.).

## Change Streams (Real-Time Change Detection)

```python
# Real-time subscription to collection changes (requires replica set)
async def watch_chat_histories(user_id: ObjectId):
    pipeline = [{"$match": {"fullDocument.user_id": user_id}}]

    async with db.chat_histories.watch(
        pipeline,
        full_document="updateLookup"
    ) as stream:
        async for change in stream:
            event_type = change["operationType"]  # insert / update / delete
            doc = change.get("fullDocument")
            yield event_type, doc
```

## Aggregation Pipeline Helpers

```python
# Reuse common pagination stage
def paginate(last_id: ObjectId = None, limit: int = 20) -> list:
    stages = []
    if last_id:
        stages.append({"$match": {"_id": {"$lt": last_id}}})
    stages += [
        {"$sort": {"_id": -1}},
        {"$limit": limit}
    ]
    return stages

# Usage example
pipeline = [
    {"$match": {"user_id": user_id, "is_active": True}},
    *paginate(last_id=last_id, limit=20)
]
```

## MongoDB-Specific Features

### Atomic Array Operations

```python
# Add element to array (prevent duplicates)
await db.users.update_one(
    {"_id": user_id},
    {"$addToSet": {"tags": "premium"}}
)

# Remove element from array
await db.users.update_one(
    {"_id": user_id},
    {"$pull": {"tags": "trial"}}
)

# Keep only last N elements of array (logs, etc.)
await db.users.update_one(
    {"_id": user_id},
    {"$push": {"recent_logins": {
        "$each": [datetime.utcnow()],
        "$slice": -10  # Keep only recent 10
    }}}
)
```

### Conditional Update ($setOnInsert)

```python
# On upsert, set created_at only on first insert
await db.user_settings.update_one(
    {"user_id": user_id, "setting_key": key},
    {
        "$set": {"setting_value": value, "updated_at": datetime.utcnow()},
        "$setOnInsert": {"created_at": datetime.utcnow()}
    },
    upsert=True
)
```

### JSONB-equivalent: Dot Notation Query

```python
# Query nested field
await db.user_settings.find_one({
    "user_id": user_id,
    "setting_data.theme": "dark"
})

# Update nested field
await db.user_settings.update_one(
    {"user_id": user_id},
    {"$set": {"setting_data.theme": "light", "updated_at": datetime.utcnow()}}
)
```

## Performance Checklist
- [ ] Connection pool configured (`maxPoolSize`, `minPoolSize`)
- [ ] Write concern `w: "majority"` verified
- [ ] Transactions used only when single-document operations cannot replace
- [ ] Confirmed no COLLSCAN with `explain()`
- [ ] `$match`, `$sort` in aggregation pipeline placed at front
- [ ] `$lookup` minimized — if needed, limit fields with `pipeline` sub-option
- [ ] Index usage statistics periodically checked (`$indexStats`)
