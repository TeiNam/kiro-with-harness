## Rate Limiting

```python
# Rate limiting typically using Redis
# shared/rate_limit.py
import time
from fastapi import HTTPException, status
from redis.asyncio import Redis

async def check_rate_limit(redis: Redis, user_id: int, limit: int = 100, window: int = 60):
    """
    Sliding window rate limit implementation.
    Limits the user to 'limit' requests per 'window' seconds.
    """
    key = f"rate_limit:{user_id}"
    now = time.time()
    
    async with redis.pipeline(transaction=True) as pipe:
        # Remove old requests
        pipe.zremrangebyscore(key, 0, now - window)
        # Add current request
        pipe.zadd(key, {str(now): now})
        # Count requests in window
        pipe.zcard(key)
        # Set expire so it cleans up when inactive
        pipe.expire(key, window)
        
        _, _, count, _ = await pipe.execute()
        
    if count > limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded"
        )
```
