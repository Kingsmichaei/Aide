from typing import Any

import httpx
import pytest

from app.integrations import channel3, llm, paypal
from app.integrations.http import CONNECT_RETRIES, make_client


def test_default_client_retries_failed_connections(monkeypatch: pytest.MonkeyPatch) -> None:
    made: list[dict[str, Any]] = []

    class Recorder(httpx.AsyncHTTPTransport):
        def __init__(self, **kwargs: Any) -> None:
            made.append(kwargs)
            super().__init__(**kwargs)

    monkeypatch.setattr(httpx, "AsyncHTTPTransport", Recorder)

    client = make_client(timeout=5, base_url=paypal.SANDBOX_URL)

    assert made == [{"retries": CONNECT_RETRIES}]
    assert str(client.base_url).rstrip("/") == paypal.SANDBOX_URL


def test_every_integration_uses_it_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    used: list[str] = []

    def recording(*, timeout: float, base_url: str = "") -> httpx.AsyncClient:
        used.append(base_url)
        return httpx.AsyncClient(base_url=base_url, timeout=timeout)

    for module in (channel3, llm, paypal):
        monkeypatch.setattr(module, "make_client", recording)

    channel3.Channel3Client("key")
    llm.GeminiClient("key", "model")
    paypal.PayPalClient("id", "secret")

    assert used == [channel3.BASE_URL, "", paypal.SANDBOX_URL]
