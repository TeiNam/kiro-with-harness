## Docker Build

### Multi-stage Dockerfile

```dockerfile
# ── Build Stage ──
FROM python:3.12-slim AS builder

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy dependencies first (cache layer)
COPY pyproject.toml uv.lock ./

# Install only production dependencies
RUN uv sync --frozen --no-dev --no-editable

# ── Runtime Stage ──
FROM python:3.12-slim

WORKDIR /app

# Minimum system packages
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r app && useradd -r -g app app

# Copy virtual environment
COPY --from=builder /app/.venv /app/.venv

# Copy source code
COPY src ./src
# If there is a DB migration tool, copy it (depends on DB skill)
# COPY alembic ./alembic
# COPY alembic.ini ./

# Environment variable configuration
ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Change ownership
RUN chown -R app:app /app
USER app

EXPOSE 8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "src.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4"]
```

### .dockerignore

```
.git
.venv
__pycache__
*.pyc
.env
.env.local
tests/
docs/
*.md
.ruff_cache
.mypy_cache
.pytest_cache
```

---
