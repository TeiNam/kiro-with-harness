## Input Validation & Defense

### Automatic Validation with Pydantic

```python
from pydantic import BaseModel, Field, field_validator

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    # Defense against massive payloads
    password: str = Field(..., min_length=8, max_length=100)
    email: str = Field(..., pattern=r"^\S+@\S+\.\S+$")

    @field_validator("password")
    @classmethod
    def validate_password_complexity(cls, v: str) -> str:
        if not any(char.isupper() for char in v):
            raise ValueError("Password must contain at least one uppercase letter.")
        if not any(char.isdigit() for char in v):
            raise ValueError("Password must contain at least one number.")
        return v
```

### Preventing Injection Attacks
1. **Never** concatenate user input into database queries directly.
2. **Always** use your ORM or Database Driver's parameter binding logic. Pydantic handles validation, but parameter binding inherently prevents SQL Injection.
