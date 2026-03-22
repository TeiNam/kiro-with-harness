# Key Design and Index Strategy

---

## Partition Key (PK) 설계 원칙

PK는 DynamoDB의 **수평 분산 단위**다. MongoDB의 샤드키보다 훨씬 직접적으로 성능에 영향을 미친다.
같은 PK를 가진 모든 Item은 동일한 파티션에 저장된다.

### 좋은 PK의 조건

| 조건 | 설명 |
|------|------|
| 높은 카디널리티 | 값의 종류가 많아야 파티션 분산 |
| 균등한 접근 | 특정 PK에 읽기/쓰기 집중 금지 |
| 불변성 | 생성 후 변경 불가 (변경 = 삭제 + 재생성) |
| 쿼리 격리 | 자주 함께 조회하는 데이터는 같은 PK에 |

### Hot Partition 방지

```python
# ❌ Sequential ID: 새 Item이 항상 같은 파티션에 쏠림
pk = "USER#1"
pk = "USER#2"
pk = "USER#3"   # 순차 생성 → 최근 파티션에 집중

# ❌ 날짜 단독: 오늘 날짜 파티션에 모든 쓰기 집중
pk = "DATE#2024-01-15"

# ❌ 저카디널리티: 2~3가지 값만 존재
pk = "STATUS#active"
pk = "STATUS#inactive"

# ✅ UUID / ULID: 균등 분산
pk = f"USER#{uuid4()}"
pk = f"MSG#{ulid()}"

# ✅ 엔티티 ID 기반: 카디널리티 높고 균등
pk = "USER#user_8f3a9b2c"
pk = "CONV#conv_4e7d1f9a"

# ✅ 쓰기 집중 완화: Write Sharding (접미어 랜덤 분산)
import random
shard = random.randint(0, 9)
pk = f"LEADERBOARD#{leaderboard_id}#SHARD{shard}"
# 읽기 시 0~9 모두 조회 후 병합 (Scatter-Gather 감수)
```

---

## Sort Key (SK) 설계 원칙

SK는 같은 PK 내에서 **정렬과 범위 쿼리**를 담당한다.
MongoDB의 복합 인덱스 두 번째 필드와 유사하지만, DynamoDB에서는 훨씬 중요하다.

### SK 설계 패턴

```python
# 패턴 1 — 단일 레코드 (정적 값)
sk = "PROFILE"
sk = "META"
sk = "SETTINGS"

# 패턴 2 — 시간 정렬 (ISO8601 String)
sk = "MSG#2024-01-15T10:05:00.000Z"     # 오름차순 시간 정렬
sk = f"MSG#{datetime.utcnow().isoformat()}Z"

# 패턴 3 — 계층 구조 (begins_with 범위 쿼리)
sk = "MSG#2024-01#msg789"               # 월별 필터
sk = "MSG#2024-01-15#msg789"            # 일별 필터
# begins_with("MSG#2024-01") → 1월 메시지 전체

# 패턴 4 — 역순 정렬 트릭 (최신순이 기본 정렬일 때)
# DynamoDB는 오름차순 정렬이 기본 → 최신이 뒤에 옴
# ScanIndexForward=False로 역순 가능하지만,
# 특정 패턴에서는 timestamp를 뒤집어 저장
MAX_TIMESTAMP = 9999999999999
inverted_ts = MAX_TIMESTAMP - int(datetime.utcnow().timestamp() * 1000)
sk = f"MSG#{inverted_ts:013d}"  # 오름차순 정렬 = 최신순
```

---

## GSI (Global Secondary Index) 전략

GSI는 원본 테이블과 다른 PK/SK로 데이터를 조회하는 별도 인덱스다.
**테이블당 최대 20개**, 추가 비용 발생. 최소한으로 설계하고 재사용할 것.

### GSI Overloading — 하나의 GSI로 여러 Access Pattern 처리

```python
# GSI 속성을 엔티티별로 다르게 채워서 GSI 재사용
# GSI1: gsi1pk + gsi1sk

# User 엔티티: email로 조회 (AP-R2)
{
    "pk": "USER#user123",
    "sk": "PROFILE",
    "gsi1pk": "EMAIL#user@example.com",   # GSI1 PK
    "gsi1sk": "USER#user123",             # GSI1 SK
    "type": "user"
}

# Content 엔티티: status별 최신 컨텐츠 조회
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "gsi1pk": "STATUS#published",         # 같은 GSI1 재사용
    "gsi1sk": "2024-01-15T10:00:00Z",     # 시간 정렬
    "type": "content"
}

# GSI1로 처리 가능한 Access Pattern:
# - email로 유저 조회: gsi1pk = "EMAIL#user@example.com"
# - published 컨텐츠 최신순: gsi1pk = "STATUS#published", ScanIndexForward=False
```

```python
# GSI 쿼리 예시
import boto3
from boto3.dynamodb.conditions import Key

table = boto3.resource("dynamodb").Table("MyApp")

# AP-R2: email로 유저 조회
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("EMAIL#user@example.com")
)
user = response["Items"][0] if response["Items"] else None

# published 컨텐츠 최신 20개
response = table.query(
    IndexName="GSI1",
    KeyConditionExpression=Key("gsi1pk").eq("STATUS#published"),
    ScanIndexForward=False,
    Limit=20
)
```

### GSI Sparse Index — 특정 엔티티만 인덱싱

GSI 속성이 없는 Item은 GSI에 포함되지 않는다. 이를 활용해 특정 타입만 인덱싱.

```python
# 관리자 승인이 필요한 컨텐츠만 GSI에 포함
# → pendingApproval 필드가 있는 Item만 GSI2에 존재
{
    "pk": "CONTENT#abc",
    "sk": "META",
    "type": "content",
    "status": "pending_review",
    "gsi2pk": "PENDING",                  # 승인 대기 컨텐츠만 이 필드 보유
    "gsi2sk": "2024-01-15T10:00:00Z"
}
# 승인 완료 시 gsi2pk, gsi2sk 필드 제거 → GSI2에서 자동 제외
```

---

## LSI (Local Secondary Index)

같은 PK에서 다른 SK로 정렬/범위 쿼리가 필요할 때 사용.
**테이블 생성 시에만 추가 가능** (이후 추가 불가). GSI보다 더 제약이 강하다.

```python
# 테이블 생성 시 LSI 정의 예시 (boto3)
dynamodb.create_table(
    TableName="MyApp",
    KeySchema=[
        {"AttributeName": "pk", "KeyType": "HASH"},
        {"AttributeName": "sk", "KeyType": "RANGE"}
    ],
    LocalSecondaryIndexes=[
        {
            "IndexName": "LSI_updatedAt",
            "KeySchema": [
                {"AttributeName": "pk", "KeyType": "HASH"},
                {"AttributeName": "updatedAt", "KeyType": "RANGE"}  # 다른 SK
            ],
            "Projection": {"ProjectionType": "ALL"}
        }
    ],
    BillingMode="PAY_PER_REQUEST"
)
```

> ⚠️ LSI는 테이블 생성 후 추가/삭제 불가. 필요한지 확실하지 않으면 GSI로 대체.
> LSI는 파티션 크기 10GB 제한을 공유한다.

---

## GSI vs LSI 선택 기준

| 항목 | GSI | LSI |
|------|-----|-----|
| 추가 시점 | 언제든 가능 | 테이블 생성 시만 |
| PK 변경 | 가능 (다른 PK 사용) | 불가 (같은 PK 공유) |
| 일관성 | Eventually consistent | Strongly consistent 가능 |
| 파티션 한도 | 없음 | PK당 10GB 공유 |
| 비용 | 추가 스토리지/처리량 | 메인 테이블과 스토리지 공유 |
| 권장 | **대부분의 경우** | 강한 일관성이 필요한 보조 정렬 |

---

## Projection 설계 (인덱스 크기 최적화)

GSI/LSI에 어떤 필드를 복사할지 결정. 비용과 편의성의 트레이드오프.

```python
# KEYS_ONLY: pk, sk, gsi pk, sk만 → 가장 저렴, 조회 후 추가 GetItem 필요
{"ProjectionType": "KEYS_ONLY"}

# INCLUDE: 지정 필드만 포함 → 목록 API에 필요한 필드만
{"ProjectionType": "INCLUDE", "NonKeyAttributes": ["title", "thumbnailUrl", "createdAt"]}

# ALL: 모든 필드 복사 → 가장 편리, 스토리지 2배
{"ProjectionType": "ALL"}
```

```python
# 권장 패턴: 목록 API용 GSI는 INCLUDE로 필요한 필드만
# 상세 조회가 필요하면 GSI로 pk/sk를 얻고 GetItem으로 전체 조회
response = table.query(IndexName="GSI1", ...)
pk = response["Items"][0]["pk"]
sk = response["Items"][0]["sk"]
full_item = table.get_item(Key={"pk": pk, "sk": sk})["Item"]
```

## Key and Index Checklist
- [ ] PK 카디널리티가 충분히 높은가 (Sequential int, 날짜 단독 금지)
- [ ] SK가 계층 구조로 설계되어 begins_with / between 활용 가능한가
- [ ] GSI Overloading으로 GSI 수를 최소화했는가
- [ ] LSI는 테이블 생성 전에 필요 여부 확정했는가
- [ ] GSI Projection은 INCLUDE로 필요한 필드만 지정했는가
- [ ] Hot partition 유발하는 저카디널리티 PK 없음
- [ ] 각 Access Pattern이 특정 인덱스에 매핑되었는가
