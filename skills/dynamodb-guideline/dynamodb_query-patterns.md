# Query Patterns

---

## Query vs Scan — Scan은 항상 금지

| 항목 | Query | Scan |
|------|-------|------|
| 동작 | PK 지정 후 SK 범위 조회 | 테이블 전체 읽기 |
| 비용 | 읽은 Item 수만큼 | 테이블 전체 RCU 소비 |
| 성능 | O(결과 크기) | O(테이블 크기) |
| 사용 | 항상 사용 | **금지** |

```python
from boto3.dynamodb.conditions import Key, Attr

# ✅ Query: PK 지정 필수
response = table.query(
    KeyConditionExpression=Key("pk").eq("USER#user123")
)

# ✅ Query + SK 범위
response = table.query(
    KeyConditionExpression=
        Key("pk").eq("CONV#conv456") &
        Key("sk").begins_with("MSG#2024-01")
)

# ✅ Query on GSI
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("EMAIL#user@example.com")
)

# ❌ Scan: 절대 금지
response = table.scan(
    FilterExpression=Attr("email").eq("user@example.com")
)
# → 테이블 전체를 읽고 나서 필터링 → 비용 동일, 성능 최악
```

> ⚠️ `FilterExpression`은 Query에서도 주의. Key 조건으로 먼저 좁힌 후 적용되지만,
> Key 조건으로 좁히지 않으면 Scan과 동일한 비용이 발생한다.

---

## GetItem / BatchGetItem — 단일/다중 조회

```python
# GetItem: pk + sk가 모두 알려진 경우 (가장 빠르고 저렴)
response = table.get_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"}
)
user = response.get("Item")

# Strongly consistent read (최신 데이터 보장, 비용 2배)
response = table.get_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"},
    ConsistentRead=True
)

# BatchGetItem: 여러 Item을 한 번에 (최대 100개, 16MB)
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

# ⚠️ BatchGetItem은 순서 보장 안 됨, UnprocessedKeys 재시도 필요
unprocessed = response.get("UnprocessedKeys", {})
while unprocessed:
    response = dynamodb.batch_get_item(RequestItems=unprocessed)
    items.extend(response["Responses"].get("MyApp", []))
    unprocessed = response.get("UnprocessedKeys", {})
```

---

## Cursor Pagination

DynamoDB의 페이지네이션은 `LastEvaluatedKey` 기반이다. `offset` 개념이 없다.

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
        "ScanIndexForward": False,  # 최신순
        "Limit": limit
    }
    if last_evaluated_key:
        kwargs["ExclusiveStartKey"] = last_evaluated_key

    response = table.query(**kwargs)
    return {
        "items": response["Items"],
        "next_cursor": response.get("LastEvaluatedKey")  # None이면 마지막 페이지
    }

# 클라이언트에서 next_cursor를 다음 요청에 전달
# → URL-safe하게 base64 인코딩 권장
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

### PutItem — 전체 Item 저장 (덮어쓰기)

```python
from datetime import datetime, timezone

# 신규 생성: condition으로 중복 방지
try:
    table.put_item(
        Item={
            "pk": "USER#user123",
            "sk": "PROFILE",
            "type": "user",
            "email": "user@example.com",
            "name": "김철수",
            "isActive": True,
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "updatedAt": datetime.now(timezone.utc).isoformat()
        },
        ConditionExpression="attribute_not_exists(pk)"  # 중복 방지
    )
except dynamodb.meta.client.exceptions.ConditionalCheckFailedException:
    raise ValueError("User already exists")
```

### UpdateItem — 부분 업데이트 (권장)

```python
# ✅ UpdateItem: 지정 필드만 변경 (PutItem보다 안전)
table.update_item(
    Key={"pk": "USER#user123", "sk": "PROFILE"},
    UpdateExpression="SET #name = :name, updatedAt = :updatedAt",
    ExpressionAttributeNames={"#name": "name"},  # 예약어 회피
    ExpressionAttributeValues={
        ":name": "김영희",
        ":updatedAt": datetime.now(timezone.utc).isoformat()
    },
    ConditionExpression="attribute_exists(pk)"  # 존재 확인
)

# 카운터 증가 (원자적)
table.update_item(
    Key={"pk": f"CONTENT#{content_id}", "sk": "META"},
    UpdateExpression="ADD #stats.viewCount :inc SET updatedAt = :now",
    ExpressionAttributeNames={"#stats": "stats"},
    ExpressionAttributeValues={":inc": 1, ":now": datetime.now(timezone.utc).isoformat()}
)
```

### UPSERT 패턴

```python
# attribute_not_exists 조건 없이 PutItem → upsert
# UpdateItem + SET → 없으면 생성, 있으면 업데이트
table.update_item(
    Key={"pk": f"USER#{user_id}", "sk": f"SETTING#{key}"},
    UpdateExpression=
        "SET settingValue = :val, updatedAt = :now "
        "ADD #v :inc",  # version 증가
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

최대 100개 Item, 4MB 제한. 성능 비용이 크므로 꼭 필요한 경우만 사용.

```python
# TransactWrite: 여러 테이블/Item의 원자적 쓰기
dynamodb_client.transact_write_items(
    TransactItems=[
        # 1. 메시지 저장
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
        # 2. 대화 메시지 카운터 업데이트 (역정규화 일관성 유지)
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

## BatchWrite — 대량 쓰기

```python
# BatchWriteItem: 최대 25개 Item, 16MB
with table.batch_writer() as batch:
    for record in records:
        batch.put_item(Item={
            "pk": f"MSG#{record['id']}",
            "sk": "DATA",
            **record
        })
# boto3 batch_writer가 자동으로 25개씩 묶어 전송 + UnprocessedItems 재시도

# 삭제도 동일
with table.batch_writer() as batch:
    for key in keys_to_delete:
        batch.delete_item(Key={"pk": key["pk"], "sk": key["sk"]})
```

---

## Condition Expression 패턴

```python
from boto3.dynamodb.conditions import Attr

# 존재 여부
"attribute_exists(pk)"
"attribute_not_exists(pk)"

# 값 비교
Attr("version").eq(expected_version)          # Optimistic locking
Attr("isActive").eq(True)
Attr("stock").gt(0)                           # 재고 있을 때만 차감

# Optimistic Locking 패턴
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
- [ ] Scan 없음 — 모든 조회가 Query 또는 GetItem
- [ ] FilterExpression 사용 시 KeyCondition으로 충분히 좁혔는가
- [ ] Pagination은 LastEvaluatedKey 기반
- [ ] BatchGetItem의 UnprocessedKeys 재시도 처리
- [ ] batch_writer() 사용으로 BatchWrite 자동 묶음 처리
- [ ] Transaction은 꼭 필요한 원자성 보장에만 사용
- [ ] 예약어 충돌 시 ExpressionAttributeNames 처리
