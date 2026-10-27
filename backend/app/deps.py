"""Shared FastAPI dependencies for sponsor clients. Tests override these."""

from functools import lru_cache

from app.config import get_settings
from app.services.channel3 import Channel3Client
from app.services.paypal import PayPalClient


@lru_cache
def get_channel3() -> Channel3Client:
    return Channel3Client(get_settings().channel3_api_key)


@lru_cache
def get_paypal() -> PayPalClient:
    settings = get_settings()
    return PayPalClient(settings.paypal_client_id, settings.paypal_client_secret)
