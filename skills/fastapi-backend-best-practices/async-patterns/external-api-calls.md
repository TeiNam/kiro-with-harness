## External API Calls

### Reusing httpx Client

```python
# src/shared/http_client.py
from contextlib import asynccontextmanager

import httpx


class ExternalAPIClient:
    """Reusable HTTP client (Connection Pooling)."""

    def __init__(self, base_url: str, timeout: float = 30.0):
        self._client = httpx.AsyncClient(
            base_url=base_url,
            timeout=timeout,
            limits=httpx.Limits(
                max_connections=100,
                max_keepalive_connections=20,
            ),
        )

    async def get(self, path: str, **kwargs) -> httpx.Response:
        response = await self._client.get(path, **kwargs)
        response.raise_for_status()
        return response

    async def post(self, path: str, **kwargs) -> httpx.Response:
        response = await self._client.post(path, **kwargs)
        response.raise_for_status()
        return response

    async def close(self) -> None:
        await self._client.aclose()
```

### Retry Pattern

```python
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(httpx.HTTPStatusError),
)
async def call_payment_api(payment: PaymentRequest) -> PaymentResult:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.payment.com/charge",
            json=payment.model_dump(),
        )
        response.raise_for_status()
        return PaymentResult.model_validate(response.json())
```

---
