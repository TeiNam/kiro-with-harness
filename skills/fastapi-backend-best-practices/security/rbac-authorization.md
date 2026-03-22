## RBAC Authorization

```python
# src/dependencies.py
from enum import Enum
from fastapi import Depends, HTTPException, status

class Role(str, Enum):
    ADMIN = "admin"
    USER = "user"

def require_roles(allowed_roles: list[Role]):
    """Dependency to check user role permissions."""
    def role_checker(current_user: dict = Depends(get_current_user)):
        # Assuming current_user has a 'role' field
        user_role = current_user.get("role", Role.USER)
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not enough permissions"
            )
        return current_user
    return role_checker

# Usage in Router
# @router.delete("/users/{user_id}")
# async def delete_user(
#     user_id: int, 
#     current_user: dict = Depends(require_roles([Role.ADMIN]))
# ):
#     ...
```
