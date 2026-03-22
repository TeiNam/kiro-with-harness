---
name: mongodb-guideline
description: >
  MongoDB 7.0+ 스키마 설계, 컬렉션/인덱스 생성, 쿼리 최적화, 샤딩,
  motor/비동기 커넥션 관리에 적용. 트리거: createCollection, createIndex,
  aggregation, $lookup, $match, $group, TTL index, motor async,
  embedded document, content schema, metadata, 도큐먼트 설계,
  채팅/로그 저장, 사용자 설정, 컨텐츠/메타데이터 관련 작업.
origin: custom
---

# MongoDB Database Guideline

## When to Activate

- Designing MongoDB collection schemas (chat, log, user settings, content, metadata)
- Writing queries or aggregation pipelines
- Creating indexes (single, compound, TTL, text)
- Troubleshooting slow queries
- Setting up async driver connection (motor / Node.js native driver)
- Implementing TTL-based data expiry

## MongoDB Version and Defaults
- MongoDB 7.0+
- Driver: ODM 없이 raw 비동기 드라이버 사용
  - Python: `motor` 3.x (async) / `pymongo` 4.x (sync)
  - Node.js: `mongodb` 6.x (native driver)
- Default write concern: `w: "majority"`
- Default read preference: `primaryPreferred`
- 스키마 검증은 드라이버가 아닌 애플리케이션 레이어에서 직접 수행 (Pydantic, Zod 등)

## Naming Rules
- Collections: snake_case, plural (e.g. `chat_histories`, `user_settings`, `contents`, `content_metadata`)
- Fields: snake_case (e.g. `user_id`, `created_at`, `updated_at`)
- Indexes: `idx_{collection}_{field}` / `uidx_{collection}_{field}`
- Database: snake_case (e.g. `myapp`, `myapp_log`)

## Field Type Guide

| Use Case | Recommended Type | Notes |
|----------|-----------------|-------|
| Document ID | `ObjectId` | Default `_id`, auto-generated |
| External ID | `string` (UUID) | For API-facing IDs |
| Integer | `int32` / `int64` | Use int64 for large counts |
| Boolean | `bool` | Never use 0/1 strings |
| String | `string` | Always validate max length in app |
| Timestamp | `date` (ISODate) | Always store in UTC |
| Decimal | `Decimal128` | Never use double for money |
| Embedded doc | `object` | For tightly coupled data |
| Reference | `ObjectId` / `int` | For loosely coupled relations |
| Tags/list | `array` | Prefer flat arrays |
| Free-form data | `object` | Use only when schema is truly dynamic |

## Prohibited Items
- `$where` operator: prohibited (JS injection risk)
- Unbounded arrays: prohibited (document size limit 16MB)
- Deep nesting (4+ levels): discouraged
- Storing binary files in documents: use GridFS or S3
- Schema-less by habit: always define expected fields

## Reference Files
- `document-design.md` — Embed vs Reference 전략, 컨텐츠 중심 설계, 글로벌 쿼리 회피
- `index-strategy.md` — RDBMS와 다른 MongoDB 인덱스 전략, multikey/partial/TTL
- `shard-key.md` — 샤드키 선정 원칙, 패턴별 가이드
- `connection-and-features.md` — motor async, transactions, change streams
