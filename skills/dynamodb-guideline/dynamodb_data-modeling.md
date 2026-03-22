# Data Modeling

DynamoDB 설계의 핵심 원칙: **Access Pattern을 먼저 정의하고, 테이블을 그에 맞게 설계한다.**
MongoDB처럼 "나중에 인덱스 추가" 방식은 DynamoDB에서 매우 비싸고 위험하다.
GSI 추가는 가능하지만, PK/SK 변경은 테이블 재생성을 의미한다.

---

## Step 1 — Access Pattern 목록 작성 (설계 전 필수)

테이블 생성 전에 모든 읽기/쓰기 패턴을 열거한다.

```
# 예시: 채팅 서비스 Access Pattern 목록

[쓰기]
AP-W1. 유저 생성
AP-W2. 메시지 전송
AP-W3. 대화 세션 생성

[읽기]
AP-R1. user_id로 유저 프로필 조회
AP-R2. email로 유저 조회
AP-R3. user_id로 전체 대화 목록 조회 (최신순)
AP-R4. conversation_id로 메시지 목록 조회 (시간순, 페이지네이션)
AP-R5. user_id + 날짜 범위로 메시지 검색
```

→ 이 목록이 PK/SK/GSI 설계의 근거가 된다.

---

## Step 2 — Single Table Design vs Multi Table

### Single Table Design (권장)

여러 엔티티를 **한 테이블**에 저장. `pk`, `sk`를 오버로드해서 엔티티 타입 구분.

**장점:**
- 여러 엔티티를 한 번의 Query로 가져올 수 있음 (1 round-trip)
- 관련 데이터가 같은 파티션에 존재 → 지연 시간 최소화
- 프로비저닝 비용 공유

**단점:**
- 설계가 복잡하고 직관적이지 않음
- 초기에 access pattern을 완전히 정의해야 함
- 팀 내 DynamoDB 이해도가 낮으면 유지보수 어려움

### Multi Table (단순한 서비스에 적합)

엔티티마다 별도 테이블. RDBMS와 유사한 구조.

**권장 케이스:**
- Access pattern이 단순하고 엔티티 간 Join 쿼리가 없음
- 팀 DynamoDB 숙련도가 낮음
- 서비스 초기 단계

---

## Single Table Design 구현

### Entity Overloading — pk/sk에 타입 접두어 포함

```python
# pk, sk 값에 엔티티 타입을 접두어로 포함
# → 같은 파티션에 여러 엔티티 타입 공존 가능

# User 엔티티
{
    "pk": "USER#user123",       # Partition Key
    "sk": "PROFILE",            # Sort Key
    "type": "user",
    "email": "user@example.com",
    "name": "김철수",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "isActive": True
}

# Conversation 엔티티 (같은 테이블)
{
    "pk": "USER#user123",           # 동일 파티션 → 유저와 함께 Query 가능
    "sk": "CONV#2024-01-15T10:00:00Z#conv456",  # 시간 정렬 + ID
    "type": "conversation",
    "conversationId": "conv456",
    "title": "제주도 여행 계획",
    "messageCount": 0,
    "createdAt": "2024-01-15T10:00:00Z"
}

# Message 엔티티 (같은 테이블)
{
    "pk": "CONV#conv456",           # 대화 파티션
    "sk": "MSG#2024-01-15T10:05:00Z#msg789",
    "type": "message",
    "conversationId": "conv456",
    "userId": "user123",
    "role": "user",
    "text": "제주도 2박 3일 일정 짜줘",
    "createdAt": "2024-01-15T10:05:00Z"
}
```

### 한 번의 Query로 여러 엔티티 조회

```python
# AP-R3: 유저의 모든 대화 목록 조회
# pk = "USER#user123", sk begins_with "CONV#"
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123") &
                           Key("sk").begins_with("CONV#"),
    ScanIndexForward=False  # 최신순
)

# AP-R1 + AP-R3 동시: 유저 프로필 + 최근 대화 한 번의 Query로
# pk = "USER#user123", sk between "CONV#" and "PROFILE"
# → sk 정렬 순서에 따라 한 번의 요청으로 여러 타입 조회
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123"),
    # sk 알파벳 순: CONV# < PROFILE
    # 필요한 범위만 KeyConditionExpression으로 좁히기
)
# type 필드로 클라이언트에서 엔티티 분류
users = [item for item in response["Items"] if item["type"] == "user"]
convs = [item for item in response["Items"] if item["type"] == "conversation"]
```

---

## Embed vs Reference (DynamoDB 관점)

MongoDB와 판단 기준은 유사하지만, DynamoDB는 **Item 크기 400KB 제한**과 **Query 단위**가 설계를 더 강하게 제약한다.

### Embed — 항상 함께 읽히고, 크기가 작고, 독립 조회 없을 때

```python
# ✅ Embed: 유저 주소 — 항상 프로필과 함께, 독립 조회 없음
{
    "pk": "USER#user123",
    "sk": "PROFILE",
    "type": "user",
    "email": "user@example.com",
    "addresses": [                  # Map의 List로 embed
        {"type": "home", "city": "Seoul", "zip": "12345"},
        {"type": "work", "city": "Suwon", "zip": "67890"}
    ]
}

# ✅ Embed: 컨텐츠 메타 — 목록 카드에 필요한 작성자 스냅샷
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "type": "content",
    "title": "MongoDB 설계 원칙",
    "author": {                     # 작성 시점 스냅샷, join 불필요
        "userId": "user123",
        "name": "김철수",
        "avatarUrl": "https://..."
    },
    "tags": ["mongodb", "database"],
    "stats": {"viewCount": 0, "likeCount": 0}
}
```

### Reference — 독립 조회, 무한 증가, 다중 공유

```python
# ✅ Reference: 메시지는 무한 증가 → 별도 pk 파티션
# conversations 파티션에서 메시지를 별도 Item으로 저장
{
    "pk": "CONV#conv456",
    "sk": "MSG#2024-01-15T10:05:00Z#msg789",
    "type": "message",
    "conversationId": "conv456",    # 역참조
    "userId": "user123"             # 역참조
}

# ❌ 절대 안 됨: 메시지를 대화 Item의 List attribute에 embed
{
    "pk": "CONV#conv456",
    "sk": "META",
    "messages": [...]  # 400KB 한도 초과, 무한 증가 불가
}
```

---

## Hierarchical Sort Key 패턴

sk를 계층 구조로 설계하면 begins_with / between으로 다양한 범위 쿼리 지원.

```python
# sk 구조: {타입}#{시간}#{ID}
# → begins_with("MSG#")          : 모든 메시지
# → begins_with("MSG#2024-01")   : 2024년 1월 메시지
# → between("MSG#2024-01", "MSG#2024-02") : 1월 범위

# 예시: 대화 파티션의 sk 구조
"sk": "MSG#2024-01-15T10:05:00Z#msg789"

# 예시: 유저 파티션의 sk 구조
"sk": "PROFILE"                          # 프로필 (단일)
"sk": "CONV#2024-01-15T10:00:00Z#conv1" # 대화 목록
"sk": "FOLLOW#user456"                   # 팔로우 목록
"sk": "SETTING#notification"            # 설정
```

---

## Denormalization (역정규화) 전략

DynamoDB는 JOIN이 없으므로 역정규화가 필수. 업데이트 비용과 읽기 편의성의 트레이드오프.

```python
# 컨텐츠에 댓글 수 역정규화 → 조회 시 aggregate 불필요
async def add_comment(content_id: str, comment: dict):
    async with aioboto3_resource() as dynamodb:
        table = await dynamodb.Table("MyApp")
        async with table.meta.client.get_waiter("table_exists"):
            pass

        # 댓글 Item 저장 + 컨텐츠 카운터 업데이트를 트랜잭션으로
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
- [ ] Access Pattern 목록을 테이블 생성 전에 작성했는가
- [ ] 각 Access Pattern이 Query (또는 GetItem)으로 처리 가능한가 (Scan 없음)
- [ ] pk/sk에 엔티티 타입 접두어 포함 (Single Table)
- [ ] Unbounded List attribute 없음 (무한 증가 데이터는 별도 Item)
- [ ] Item 크기 400KB 이내
- [ ] 역정규화 필드는 트랜잭션으로 일관성 유지
- [ ] `type` 필드로 엔티티 타입 식별 가능
