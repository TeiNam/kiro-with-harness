# Shard Key Selection

샤딩은 단일 서버 한계를 넘을 때 수평 확장하는 방법이다.
**샤드키는 변경 불가**이므로 초기 설계가 매우 중요하다.
샤딩 전에 인덱스 최적화 → 레플리카셋 스케일업을 먼저 시도할 것.

---

## 좋은 샤드키의 4가지 조건

| 조건 | 설명 | 나쁜 예 |
|------|------|---------|
| 높은 카디널리티 | 값의 종류가 충분히 많아야 분산 가능 | `status`, `is_active`, `country` |
| 균등한 쓰기 분산 | 특정 샤드에 쓰기가 몰리지 않아야 함 | `created_at` 단독 (시간 순 hotspot) |
| 쿼리 격리 | 대부분의 쿼리가 단일 샤드에서 완결 | 쿼리 조건과 무관한 필드 |
| 불변성 | 도큐먼트 생성 후 변경되지 않는 값 | `status`, `email` (변경 가능) |

---

## 패턴별 샤드키 가이드

### 패턴 1 — 유저 데이터 (chat, settings, activity)

유저별로 데이터가 격리되고, 쿼리의 대부분이 `user_id` 기준이면 `user_id` 샤드키.

```javascript
// Hashed sharding: user_id를 해시해서 균등 분산
sh.shardCollection("myapp.messages", {"user_id": "hashed"})

// Range sharding: user_id 범위별 샤드 — 특정 유저 범위 쿼리에 유리
sh.shardCollection("myapp.messages", {"user_id": 1})
```

```python
# 장점: 한 유저의 모든 데이터가 같은 샤드에 → $lookup 없이 단일 샤드 완결
await db.messages.find({"user_id": user_id})       # ✅ 단일 샤드 쿼리
await db.messages.find({"user_id": user_id, "conversation_id": conv_id})  # ✅ 단일 샤드

# 단점: 특정 유저에게 쓰기가 폭증하면 hotspot 가능 (whale user 문제)
# → 쓰기 분산이 중요하면 (user_id, _id) 복합 샤드키 고려
```

### 패턴 2 — 시계열/로그 데이터 (access_log, events)

```python
# ❌ created_at 단독: 최신 샤드에 쓰기 집중 (monotonic hotspot)
sh.shardCollection("myapp.access_logs", {"created_at": 1})

# ✅ (hashed _id): _id의 ObjectId는 시간 기반이라 hashed로 분산
sh.shardCollection("myapp.access_logs", {"_id": "hashed"})

# ✅ (user_id + created_at): 유저별 격리 + 시간 범위 쿼리 효율
sh.shardCollection("myapp.access_logs", {"user_id": 1, "created_at": 1})
```

### 패턴 3 — 컨텐츠 데이터 (articles, videos, products)

```python
# 컨텐츠는 특정 유저 소유가 아닌 전체 검색이 많음
# → category + _id 복합: 카테고리별 격리 + 균등 분산

# ✅ (category_id hashed): 카테고리별 분산
sh.shardCollection("myapp.contents", {"category_id": "hashed"})

# ✅ (_id hashed): 가장 단순하고 균등한 분산, 범위 쿼리 비효율
sh.shardCollection("myapp.contents", {"_id": "hashed"})
```

### 패턴 4 — 멀티테넌트 (SaaS, 조직/팀별 격리)

```python
# tenant_id 기준으로 데이터 완전 격리
sh.shardCollection("myapp.documents", {"tenant_id": 1, "_id": 1})

# 장점: 테넌트별 모든 쿼리가 단일 샤드 완결
# 단점: 테넌트 간 크기 불균형 → Zone sharding으로 보완 가능
await db.documents.find({"tenant_id": tenant_id})  # ✅ 단일 샤드
```

---

## Hashed vs Range Sharding 비교

| 항목 | Hashed | Range |
|------|--------|-------|
| 쓰기 분산 | ✅ 균등 | ⚠️ hotspot 가능 |
| Range 쿼리 | ❌ 글로벌 스캔 | ✅ 단일 샤드 |
| 정렬 쿼리 | ❌ 글로벌 | ✅ 효율적 |
| 적합한 케이스 | 랜덤 write 많음 | 범위/정렬 쿼리 많음 |

```python
# Hashed: write 분산이 최우선, range 쿼리 거의 없을 때
sh.shardCollection("myapp.events", {"user_id": "hashed"})

# Range: user_id 범위 쿼리나 정렬이 많을 때
sh.shardCollection("myapp.orders", {"user_id": 1, "created_at": 1})
```

---

## 글로벌 쿼리(Scatter-Gather) 방지

샤드키가 없는 쿼리는 모든 샤드에 브로드캐스트된다 (scatter-gather).
샤드키를 포함하지 않는 쿼리는 **반드시 사전에 파악하고 최소화**해야 한다.

```python
# ❌ 샤드키(user_id) 없는 쿼리 → 모든 샤드 스캔
await db.messages.find({"conversation_id": conv_id})  # scatter-gather

# ✅ 샤드키 포함 → 단일 샤드 완결
await db.messages.find({"user_id": user_id, "conversation_id": conv_id})

# conversation_id 단독 조회가 필요하다면?
# → conversation_id에 user_id를 embed해서 조회 시 user_id를 함께 전달
# conversations 컬렉션에서 user_id를 먼저 조회한 뒤 messages 조회
conv = await db.conversations.find_one({"_id": conv_id}, {"user_id": 1})
messages = await db.messages.find({"user_id": conv["user_id"], "conversation_id": conv_id})
```

---

## 샤드키 선정 체크리스트

- [ ] 카디널리티가 충분히 높은가 (최소 수천 가지 이상의 값)
- [ ] 쓰기가 특정 샤드에 집중되지 않는가 (monotonic 값 단독 사용 금지)
- [ ] 대부분의 쿼리에 샤드키가 포함되는가 (scatter-gather 최소화)
- [ ] 샤드키 값이 도큐먼트 생성 후 변경되지 않는가
- [ ] Hashed vs Range 중 쿼리 패턴에 맞게 선택했는가
- [ ] 샤딩 전에 인덱스 최적화 및 레플리카셋 스케일업을 먼저 시도했는가
