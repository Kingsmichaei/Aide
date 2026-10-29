import secrets
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """App settings, read from environment variables (and `.env` if present)."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    # SQLite file in backend/ for local development; Render sets a Postgres URL.
    database_url: str = "sqlite:///./aide.db"
    llm_provider: str = ""
    llm_api_key: str = ""
    llm_model: str = "gemini-3.8-flash"
    paypal_client_id: str = ""
    paypal_client_secret: str = ""
    paypal_environment: str = "SANDBOX"
    channel3_api_key: str = ""
    kernel_api_key: str = ""
    render_api_key: str = ""
    ag_grid_license_key: str = ""
    bryntum_license: str = ""
    frontend_url: str = "http://localhost:5173"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    # Signs the session cookie. Set it in production; the random default means
    # everyone is signed out whenever the server restarts.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(32))
    # The app is served from one origin (/api is proxied), so Lax works. Secure
    # must be on in production (https) and off for http://localhost.
    # Fallback if a proxy ever drops the cookie: point VITE_API_URL at the API,
    # set COOKIE_SAMESITE=none and COOKIE_SECURE=true. Safari blocks such
    # cross-site cookies, so prefer fixing the proxy.
    cookie_secure: bool = False
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    @field_validator("database_url")
    @classmethod
    def use_psycopg_driver(cls, value: str) -> str:
        # Render gives `postgres://` or `postgresql://`; SQLAlchemy needs the psycopg 3 driver name.
        for prefix in ("postgres://", "postgresql://"):
            if value.startswith(prefix):
                return "postgresql+psycopg://" + value.removeprefix(prefix)
        return value

    @field_validator("secret_key")
    @classmethod
    def random_if_blank(cls, value: str) -> str:
        # `SECRET_KEY=` in .env means "not set", never an empty signing key.
        return value or secrets.token_urlsafe(32)

    @field_validator("paypal_environment")
    @classmethod
    def sandbox_only(cls, value: str) -> str:
        if value.upper() != "SANDBOX":
            raise ValueError("Aide only runs against the PayPal sandbox")
        return value.upper()


@lru_cache
def get_settings() -> Settings:
    return Settings()
