from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (and `.env` if present)."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "postgresql+psycopg://aide:aide@localhost:5432/aide"
    llm_provider: str = ""
    llm_api_key: str = ""
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_environment: str = "SANDBOX"
    channel3_api_key: str = ""
    kernel_api_key: str = ""
    render_api_key: str = ""
    frontend_url: str = "http://localhost:5173"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Render gives `postgres://` or `postgresql://`; SQLAlchemy needs the psycopg 3 driver name.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("paypal_environment")
    @classmethod
    def sandbox_only(cls, value: str) -> str:
        if value.upper() != "SANDBOX":
            raise ValueError("Aide only runs against the PayPal sandbox")
        return value.upper()


@lru_cache
def get_settings() -> Settings:
    return Settings()
