from collections.abc import Collection, Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_channel3, get_paypal
from app.core.errors import Conflict
from app.core.security import current_user
from app.integrations.channel3 import Offer, ProductDetail
from app.integrations.paypal import Authorization, Capture, PayPalError, PayPalOrder, Purchase
from app.main import app
from app.models import (
    Conversation,
    Notification,
    Order,
    OrderEvent,
    OrderStatus,
    SpendingRule,
    User,
)
from app.services.checkout import purchase_for


class FakeChannel3:
    def __init__(self) -> None:
        self.price = Decimal("39.99")
        self.retailer = "target.com"
        self.currency = "USD"

    async def get_product(
        self, product_id: str, blocked_categories: Collection[str] = ()
    ) -> ProductDetail | None:
        if product_id != "kettle-1":
            return None
        offer = Offer(
            price=self.price, currency=self.currency, retailer=self.retailer, url="https://x"
        )
        return ProductDetail(
            id="kettle-1",
            title="Electric kettle",
            image_url=None,
            category="kettles",
            top_category="Kitchen",
            best_offer=offer,
            description=None,
            offers=[offer],
        )


class FakePayPal:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.created_total: Decimal | None = None
        self.authorized_amount: Decimal | None = None
        self.capture_fails = False

    async def create_order(self, purchase: Purchase) -> PayPalOrder:
        self.calls.append("create_order")
        self.created_total = purchase.total
        return PayPalOrder(id="PP-1", status="CREATED")

    async def authorize(self, paypal_order_id: str) -> Authorization:
        self.calls.append("authorize")
        amount = self.authorized_amount or self.created_total
        assert amount is not None
        return Authorization(id="AUTH-1", status="CREATED", amount=amount, currency="USD")

    async def capture(self, auth_id: str) -> Capture:
        self.calls.append("capture")
        if self.capture_fails:
            raise PayPalError("down", status=503)
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
def user(session: Session) -> User:
    user = User(name="Maya", email="maya@example.com")
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def client(
    session: Session, channel3: FakeChannel3, paypal: FakePayPal, user: User
) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    # Signed in as the test's user; the cookie itself is tested in test_auth.
    app.dependency_overrides[current_user] = lambda: user
    app.dependency_overrides[get_channel3] = lambda: channel3
    app.dependency_overrides[get_paypal] = lambda: paypal
    yield TestClient(app)
    app.dependency_overrides.clear()


def set_rules(session: Session, user: User, budget: str | None, ask_above: str | None) -> None:
    session.merge(
        SpendingRule(
            user_id=user.id,
            monthly_budget=Decimal(budget) if budget else None,
            ask_above=Decimal(ask_above) if ask_above else None,
            blocked_categories=[],
        )
    )
    session.commit()


def paid_this_month(session: Session, user: User, amount: str) -> None:
    session.add(
        Order(
            user_id=user.id,
            channel3_product_id="old",
            title="Earlier order",
            retailer="x.com",
            price=Decimal(amount),
            currency="USD",
            confirmed_total=Decimal(amount),
            status=OrderStatus.captured,
            status_changed_at=datetime.now(UTC),
        )
    )
    session.commit()


def draft(client: TestClient) -> dict[str, Any]:
    response = client.post("/orders/draft", json={"channel3_product_id": "kettle-1"})
    assert response.status_code == 201
    return response.json()


def shown(order: dict[str, Any], **extra: Any) -> dict[str, Any]:
    return {**{k: order[k] for k in ("title", "price", "currency", "total")}, **extra}


def confirm(client: TestClient, order: dict[str, Any], **extra: Any) -> dict[str, Any]:
    response = client.post(f"/orders/{order['id']}/confirm", json=shown(order, **extra))
    assert response.status_code == 200
    return response.json()


def events(session: Session, order_id: int) -> list[str]:
    rows = session.scalars(
        select(OrderEvent).where(OrderEvent.order_id == order_id).order_by(OrderEvent.id)
    )
    return [row.detail["event"] for row in rows]


# --- The happy path -----------------------------------------------------------------


def test_happy_path_walks_every_status(
    client: TestClient, session: Session, paypal: FakePayPal, user: User
) -> None:
    order = draft(client)
    assert (order["status"], order["total"], order["user_id"]) == ("draft", "39.99", user.id)

    confirmed = confirm(client, order)
    assert confirmed["confirmed"] is True
    assert confirmed["warnings"] == []
    assert confirmed["order"]["status"] == "confirmed"
    assert confirmed["order"]["confirmed_total"] == "39.99"

    assert client.post(f"/orders/{order['id']}/paypal").json() == {"paypal_order_id": "PP-1"}
    assert session.get(Order, order["id"]).status == OrderStatus.awaiting_payment

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
    statuses = session.scalars(
        select(OrderEvent.to_status)
        .where(OrderEvent.order_id == order["id"])
        .order_by(OrderEvent.id)
    ).all()
    assert statuses == ["draft", "confirmed", "awaiting_payment", "authorized", "captured"]
    [alert] = session.scalars(select(Notification)).all()
    assert (alert.kind, alert.payload["title"]) == ("order_paid", "Electric kettle")


def test_approved_is_safe_to_call_twice(client: TestClient, paypal: FakePayPal, user: User) -> None:
    order = draft(client)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")

    client.post(f"/orders/{order['id']}/approved")
    again = client.post(f"/orders/{order['id']}/approved")

    assert again.json()["status"] == "captured"
    assert paypal.calls.count("capture") == 1


def test_a_failed_capture_keeps_the_hold_and_can_be_retried(
    client: TestClient, session: Session, paypal: FakePayPal, user: User
) -> None:
    order = draft(client)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")
    paypal.capture_fails = True

    failed = client.post(f"/orders/{order['id']}/approved")

    assert failed.status_code == 502
    assert session.get(Order, order["id"]).status == OrderStatus.authorized
    paypal.capture_fails = False
    retried = client.post(f"/orders/{order['id']}/approved").json()
    assert retried["status"] == "captured"
    assert paypal.calls.count("authorize") == 1  # authorized once, captured on retry


def test_a_different_authorized_amount_is_voided(
    client: TestClient, session: Session, paypal: FakePayPal, user: User
) -> None:
    order = draft(client)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")
    paypal.authorized_amount = Decimal("99.99")

    response = client.post(f"/orders/{order['id']}/approved")

    assert response.status_code == 409
    assert "Nothing was paid" in response.json()["detail"]
    assert session.get(Order, order["id"]).status == OrderStatus.voided
    assert "capture" not in paypal.calls


# --- Spending rules: a warning, then an extra, explicit yes ---------------------------


def test_over_the_ask_first_amount_needs_an_extra_yes(
    client: TestClient, session: Session, channel3: FakeChannel3, user: User
) -> None:
    set_rules(session, user, budget=None, ask_above="100")
    channel3.price = Decimal("150.00")
    order = draft(client)

    first = confirm(client, order)

    assert first["confirmed"] is False
    assert first["reason"] == "needs_extra_confirmation"
    assert first["warnings"] == [
        {
            "code": "ask_above",
            "message": "This is over your ask-first amount of $100.00.",
            "amount": "100.00",
            "currency": "USD",
        }
    ]
    assert first["order"]["status"] == "draft"
    assert events(session, order["id"])[-1] == "rules_warning"

    second = confirm(client, order, acknowledged=["ask_above"])

    assert second["confirmed"] is True
    assert second["order"]["status"] == "confirmed"
    event = session.scalars(
        select(OrderEvent).where(OrderEvent.order_id == order["id"]).order_by(OrderEvent.id.desc())
    ).first()
    assert event is not None
    assert event.detail["acknowledged"] == ["ask_above"]
    assert event.note == "Accepted: This is over your ask-first amount of $100.00."


def test_over_the_monthly_budget_says_by_how_much(
    client: TestClient, session: Session, user: User
) -> None:
    set_rules(session, user, budget="500", ask_above=None)
    paid_this_month(session, user, "500.01")
    order = draft(client)

    result = confirm(client, order)

    [warning] = result["warnings"]
    assert warning["code"] == "over_budget"
    assert warning["message"] == "This puts you $40.00 over your monthly budget."
    assert warning["amount"] == "40.00"


def test_both_warnings_must_be_accepted(
    client: TestClient, session: Session, channel3: FakeChannel3, user: User
) -> None:
    set_rules(session, user, budget="100", ask_above="100")
    channel3.price = Decimal("150.00")
    order = draft(client)

    only_one = confirm(client, order, acknowledged=["ask_above"])

    assert only_one["confirmed"] is False
    # Every warning is shown again, so the second yes is to the full picture.
    assert [w["code"] for w in only_one["warnings"]] == ["ask_above", "over_budget"]
    both = confirm(client, order, acknowledged=["ask_above", "over_budget"])
    assert both["confirmed"] is True


def test_the_extra_yes_can_be_spoken(
    client: TestClient, session: Session, channel3: FakeChannel3, user: User
) -> None:
    set_rules(session, user, budget=None, ask_above="100")
    channel3.price = Decimal("150.00")
    order = draft(client)

    result = confirm(
        client, order, method="voice", transcript="Yes, buy it", acknowledged=["ask_above"]
    )

    assert result["confirmed"] is True
    assert session.get(Order, order["id"]).confirmation_transcript == "Yes, buy it"


def test_an_order_in_another_currency_is_flagged(
    client: TestClient, session: Session, channel3: FakeChannel3, user: User
) -> None:
    set_rules(session, user, budget="500", ask_above="100")
    channel3.currency = "EUR"
    order = draft(client)

    [warning] = confirm(client, order)["warnings"]

    assert warning["code"] == "other_currency"
    assert "can't be checked against your USD spending rules" in warning["message"]


def test_no_rules_means_no_warnings(client: TestClient, channel3: FakeChannel3, user: User) -> None:
    channel3.price = Decimal("999.00")

    assert confirm(client, draft(client))["confirmed"] is True


def test_rules_are_checked_again_before_paying(
    client: TestClient, session: Session, paypal: FakePayPal, user: User
) -> None:
    set_rules(session, user, budget="100", ask_above=None)
    order = draft(client)
    assert confirm(client, order)["confirmed"] is True
    paid_this_month(session, user, "90.00")  # another order paid in between

    response = client.post(f"/orders/{order['id']}/paypal")

    assert response.status_code == 409
    detail = response.json()["detail"]
    assert detail["reason"] == "needs_extra_confirmation"
    assert detail["order"]["status"] == "draft"
    assert detail["order"]["confirmed_total"] is None
    assert paypal.calls == []


def test_an_accepted_warning_does_not_stop_payment(
    client: TestClient, session: Session, channel3: FakeChannel3, paypal: FakePayPal, user: User
) -> None:
    set_rules(session, user, budget=None, ask_above="100")
    channel3.price = Decimal("150.00")
    order = draft(client)
    confirm(client, order, acknowledged=["ask_above"])

    response = client.post(f"/orders/{order['id']}/paypal")

    assert response.status_code == 200
    assert paypal.calls == ["create_order"]


# --- Price checks (payment rule 4) ---------------------------------------------------


def test_confirm_refuses_when_price_rose_more_than_5_percent(
    client: TestClient, channel3: FakeChannel3, user: User
) -> None:
    order = draft(client)
    channel3.price = Decimal("42.00")  # +5.02%

    result = confirm(client, order)

    assert (result["confirmed"], result["reason"]) == (False, "price_changed")
    assert result["order"]["price"] == "42.00"


def test_confirm_accepts_change_within_5_percent(
    client: TestClient, channel3: FakeChannel3, user: User
) -> None:
    order = draft(client)
    channel3.price = Decimal("41.98")  # +4.98%

    assert confirm(client, order)["confirmed"] is True


def test_confirm_refuses_when_shown_details_differ(client: TestClient, user: User) -> None:
    order = draft(client)

    result = confirm(client, {**order, "price": "35.00"})

    assert result["reason"] == "details_changed"


def test_confirm_refuses_when_retailer_no_longer_sells_it(
    client: TestClient, channel3: FakeChannel3, user: User
) -> None:
    order = draft(client)
    channel3.retailer = "walmart.com"

    result = confirm(client, order)

    assert result["reason"] == "retailer_changed"
    assert result["order"]["retailer"] == "walmart.com"


def test_paypal_requires_confirmation(client: TestClient, paypal: FakePayPal, user: User) -> None:
    order = draft(client)

    assert client.post(f"/orders/{order['id']}/paypal").status_code == 409
    assert paypal.calls == []


def test_paypal_rechecks_price_and_drops_confirmation(
    client: TestClient, session: Session, channel3: FakeChannel3, paypal: FakePayPal, user: User
) -> None:
    order = draft(client)
    confirm(client, order, method="voice", transcript="yes")
    channel3.price = Decimal("50.00")

    response = client.post(f"/orders/{order['id']}/paypal")

    assert response.status_code == 409
    assert response.json()["detail"]["reason"] == "price_changed"
    assert paypal.calls == []
    stored = session.get(Order, order["id"])
    assert (stored.status, stored.confirmed_total, stored.confirmation_method) == (
        OrderStatus.draft,
        None,
        None,
    )


def test_approved_requires_a_paypal_order(client: TestClient, user: User) -> None:
    order = draft(client)
    confirm(client, order)

    assert client.post(f"/orders/{order['id']}/approved").status_code == 409


def test_draft_unknown_product_is_404(client: TestClient, user: User) -> None:
    response = client.post("/orders/draft", json={"channel3_product_id": "nope"})

    assert response.status_code == 404


def test_a_paid_order_cannot_be_confirmed_again(client: TestClient, user: User) -> None:
    order = draft(client)
    confirm(client, order)
    client.post(f"/orders/{order['id']}/paypal")
    client.post(f"/orders/{order['id']}/approved")

    response = client.post(f"/orders/{order['id']}/confirm", json=shown(order))

    assert response.status_code == 409


# --- Voice confirmation --------------------------------------------------------------


@pytest.mark.parametrize("transcript", ["Yes, please.", "Sí, cómpralo", "Oui !", "نعم"])
def test_voice_yes_confirms_and_stores_the_words(
    client: TestClient, session: Session, user: User, transcript: str
) -> None:
    order = draft(client)

    result = confirm(client, order, method="voice", transcript=transcript)

    assert result["confirmed"] is True
    assert result["order"]["confirmation_method"] == "voice"
    assert session.get(Order, order["id"]).confirmation_transcript == transcript


def test_voice_no_declines_without_confirming(
    client: TestClient, session: Session, user: User
) -> None:
    order = draft(client)

    result = confirm(client, order, method="voice", transcript="No, gracias")

    assert (result["confirmed"], result["reason"]) == (False, "declined")
    assert session.get(Order, order["id"]).confirmed_total is None
    assert events(session, order["id"])[-1] == "voice_no"


@pytest.mark.parametrize("transcript", ["maybe", "how much again?", "yes, how much again?"])
def test_unclear_answer_confirms_nothing(
    client: TestClient, session: Session, user: User, transcript: str
) -> None:
    order = draft(client)

    result = confirm(client, order, method="voice", transcript=transcript)

    assert (result["confirmed"], result["reason"]) == (False, "unclear")
    assert session.get(Order, order["id"]).status == OrderStatus.draft


def test_voice_needs_a_transcript(client: TestClient, user: User) -> None:
    order = draft(client)

    response = client.post(
        f"/orders/{order['id']}/confirm", json=shown(order, method="voice", transcript=" ")
    )

    assert response.status_code == 422


def test_button_confirmation_is_recorded_without_a_transcript(
    client: TestClient, session: Session, user: User
) -> None:
    order = draft(client)

    result = confirm(client, order, transcript="ignored")

    assert result["order"]["confirmation_method"] == "button"
    assert session.get(Order, order["id"]).confirmation_transcript is None


# --- Listing and detail ----------------------------------------------------------------


def test_my_orders_lists_confirmed_and_paid_ones_newest_first(
    client: TestClient, session: Session, user: User
) -> None:
    first = draft(client)
    confirm(client, first)
    draft(client)  # never confirmed: left out
    stranger = User(name="Leo")
    session.add(stranger)
    session.flush()
    session.add(
        Order(
            user_id=stranger.id,
            channel3_product_id="x",
            title="Not mine",
            retailer="x.com",
            price=Decimal(1),
            currency="USD",
            status=OrderStatus.captured,
        )
    )
    session.commit()

    rows = client.get("/orders").json()

    assert [(r["id"], r["status"], r["category"]) for r in rows] == [
        (first["id"], "confirmed", "Kitchen")
    ]


def test_order_detail_has_the_timeline_and_conversation(
    client: TestClient, session: Session, user: User
) -> None:
    order = draft(client)
    confirm(client, order, method="voice", transcript="Yes")
    session.add(
        Conversation(
            user_id=user.id,
            language="en",
            messages=[
                {"role": "user", "text": "A kettle please"},
                {"role": "tool", "call_id": "1", "name": "search_products", "result": {}},
                {"role": "model", "text": "Here are three.", "raw": []},
            ],
        )
    )
    session.commit()

    body = client.get(f"/orders/{order['id']}").json()

    assert body["order"]["status"] == "confirmed"
    assert body["confirmation_transcript"] == "Yes"
    assert [(e["event"], e["actor"], e["status"]) for e in body["events"]] == [
        ("drafted", "user", "draft"),
        ("confirmed", "user", "confirmed"),
    ]
    assert body["conversation"] == [
        {"role": "user", "text": "A kettle please"},
        {"role": "aide", "text": "Here are three."},
    ]


def test_someone_elses_order_is_404(client: TestClient, session: Session, user: User) -> None:
    stranger = User(name="Leo")
    session.add(stranger)
    session.flush()
    theirs = Order(
        user_id=stranger.id,
        channel3_product_id="x",
        title="Not mine",
        retailer="x.com",
        price=Decimal(1),
        currency="USD",
    )
    session.add(theirs)
    session.commit()

    assert client.get(f"/orders/{theirs.id}").status_code == 404
    assert (
        client.post(
            f"/orders/{theirs.id}/confirm",
            json=shown({"title": "Not mine", "price": "1.00", "currency": "USD", "total": "1.00"}),
        ).status_code
        == 404
    )
    assert client.post(f"/orders/{theirs.id}/paypal").status_code == 404
    assert client.post(f"/orders/{theirs.id}/approved").status_code == 404


def test_paypal_is_never_asked_for_an_unconfirmed_order() -> None:
    order = Order(id=7, title="Kettle", price=Decimal("39.99"), currency="USD")
    with pytest.raises(Conflict, match="no confirmation from the user"):
        purchase_for(order)


def test_paypal_is_asked_for_exactly_the_confirmed_total() -> None:
    order = Order(
        id=7,
        title="Kettle",
        price=Decimal("39.99"),
        currency="USD",
        confirmed_total=Decimal("42.50"),
    )
    assert purchase_for(order) == Purchase(
        reference="7",
        title="Kettle",
        price=Decimal("39.99"),
        total=Decimal("42.50"),
        currency="USD",
    )
