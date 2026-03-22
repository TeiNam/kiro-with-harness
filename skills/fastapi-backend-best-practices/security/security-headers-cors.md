## Security Headers & CORS

```python
# src/shared/middleware.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Any, Awaitable, Callable
from starlette.requests import Request
from starlette.responses import Response


async def security_headers_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    """Add standard security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


def register_middleware(app: FastAPI, settings: Any) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    app.middleware("http")(security_headers_middleware)

### Security Checklist
- [x] Password bcrypt hashing
- [x] JWT expiration time logic
- [x] CORS allowed_origins configuration
- [x] Security headers
- [x] Require HTTPS in production
```
