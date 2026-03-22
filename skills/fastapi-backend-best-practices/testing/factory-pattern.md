## Factory Pattern

```python
# tests/factories.py
import factory
from factory import fuzzy

from src.users.schemas import UserResponse
from src.orders.schemas import OrderResponse


class UserFactory(factory.Factory):
    """Pydantic schema-based factory — DB model independent."""

    class Meta:
        model = UserResponse

    id = factory.Sequence(lambda n: n + 1)
    name = factory.Faker("name")
    email = factory.LazyAttribute(lambda o: f"user{o.id}@test.com")
    is_active = True


class OrderFactory(factory.Factory):
    class Meta:
        model = OrderResponse

    id = factory.Sequence(lambda n: n + 1)
    user_id = factory.LazyAttribute(lambda o: UserFactory().id)
    status = "draft"
    total = fuzzy.FuzzyInteger(1000, 100000)


# Usage
user = UserFactory(name="Custom Name")
orders = OrderFactory.create_batch(5, user_id=user.id)
```

---
