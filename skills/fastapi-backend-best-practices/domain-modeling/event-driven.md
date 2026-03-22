# Event-Driven

Loose coupling between services. Emits events and subscribers react to them.

## Event Definition

```python
# domain/events.py
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID, uuid4


class DomainEvent(BaseModel):
    """Base for all domain events."""
    event_id: UUID = Field(default_factory=uuid4)
    occurred_at: datetime = Field(default_factory=datetime.utcnow)
    event_type: str


class OrderPlacedEvent(DomainEvent):
    event_type: str = "order.placed"
    order_id: int
    user_id: int
    total: int


class PaymentCompletedEvent(DomainEvent):
    event_type: str = "payment.completed"
    order_id: int
    payment_id: str
    amount: int


class OrderShippedEvent(DomainEvent):
    event_type: str = "order.shipped"
    order_id: int
    tracking_number: str
```

## In-Memory Event Bus

```python
# shared/event_bus.py
from collections import defaultdict
from collections.abc import Callable, Coroutine
from typing import Any

import asyncio


EventHandler = Callable[..., Coroutine[Any, Any, None]]


class EventBus:
    """In-memory Pub/Sub. Intended for single processes."""

    def __init__(self):
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        handlers = self._handlers.get(event.event_type, [])
        if handlers:
            await asyncio.gather(
                *[h(event) for h in handlers],
                return_exceptions=True,
            )


# Subscriber Registration
event_bus = EventBus()

async def on_order_placed(event: OrderPlacedEvent) -> None:
    await notification_service.send_order_confirmation(event.user_id, event.order_id)

async def on_order_placed_analytics(event: OrderPlacedEvent) -> None:
    await analytics_service.track_order(event.order_id, event.total)

event_bus.subscribe("order.placed", on_order_placed)
event_bus.subscribe("order.placed", on_order_placed_analytics)
```

## Redis Event Bus (Multi-Process)

```python
# shared/redis_event_bus.py
import json
from redis.asyncio import Redis
import logging

logger = logging.getLogger(__name__)


class RedisEventBus:
    """Redis Pub/Sub based. Supports multi-instance."""

    def __init__(self, redis: Redis):
        self.redis = redis
        self._handlers: dict[str, list[EventHandler]] = defaultdict(list)

    def subscribe(self, event_type: str, handler: EventHandler) -> None:
        self._handlers[event_type].append(handler)

    async def publish(self, event: DomainEvent) -> None:
        await self.redis.publish(
            f"events:{event.event_type}",
            event.model_dump_json(),
        )

    async def listen(self) -> None:
        pubsub = self.redis.pubsub()
        channels = [f"events:{et}" for et in self._handlers]
        await pubsub.subscribe(*channels)

        async for message in pubsub.listen():
            if message["type"] != "message":
                continue
            channel = message["channel"].decode()
            event_type = channel.split(":", 1)[1]
            data = json.loads(message["data"])

            for handler in self._handlers.get(event_type, []):
                try:
                    await handler(data)
                except Exception:
                    logger.exception("event_handler_error", event_type=event_type)
```
