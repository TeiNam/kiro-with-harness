## Project Layout

```
my-api/
├── src/
│   ├── __init__.py
│   ├── main.py                # Create FastAPI app, lifespan
│   ├── config.py              # pydantic-settings configuration
│   ├── dependencies.py        # Common DI (Auth, Cache)
│   │
│   ├── domain/                # Domain models (pure business logic)
│   │   ├── __init__.py
│   │   ├── schemas.py         # Pydantic schemas
│   │   ├── exceptions.py      # Domain exceptions
│   │   ├── protocols.py       # Repository Protocol definitions
│   │   └── events.py          # Domain events (if necessary)
│   │
│   ├── users/                 # Feature module (Vertical Slice)
│   │   ├── __init__.py
│   │   ├── router.py          # API endpoints
│   │   ├── service.py         # Business logic
│   │   ├── repository.py      # Repository implementation (refer to DB skill)
│   │   ├── schemas.py         # Module-specific schemas
│   │   └── dependencies.py    # Module-specific DI
│   │
│   ├── orders/                # Another feature module
│   │   ├── ...
│   │
│   ├── shared/                # Shared infrastructure
│   │   ├── __init__.py
│   │   ├── cache.py           # Redis client
│   │   ├── middleware.py      # Custom middleware
│   │   └── pagination.py      # Pagination utilities
│   │
│   ├── infra/                 # Infrastructure implementations (depends on DB skill)
│   │   ├── __init__.py
│   │   └── database.py        # DB connection, session factory
│   │
│   └── core/                  # Core infrastructure
│       ├── __init__.py
│       ├── security.py        # JWT, authentication
│       └── logging.py         # structlog configuration
│
├── tests/
│   ├── conftest.py            # Common fixtures
│   ├── users/
│   │   ├── test_router.py
│   │   └── test_service.py
│   └── orders/
│
├── pyproject.toml
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
