# CQRS

Separate Read (Query) and Write (Command) operations completely.
Suitable for systems where reads vastly outnumber writes or the models significantly differ.

## Command (Write)

```python
# commands/schemas.py
from pydantic import BaseModel


class PlaceOrderCommand(BaseModel):
    """Order creation command."""
    user_id: int
    items: list[OrderItemInput]
    shipping_address: str
    payment_method: str


class OrderItemInput(BaseModel):
    product_id: int
    quantity: int = Field(ge=1)


# commands/handler.py
class OrderCommandHandler:
    def __init__(
        self,
        order_repo: OrderRepository,
        inventory_service: InventoryService,
        event_bus: EventBus,
    ):
        self.order_repo = order_repo
        self.inventory = inventory_service
        self.event_bus = event_bus

    async def place_order(self, cmd: PlaceOrderCommand) -> int:
        # 1. Check inventory
        await self.inventory.reserve(cmd.items)

        # 2. Create order
        order = Order(
            user_id=cmd.user_id,
            status=OrderStatus.PENDING,
            shipping_address=cmd.shipping_address,
        )
        for item in cmd.items:
            order.add_item(item.product_id, item.quantity)

        await self.order_repo.save(order)

        # 3. Publish event
        await self.event_bus.publish(
            OrderPlacedEvent(
                order_id=order.id,
                user_id=cmd.user_id,
                total=order.total,
            )
        )

        return order.id
```

## Query (Read)

```python
# queries/schemas.py
class OrderSummaryView(BaseModel):
    """Read-only view — Queries DB views, denormalized tables, or caches."""
    model_config = ConfigDict(from_attributes=True)

    order_id: int
    user_name: str
    item_count: int
    total: int
    status: str
    ordered_at: datetime


class OrderDetailView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    order_id: int
    user: UserBrief
    items: list[OrderItemView]
    total: int
    status: str
    shipping_address: str
    tracking_number: str | None


# queries/protocols.py
class OrderQueryRepository(Protocol):
    """Read-only repository. Can use read replicas or separate data sources."""

    async def get_order_summaries(
        self,
        user_id: int,
        *,
        status: str | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[OrderSummaryView]: ...

    async def get_order_detail(self, order_id: int) -> OrderDetailView | None: ...


# queries/handler.py
class OrderQueryHandler:
    """Read-only handler."""

    def __init__(self, repo: OrderQueryRepository):
        self.repo = repo

    async def get_order_summary_list(
        self,
        user_id: int,
        *,
        status: str | None = None,
        offset: int = 0,
        limit: int = 20,
    ) -> list[OrderSummaryView]:
        return await self.repo.get_order_summaries(
            user_id, status=status, offset=offset, limit=limit
        )
```

## Router (Command/Query Separation)

```python
# router.py
@router.post("/orders", status_code=201)
async def place_order(
    cmd: PlaceOrderCommand,
    handler: OrderCommandHandler = Depends(get_command_handler),
) -> dict[str, int]:
    order_id = await handler.place_order(cmd)
    return {"order_id": order_id}


@router.get("/orders")
async def list_orders(
    status: str | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    handler: OrderQueryHandler = Depends(get_query_handler),
) -> list[OrderSummaryView]:
    return await handler.get_order_summary_list(
        current_user.id, status=status, offset=offset, limit=limit
    )
```
