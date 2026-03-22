# Saga

Distributed transactions spanning multiple services. Define compensating (rollback) logic for each step.

## Saga Orchestrator

```python
# sagas/order_saga.py
from dataclasses import dataclass, field
from enum import Enum


class SagaStepStatus(str, Enum):
    PENDING = "pending"
    COMPLETED = "completed"
    COMPENSATING = "compensating"
    COMPENSATED = "compensated"
    FAILED = "failed"


@dataclass
class SagaStep:
    name: str
    execute: Callable
    compensate: Callable
    status: SagaStepStatus = SagaStepStatus.PENDING


class OrderSaga:
    """Order Creation Saga: Reserve Inventory → Charge Payment → Confirm Order."""

    def __init__(
        self,
        inventory: InventoryService,
        payment: PaymentService,
        order: OrderService,
        notification: NotificationService,
    ):
        self.steps: list[SagaStep] = [
            SagaStep(
                name="reserve_inventory",
                execute=lambda ctx: inventory.reserve(ctx["items"]),
                compensate=lambda ctx: inventory.release(ctx["items"]),
            ),
            SagaStep(
                name="process_payment",
                execute=lambda ctx: payment.charge(
                    ctx["user_id"], ctx["total"]
                ),
                compensate=lambda ctx: payment.refund(ctx["payment_id"]),
            ),
            SagaStep(
                name="confirm_order",
                execute=lambda ctx: order.confirm(ctx["order_id"]),
                compensate=lambda ctx: order.cancel(ctx["order_id"]),
            ),
        ]

    async def execute(self, context: dict) -> dict:
        completed_steps: list[SagaStep] = []

        for step in self.steps:
            try:
                result = await step.execute(context)
                step.status = SagaStepStatus.COMPLETED
                completed_steps.append(step)

                # Merge result into context
                if isinstance(result, dict):
                    context.update(result)

            except Exception as e:
                logger.error(
                    "saga_step_failed",
                    step=step.name,
                    error=str(e),
                )
                # Execute compensating transactions (in reverse)
                await self._compensate(completed_steps, context)
                raise SagaFailedError(step.name, str(e))

        return context

    async def _compensate(
        self, completed: list[SagaStep], context: dict
    ) -> None:
        for step in reversed(completed):
            try:
                await step.compensate(context)
                step.status = SagaStepStatus.COMPENSATED
            except Exception:
                step.status = SagaStepStatus.FAILED
                logger.exception(
                    "saga_compensation_failed", step=step.name
                )
```

## Usage in Router

```python
@router.post("/orders/checkout", status_code=201)
async def checkout(
    data: CheckoutRequest,
    saga: OrderSaga = Depends(get_order_saga),
    current_user: User = Depends(get_current_user),
) -> OrderResponse:
    try:
        result = await saga.execute({
            "user_id": current_user.id,
            "items": data.items,
            "total": data.total,
            "order_id": data.order_id,
        })
        return OrderResponse(order_id=result["order_id"], status="confirmed")
    except SagaFailedError as e:
        raise HTTPException(
            status_code=409,
            detail=f"Checkout failed at step '{e.step}': {e.reason}",
        )
```
