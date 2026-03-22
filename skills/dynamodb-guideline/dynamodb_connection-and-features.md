# Connection Management and DynamoDB Features

## boto3 / aioboto3 클라이언트 설정

```python
import boto3
from boto3.dynamodb.conditions import Key, Attr

# Sync (boto3) — 단순 스크립트, Lambda (동기)
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-2"
)
table = dynamodb.Table("MyApp")

# 환경별 설정 (환경 변수 기반)
import os

dynamodb = boto3.resource(
    "dynamodb",
    region_name=os.environ.get("AWS_REGION", "ap-northeast-2"),
    # 로컬 개발: DynamoDB Local
    endpoint_url=os.environ.get("DYNAMODB_ENDPOINT")  # "http://localhost:8000"
)
```

```python
# Async (aioboto3) — FastAPI, async 서비스 권장
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

# FastAPI lifespan 패턴
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.dynamodb_session = aioboto3.Session()
    yield
    # aioboto3 session은 별도 close 불필요

app = FastAPI(lifespan=lifespan)

# 사용 예
async def get_user(user_id: str) -> dict:
    async with get_table() as table:
        response = await table.get_item(
            Key={"pk": f"USER#{user_id}", "sk": "PROFILE"}
        )
        return response.get("Item")
```

---

## TTL (Time To Live)

DynamoDB의 자동 만료 기능. MongoDB TTL index와 동일한 개념.

```python
# 테이블에 TTL 활성화 (콘솔 또는 CLI로 1회 설정)
dynamodb_client.update_time_to_live(
    TableName="MyApp",
    TimeToLiveSpecification={
        "Enabled": True,
        "AttributeName": "ttl"  # epoch seconds (Unix timestamp)
    }
)

# 도큐먼트에 ttl 필드 추가
from datetime import datetime, timedelta, timezone
import time

# 세션: 24시간 후 만료
session_item = {
    "pk": f"SESSION#{session_id}",
    "sk": "DATA",
    "type": "session",
    "userId": user_id,
    "token": token,
    "createdAt": datetime.now(timezone.utc).isoformat(),
    "ttl": int(time.time()) + 60 * 60 * 24  # 24시간 후 epoch
}

# 임시 인증 코드: 10분 후 만료
otp_item = {
    "pk": f"OTP#{email}",
    "sk": "VERIFY",
    "code": otp_code,
    "ttl": int(time.time()) + 60 * 10  # 10분
}
```

> ⚠️ TTL 만료는 즉시가 아닌 만료 후 최대 48시간 이내 삭제.
> 정확한 만료 시점이 중요하면 `ttl` 필드를 조회 시 직접 확인.

```python
# 만료 여부 직접 확인
import time

def is_expired(item: dict) -> bool:
    ttl = item.get("ttl")
    return ttl is not None and ttl < int(time.time())
```

---

## DynamoDB Streams

테이블 변경 이벤트를 실시간으로 처리. MongoDB Change Streams와 유사.

```python
# Streams 활성화 (테이블 설정)
dynamodb_client.update_table(
    TableName="MyApp",
    StreamSpecification={
        "StreamEnabled": True,
        "StreamViewType": "NEW_AND_OLD_IMAGES"  # NEW_IMAGE / OLD_IMAGE / KEYS_ONLY
    }
)
```

```python
# Lambda로 Stream 처리 (가장 일반적인 패턴)
def handler(event, context):
    for record in event["Records"]:
        event_name = record["eventName"]  # INSERT / MODIFY / REMOVE

        new_image = record["dynamodb"].get("NewImage", {})
        old_image = record["dynamodb"].get("OldImage", {})

        # DynamoDB type descriptor 언패킹
        from boto3.dynamodb.types import TypeDeserializer
        deserializer = TypeDeserializer()

        new_item = {k: deserializer.deserialize(v) for k, v in new_image.items()}
        old_item = {k: deserializer.deserialize(v) for k, v in old_image.items()}

        if event_name == "INSERT" and new_item.get("type") == "message":
            # 새 메시지 → 알림 발송
            send_notification(new_item)

        elif event_name == "MODIFY":
            # 변경 감지 → 캐시 무효화, 검색 인덱스 업데이트 등
            invalidate_cache(new_item["pk"])

        elif event_name == "REMOVE":
            # 삭제 이벤트 (TTL 만료 포함)
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
            # PAY_PER_REQUEST에서는 드물지만, burst 시 발생 가능
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
# Exponential backoff 재시도 (RetryableError 처리)
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

## DynamoDB Local (로컬 개발)

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
# 로컬 연결
dynamodb = boto3.resource(
    "dynamodb",
    region_name="ap-northeast-2",
    endpoint_url="http://localhost:8000",
    aws_access_key_id="dummy",      # 로컬은 dummy 값 사용
    aws_secret_access_key="dummy"
)

# 테이블 생성 스크립트 (로컬 초기화)
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
- [ ] PAY_PER_REQUEST vs Provisioned 모드 선택 (트래픽 예측 가능하면 Provisioned)
- [ ] TTL 활성화 여부 확인 (세션, 임시 데이터)
- [ ] Streams 필요 여부 확인 (캐시 무효화, 검색 인덱스 동기화)
- [ ] ClientError 코드별 분기 처리
- [ ] RetryableError에 exponential backoff 적용
- [ ] 로컬 개발 환경 DynamoDB Local 사용
- [ ] ProjectionExpression으로 필요한 필드만 조회
