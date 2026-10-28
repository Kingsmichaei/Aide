from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_session
from app.main import app
from app.models import (
    Actor,
    Approval,
    CareLink,
    CareLinkStatus,
    ConfirmationMethod,
    Conversation,
    Decision,
    Limit,
    Order,
    OrderStatus,
    Role,
    User,
)
from app.services.channel3 import Offer, ProductDetail
from app.services.orders import create_draft, record
from app.services.spending import spending

NOW = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {
        "rosa": User(name="Rosa", role=Role.shopper),
        "ana": User(name="Ana", role=Role.shopper),
        "sam": User(name="Sam", role=Role.caregiver),
        "kim": User(name="Kim", role=Role.caregiver),
    }
    session.add_all(people.values())
    session.flush()
    session.add(
        CareLink(
            shopper_id=people["rosa"].id,
            caregiver_id=people["sam"].id,
            status=CareLinkStatus.active,
        )
    )
    session.add(
        Limit(
            shopper_id=people["rosa"].id,
            per_order_max=Decimal("100"),
            monthly_max=Decimal("500"),
            currency="USD",
            blocked_categories=[],
        )
    )
    session.commit()
    return people


def add_order(session: Session, shopper: User, **changes: Any) -> Order:
    fields: dict[str, Any] = {
        "shopper_id": shopper.id,
        "channel3_product_id": "p",
        "title": "Kettle",
        "retailer": "target.com",
        "category": "Kitchen",
        "price": Decimal("40.00"),
        "currency": "USD",
        "confirmed_total": Decimal("40.00"),
        "status": OrderStatus.captured,
        "status_changed_at": NOW,
        "created_at": NOW,
        **changes,
    }
    order = Order(**fields)
    session.add(order)
    session.commit()
    return order


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


# --- Ledger --------------------------------------------------------------------


def test_ledger_lists_orders_with_method_and_who_approved(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    within = add_order(session, people["rosa"], confirmation_method=ConfirmationMethod.button)
    big = add_order(
        session,
        people["rosa"],
        title="Vitamin D",
        category="Health",
        price=Decimal("150.00"),
        confirmed_total=Decimal("150.00"),
        confirmation_method=ConfirmationMethod.voice,
        created_at=datetime(2026, 10, 29, tzinfo=UTC),
    )
    session.add(
        Approval(order_id=big.id, caregiver_id=people["sam"].id, decision=Decision.approved)
    )
    add_order(session, people["rosa"], status=OrderStatus.draft)  # never confirmed: left out
    add_order(session, people["ana"])  # someone else's
    session.commit()
    sign_in(client, people["sam"])

    rows = client.get(f"/care/shoppers/{people['rosa'].id}/orders").json()

    assert [r["id"] for r in rows] == [big.id, within.id]  # newest first
    assert rows[0] | {"created_at": None} == {
        "id": big.id,
        "created_at": None,
        "title": "Vitamin D",
        "retailer": "target.com",
        "category": "Health",
        "price": "150.00",
        "total": "150.00",
        "currency": "USD",
        "status": "captured",
        "method": "voice",
        "approved_by": "Sam",
        "declined_by": None,
    }
    assert (rows[1]["method"], rows[1]["approved_by"]) == ("button", None)


def test_ledger_shows_who_declined(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    order = add_order(session, people["rosa"], status=OrderStatus.voided)
    session.add(
        Approval(order_id=order.id, caregiver_id=people["sam"].id, decision=Decision.declined)
    )
    session.commit()
    sign_in(client, people["sam"])

    [row] = client.get(f"/care/shoppers/{people['rosa'].id}/orders").json()

    assert (row["status"], row["declined_by"], row["approved_by"]) == ("voided", "Sam", None)


@pytest.mark.parametrize(
    "path", ["/orders", "/orders/1", "/spending"], ids=["ledger", "detail", "spending"]
)
def test_dashboard_needs_the_linked_caregiver(
    client: TestClient, session: Session, people: dict[str, User], path: str
) -> None:
    add_order(session, people["rosa"])
    for who in ("kim", "rosa"):
        sign_in(client, people[who])
        assert client.get(f"/care/shoppers/{people['rosa'].id}{path}").status_code == 403


# --- Order detail ----------------------------------------------------------------


def test_detail_has_events_decisions_and_the_conversation(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    order = add_order(
        session,
        people["rosa"],
        status=OrderStatus.voided,
        confirmation_method=ConfirmationMethod.voice,
        confirmation_transcript="Sí, cómpralo",
    )
    record(session, order, Actor.shopper, "confirmed")
    session.add(
        Approval(
            order_id=order.id,
            caregiver_id=people["sam"].id,
            decision=Decision.declined,
            note="We have one",
        )
    )
    session.add(
        Conversation(
            shopper_id=people["rosa"].id,
            language="es",
            messages=[
                {"role": "user", "text": "Necesito una tetera"},
                {"role": "model", "text": "", "raw": []},  # a tool-call step: skipped
                {"role": "tool", "call_id": "1", "name": "search_products", "result": {}},
                {"role": "model", "text": "Encontré dos.", "raw": []},
            ],
        )
    )
    session.commit()
    sign_in(client, people["sam"])

    body = client.get(f"/care/shoppers/{people['rosa'].id}/orders/{order.id}").json()

    assert body["order"]["declined_by"] == "Sam"
    assert body["confirmation_transcript"] == "Sí, cómpralo"
    assert [e["event"] for e in body["events"]] == ["confirmed"]
    assert body["decisions"][0] | {"at": None} == {
        "decision": "declined",
        "caregiver": "Sam",
        "note": "We have one",
        "at": None,
    }
    assert body["conversation"] == [
        {"role": "shopper", "text": "Necesito una tetera"},
        {"role": "aide", "text": "Encontré dos."},
    ]


def test_detail_of_another_shoppers_order_is_404(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    theirs = add_order(session, people["ana"])
    sign_in(client, people["sam"])

    response = client.get(f"/care/shoppers/{people['rosa'].id}/orders/{theirs.id}")

    assert response.status_code == 404


# --- Spending ----------------------------------------------------------------------


def test_spending_this_month_by_month_and_by_category(
    session: Session, people: dict[str, User]
) -> None:
    rosa = people["rosa"]
    add_order(session, rosa, confirmed_total=Decimal("40.00"))  # Kitchen, this month
    add_order(session, rosa, category="Health", confirmed_total=Decimal("60.00"))
    add_order(
        session,
        rosa,
        category="Health",
        confirmed_total=Decimal("25.50"),
        status_changed_at=datetime(2026, 8, 15, tzinfo=UTC),
    )
    add_order(session, rosa, category=None, confirmed_total=Decimal("5.00"))  # no category
    add_order(session, rosa, status=OrderStatus.awaiting_caregiver)  # not spent yet
    add_order(session, rosa, status=OrderStatus.voided)  # never spent
    add_order(session, rosa, currency="EUR")  # other currency: not mixed in
    add_order(  # older than six months
        session, rosa, status_changed_at=datetime(2026, 3, 31, tzinfo=UTC)
    )

    figures = spending(session, rosa.id, NOW)

    assert figures.currency == "USD"
    assert figures.spent_this_month == Decimal("105.00")
    assert figures.limit_left == Decimal("395.00")
    assert figures.waiting == 1
    assert figures.by_month == [
        ("2026-05", 0),
        ("2026-06", 0),
        ("2026-07", 0),
        ("2026-08", Decimal("25.50")),
        ("2026-09", 0),
        ("2026-10", Decimal("105.00")),
    ]
    assert figures.by_category == [
        ("Health", Decimal("85.50")),
        ("Kitchen", Decimal("40.00")),
        ("Other", Decimal("5.00")),
    ]


def test_limit_left_never_goes_below_zero(session: Session, people: dict[str, User]) -> None:
    add_order(session, people["rosa"], confirmed_total=Decimal("700.00"))

    assert spending(session, people["rosa"].id, NOW).limit_left == 0


def test_without_limits_there_is_nothing_left_to_show(
    session: Session, people: dict[str, User]
) -> None:
    ana = people["ana"]
    add_order(session, ana)

    figures = spending(session, ana.id, NOW)

    assert (figures.monthly_max, figures.limit_left) == (None, None)
    assert figures.spent_this_month == Decimal("40.00")


def test_spending_endpoint(client: TestClient, session: Session, people: dict[str, User]) -> None:
    add_order(session, people["rosa"], status_changed_at=datetime.now(UTC))
    sign_in(client, people["sam"])

    body = client.get(f"/care/shoppers/{people['rosa'].id}/spending").json()

    assert (body["currency"], body["spent_this_month"], body["monthly_max"]) == (
        "USD",
        "40.00",
        "500.00",
    )
    assert len(body["by_month"]) == 6
    assert body["by_category"] == [{"label": "Kitchen", "total": "40.00"}]


# --- Category on new orders --------------------------------------------------------


def test_drafts_keep_the_top_level_category(session: Session, people: dict[str, User]) -> None:
    offer = Offer(price=Decimal("9.99"), currency="USD", retailer="cvs.com", url="https://x")
    product = ProductDetail(
        id="vit",
        title="Vitamin C",
        image_url=None,
        category="vitamins",
        top_category="Health",
        best_offer=offer,
        description=None,
        offers=[offer],
    )

    order = create_draft(session, people["rosa"].id, product, Actor.system)

    assert order.category == "Health"
