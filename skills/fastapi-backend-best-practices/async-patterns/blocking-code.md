## Handling Blocking Code

```python
import asyncio
from concurrent.futures import ProcessPoolExecutor
from functools import partial

# Global process pool
_process_pool = ProcessPoolExecutor(max_workers=4)


async def run_in_process(fn, *args, **kwargs):
    """Execute CPU-bound tasks in process pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _process_pool,
        partial(fn, *args, **kwargs),
    )


# Example: Image resize
def resize_image_sync(data: bytes, width: int, height: int) -> bytes:
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    img = img.resize((width, height))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@router.post("/images/resize")
async def resize_image(file: UploadFile) -> Response:
    data = await file.read()
    resized = await run_in_process(resize_image_sync, data, 800, 600)
    return Response(content=resized, media_type="image/png")


# Simple blocking → asyncio.to_thread (Python 3.9+)
async def read_legacy_config() -> dict:
    return await asyncio.to_thread(read_config_from_disk, "/etc/app.conf")
```

---
