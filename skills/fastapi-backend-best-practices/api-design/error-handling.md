## Error Handling

### Domain Exception Hierarchy

```python
# domain/exceptions.py
class AppError(Exception):
    """Base application error."""
    def __init__(self, message: str, code: str = "APP_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class NotFoundError(AppError):
    def __init__(self, entity: str, identifier: str | int):
        super().__init__(
            message=f"{entity} not found: {identifier}",
            code="NOT_FOUND",
        )


class ConflictError(AppError):
    def __init__(self, message: str):
        super().__init__(message=message, code="CONFLICT")


class ValidationError(AppError):
    def __init__(self, message: str):
        super().__init__(message=message, code="VALIDATION_ERROR")


class AuthorizationError(AppError):
    def __init__(self, message: str = "Permission denied"):
        super().__init__(message=message, code="FORBIDDEN")
```

### Global Exception Handlers

```python
# shared/error_handlers.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ErrorResponse(BaseModel):
    code: str
    message: str
    detail: dict | None = None


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        return JSONResponse(
            status_code=404,
            content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        )

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError):
        return JSONResponse(
            status_code=409,
            content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        )

    @app.exception_handler(ValidationError)
    async def validation_handler(request: Request, exc: ValidationError):
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        )

    @app.exception_handler(AuthorizationError)
    async def auth_handler(request: Request, exc: AuthorizationError):
        return JSONResponse(
            status_code=403,
            content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
        )

    @app.exception_handler(Exception)
    async def unhandled_handler(request: Request, exc: Exception):
        logger.exception("unhandled_error", path=request.url.path)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred",
            ).model_dump(),
        )
```

---
