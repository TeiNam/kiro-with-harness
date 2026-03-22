# Document Design

MongoDB 스키마 설계의 핵심은 **"어떻게 데이터를 읽을 것인가"** 에서 출발한다.
RDBMS처럼 정규화로 시작하지 말고, 애플리케이션의 읽기 패턴을 먼저 정의한 뒤 설계할 것.

---

## Embed vs Reference 결정 원칙

### Embed (내장) 조건 — 모두 해당할 때

| 조건 | 판단 질문 |
|------|----------|
| 소유 관계 | 이 데이터가 부모 없이 독립적으로 존재하는가? → No면 embed |
| 함께 조회 | 이 데이터를 항상 부모와 함께 읽는가? → Yes면 embed |
| 크기 제한 | 배열이 무한히 증가하지 않는가? → 수십~수백 개 이하면 embed |
| 공유 없음 | 다른 도큐먼트에서도 이 데이터를 참조하는가? → No면 embed |

```python
# ✅ Embed: 주소는 유저와 항상 함께 조회, 공유 없음, 크기 제한적
{
    "_id": ObjectId(),
    "email": "user@example.com",
    "addresses": [
        {"type": "home", "city": "Seoul", "zip": "12345"},
        {"type": "work", "city": "Suwon", "zip": "67890"}
    ]
}

# ✅ Embed: 챗봇 대화의 최근 요약 — 항상 함께 읽히고, 크기 고정
{
    "_id": ObjectId(),
    "user_id": ObjectId("..."),
    "summary": "사용자는 여행 계획 도움을 요청함",
    "last_messages": [      # 최근 5개만 유지 ($slice로 제한)
        {"role": "user", "text": "제주도 2박 3일 일정 짜줘"},
        {"role": "bot",  "text": "제주도 2박 3일 추천 일정입니다..."}
    ],
    "created_at": datetime,
    "updated_at": datetime
}
```

### Reference (참조) 조건 — 하나라도 해당할 때

| 조건 | 판단 질문 |
|------|----------|
| 무한 증가 | 이 배열이 계속 커지는가? → Yes면 separate collection |
| 독립 조회 | 부모 없이 단독으로 조회/수정되는가? → Yes면 reference |
| 다중 공유 | 여러 도큐먼트에서 이 데이터를 참조하는가? → Yes면 reference |
| 대용량 | 이 데이터가 도큐먼트를 16MB에 가깝게 만드는가? → Yes면 reference |

```python
# ✅ Reference: 채팅 메시지는 무한 증가 → 별도 컬렉션
# conversations 컬렉션
{
    "_id": ObjectId("conv_1"),
    "user_id": ObjectId("user_1"),
    "title": "제주도 여행 계획",
    "message_count": 42,        # 역정규화: $lookup 없이 바로 표시
    "last_message_at": datetime,
    "created_at": datetime
}

# messages 컬렉션 (별도)
{
    "_id": ObjectId(),
    "conversation_id": ObjectId("conv_1"),  # reference
    "role": "user",
    "text": "제주도 2박 3일 일정 짜줘",
    "created_at": datetime
}
```

---

## 컨텐츠 중심 입출력 설계

MongoDB를 가장 효과적으로 쓰는 패턴은 **한 화면 = 한 도큐먼트** 원칙이다.
API 응답 구조를 먼저 정의하고, 그에 맞게 도큐먼트를 설계한다.

### 패턴 1 — 콘텐츠 피드 (카드형 목록)

```python
# 목록 API 응답에 필요한 모든 필드를 한 도큐먼트에 담음
# → $lookup 없이 단일 find()로 해결
{
    "_id": ObjectId(),
    "type": "article",          # 컨텐츠 타입 (article / video / podcast)
    "title": "MongoDB 설계 원칙",
    "slug": "mongodb-design-principles",

    # 목록 카드에 표시할 메타 (author 컬렉션 join 불필요)
    "author": {
        "user_id": ObjectId("..."),
        "name": "김철수",           # 역정규화: 작성 시점 스냅샷
        "avatar_url": "https://..."
    },

    # 목록 렌더링에 필요한 요약 정보
    "thumbnail_url": "https://...",
    "summary": "MongoDB는 읽기 패턴 중심으로...",
    "read_time_minutes": 8,
    "tags": ["mongodb", "database", "nosql"],

    # 집계 카운터 (역정규화)
    "stats": {
        "view_count": 1240,
        "like_count": 87,
        "comment_count": 23
    },

    "published_at": datetime,
    "created_at": datetime,
    "updated_at": datetime,
    "is_active": True
}
```

### 패턴 2 — 상세 페이지 (단일 도큐먼트 = 전체 페이지)

```python
# 상세 API: 본문 포함, 단일 find_one()으로 완성
{
    "_id": ObjectId(),
    "slug": "mongodb-design-principles",
    "title": "MongoDB 설계 원칙",
    "body": "## 서론\n\nMongoDB는 ...",    # 마크다운/HTML 본문

    "author": {
        "user_id": ObjectId("..."),
        "name": "김철수",
        "bio": "백엔드 개발자",
        "avatar_url": "https://..."
    },

    # 연관 컨텐츠 ID (목록 표시용 최소 정보만 embed)
    "related_content_ids": [ObjectId("..."), ObjectId("...")],

    "tags": ["mongodb", "database"],
    "stats": {"view_count": 1240, "like_count": 87, "comment_count": 23},
    "published_at": datetime,
    "updated_at": datetime
}
```

### 패턴 3 — 사용자 프로필 (설정 + 상태 통합)

```python
# 프로필 페이지: 설정, 통계, 최근 활동을 한 도큐먼트에
{
    "_id": ObjectId(),
    "public_id": "user_abc123",     # URL용 외부 ID
    "email": "user@example.com",
    "is_active": True,

    "profile": {
        "name": "김철수",
        "bio": "백엔드 개발자",
        "avatar_url": "https://...",
        "location": "Seoul, Korea"
    },

    "settings": {
        "theme": "dark",
        "language": "ko",
        "notifications": {"email": True, "push": False}
    },

    # 역정규화: 프로필 페이지에서 바로 보여줄 집계값
    "stats": {
        "post_count": 42,
        "follower_count": 128,
        "following_count": 56
    },

    "created_at": datetime,
    "updated_at": datetime
}
```

---

## 글로벌 쿼리를 피하는 설계

**글로벌 쿼리**: 컬렉션 전체를 스캔하거나, 특정 사용자/컨텍스트로 격리되지 않는 쿼리.
MongoDB에서 성능 문제의 대부분은 글로벌 쿼리에서 발생한다.

### 원칙 1 — 모든 쿼리의 첫 번째 필터는 소유자 ID

```python
# ❌ 글로벌 쿼리: 전체 컬렉션 스캔
await db.messages.find({"text": {"$regex": "제주도"}})

# ✅ 소유자 격리: user_id 먼저, 그 다음 조건
await db.messages.find({
    "user_id": user_id,             # 항상 첫 번째
    "conversation_id": conv_id,     # 두 번째 격리 레벨
    "created_at": {"$gte": since}
})
```

### 원칙 2 — 타입/상태 필드 단독 인덱스 금지, 복합 인덱스로 설계

```python
# ❌ 카디널리티 낮은 필드 단독 인덱스 → 효과 없음
await db.contents.create_index("status")        # "published" / "draft" 2가지뿐
await db.contents.create_index("content_type")  # 5가지 타입뿐

# ✅ 소유자 + 상태 복합 인덱스 → 글로벌 쿼리 차단
await db.contents.create_index(
    [("author_id", ASCENDING), ("status", ASCENDING), ("published_at", DESCENDING)],
    name="idx_contents_author_status_published"
)

# ✅ Partial index: published 상태만 인덱싱 → 인덱스 크기 절감
await db.contents.create_index(
    [("published_at", DESCENDING)],
    partialFilterExpression={"status": "published"},
    name="idx_contents_published_at"
)
```

### 원칙 3 — 역정규화로 $lookup / 집계 쿼리 제거

```python
# ❌ 댓글 수를 알기 위해 매번 집계 쿼리
count = await db.comments.count_documents({"content_id": content_id})

# ✅ content 도큐먼트에 카운터 역정규화 → 단순 find_one()으로 해결
await db.contents.update_one(
    {"_id": content_id},
    {
        "$inc": {"stats.comment_count": 1},
        "$set": {"updated_at": datetime.utcnow()}
    }
)
# 조회 시
doc = await db.contents.find_one({"_id": content_id}, {"stats.comment_count": 1})
```

### 원칙 4 — 시간 범위 쿼리는 반드시 소유자와 함께

```python
# ❌ 시간 범위만으로 쿼리 → created_at 인덱스 있어도 범위가 넓으면 느림
await db.events.find({"created_at": {"$gte": today_start}})

# ✅ 소유자 + 시간 범위 복합 조건
await db.events.find({
    "user_id": user_id,
    "created_at": {"$gte": today_start, "$lt": today_end}
})
```

### 원칙 5 — 컬렉션 설계로 격리 (수평 분리)

```python
# ❌ 하나의 events 컬렉션에 모든 이벤트 타입 혼재
await db.events.find({"type": "chat_message", "user_id": user_id})
await db.events.find({"type": "login",        "user_id": user_id})
await db.events.find({"type": "purchase",     "user_id": user_id})

# ✅ 타입별 컬렉션 분리 → 각 컬렉션이 작아지고 인덱스 효율 향상
await db.chat_messages.find({"user_id": user_id})
await db.login_events.find({"user_id": user_id})
await db.purchases.find({"user_id": user_id})
```

---

## Standard Fields (모든 컬렉션 공통)

```python
{
    "_id": ObjectId(),          # 자동 생성, 내부 참조용
    "created_at": datetime,     # UTC, 필수, append-only 포함
    "updated_at": datetime,     # UTC, 모든 update에 명시 갱신
    "is_active": bool           # Soft delete 필요한 컬렉션만
}
```

> ⚠️ MongoDB는 `updated_at` 자동 갱신 훅이 없음.
> 모든 `update_one` / `update_many` 에 `"$set": {"updated_at": datetime.utcnow()}` 명시 필수.

## Collection Design Checklist
- [ ] 읽기 패턴(API 응답 구조)을 먼저 정의하고 설계했는가
- [ ] 한 화면에 필요한 데이터를 최소한의 쿼리로 가져올 수 있는가
- [ ] Unbounded array 없음 (무한 증가 데이터는 별도 컬렉션)
- [ ] 집계 카운터는 역정규화로 도큐먼트에 포함
- [ ] 모든 쿼리의 첫 번째 필터가 소유자 ID (user_id 등)인가
- [ ] 타입/상태 단독 인덱스 없이 복합 인덱스로 설계했는가
- [ ] `created_at` / `updated_at` 포함, UTC datetime
- [ ] 도큐먼트 최대 크기 16MB 고려
