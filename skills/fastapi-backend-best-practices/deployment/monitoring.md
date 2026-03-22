## Monitoring

### Request Metrics Middleware

```python
# src/shared/metrics.py
import time
from collections import defaultdict
from dataclasses import dataclass, field
from fastapi import Request


@dataclass
class RequestMetrics:
    total_requests: int = 0
    total_errors: int = 0
    response_times: list[float] = field(default_factory=list)
    status_counts: dict[int, int] = field(default_factory=lambda: defaultdict(int))

    @property
    def avg_response_time_ms(self) -> float:
        if not self.response_times:
            return 0
        return round(sum(self.response_times) / len(self.response_times), 2)

    @property
    def p95_response_time_ms(self) -> float:
        if not self.response_times:
            return 0
        sorted_times = sorted(self.response_times)
        idx = int(len(sorted_times) * 0.95)
        return round(sorted_times[idx], 2)


metrics = RequestMetrics()


class MetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000

        metrics.total_requests += 1
        metrics.response_times.append(elapsed_ms)
        metrics.status_counts[response.status_code] += 1

        if response.status_code >= 500:
            metrics.total_errors += 1

        # Keep only the latest 10000
        if len(metrics.response_times) > 10000:
            metrics.response_times = metrics.response_times[-10000:]

        return response


# Metrics endpoint
@router.get("/metrics")
async def get_metrics() -> dict:
    return {
        "total_requests": metrics.total_requests,
        "total_errors": metrics.total_errors,
        "avg_response_time_ms": metrics.avg_response_time_ms,
        "p95_response_time_ms": metrics.p95_response_time_ms,
        "status_counts": dict(metrics.status_counts),
    }
```

---
