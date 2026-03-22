# 스킬(Skill) 카탈로그

도메인별로 정리된 96개의 스킬. 각 스킬은 수동 포함(manual-inclusion) 스티어링(Steering)으로 설치되며, Kiro 채팅에서 `#` 컨텍스트 키를 통해 필요할 때 로드합니다.

## 인프라(Infrastructure)

| 스킬 | 설명 |
|-------|-------------|
| docker-patterns | 컨테이너 패턴, 멀티 스테이지 빌드, Compose 모범 사례 |
| deployment-patterns | 배포 전략, 블루-그린, 카나리, 롤백 |
| database-migrations | 스키마 마이그레이션 패턴, 무중단 마이그레이션 |
| backend-patterns | 백엔드 아키텍처 패턴, 서비스 레이어, 리포지토리 |
| content-hash-cache-pattern | 콘텐츠 주소 지정 캐싱 전략 |
| video-editing | 비디오 처리 및 편집 자동화 |

## 데이터베이스(Databases)

| 스킬 | 설명 |
|-------|-------------|
| postgres-guideline | PostgreSQL 모범 사례, 인덱싱, 쿼리 최적화 |
| mysql-guideline | MySQL 모범 사례, InnoDB 튜닝, 복제 |
| mongodb-guideline | MongoDB 스키마 설계, 집계, 샤딩 |
| dynamodb-guideline | DynamoDB 단일 테이블 설계, GSI, 용량 계획 |
| clickhouse-io | ClickHouse 분석, MergeTree 엔진, 구체화된 뷰 |
| jpa-patterns | JPA/Hibernate 패턴, N+1 방지, 엔티티 생명주기 |

## 백엔드 프레임워크(Backend Frameworks)

| 스킬 | 설명 |
|-------|-------------|
| django-patterns | Django 프로젝트 구조, 뷰, 모델, 시그널 |
| django-tdd | Django 테스트 주도 개발, 픽스처, 팩토리 |
| django-security | Django 보안 강화, CSRF, 인증, 권한 |
| django-verification | Django 배포 검증, 헬스 체크 |
| springboot-patterns | Spring Boot 아키텍처, DI, 설정 |
| springboot-tdd | Spring Boot 테스트, MockMvc, Testcontainers |
| springboot-security | Spring Security, OAuth2, JWT, 메서드 보안 |
| springboot-verification | Spring Boot Actuator, 배포 검증 |
| laravel-patterns | Laravel 아키텍처, Eloquent, 서비스 프로바이더 |
| laravel-tdd | Laravel 테스트, Pest, 팩토리, 데이터베이스 테스트 |
| laravel-security | Laravel 보안, 게이트, 정책, 암호화 |
| laravel-verification | Laravel 배포 검증, Envoy |
| fastapi-backend-best-practices | FastAPI 프로젝트 구조, 비동기, 도메인 모델링, API 설계, 테스트, 보안, 배포 |

## 프론트엔드(Frontend)

| 스킬 | 설명 |
|-------|-------------|
| nextjs-turbopack | Next.js + Turbopack, App Router, RSC 패턴 |
| nuxt4-patterns | Nuxt 4 패턴, 컴포저블, 서버 라우트 |
| bun-runtime | Bun 런타임, 번들러, 테스트 러너, 패키지 매니저 |
| frontend-patterns | 일반 프론트엔드 아키텍처, 상태 관리 |
| flutter-dart-code-review | Flutter/Dart 코드 리뷰 체크리스트 |
| liquid-glass-design | Apple Liquid Glass 디자인 시스템 패턴 |
| frontend-slides | 프레젠테이션/슬라이드 프레임워크 패턴 |

## 모바일(Mobile)

| 스킬 | 설명 |
|-------|-------------|
| android-clean-architecture | Android 클린 아키텍처, MVVM, Hilt |
| compose-multiplatform-patterns | Compose Multiplatform, 공유 UI, expect/actual |
| swiftui-patterns | SwiftUI 뷰, 내비게이션, 데이터 흐름 |
| swift-concurrency-6-2 | Swift 6.2 구조적 동시성, async/await |
| swift-actor-persistence | Swift 액터 격리, 영속성 패턴 |
| swift-protocol-di-testing | Swift 프로토콜 기반 DI 및 테스트 |
| kotlin-coroutines-flows | Kotlin 코루틴, Flow, StateFlow, SharedFlow |
| kotlin-ktor-patterns | Ktor 서버/클라이언트 패턴, 라우팅, 플러그인 |
| kotlin-exposed-patterns | Kotlin Exposed ORM, DSL, DAO 패턴 |
| kotlin-patterns | 일반 Kotlin 관용구, sealed 클래스, 확장 함수 |

## AI / LLM

| 스킬 | 설명 |
|-------|-------------|
| claude-api | Claude API 통합, 스트리밍, 도구 사용 |
| cost-aware-llm-pipeline | LLM 비용 최적화, 캐싱, 모델 라우팅 |
| foundation-models-on-device | 온디바이스 모델 배포, 양자화, ONNX |
| pytorch-patterns | PyTorch 학습 루프, 데이터 로딩, 분산 처리 |
| regex-vs-llm-structured-text | 텍스트 추출 시 정규식 vs LLM 선택 기준 |
| ai-regression-testing | AI 출력 회귀 테스트, 골든 데이터셋 |
| agent-eval | 에이전트 평가 프레임워크, pass@k 메트릭 |

## 아키텍처(Architecture)

| 스킬 | 설명 |
|-------|-------------|
| api-design | REST/GraphQL API 설계, 버전 관리, 페이지네이션 |
| architecture-decision-records | ADR 템플릿, 의사결정 기록 |
| blueprint | 시스템 블루프린트, 컴포넌트 다이어그램, 데이터 흐름 |
| mcp-server-patterns | MCP 서버 구현 패턴 |
| codebase-onboarding | 코드베이스 탐색, 의존성 매핑 |
| agent-harness-construction | 에이전트 하네스 설계, 스티어링, 훅, 스킬 |

## 품질 및 엔지니어링(Quality & Engineering)

| 스킬 | 설명 |
|-------|-------------|
| continuous-learning-v2 | 지속적 학습 루프, 피드백 통합 |
| strategic-compact | 장시간 세션을 위한 컨텍스트 압축 전략 |
| context-budget | 토큰 예산 관리, 컨텍스트 윈도우 최적화 |
| agentic-engineering | 에이전틱 코딩 패턴, 도구 사용, 계획 수립 |
| ai-first-engineering | AI 우선 개발 워크플로 |
| enterprise-agent-ops | 엔터프라이즈 에이전트 운영, 거버넌스, 모니터링 |
| documentation-lookup | 문서 검색 및 조회 패턴 |

## 워크플로 스킬(Workflow Skills)

| 스킬 | 설명 |
|-------|-------------|
| verification-loop | 반복적 검증 및 유효성 확인 루프 |
| eval-harness | 평가 기반 개발, pass@k 메트릭 |
| coding-standards | 코드 품질 강제, 린팅 규칙 |
| iterative-retrieval | 다단계 정보 검색 패턴 |
| prompt-optimizer | 프롬프트 엔지니어링 및 최적화 |
| security-review | 보안 감사 체크리스트 및 리뷰 프로세스 |
| security-scan | 자동화된 보안 스캐닝 패턴 |
| e2e-testing | 엔드투엔드 테스트 전략 및 프레임워크 |

## 글쓰기 및 리서치(Writing & Research)

| 스킬 | 설명 |
|-------|-------------|
| article-writing | 기술 문서 구조, 초안 작성, 편집 |
| content-engine | 콘텐츠 파이프라인, 스케줄링, 멀티 플랫폼 |
| deep-research | 심층 리서치 방법론, 출처 평가 |
| search-first | 검색 우선 접근법, 정보 수집 |
| market-research | 시장 분석, 경쟁 정보 |
| crosspost | 크로스 플랫폼 콘텐츠 배포 |
| investor-materials | 피치 덱, 재무 모델, 원페이저 |
| investor-outreach | 투자자 커뮤니케이션, 후속 시퀀스 |

## 언어별 테스트(Language-Specific Testing)

| 스킬 | 설명 |
|-------|-------------|
| python-testing | pytest, 픽스처, parametrize, 커버리지 |
| golang-testing | Go 테스트, 테이블 기반 테스트, 벤치마크 |
| rust-testing | Rust 테스트, 속성 기반 테스트, 통합 테스트 |
| cpp-testing | C++ 테스트, Google Test, Catch2, 새니타이저 |
| kotlin-testing | Kotlin 테스트, MockK, Kotest |
| perl-testing | Perl 테스트, Test::More, Test2 |
| perl-security | Perl 보안, taint 모드, 입력 검증 |

## 언어별 패턴(Language-Specific Patterns)

| 스킬 | 설명 |
|-------|-------------|
| python-patterns | Python 관용구, 데코레이터, 컨텍스트 매니저 |
| golang-patterns | Go 패턴, 인터페이스, 에러 처리 |
| rust-patterns | Rust 소유권, 라이프타임, 트레이트 패턴 |
| perl-patterns | Perl 관용구, 정규식, CPAN 모듈 |
| cpp-coding-standards | C++ 모던 표준, RAII, 스마트 포인터 |
| java-coding-standards | Java 컨벤션, 스트림, Optional 패턴 |

## 도메인 특화 — 비즈니스(Domain-Specific — Business)

| 스킬 | 설명 |
|-------|-------------|
| carrier-relationship-management | 운송사 온보딩, 요율 관리, SLA |
| customs-trade-compliance | 무역 컴플라이언스, HS 코드, 관세 계산 |
| energy-procurement | 에너지 조달, RFP, 계약 관리 |
| inventory-demand-planning | 수요 예측, 안전 재고, 재주문점 |
| logistics-exception-management | 배송 예외 처리, 에스컬레이션, 해결 |
| production-scheduling | 생산 계획, MRP, 용량 스케줄링 |
| quality-nonconformance | NCR 관리, CAPA, 근본 원인 분석 |
| returns-reverse-logistics | 반품 처리, 리퍼비시, 처분 |

## 특수 분야(Specialty)

| 스킬 | 설명 |
|-------|-------------|
| obsidian-plugin-develop | Obsidian 플러그인 모범 사례, i18n, TypeScript/Chromium, 릴리스 체크리스트 |
