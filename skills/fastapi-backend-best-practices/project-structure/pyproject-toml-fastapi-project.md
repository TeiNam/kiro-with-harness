## pyproject.toml (FastAPI Project)

```toml
[project]
name = "my-api"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "fastapi>=0.115.0",
    "uvicorn[standard]>=0.32.0",
    "pydantic>=2.10.0",
    "pydantic-settings>=2.6.0",
    "redis>=5.2.0",
    "httpx>=0.28.0",
    "structlog>=24.4.0",
    "python-jose[cryptography]>=3.3.0",
    "passlib[bcrypt]>=1.7.4",
    # Add DB drivers tailored to the project
    # "sqlalchemy[asyncio]>=2.0.36", "asyncpg>=0.30.0",  # PostgreSQL
    # "motor>=3.6.0",                                     # MongoDB
    # "aiobotocore>=2.15.0",                               # DynamoDB
]

[project.optional-dependencies]
dev = [
    "pytest>=8.3.0",
    "pytest-asyncio>=0.24.0",
    "pytest-cov>=6.0.0",
    "httpx>=0.28.0",
    "ruff>=0.8.0",
    "mypy>=1.13.0",
    "pre-commit>=4.0.0",
    "factory-boy>=3.3.0",
]
```
