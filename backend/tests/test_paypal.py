import json
from decimal import Decimal

import httpx
import pytest

from app.models import Order
from app.services.paypal import (
    AUTHORIZATION_EXPIRED,
    SANDBOX_URL,
    PayPalClient,
    PayPalError,
)

pytestmark = pytest.mark.anyio


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class FakePayPal:
    """Mock transport that answers like the PayPal sandbox and records requests."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []
        self.tokens_issued = 0

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if path == "/v1/oauth2/token":
            self.tokens_issued += 1
            return httpx.Response(
                200, json={"access_token": f"token-{self.tokens_issued}", "expires_in": 3600}
            )
        if path == "/v2/checkout/orders":
            return httpx.Response(201, json={"id": "PP-ORDER-1", "status": "CREATED"})
        if path == "/v2/checkout/orders/PP-ORDER-1/authorize":
            auth = {
                "id": "AUTH-1",
                "status": "CREATED",
                "amount": {"currency_code": "USD", "value": "42.50"},
            }
            return httpx.Response(
                201,
                json={
                    "id": "PP-ORDER-1",
                    "status": "COMPLETED",
                    "purchase_units": [{"payments": {"authorizations": [auth]}}],
                },
            )
        if path == "/v2/payments/authorizations/AUTH-1/capture":
            return httpx.Response(201, json={"id": "CAP-1", "status": "COMPLETED"})
        if path == "/v2/payments/authorizations/AUTH-1/void":
            return httpx.Response(204)
        if path == "/v2/payments/authorizations/AUTH-OLD/capture":
            # The example PayPal's spec gives for capturing an expired authorization.
            return httpx.Response(
                422,
                json={
                    "name": "UNPROCESSABLE_ENTITY",
                    "details": [{"issue": "AUTHORIZATION_EXPIRED", "description": "expired"}],
                },
            )
        return httpx.Response(404, json={"name": "RESOURCE_NOT_FOUND"})

    def api_requests(self) -> list[httpx.Request]:
        return [r for r in self.requests if r.url.path != "/v1/oauth2/token"]


@pytest.fixture
def fake() -> FakePayPal:
    return FakePayPal()


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def paypal(fake: FakePayPal, clock: FakeClock) -> PayPalClient:
    http = httpx.AsyncClient(base_url=SANDBOX_URL, transport=httpx.MockTransport(fake))
    return PayPalClient("client-id", "secret", http=http, clock=clock)


def make_order(**overrides: object) -> Order:
    fields: dict[str, object] = {
        "id": 7,
        "shopper_id": 1,
        "channel3_product_id": "c3-1",
        "title": "Electric kettle",
        "retailer": "target.com",
        "price": Decimal("39.99"),
        "currency": "USD",
        "confirmed_total": Decimal("42.50"),
    }
    return Order(**(fields | overrides))


async def test_token_is_fetched_once_and_cached_until_expiry(
    paypal: PayPalClient, fake: FakePayPal, clock: FakeClock
) -> None:
    await paypal.capture("AUTH-1")
    await paypal.capture("AUTH-1")
    assert fake.tokens_issued == 1

    token_request = fake.requests[0]
    assert token_request.headers["authorization"].startswith("Basic ")
    assert token_request.content == b"grant_type=client_credentials"

    clock.now += 3600 - 59  # inside the refresh margin
    await paypal.capture("AUTH-1")
    assert fake.tokens_issued == 2
    assert fake.requests[-1].headers["authorization"] == "Bearer token-2"


async def test_create_order_uses_authorize_intent_and_stored_amounts(
    paypal: PayPalClient, fake: FakePayPal
) -> None:
    result = await paypal.create_order(make_order())

    assert result.id == "PP-ORDER-1"
    [request] = fake.api_requests()
    assert request.url == f"{SANDBOX_URL}/v2/checkout/orders"
    assert request.headers["PayPal-Request-Id"] == "aide-create-7-42.50-USD"
    body = json.loads(request.content)
    assert body["intent"] == "AUTHORIZE"
    [unit] = body["purchase_units"]
    assert unit["reference_id"] == "7"
    assert unit["amount"] == {
        "currency_code": "USD",
        "value": "42.50",
        "breakdown": {
            "item_total": {"currency_code": "USD", "value": "39.99"},
            "shipping": {"currency_code": "USD", "value": "2.51"},
        },
    }
    assert unit["items"] == [
        {
            "name": "Electric kettle",
            "quantity": "1",
            "unit_amount": {"currency_code": "USD", "value": "39.99"},
            "category": "PHYSICAL_GOODS",
        }
    ]


async def test_create_order_omits_shipping_when_total_equals_price(
    paypal: PayPalClient, fake: FakePayPal
) -> None:
    await paypal.create_order(make_order(confirmed_total=Decimal("39.99")))

    amount = json.loads(fake.api_requests()[0].content)["purchase_units"][0]["amount"]
    assert "shipping" not in amount["breakdown"]


async def test_create_order_formats_zero_decimal_currencies(
    paypal: PayPalClient, fake: FakePayPal
) -> None:
    await paypal.create_order(
        make_order(price=Decimal("4500"), confirmed_total=Decimal("4500"), currency="JPY")
    )

    amount = json.loads(fake.api_requests()[0].content)["purchase_units"][0]["amount"]
    assert amount["value"] == "4500"


async def test_create_order_refuses_unconfirmed_order(
    paypal: PayPalClient, fake: FakePayPal
) -> None:
    with pytest.raises(PayPalError, match="no shopper confirmation"):
        await paypal.create_order(make_order(confirmed_total=None))
    assert fake.requests == []


async def test_authorize_returns_authorization(paypal: PayPalClient, fake: FakePayPal) -> None:
    auth = await paypal.authorize("PP-ORDER-1")

    assert auth.id == "AUTH-1"
    assert auth.amount == Decimal("42.50")
    assert auth.currency == "USD"
    assert fake.api_requests()[0].headers["PayPal-Request-Id"] == "aide-auth-PP-ORDER-1"


async def test_capture_and_void_hit_the_authorization(
    paypal: PayPalClient, fake: FakePayPal
) -> None:
    capture = await paypal.capture("AUTH-1")
    await paypal.void("AUTH-1")

    assert capture.status == "COMPLETED"
    paths = [r.url.path for r in fake.api_requests()]
    assert paths == [
        "/v2/payments/authorizations/AUTH-1/capture",
        "/v2/payments/authorizations/AUTH-1/void",
    ]


async def test_errors_raise_paypal_error(paypal: PayPalClient) -> None:
    with pytest.raises(PayPalError, match="HTTP 404") as raised:
        await paypal.capture("UNKNOWN")
    assert (raised.value.status, raised.value.issue) == (404, None)


async def test_expired_authorization_is_reported_by_issue(paypal: PayPalClient) -> None:
    with pytest.raises(PayPalError) as raised:
        await paypal.capture("AUTH-OLD")
    assert raised.value.status == 422
    assert raised.value.issue == AUTHORIZATION_EXPIRED


def test_client_only_talks_to_sandbox() -> None:
    assert SANDBOX_URL == "https://api-m.sandbox.paypal.com"
