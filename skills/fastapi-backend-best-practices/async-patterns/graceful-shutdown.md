## Graceful Shutdown

```python
import signal


class GracefulShutdown:
    """Finish pending tasks before terminating."""

    def __init__(self):
        self._active_tasks: set[asyncio.Task] = set()
        self._shutting_down = False

    @property
    def is_shutting_down(self) -> bool:
        return self._shutting_down

    def track(self, task: asyncio.Task) -> None:
        self._active_tasks.add(task)
        task.add_done_callback(self._active_tasks.discard)

    async def shutdown(self, timeout: float = 30.0) -> None:
        self._shutting_down = True
        logger.info("graceful_shutdown_start", active_tasks=len(self._active_tasks))

        if self._active_tasks:
            done, pending = await asyncio.wait(
                self._active_tasks, timeout=timeout
            )
            for task in pending:
                task.cancel()

        logger.info("graceful_shutdown_complete")


# Usage in Lifespan
shutdown_handler = GracefulShutdown()
```
