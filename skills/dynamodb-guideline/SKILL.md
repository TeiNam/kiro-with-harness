---
name: dynamodb-guideline
description: >
  DynamoDB 테이블 설계, 키/인덱스 전략, 쿼리 패턴, boto3/aioboto3 연결 관리에 적용.
  트리거: DynamoDB table design, PK/SK, GSI, LSI, Single Table Design, access pattern,
  partition key, sort key, overloading, Query vs Scan, TTL, DynamoDB Streams,
  boto3, aioboto3, TransactWrite, BatchWrite 관련 작업.
origin: custom
---

# DynamoDB Guideline

## When to Activate

- Designing DynamoDB table schemas
- Defining access patterns before modeling
- Selecting partition key / sort key / GSI
- Writing Query, GetItem, PutItem, UpdateItem expressions
- Troubleshooting hot partitions or slow scans
- Setting up boto3 / aioboto3 client
- Implementing TTL or DynamoDB Streams

## DynamoDB Defaults
- AWS SDK: `boto3` 4.x (sync) / `aioboto3` 12.x (async)
- Billing mode: `PAY_PER_REQUEST` (기본, 트래픽 예측 어려울 때)
- Table class: `STANDARD`
- Encryption: AWS managed key (기본)

## Naming Rules
- Tables: PascalCase (e.g. `ChatHistory`, `UserSetting`, `Content`)
- Single Table: 서비스명 단수 (e.g. `MyApp`)
- Attribute (필드): camelCase (e.g. `userId`, `createdAt`, `sk`)
- GSI: `GSI_{번호}` 또는 용도 명시 (e.g. `GSI_email`, `GSI_status_created`)
- LSI: `LSI_{번호}` 또는 용도 명시

## Key Attribute Naming (Single Table Design)

| Attribute | 역할 | 예시 값 |
|-----------|------|---------|
| `pk` | Partition Key | `USER#user123`, `CONTENT#abc` |
| `sk` | Sort Key | `PROFILE`, `MSG#2024-01-01T00:00:00Z` |
| `gsi1pk` | GSI 1 PK | `EMAIL#user@example.com` |
| `gsi1sk` | GSI 1 SK | `USER#user123` |
| `type` | 엔티티 타입 식별 | `"user"`, `"message"`, `"content"` |

## Data Type Guide

| Use Case | DynamoDB Type | Notes |
|----------|--------------|-------|
| ID / String | `S` (String) | 모든 ID는 String |
| 숫자 | `N` (Number) | 정수/소수 모두 |
| Boolean | `BOOL` | True/False |
| Timestamp | `S` (ISO8601) or `N` (epoch) | 정렬 필요하면 ISO8601 String |
| 중첩 객체 | `M` (Map) | embed용 |
| 배열 | `L` (List) | 순서 있는 배열 |
| 태그/집합 | `SS` / `NS` (Set) | 중복 없는 집합 |
| Binary | `B` | 바이너리 데이터 |
| Money | `N` (정수, 최소단위) | 소수점 오차 방지: 원 단위 정수 저장 |

## Prohibited Items
- `Scan` operation: 금지 (전체 테이블 읽기, 비용/성능 최악)
- `FilterExpression` on non-key attributes without Query: Scan과 동일한 비용
- Sequential numeric PK (1, 2, 3...): hot partition 위험
- Unbounded List attribute: 16KB item 한도 초과 위험
- 스키마 없는 설계: access pattern 없이 테이블 생성 금지

## Reference Files
- `data-modeling.md` — Single Table Design, Access Pattern 우선 설계, Entity Overloading
- `key-and-index.md` — Partition Key / Sort Key 설계, GSI/LSI 전략, hot partition 방지
- `query-patterns.md` — Query vs Scan, 페이지네이션, 조건 표현식, Batch/Transaction
- `connection-and-features.md` — boto3/aioboto3, TTL, DynamoDB Streams, 에러 처리
