## API Versioning

### URL Prefix Approach (Recommended)

```python
# src/main.py
from fastapi import APIRouter

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(users_v1.router)
v1_router.include_router(orders_v1.router)

v2_router = APIRouter(prefix="/api/v2")
v2_router.include_router(users_v2.router)  # New schema
v2_router.include_router(orders_v1.router)  # Reuse v1 if no changes

app.include_router(v1_router)
app.include_router(v2_router)
```

### Versioning Strategy
- **URL prefix**: `/api/v1/users` — Clear and cache-friendly
- **Header**: `Accept: application/vnd.api+json;version=2` — Clean URLs
- **Query**: `?version=2` — Simple but less cache-friendly

**Principle: Do not increment the version for backward-compatible changes.**
Adding fields or optional parameters is backward-compatible. Removing fields or changing types requires a version bump.

---
