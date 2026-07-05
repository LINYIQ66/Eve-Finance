"""Application settings loaded from environment variables."""
import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/eve_finance"

    # JWT
    jwt_secret: str = "eve-finance-dev-secret-change-in-production-2024"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # CORS
    cors_origins: list[str] = ["*"]

    # App
    app_name: str = "EVE Finance API"
    app_version: str = "1.0.0"

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
