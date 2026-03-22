## Streaming Responses

### SSE (Server-Sent Events)

```python
from fastapi.responses import StreamingResponse


async def event_generator(user_id: int) -> AsyncGenerator[str, None]:
    """Real-time event stream."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"events:{user_id}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"].decode()
                yield f"data: {data}\n\n"
    finally:
        await pubsub.unsubscribe(f"events:{user_id}")


@router.get("/events/stream")
async def stream_events(
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    return StreamingResponse(
        event_generator(current_user.id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        },
    )
```

### Large File Streaming

```python
async def stream_large_file(path: str) -> AsyncGenerator[bytes, None]:
    """Memory-efficient file streaming."""
    async with aiofiles.open(path, "rb") as f:
        while chunk := await f.read(64 * 1024):  # 64KB
            yield chunk


@router.get("/exports/{file_id}")
async def download_export(file_id: str) -> StreamingResponse:
    path = await get_export_path(file_id)
    return StreamingResponse(
        stream_large_file(path),
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename={file_id}.csv"},
    )
```

---
