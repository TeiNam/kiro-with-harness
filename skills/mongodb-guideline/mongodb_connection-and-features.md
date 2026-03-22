# Connection Management and MongoDB Features

## motor Async Connection Pool (Python)

```python
from motor.motor_asyncio import AsyncIOMotorClient

# 앱 시작 시 한 번만 생성 (싱글턴)
client = AsyncIOMotorClient(
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

> ⚠️ `AsyncIOMotorClient`는 프로세스당 하나만 생성할 것.
> FastAPI의 경우 `lifespan` 이벤트에서 생성/종료 관리 권장.

```python
# FastAPI lifespan 패턴
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo = AsyncIOMotorClient("mongodb://localhost:27017")
    app.state.db = app.state.mongo["myapp"]
    yield
    app.state.mongo.close()

app = FastAPI(lifespan=lifespan)
```

## Node.js Native Driver (Async)

```javascript
import { MongoClient } from "mongodb";

// 싱글턴 클라이언트
const client = new MongoClient("mongodb://localhost:27017", {
  maxPoolSize: 10,
  minPoolSize: 4,
  serverSelectionTimeoutMS: 5000,
  writeConcern: { w: "majority" },
  readPreference: "primaryPreferred",
});

await client.connect();
const db = client.db("myapp");

// 사용 예
const user = await db.collection("users").findOne(
  { _id: new ObjectId(userId), is_active: true },
  { projection: { email: 1, created_at: 1 } }
);
```

## 애플리케이션 레이어 스키마 검증

ODM 없이 raw 드라이버를 쓰므로 스키마 검증은 앱에서 직접 수행.

```python
# Python: Pydantic으로 입력 검증
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
// Node.js: Zod로 입력 검증
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
# Multi-document transaction (replica set 또는 sharded cluster 필요)
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
            # with 블록 정상 종료 시 자동 commit, 예외 시 자동 rollback
```

> ⚠️ MongoDB 트랜잭션은 성능 비용이 큼. 단일 도큐먼트 원자적 연산(`$set`, `$inc` 등)으로 해결 가능하면 트랜잭션 사용 금지.

## Change Streams (실시간 변경 감지)

```python
# 컬렉션 변경 실시간 구독 (replica set 필요)
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
# 공통 pagination stage 재사용
def paginate(last_id: ObjectId = None, limit: int = 20) -> list:
    stages = []
    if last_id:
        stages.append({"$match": {"_id": {"$lt": last_id}}})
    stages += [
        {"$sort": {"_id": -1}},
        {"$limit": limit}
    ]
    return stages

# 사용 예
pipeline = [
    {"$match": {"user_id": user_id, "is_active": True}},
    *paginate(last_id=last_id, limit=20)
]
```

## MongoDB-Specific Features

### Atomic Array Operations

```python
# 배열에 요소 추가 (중복 방지)
await db.users.update_one(
    {"_id": user_id},
    {"$addToSet": {"tags": "premium"}}
)

# 배열에서 요소 제거
await db.users.update_one(
    {"_id": user_id},
    {"$pull": {"tags": "trial"}}
)

# 배열 마지막 N개만 유지 (로그 등)
await db.users.update_one(
    {"_id": user_id},
    {"$push": {"recent_logins": {
        "$each": [datetime.utcnow()],
        "$slice": -10  # 최근 10개만 유지
    }}}
)
```

### Conditional Update ($setOnInsert)

```python
# upsert 시 created_at은 최초 1회만 세팅
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
# 중첩 필드 조회
await db.user_settings.find_one({
    "user_id": user_id,
    "setting_data.theme": "dark"
})

# 중첩 필드 업데이트
await db.user_settings.update_one(
    {"user_id": user_id},
    {"$set": {"setting_data.theme": "light", "updated_at": datetime.utcnow()}}
)
```

## Performance Checklist
- [ ] Connection pool 설정 (`maxPoolSize`, `minPoolSize`)
- [ ] Write concern `w: "majority"` 확인
- [ ] 트랜잭션은 단일 도큐먼트 연산으로 대체 불가능할 때만 사용
- [ ] `explain()` 으로 COLLSCAN 없음 확인
- [ ] Aggregation pipeline의 `$match`, `$sort` 를 파이프라인 앞에 배치
- [ ] `$lookup` 최소화 — 필요하면 `pipeline` 서브옵션으로 필드 제한
- [ ] 인덱스 사용 통계 주기적 확인 (`$indexStats`)
