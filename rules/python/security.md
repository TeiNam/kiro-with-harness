---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

> This file extends [common/security.md](../common/security.md) with Python-specific content.

## SQL Injection

Always use parameterized queries. Never format SQL strings:

```python
# WRONG: SQL injection risk
cursor.execute(f"SELECT * FROM users WHERE id = '{user_id}'")

# CORRECT: Parameterized query
cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))

# CORRECT: ORM (SQLAlchemy)
session.query(User).filter(User.id == user_id).first()
```

## Input Validation

Validate all external input at the boundary. Use Pydantic for API inputs:

```python
from pydantic import BaseModel, Field, EmailStr

class CreateUserRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    age: int = Field(ge=0, le=150)
```

Sanitize file paths to prevent path traversal:

```python
import os

def safe_read(base_dir: str, filename: str) -> str:
    resolved = os.path.realpath(os.path.join(base_dir, filename))
    if not resolved.startswith(os.path.realpath(base_dir)):
        raise ValueError("Path traversal detected")
    with open(resolved) as f:
        return f.read()
```

## Secrets Management

- Never hardcode secrets in source code
- Use environment variables or a secrets manager
- Use `python-dotenv` for local development only; never commit `.env` files

```python
import os

DATABASE_URL = os.environ["DATABASE_URL"]  # Fail loud if missing
```

## Dependency Security

- Pin dependencies in `requirements.txt` or `pyproject.toml`
- Run `pip audit` or `safety check` in CI to detect known vulnerabilities
- Keep dependencies updated; use Dependabot or Renovate

## Deserialization

Never use `pickle` or `eval()` on untrusted data:

```python
# WRONG: Arbitrary code execution
data = pickle.loads(untrusted_bytes)
result = eval(user_input)

# CORRECT: Use safe formats
data = json.loads(untrusted_string)
```

## Authentication

- Use `bcrypt` or `argon2` for password hashing (never MD5/SHA for passwords)
- Use constant-time comparison for tokens: `hmac.compare_digest(a, b)`
- Validate JWTs with signature verification and expiry checks

## Subprocess Safety

Avoid `shell=True`. Pass arguments as a list:

```python
import subprocess

# WRONG: Shell injection risk
subprocess.run(f"ls {user_input}", shell=True)

# CORRECT: No shell interpretation
subprocess.run(["ls", user_input], check=True)
```

## Security Scanning

```bash
bandit -r src/
pip audit
```

## Logging

Never log secrets, tokens, or passwords.
