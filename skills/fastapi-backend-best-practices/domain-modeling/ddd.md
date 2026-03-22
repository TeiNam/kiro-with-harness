# DDD

Domains with many complex business rules. Aggregate Roots ensure consistency.

## Aggregate Root

```python
# domain/order_aggregate.py
from datetime import datetime
from enum import Enum


class OrderStatus(str, Enum):
    DRAFT = "draft"
    PLACED = "placed"
    PAID = "paid"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class OrderAggregate:
    """Order Aggregate Root — All state changes go through this class."""

    def __init__(
        self,
        id: int,
        user_id: int,
        status: OrderStatus = OrderStatus.DRAFT,
    ):
        self.id = id
        self.user_id = user_id
        self.status = status
        self._items: list[OrderItem] = []
        self._events: list[DomainEvent] = []

    @property
    def total(self) -> int:
        return sum(item.subtotal for item in self._items)

    @property
    def events(self) -> list[DomainEvent]:
        return list(self._events)

    def clear_events(self) -> None:
        self._events.clear()

    # ── Business Rule Methods ──

    def add_item(self, product_id: int, quantity: int, price: int) -> None:
        if self.status != OrderStatus.DRAFT:
            raise OrderInvariantError("Cannot add items to a confirmed order.")
        if quantity <= 0:
            raise OrderInvariantError("Quantity must be greater than 0.")

        existing = next(
            (i for i in self._items if i.product_id == product_id), None
        )
        if existing:
            existing.quantity += quantity
        else:
            self._items.append(OrderItem(product_id, quantity, price))

    def place(self) -> None:
        if self.status != OrderStatus.DRAFT:
            raise OrderInvariantError("Orders can only be placed from the DRAFT state.")
        if not self._items:
            raise OrderInvariantError("Orders must have at least one item.")

        self.status = OrderStatus.PLACED
        self._events.append(
            OrderPlacedEvent(order_id=self.id, user_id=self.user_id, total=self.total)
        )

    def pay(self, payment_id: str) -> None:
        if self.status != OrderStatus.PLACED:
            raise OrderInvariantError("Payment is only possible from the PLACED state.")

        self.status = OrderStatus.PAID
        self._events.append(
            PaymentCompletedEvent(
                order_id=self.id, payment_id=payment_id, amount=self.total
            )
        )

    def cancel(self, reason: str) -> None:
        if self.status in (OrderStatus.SHIPPED, OrderStatus.DELIVERED):
            raise OrderInvariantError("Orders cannot be cancelled after shipping.")

        self.status = OrderStatus.CANCELLED
        self._events.append(
            OrderCancelledEvent(order_id=self.id, reason=reason)
        )


class OrderItem:
    def __init__(self, product_id: int, quantity: int, price: int):
        self.product_id = product_id
        self.quantity = quantity
        self.price = price

    @property
    def subtotal(self) -> int:
        return self.price * self.quantity
```

## Aggregate Repository Protocol

```python
# repositories/order_aggregate_repo.py
from typing import Protocol


class OrderAggregateRepository(Protocol):
    """Interface for loading/saving per Aggregate.
    Implementations provided by DB skills (SQL, Document DB, Event Store, etc.).
    Mapping between Aggregate ↔ Persistence is handled within the implementation.
    """

    async def get_by_id(self, order_id: int) -> OrderAggregate | None: ...
    async def save(self, aggregate: OrderAggregate) -> None: ...
    async def delete(self, order_id: int) -> bool: ...
```

## Application Service (DDD)

```python
# services/order_app_service.py
class OrderApplicationService:
    """Use case orchestration. Load Aggregate → Call business method → Save.
    Depends only on Repository Protocol, thus agnostic to DB implementation.
    """

    def __init__(
        self,
        repo: OrderAggregateRepository,
        event_bus: EventBus,
    ):
        self.repo = repo
        self.event_bus = event_bus

    async def place_order(self, order_id: int) -> None:
        order = await self.repo.get_by_id(order_id)
        if not order:
            raise OrderNotFoundError(order_id)

        order.place()  # Execute business logic

        await self.repo.save(order)

        # Publish domain events
        for event in order.events:
            await self.event_bus.publish(event)
        order.clear_events()
```
