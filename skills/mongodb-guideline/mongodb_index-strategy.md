# Index Strategy

MongoDB 인덱스는 RDBMS와 개념은 같지만, **도큐먼트 구조와 쿼리 패턴**에 따라 전혀 다른 전략이 필요하다.

---

## RDBMS와 다른 핵심 차이

| 항목 | RDBMS (MySQL/PostgreSQL) | MongoDB |
|------|--------------------------|---------|
| 인덱스 단위 | 컬럼 | 필드 (중첩 필드, 배열 요소 포함) |
| 배열 인덱스 | 별도 테이블 필요 | Multikey index 자동 지원 |
| 조건부 인덱스 | Partial index (PostgreSQL만) | `partialFilterExpression` |
| 복합 인덱스 방향 | 단방향 (ASC/DESC 혼합 가능) | 정렬 방향이 인덱스 효율에 직접 영향 |
| 커버링 인덱스 | INCLUDE 컬럼 | projection 필드를 인덱스에 포함 |
| 카디널리티 | 높을수록 유리 | 동일, 단 Partial로 저카디널리티 보완 |
| 자동 생성 | FK에 자동 생성 안 됨 | 없음 — 명시적 생성 필수 |
| `_id` 인덱스 | PK 인덱스 자동 | `_id`에 unique index 자동 생성 |

---

## Index Types

### 1. Single Field — 기본

```python
# 단순 equality / range 쿼리
await db.users.create_index("email", name="idx_users_email")

# 중첩 필드도 인덱싱 가능 (RDBMS에서는 불가)
await db.users.create_index("profile.location", name="idx_users_location")
await db.contents.create_index("author.user_id", name="idx_contents_author_id")
```

### 2. Compound Index — ESR 규칙 필수

RDBMS의 "equality first, range last"와 다르게 MongoDB는 **E → S → R** 순서를 따른다.

```
E (Equality)  : 정확히 일치하는 필드를 앞에
S (Sort)      : 정렬 필드를 중간에
R (Range)     : 범위 조건 필드를 마지막에
```

```python
# 쿼리: user_id = x AND status = "published" ORDER BY published_at DESC
# ESR: user_id(E) → published_at(S) → status(R) 가 아니라
#      user_id(E) → status(E) → published_at(S) 순서
await db.contents.create_index(
    [("user_id", ASCENDING), ("status", ASCENDING), ("published_at", DESCENDING)],
    name="idx_contents_user_status_published"
)

# ❌ 잘못된 순서: Range를 Sort 앞에 두면 sort를 인덱스로 처리 못함
await db.contents.create_index(
    [("user_id", ASCENDING), ("created_at", ASCENDING), ("status", ASCENDING)]
    # created_at이 range 조건이면 status sort를 인덱스로 처리 불가
)
```

### 3. Multikey Index — 배열 필드 (RDBMS에 없는 개념)

배열 필드에 인덱스를 걸면 **배열의 각 요소가 별도 인덱스 엔트리**로 저장된다.

```python
# tags 배열의 각 요소를 인덱싱
await db.contents.create_index("tags", name="idx_contents_tags")

# 쿼리: tags 배열에 "mongodb"가 포함된 도큐먼트
await db.contents.find({"tags": "mongodb"})              # 단일 태그
await db.contents.find({"tags": {"$all": ["mongodb", "database"]}})  # 모두 포함

# 중첩 배열 필드도 가능
await db.users.create_index("addresses.city", name="idx_users_city")
```

> ⚠️ Multikey index는 두 개 이상의 배열 필드를 포함하는 복합 인덱스 불가.
> `[("tags", 1), ("categories", 1)]` → ERROR (두 배열 필드 동시 multikey 금지)

### 4. Partial Index — 저카디널리티 필드의 해법

RDBMS에서는 `is_active`, `status` 같은 필드에 인덱스를 걸어도 효과가 없다.
MongoDB의 Partial Index는 **조건에 맞는 도큐먼트만 인덱싱**해서 이 문제를 해결한다.

```python
# is_active = true인 도큐먼트만 email 인덱싱 → 삭제된 유저 제외
await db.users.create_index(
    "email",
    partialFilterExpression={"is_active": {"$eq": True}},
    unique=True,
    name="uidx_users_active_email"
)

# status = "published"인 컨텐츠만 인덱싱 → draft 제외
await db.contents.create_index(
    [("published_at", DESCENDING)],
    partialFilterExpression={"status": "published"},
    name="idx_contents_published_at"
)

# ⚠️ Partial index는 쿼리에 partialFilterExpression 조건이 반드시 포함되어야 활성화됨
# 아래 쿼리는 idx_contents_published_at을 사용하지 않음 (status 조건 누락)
await db.contents.find({"published_at": {"$gte": since}})  # ❌ COLLSCAN
# 아래 쿼리는 사용함
await db.contents.find({"status": "published", "published_at": {"$gte": since}})  # ✅
```

### 5. TTL Index — 자동 만료

```python
# expired_at 시각에 도달하면 MongoDB가 백그라운드에서 자동 삭제
await db.sessions.create_index(
    "expired_at",
    expireAfterSeconds=0,
    name="idx_sessions_expired_at"
)

# 고정 TTL: created_at 기준으로 N초 후 삭제
await db.temp_tokens.create_index(
    "created_at",
    expireAfterSeconds=60 * 60 * 24,  # 24시간 후 삭제
    name="idx_temp_tokens_created_at"
)
```

### 6. Text Index — 전문 검색

```python
from pymongo import TEXT

# 다중 필드 텍스트 인덱스 (가중치 설정 가능)
await db.contents.create_index(
    [("title", TEXT), ("body", TEXT), ("tags", TEXT)],
    weights={"title": 10, "tags": 5, "body": 1},
    name="idx_contents_text"
)

# 텍스트 검색 쿼리
await db.contents.find(
    {"$text": {"$search": "MongoDB 인덱스"}},
    {"score": {"$meta": "textScore"}}   # 관련도 점수
).sort([("score", {"$meta": "textScore"})])
```

> ⚠️ 컬렉션당 Text index는 하나만 생성 가능. 여러 필드를 하나의 Text index에 묶어야 한다.
> 한국어 형태소 분석이 필요하면 Atlas Search 사용 권장.

---

## Covering Index (Index-Only Scan)

쿼리에 필요한 모든 필드가 인덱스에 있으면 도큐먼트를 fetch하지 않는다.
RDBMS보다 효과가 크다 — 도큐먼트가 크고 중첩이 많을수록 절감이 큼.

```python
# 인덱스: (user_id, status, published_at) + projection에 필요한 title, thumbnail_url
# → 목록 API를 도큐먼트 fetch 없이 인덱스만으로 처리
await db.contents.create_index(
    [
        ("user_id", ASCENDING),
        ("status", ASCENDING),
        ("published_at", DESCENDING),
        ("title", ASCENDING),           # projection 필드
        ("thumbnail_url", ASCENDING)    # projection 필드
    ],
    name="idx_contents_feed_covering"
)

# 이 쿼리 + projection은 인덱스만으로 처리 (FETCH 단계 없음)
await db.contents.find(
    {"user_id": user_id, "status": "published"},
    {"title": 1, "thumbnail_url": 1, "published_at": 1, "_id": 0}
).sort("published_at", DESCENDING)
```

---

## Cursor Pagination (skip 금지)

```python
# ❌ skip은 O(n): 페이지가 깊어질수록 앞부분을 모두 스캔
cursor = db.contents.find({"status": "published"}).skip(1000).limit(20)

# ✅ _id 기반 cursor: ObjectId는 시간 순 정렬 내장
async def get_contents(last_id: ObjectId = None, limit: int = 20):
    query = {"status": "published"}
    if last_id:
        query["_id"] = {"$lt": last_id}
    return await db.contents.find(query).sort("_id", DESCENDING).limit(limit).to_list(limit)

# ✅ 복합 cursor: 정렬 기준이 published_at인 경우 (동일 시각 tie-breaking)
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

## EXPLAIN 분석

```python
explanation = await db.contents.find(
    {"user_id": user_id, "status": "published"}
).explain()

stage = explanation["queryPlanner"]["winningPlan"]["stage"]
# COLLSCAN → 인덱스 없음, 위험
# IXSCAN   → 인덱스 사용, 정상
# FETCH    → 인덱스 후 도큐먼트 fetch (covering index 아님)
# PROJECTION → projection 처리 (covering이면 FETCH 없이 바로 옴)
```

## Index Checklist
- [ ] ESR 순서 (Equality → Sort → Range) 준수
- [ ] `is_active`, `status` 단독 인덱스 없음 → Partial index로 대체
- [ ] 배열 필드 인덱스는 Multikey 특성 이해 후 설계 (두 배열 필드 복합 불가)
- [ ] 자주 조회하는 목록 API는 Covering index 고려
- [ ] `skip()` 없음 → cursor pagination 사용
- [ ] `EXPLAIN` 으로 COLLSCAN 없음 확인
- [ ] TTL 필요한 컬렉션은 `expired_at` + TTL index
- [ ] Text index는 컬렉션당 하나, 다중 필드 통합
