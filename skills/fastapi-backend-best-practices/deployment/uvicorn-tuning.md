## Uvicorn Tuning

### Production Configuration

```bash
# Basic production execution
uvicorn src.main:app \
    --host 0.0.0.0 \
    --port 8000 \
    --workers 4 \
    --loop uvloop \
    --http httptools \
    --log-level info \
    --access-log

# Worker count guide: CPU cores × 2 + 1
# 4 cores → 9 workers (requires memory check)
```

### Programmatic Configuration

```python
# src/server.py (When executing directly)
import multiprocessing

import uvicorn


def get_workers() -> int:
    """Calculate worker count based on CPU."""
    return min(multiprocessing.cpu_count() * 2 + 1, 9)


if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        workers=get_workers(),
        loop="uvloop",
        http="httptools",
        log_level="info",
        access_log=True,
        reload=False,  # Never True in production
    )
```

### Development Server

```bash
# During development (hot reload)
uvicorn src.main:app --reload --port 8000
```

---
