from collections.abc import Collection, Iterator
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import get_channel3, get_paypal
from app.main import app
from app.models import Limit, Order, OrderEvent, Role, User
from app.services.channel3 import Offer, ProductDetail
from app.services.paypal import Authorization, Capture, PayPalOrder


class FakeChannel3:
    def __init__(self) -> None:
        self.price = Decimal("39.99")
        self.retailer = "target.com"

    async def get_product(
        self, product_id: str, blocked_categories: Collection[str] = ()
    ) -> ProductDetail | None:
        if product_id != "kettle-1":
            return None
        offer = Offer(price=self.price, currency="USD", retailer=self.retailer, url="https://x")
        return ProductDetail(
            id="kettle-1",
            title="Electric kettle",
            image_url=None,
            category="kettles",
            best_offer=offer,
            description=None,
            offers=[offer],
        )


class FakePayPal:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.created_total: Decimal | None = None

    async def create_order(self, order: Order) -> PayPalOrder:
        self.calls.append("create_order")
        self.created_total = order.confirmed_total
        return PayPalOrder(id="PP-1", status="CREATED")

    async def authorize(self, paypal_order_id: str) -> Authorization:
        self.calls.append("authorize")
        assert self.created_total is not None
        return Authorization(
            id="AUTH-1", status="CREATED", amount=self.created_total, currency="USD"
        )

    async def capture(self, auth_id: str) -> Capture:
        self.calls.append("capture")
        return Capture(id="CAP-1", status="COMPLETED")

    async def void(self, auth_id: str) -> None:
        self.calls.append("void")


@pytest.fixture
def channel3() -> FakeChannel3:
    return FakeChannel3()


@pytest.fixture
def paypal() -> FakePayPal:
    return FakePayPal()


@pytest.fixture
def client(session: Session, channel3: FakeChannel3, paypal: FakePayPal) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_channel3] = lambda: channel3
    app.dependency_overrides[get_paypal] = lambda: paypal
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def shopper_id(session: Session) -> int:
    shopper = User(name="Rosa", role=Role.shopper)
    session.add(shopper)
    session.flush()
    session.add(
        Limit(
            shopper_id=shopper.id,
            per_order_max=Decimal("100"),
            monthly_max=Decimal("300"),
            currency="USD",
            blocked_categories=[],
        )
    )
    session.commit()
    return shopper.id


def draft(client: TestClient, shopper_id: int) -> dict[str, Any]:
    response = client.post(
        "/orders/draft", json={"shopper_id": shopper_id, "channel3_product_id": "kettle-1"}
    )
    assert response.status_code == 201
    return response.json()


def confirm(client: TestClient, order: dict[str, Any]) -> dict[str, Any]:
    shown = {k: order[k] for k in ("title", "price", "currency", "total")}
    response = client.post(f"/orders/{order['id']}/confirm", json=shown)
    assert response.status_code == 200
    return response.json()


def events(session: Session, order_id: int) -> list[str]:
    rows = session.scalars(
        select(OrderEvent).where(OrderEvent.order_id == order_id).order_by(OrderEvent.id)
    )
    return [row.detail["event"] for row in rows]


def test_happy_path_captures_within_limit(
    client: TestClient, session: Session, paypal: FakePayPal, shopper_id: int
) -> None:
    order = draft(client, shopper_id)
    assert order["status"] == "draft"
    assert order["total"] == "39.99"

    confirmed = confirm(client, order)
    assert confirmed["confirmed"] is True
    assert confirmed["order"]["confirmed_total"] == "39.99"

    response = client.post(f"/orders/{order['id']}/paypal")
    assert response.json() == {"paypal_order_id": "PP-1"}

    result = client.post(f"/orders/{order['id']}/approved").json()
    assert result["status"] == "captured"
    assert paypal.calls == ["create_order", "authorize", "capture"]
    assert events(session, order["id"]) == [
        "drafted",
        "confirmed",
        "paypal_order_created",
        "authorized",
        "captured",
    ]


def test_over_limit_waits_for_caregiver_without_capturing(
    client: TestClient,
    session: Session,
    channel3: FakeChannel3,
    paypal: FakePayPal,
    shopper_id: int,
) -> None:
    channel3.price = Decimal("150.00")
    order = draft(client, shopper_id)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")

    result = client.post(f"/orders/{order['id']}/approved").json()

    assert result["status"] == "awaiting_caregiver"
    assert "capture" not in paypal.calls
    assert session.get(Order, order["id"]).paypal_auth_id == "AUTH-1"
    assert events(session, order["id"])[-1] == "sent_to_caregiver"


def test_approved_is_safe_to_call_twice(
    client: TestClient, paypal: FakePayPal, shopper_id: int
) -> None:
    order = draft(client, shopper_id)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")
    client.post(f"/orders/{order['id']}/approved")

    again = client.post(f"/orders/{order['id']}/approved").json()

    assert again["status"] == "captured"
    assert paypal.calls.count("capture") == 1


def test_confirm_refuses_when_price_rose_more_than_5_percent(
    client: TestClient, channel3: FakeChannel3, shopper_id: int
) -> None:
    order = draft(client, shopper_id)
    channel3.price = Decimal("42.00")  # +5.02%

    result = confirm(client, order)

    assert result["confirmed"] is False
    assert result["reason"] == "price_changed"
    assert result["order"]["price"] == "42.00"
    assert result["order"]["confirmed_total"] is None


def test_confirm_accepts_change_within_5_percent(
    client: TestClient, channel3: FakeChannel3, shopper_id: int
) -> None:
    order = draft(client, shopper_id)
    channel3.price = Decimal("41.98")  # +4.98%

    result = confirm(client, order)

    assert result["confirmed"] is True
    assert result["order"]["confirmed_total"] == "39.99"


def test_confirm_refuses_when_shown_details_differ(client: TestClient, shopper_id: int) -> None:
    order = draft(client, shopper_id)

    result = confirm(client, {**order, "price": "35.00"})

    assert result["confirmed"] is False
    assert result["reason"] == "details_changed"


def test_confirm_refuses_when_retailer_no_longer_sells_it(
    client: TestClient, channel3: FakeChannel3, shopper_id: int
) -> None:
    order = draft(client, shopper_id)
    channel3.retailer = "walmart.com"

    result = confirm(client, order)

    assert result["reason"] == "retailer_changed"
    assert result["order"]["retailer"] == "walmart.com"


def test_paypal_requires_confirmation(
    client: TestClient, paypal: FakePayPal, shopper_id: int
) -> None:
    order = draft(client, shopper_id)

    response = client.post(f"/orders/{order['id']}/paypal")

    assert response.status_code == 409
    assert paypal.calls == []


def test_paypal_rechecks_price_and_drops_confirmation(
    client: TestClient,
    session: Session,
    channel3: FakeChannel3,
    paypal: FakePayPal,
    shopper_id: int,
) -> None:
    order = draft(client, shopper_id)
    confirm(client, order)
    channel3.price = Decimal("50.00")

    response = client.post(f"/orders/{order['id']}/paypal")

    assert response.status_code == 409
    assert response.json()["detail"]["reason"] == "price_changed"
    assert paypal.calls == []
    assert session.get(Order, order["id"]).confirmed_total is None


def test_approved_requires_paypal_order(client: TestClient, shopper_id: int) -> None:
    order = draft(client, shopper_id)
    confirm(client, order)

    assert client.post(f"/orders/{order['id']}/approved").status_code == 409


def test_draft_unknown_product_is_404(client: TestClient, shopper_id: int) -> None:
    response = client.post(
        "/orders/draft", json={"shopper_id": shopper_id, "channel3_product_id": "nope"}
    )

    assert response.status_code == 404
