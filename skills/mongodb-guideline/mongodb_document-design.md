# Document Design

The core principle of MongoDB schema design starts with **"How will data be read?"**
Do not start with normalization like RDBMS. Define the application's read patterns first, then design accordingly.

---

## Embed vs Reference Decision Principles

### Embed Conditions — When All Apply

| Condition | Decision Question |
|-----------|------------------|
| Ownership | Does this data exist independently without a parent? → If No, embed |
| Co-query | Is this data always read together with parent? → If Yes, embed |
| Size limit | Does the array grow indefinitely? → If tens to hundreds only, embed |
| No sharing | Is this data referenced by other documents? → If No, embed |

```python
# PASS: Embed: addresses are always queried with user, no sharing, size bounded
{
    "_id": ObjectId(),
    "email": "user@example.com",
    "addresses": [
        {"type": "home", "city": "Seoul", "zip": "12345"},
        {"type": "work", "city": "Suwon", "zip": "67890"}
    ]
}

# PASS: Embed: recent chatbot conversation summary — always read together, fixed size
{
    "_id": ObjectId(),
    "user_id": ObjectId("..."),
    "summary": "User requested travel planning help",
    "last_messages": [      # Keep only recent 5 (limited by $slice)
        {"role": "user", "text": "Plan a 2-night 3-day Jeju trip"},
        {"role": "bot",  "text": "Here's a recommended 2-night 3-day Jeju itinerary..."}
    ],
    "created_at": datetime,
    "updated_at": datetime
}
```

### Reference Conditions — When Any One Applies

| Condition | Decision Question |
|-----------|------------------|
| Unbounded growth | Does this array keep growing? → If Yes, separate collection |
| Independent query | Is it queried/updated without parent? → If Yes, reference |
| Multi-sharing | Is this data referenced by multiple documents? → If Yes, reference |
| Large size | Does this data push document close to 16MB? → If Yes, reference |

```python
# PASS: Reference: chat messages grow unbounded → separate collection
# conversations collection
{
    "_id": ObjectId("conv_1"),
    "user_id": ObjectId("user_1"),
    "title": "Jeju Travel Planning",
    "message_count": 42,        # Denormalized: display directly without $lookup
    "last_message_at": datetime,
    "created_at": datetime
}

# messages collection (separate)
{
    "_id": ObjectId(),
    "conversation_id": ObjectId("conv_1"),  # reference
    "role": "user",
    "text": "Plan a 2-night 3-day Jeju trip",
    "created_at": datetime
}
```

---

## Content-Centric Input/Output Design

The most effective MongoDB pattern follows the **one screen = one document** principle.
Define the API response structure first, then design documents to match it.

### Pattern 1 — Content Feed (Card List)

```python
# All fields needed for list API response in a single document
# → Resolved with single find() without $lookup
{
    "_id": ObjectId(),
    "type": "article",          # Content type (article / video / podcast)
    "title": "MongoDB Design Principles",
    "slug": "mongodb-design-principles",

    # Metadata to display on list cards (no join to author collection needed)
    "author": {
        "user_id": ObjectId("..."),
        "name": "Kim Chulsoo",           # Denormalized: snapshot at write time
        "avatar_url": "https://..."
    },

    # Summary information for list rendering
    "thumbnail_url": "https://...",
    "summary": "MongoDB centers around read patterns...",
    "read_time_minutes": 8,
    "tags": ["mongodb", "database", "nosql"],

    # Aggregate counters (denormalized)
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

### Pattern 2 — Detail Page (Single Document = Complete Page)

```python
# Detail API: includes body, complete with single find_one()
{
    "_id": ObjectId(),
    "slug": "mongodb-design-principles",
    "title": "MongoDB Design Principles",
    "body": "## Introduction\n\nMongoDB is ...",    # Markdown/HTML body

    "author": {
        "user_id": ObjectId("..."),
        "name": "Kim Chulsoo",
        "bio": "Backend developer",
        "avatar_url": "https://..."
    },

    # Related content IDs (only minimal info for list display embedded)
    "related_content_ids": [ObjectId("..."), ObjectId("...")],

    "tags": ["mongodb", "database"],
    "stats": {"view_count": 1240, "like_count": 87, "comment_count": 23},
    "published_at": datetime,
    "updated_at": datetime
}
```

### Pattern 3 — User Profile (Settings + State Unified)

```python
# Profile page: settings, stats, recent activity in one document
{
    "_id": ObjectId(),
    "public_id": "user_abc123",     # External ID for URLs
    "email": "user@example.com",
    "is_active": True,

    "profile": {
        "name": "Kim Chulsoo",
        "bio": "Backend developer",
        "avatar_url": "https://...",
        "location": "Seoul, Korea"
    },

    "settings": {
        "theme": "dark",
        "language": "ko",
        "notifications": {"email": True, "push": False}
    },

    # Denormalized: aggregate values to display directly on profile page
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

## Design to Avoid Global Queries

**Global Query**: A query that scans the entire collection or is not isolated by a specific user/context.
Most MongoDB performance issues originate from global queries.

### Principle 1 — First Filter in Every Query is Owner ID

```python
# FAIL: Global query: full collection scan
await db.messages.find({"text": {"$regex": "Jeju"}})

# PASS: Owner isolation: user_id first, then other conditions
await db.messages.find({
    "user_id": user_id,             # Always first
    "conversation_id": conv_id,     # Second isolation level
    "created_at": {"$gte": since}
})
```

### Principle 2 — Prohibit Single Index on Type/Status Field, Use Compound Index

```python
# FAIL: Low-cardinality field single index → ineffective
await db.contents.create_index("status")        # Only 2 values: "published" / "draft"
await db.contents.create_index("content_type")  # Only 5 types

# PASS: Owner + status compound index → blocks global queries
await db.contents.create_index(
    [("author_id", ASCENDING), ("status", ASCENDING), ("published_at", DESCENDING)],
    name="idx_contents_author_status_published"
)

# PASS: Partial index: index only published status → reduces index size
await db.contents.create_index(
    [("published_at", DESCENDING)],
    partialFilterExpression={"status": "published"},
    name="idx_contents_published_at"
)
```

### Principle 3 — Eliminate $lookup / Aggregation Queries via Denormalization

```python
# FAIL: Aggregate query every time to get comment count
count = await db.comments.count_documents({"content_id": content_id})

# PASS: Denormalize counter in content document → resolve with simple find_one()
await db.contents.update_one(
    {"_id": content_id},
    {
        "$inc": {"stats.comment_count": 1},
        "$set": {"updated_at": datetime.utcnow()}
    }
)
# On query
doc = await db.contents.find_one({"_id": content_id}, {"stats.comment_count": 1})
```

### Principle 4 — Time Range Queries Must Always Include Owner

```python
# FAIL: Time range only → slow even with created_at index if range is wide
await db.events.find({"created_at": {"$gte": today_start}})

# PASS: Owner + time range compound condition
await db.events.find({
    "user_id": user_id,
    "created_at": {"$gte": today_start, "$lt": today_end}
})
```

### Principle 5 — Isolate via Collection Design (Horizontal Separation)

```python
# FAIL: One events collection mixing all event types
await db.events.find({"type": "chat_message", "user_id": user_id})
await db.events.find({"type": "login",        "user_id": user_id})
await db.events.find({"type": "purchase",     "user_id": user_id})

# PASS: Separate collection per type → smaller collections, better index efficiency
await db.chat_messages.find({"user_id": user_id})
await db.login_events.find({"user_id": user_id})
await db.purchases.find({"user_id": user_id})
```

---

## Standard Fields (Common to All Collections)

```python
{
    "_id": ObjectId(),          # Auto-generated, for internal reference
    "created_at": datetime,     # UTC, required, including append-only
    "updated_at": datetime,     # UTC, explicitly updated in every update
    "is_active": bool           # Only for collections needing soft delete
}
```

> WARNING: MongoDB has no auto-update hook for `updated_at`.
> Must explicitly include `"$set": {"updated_at": datetime.utcnow()}` in all `update_one` / `update_many`.

## Collection Design Checklist
- [ ] Read patterns (API response structure) defined before design
- [ ] Data needed for one screen can be fetched with minimal queries
- [ ] No unbounded arrays (data that grows indefinitely goes in separate collection)
- [ ] Aggregate counters denormalized into document
- [ ] First filter in every query is owner ID (user_id, etc.)
- [ ] Designed with compound indexes instead of single type/status indexes
- [ ] Includes `created_at` / `updated_at`, UTC datetime
- [ ] Document maximum size of 16MB considered
