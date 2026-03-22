## pydantic-settings Configuration

```python
# src/config.py
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # App
    app_name: str = "My API"
    debug: bool = False
    environment: str = "production"  # development | staging | production

    # Database (Configuration key may vary by DB skill)
    database_url: str = Field(
        description="DB Connection URL (configure based on mounted DB skill)"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Auth
    secret_key: str
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]

    @property
    def is_development(self) -> bool:
        return self.environment == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
```
