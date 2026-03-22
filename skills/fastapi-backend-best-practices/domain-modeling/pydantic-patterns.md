# Pydantic Common Patterns

## Base Schema Inheritance Structure

```python
from pydantic import BaseModel, ConfigDict
from datetime import datetime


class BaseSchema(BaseModel):
    """Base for all schemas."""
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
    )


class TimestampMixin(BaseModel):
    created_at: datetime
    updated_at: datetime


class PaginatedResponse[T](BaseModel):
    items: list[T]
    total: int
    offset: int
    limit: int

    @property
    def has_next(self) -> bool:
        return self.offset + self.limit < self.total
```

## Discriminated Union (Polymorphism)

```python
from typing import Annotated, Literal
from pydantic import BaseModel, Discriminator, Tag


class EmailNotification(BaseModel):
    type: Literal["email"] = "email"
    to: str
    subject: str
    body: str


class SlackNotification(BaseModel):
    type: Literal["slack"] = "slack"
    channel: str
    message: str


class WebhookNotification(BaseModel):
    type: Literal["webhook"] = "webhook"
    url: str
    payload: dict


Notification = Annotated[
    EmailNotification | SlackNotification | WebhookNotification,
    Discriminator("type"),
]


# Usage
class NotificationRequest(BaseModel):
    notifications: list[Notification]
```

## Custom Validator

```python
from pydantic import BaseModel, field_validator, model_validator


class DateRangeFilter(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_range(self) -> "DateRangeFilter":
        if self.start_date > self.end_date:
            raise ValueError("start_date must be before end_date.")
        if (self.end_date - self.start_date).days > 365:
            raise ValueError("Query range cannot exceed 1 year.")
        return self


class MoneyAmount(BaseModel):
    amount: int
    currency: str = "KRW"

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        allowed = {"KRW", "USD", "EUR", "JPY"}
        if v not in allowed:
            raise ValueError(f"Unsupported currency: {v}. Allowed: {allowed}")
        return v
```

## Computed Field

```python
from pydantic import computed_field


class OrderResponse(BaseSchema, TimestampMixin):
    id: int
    items: list[OrderItemResponse]
    status: str

    @computed_field
    @property
    def total(self) -> int:
        return sum(item.price * item.quantity for item in self.items)

    @computed_field
    @property
    def item_count(self) -> int:
        return len(self.items)
```
