## OAuth2 + Password Hashing

```python
# src/core/security.py
from passlib.context import CryptContext
from fastapi.security import OAuth2PasswordBearer

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


# src/dependencies.py
from fastapi import Depends, HTTPException, status
from src.core.security import oauth2_scheme, decode_access_token

async def get_current_user(token: str = Depends(oauth2_scheme)):
    """Dependency used in endpoints requiring authentication."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
        
    # Implement actual DB lookup here
    # user = await user_repo.get_by_id(user_id)
    # if user is None:
    #     raise credentials_exception
        
    return {"id": user_id} # Stub, return actual user model
```
