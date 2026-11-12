"""Load environment-owned database and authentication configuration."""
from functools import lru_cache
from pathlib import Path
from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Keep runtime secrets outside source and validate bounded pool settings."""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[2] / ".env", extra="ignore"
    )
    database_url: str
    db_name: str
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_minutes: int = Field(default=60, ge=1, le=10080)
    cors_origins: str = ""
    db_pool_size: int = Field(default=5, ge=1, le=50)
    db_max_overflow: int = Field(default=5, ge=0, le=50)
    seed_on_startup: bool = False
    seed_username: str = "demo"
    seed_password: SecretStr = SecretStr("dev-demo-change-me")

    @field_validator("db_name")
    @classmethod
    def validate_db_name(cls, value: str) -> str:
        """Reject empty or maintenance database names before provisioning."""
        if not value or value in {"postgres", "template0", "template1"} or len(value.encode()) > 63:
            raise ValueError("Use a distinct application database name")
        return value

    @property
    def allowed_origins(self) -> list[str]:
        """Split explicit origins without enabling wildcard credentials."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Share validated settings without opening a database at import time."""
    return Settings()
