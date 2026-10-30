"""PayPal Orders v2 + Payments v2, sandbox only.

SERVER-ONLY. Nothing in this module may be registered as an agent tool: the model
can draft orders but never move money.
Docs: https://developer.paypal.com/docs/api/orders/v2/ and /docs/api/payments/v2/
"""

import asyncio
import time
from collections.abc import Callable
from decimal import Decimal
from typing import Any

import httpx
from pydantic import BaseModel

from app.integrations.http import make_client

SANDBOX_URL = "https://api-m.sandbox.paypal.com"
TOKEN_REFRESH_MARGIN = 60  # seconds before expiry to fetch a new token
ZERO_DECIMAL_CURRENCIES = {"HUF", "JPY", "TWD"}


# Payments v2 422 issues (from PayPal's OpenAPI spec, payments_payment_v2.json).
AUTHORIZATION_EXPIRED = "AUTHORIZATION_EXPIRED"  # capture after the 29-day hold ended


class PayPalError(Exception):
    def __init__(self, message: str, *, status: int | None = None, issue: str | None = None):
        super().__init__(message)
        self.status = status
        # PayPal's machine-readable reason, e.g. AUTHORIZATION_EXPIRED
        self.issue = issue


class Purchase(BaseModel):
    """One item at the total the user confirmed (delivery is total minus price)."""

    reference: str  # our order id; also makes retries idempotent
    title: str
    price: Decimal
    total: Decimal
    currency: str


class PayPalOrder(BaseModel):
    id: str
    status: str


class Authorization(BaseModel):
    id: str
    status: str
    amount: Decimal
    currency: str


class Capture(BaseModel):
    id: str
    status: str


class PayPalClient:
    def __init__(
        self,
        client_id: str,
        client_secret: str,
        http: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._auth = (client_id, client_secret)
        self._http = http or make_client(base_url=SANDBOX_URL, timeout=30)
        self._clock = clock
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    async def create_order(self, purchase: Purchase) -> PayPalOrder:
        """Create a PayPal order (intent AUTHORIZE) for the purchase."""
        currency = purchase.currency
        breakdown = {"item_total": _money(purchase.price, currency)}
        delivery = purchase.total - purchase.price
        if delivery:
            breakdown["shipping"] = _money(delivery, currency)
        body = {
            "intent": "AUTHORIZE",
            "purchase_units": [
                {
                    "reference_id": purchase.reference,
                    "custom_id": purchase.reference,
                    "amount": {**_money(purchase.total, currency), "breakdown": breakdown},
                    "items": [
                        {
                            "name": purchase.title[:127],
                            "quantity": "1",
                            "unit_amount": _money(purchase.price, currency),
                            "category": "PHYSICAL_GOODS",
                        }
                    ],
                }
            ],
        }
        request_id = f"aide-create-{purchase.reference}-{purchase.total}-{currency}"
        data = await self._post("/v2/checkout/orders", body, request_id)
        return PayPalOrder(id=data["id"], status=data["status"])

    async def authorize(self, paypal_order_id: str) -> Authorization:
        data = await self._post(
            f"/v2/checkout/orders/{paypal_order_id}/authorize", {}, f"aide-auth-{paypal_order_id}"
        )
        try:
            auth = data["purchase_units"][0]["payments"]["authorizations"][0]
        except (KeyError, IndexError) as error:
            raise PayPalError(f"No authorization returned for order {paypal_order_id}") from error
        return Authorization(
            id=auth["id"],
            status=auth["status"],
            amount=Decimal(auth["amount"]["value"]),
            currency=auth["amount"]["currency_code"],
        )

    async def capture(self, auth_id: str) -> Capture:
        data = await self._post(
            f"/v2/payments/authorizations/{auth_id}/capture",
            {"final_capture": True},
            f"aide-capture-{auth_id}",
        )
        return Capture(id=data["id"], status=data["status"])

    async def void(self, auth_id: str) -> None:
        await self._post(
            f"/v2/payments/authorizations/{auth_id}/void", None, f"aide-void-{auth_id}"
        )

    async def _post(self, path: str, body: dict[str, Any] | None, request_id: str) -> Any:
        headers = {
            "Authorization": f"Bearer {await self._access_token()}",
            "PayPal-Request-Id": request_id,
            "Prefer": "return=representation",
        }
        try:
            response = await self._http.post(path, json=body, headers=headers)
        except httpx.HTTPError as error:
            # No answer at all: the call may or may not have happened. Retrying
            # is safe because every POST carries a PayPal-Request-Id.
            raise PayPalError(f"PayPal POST {path} failed: {error!r}") from error
        if response.is_error:
            issue = _issue(response)
            raise PayPalError(
                f"PayPal POST {path} failed: HTTP {response.status_code}"
                + (f" {issue}" if issue else ""),
                status=response.status_code,
                issue=issue,
            )
        return response.json() if response.content else None

    async def _access_token(self) -> str:
        async with self._token_lock:
            if self._token is None or self._clock() >= self._token_expires_at:
                try:
                    response = await self._http.post(
                        "/v1/oauth2/token",
                        data={"grant_type": "client_credentials"},
                        auth=self._auth,
                    )
                except httpx.HTTPError as error:
                    raise PayPalError(f"PayPal token request failed: {error!r}") from error
                if response.is_error:
                    raise PayPalError(f"PayPal token request failed: HTTP {response.status_code}")
                data = response.json()
                self._token = data["access_token"]
                self._token_expires_at = self._clock() + data["expires_in"] - TOKEN_REFRESH_MARGIN
            return self._token


def _money(amount: Decimal, currency: str) -> dict[str, str]:
    places = Decimal("1") if currency in ZERO_DECIMAL_CURRENCIES else Decimal("0.01")
    return {"currency_code": currency, "value": str(amount.quantize(places))}


def _issue(response: httpx.Response) -> str | None:
    """The first `details[].issue` of a PayPal error body, if there is one."""
    try:
        details = response.json().get("details") or []
        return details[0].get("issue") if details else None
    except (ValueError, AttributeError):
        return None
