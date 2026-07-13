# Skill Catalog

139 skills organized by domain (highlights below; the full set is tagged by workload and installed on selection). Each skill is installed as manual-inclusion steering — load on demand via `#` context key in Kiro chat.

## Infrastructure

| Skill | Description |
|-------|-------------|
| docker-patterns | Container patterns, multi-stage builds, compose best practices |
| deployment-patterns | Deployment strategies, blue-green, canary, rollback |
| database-migrations | Schema migration patterns, zero-downtime migrations |
| backend-patterns | Backend architecture patterns, service layer, repository |
| content-hash-cache-pattern | Content-addressable caching strategy |
| video-editing | Video processing and editing automation |

## Cloud / Data Engineering

| Skill | Description |
|-------|-------------|
| aws-cloud | AWS service usage, IAM least-privilege, service selection, cost guardrails |
| aws-sdk-patterns | boto3/aioboto3, AWS SDK for JS v3, AWS CLI v2 (creds, retries, pagination, errors) |
| aws-bedrock | Amazon Bedrock Converse/InvokeModel, agents, knowledge bases, guardrails |
| aws-lakehouse | S3 Tables, Apache Iceberg, Athena, Spark on EMR/Glue lakehouse |
| aws-etl-cdc | Choose DMS/Glue/Kinesis/MSK/Flink/Zero-ETL by transform type; CDC patterns |
| aws-finops | Cost Explorer, Budgets, Savings Plans vs RI, rightsizing, unit economics, showback/chargeback (FinOps) |
| log-data-offloading | Move RDBMS log/time-series data to S3 or OpenSearch (partitioning, ISM, tiering) |
| infra-version-currency | Resolve/pin latest EKS/MSK/Terraform/image versions before provisioning |
| terraform-deployment | Greenfield Terraform version pinning, lock, fmt→validate→plan→apply gate |
| duckdb-patterns | DuckDB analytics, Parquet/Iceberg querying without a cluster |
| python-data-analysis | pandas/polars/DuckDB data analysis workflows |
| analysis-methodology | Analysis judgment layer: framing, technique selection, causal/experiment design, domain playbooks |
| cost-tracking | Token/spend tracking and budget reporting |

## Databases

| Skill | Description |
|-------|-------------|
| postgres-guideline | PostgreSQL best practices, indexing, query optimization |
| mysql-guideline | MySQL best practices, InnoDB tuning, replication, dev practices, JDBC |
| mongodb-guideline | MongoDB schema design, aggregation, sharding |
| mongodb-patterns | MongoDB runtime — aggregation, query/index usage, transactions, async pools |
| dynamodb-guideline | DynamoDB single-table design, GSI, capacity planning |
| rdbms-naming | Common RDBMS naming + data-type conventions (MySQL & PostgreSQL) |
| clickhouse-io | ClickHouse analytics, MergeTree engines, materialized views |
| jpa-patterns | JPA/Hibernate patterns, N+1 prevention, entity lifecycle |

## Backend Frameworks

| Skill | Description |
|-------|-------------|
| django-patterns | Django project structure, views, models, signals |
| django-tdd | Django test-driven development, fixtures, factories |
| django-security | Django security hardening, CSRF, auth, permissions |
| django-verification | Django deployment verification, health checks |
| springboot-patterns | Spring Boot architecture, DI, configuration |
| springboot-tdd | Spring Boot testing, MockMvc, Testcontainers |
| springboot-security | Spring Security, OAuth2, JWT, method security |
| springboot-verification | Spring Boot actuator, deployment verification |
| laravel-patterns | Laravel architecture, Eloquent, service providers |
| laravel-tdd | Laravel testing, Pest, factories, database testing |
| laravel-security | Laravel security, gates, policies, encryption |
| laravel-verification | Laravel deployment verification, Envoy |
| fastapi-backend-best-practices | FastAPI project structure, async, domain modeling, API design, testing, security, deployment |

## Frontend

| Skill | Description |
|-------|-------------|
| nextjs-turbopack | Next.js with Turbopack, App Router, RSC patterns |
| nuxt4-patterns | Nuxt 4 patterns, composables, server routes |
| vite-patterns | Vite 6/7 config, plugins, HMR, env vars, library mode, build optimization |
| bun-runtime | Bun runtime, bundler, test runner, package manager |
| frontend-patterns | General frontend architecture, state management |
| flutter-dart-code-review | Flutter/Dart code review checklist |
| liquid-glass-design | Apple Liquid Glass design system patterns |
| frontend-slides | Presentation/slide framework patterns |

## Mobile

| Skill | Description |
|-------|-------------|
| android-clean-architecture | Android Clean Architecture, MVVM, Hilt |
| compose-multiplatform-patterns | Compose Multiplatform, shared UI, expect/actual |
| swiftui-patterns | SwiftUI views, navigation, data flow |
| swift-concurrency-6-2 | Swift 6.2 structured concurrency, async/await |
| swift-actor-persistence | Swift actor isolation, persistence patterns |
| swift-protocol-di-testing | Swift protocol-oriented DI and testing |
| kotlin-coroutines-flows | Kotlin coroutines, Flow, StateFlow, SharedFlow |
| kotlin-ktor-patterns | Ktor server/client patterns, routing, plugins |
| kotlin-exposed-patterns | Kotlin Exposed ORM, DSL, DAO patterns |
| kotlin-patterns | General Kotlin idioms, sealed classes, extensions |

## AI / LLM

| Skill | Description |
|-------|-------------|
| claude-api | Claude API integration, streaming, tool use |
| cost-aware-llm-pipeline | LLM cost optimization, caching, model routing |
| foundation-models-on-device | On-device model deployment, quantization, ONNX |
| pytorch-patterns | PyTorch training loops, data loading, distributed |
| regex-vs-llm-structured-text | When to use regex vs LLM for text extraction |
| ai-regression-testing | AI output regression testing, golden datasets |
| mle-workflow | Production ML engineering — data contracts, training, eval, deploy, monitor |
| agent-eval | Agent evaluation frameworks, pass@k metrics |

## Architecture

| Skill | Description |
|-------|-------------|
| api-design | REST/GraphQL API design, versioning, pagination |
| architecture-decision-records | ADR templates, decision logging |
| blueprint | System blueprint, component diagrams, data flow |
| mcp-server-patterns | MCP server implementation patterns |
| mcp-builder | Scaffold and harden MCP servers — transport, tools/resources/prompts, input validation, Kiro registration |
| codebase-onboarding | Codebase exploration, dependency mapping |
| agent-harness-construction | Agent harness design, steering, hooks, skills |

## Quality & Engineering

| Skill | Description |
|-------|-------------|
| continuous-learning-v2 | Continuous learning loops, feedback integration |
| strategic-compact | Context compaction strategies for long sessions |
| context-budget | Token budget management, context window optimization |
| agentic-engineering | Agentic coding patterns, tool use, planning |
| agentic-loops | Loop engineering for Kiro `/goal`, review loops, DAG delegation; evidence-based completion |
| ai-first-engineering | AI-first development workflows |
| enterprise-agent-ops | Enterprise agent operations, governance, monitoring |
| documentation-lookup | Documentation search and retrieval patterns |

## Workflow Skills

| Skill | Description |
|-------|-------------|
| verification-loop | Iterative verification and validation loops |
| git-workflow | Branching strategies, commit conventions, merge vs rebase, conflict resolution |
| eval-harness | Eval-driven development, pass@k metrics |
| coding-standards | Code quality enforcement, linting rules |
| iterative-retrieval | Multi-step information retrieval patterns |
| prompt-optimizer | Prompt engineering and optimization |
| security-review | Security audit checklist and review process |
| security-scan | Automated security scanning patterns |
| e2e-testing | End-to-end testing strategies and frameworks |

## Writing & Research

| Skill | Description |
|-------|-------------|
| article-writing | Technical article structure, drafting, editing |
| humanize-writing | Cut AI tells and raise real quality in web/long-form writing (English/general companion to humanize-korean) |
| content-engine | Content pipeline, scheduling, multi-platform |
| deep-research | Deep research methodology, source evaluation |
| search-first | Search-first approach, information gathering |
| market-research | Market analysis, competitive intelligence |
| crosspost | Cross-platform content distribution |
| investor-materials | Pitch decks, financial models, one-pagers |
| investor-outreach | Investor communication, follow-up sequences |

## Documents & Deliverables

| Skill | Description |
|-------|-------------|
| pdf-generation | Create/fill/extract PDFs — reportlab (data), WeasyPrint (HTML/CSS), pandoc+Typst (Markdown), pypdf/pdfplumber (read/forms) |
| pptx-generation | Native PowerPoint .pptx via python-pptx (or pptxgenjs); overflow + visual-QA gotchas encoded |
| docx-generation | Native Word .docx via python-docx / pandoc; DXA table widths, US Letter, styles |
| xlsx-generation | Excel .xlsx via openpyxl / XlsxWriter / pandas; live formulas, LibreOffice recalc, zero-error delivery |
| brand-guidelines | Apply brand colors, fonts, logo, and voice consistently across docs, decks, and web artifacts |

## Language-Specific Testing

| Skill | Description |
|-------|-------------|
| python-testing | pytest, fixtures, parametrize, coverage |
| golang-testing | Go testing, table-driven tests, benchmarks |
| rust-testing | Rust testing, property-based, integration |
| cpp-testing | C++ testing, Google Test, Catch2, sanitizers |
| kotlin-testing | Kotlin testing, MockK, Kotest |
| perl-testing | Perl testing, Test::More, Test2 |
| perl-security | Perl security, taint mode, input validation |

## Language-Specific Patterns

| Skill | Description |
|-------|-------------|
| python-patterns | Python idioms, decorators, context managers |
| golang-patterns | Go patterns, interfaces, error handling |
| rust-patterns | Rust ownership, lifetimes, trait patterns |
| perl-patterns | Perl idioms, regex, CPAN modules |
| cpp-coding-standards | C++ modern standards, RAII, smart pointers |
| java-coding-standards | Java conventions, streams, Optional patterns |

## Domain-Specific (Business)

| Skill | Description |
|-------|-------------|
| carrier-relationship-management | Carrier onboarding, rate management, SLA |
| customs-trade-compliance | Trade compliance, HS codes, duty calculation |
| energy-procurement | Energy sourcing, RFP, contract management |
| inventory-demand-planning | Demand forecasting, safety stock, reorder points |
| logistics-exception-management | Shipment exceptions, escalation, resolution |
| production-scheduling | Production planning, MRP, capacity scheduling |
| quality-nonconformance | NCR management, CAPA, root cause analysis |
| returns-reverse-logistics | Returns processing, refurbishment, disposition |

## Specialty

| Skill | Description |
|-------|-------------|
| obsidian-plugin-develop | Obsidian plugin best practices, i18n, TypeScript/Chromium, release checklist |
