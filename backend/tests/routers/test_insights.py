from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.security import current_user
from app.main import app
from app.models import Order, OrderStatus, SpendingRule, User
from app.services.spending import spending

NOW = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


@pytest.fixture
def user(session: Session) -> User:
    user = User(name="Maya", currency="USD")
    session.add(user)
    session.flush()
    session.add(
        SpendingRule(
            user_id=user.id,
            monthly_budget=Decimal("500"),
            ask_above=Decimal("150"),
            blocked_categories=[],
        )
    )
    session.commit()
    return user


def add_order(session: Session, user: User, **changes: Any) -> Order:
    fields: dict[str, Any] = {
        "user_id": user.id,
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


def test_spending_this_month_by_month_and_by_category(session: Session, user: User) -> None:
    add_order(session, user, confirmed_total=Decimal("40.00"))
    add_order(session, user, category="Health", confirmed_total=Decimal("60.00"))
    add_order(
        session,
        user,
        category="Health",
        confirmed_total=Decimal("25.50"),
        status_changed_at=datetime(2026, 8, 15, tzinfo=UTC),
    )
    add_order(session, user, category=None, confirmed_total=Decimal("5.00"))
    add_order(session, user, status=OrderStatus.authorized)  # not paid yet
    add_order(session, user, status=OrderStatus.voided)  # never paid
    add_order(session, user, currency="EUR")  # other currency: not mixed in
    add_order(session, user, status_changed_at=datetime(2026, 3, 31, tzinfo=UTC))  # too old

    figures = spending(session, user, NOW)

    assert figures.currency == "USD"
    assert figures.spent_this_month == Decimal("105.00")
    assert figures.orders_this_month == 3
    assert (figures.monthly_budget, figures.budget_left, figures.ask_above) == (
        Decimal("500"),
        Decimal("395.00"),
        Decimal("150"),
    )
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


def test_budget_left_never_goes_below_zero(session: Session, user: User) -> None:
    add_order(session, user, confirmed_total=Decimal("700.00"))

    assert spending(session, user, NOW).budget_left == 0


def test_without_rules_there_is_no_budget(session: Session) -> None:
    leo = User(name="Leo")
    session.add(leo)
    session.commit()

    figures = spending(session, leo, NOW)

    assert (figures.monthly_budget, figures.budget_left, figures.ask_above) == (None, None, None)


@pytest.fixture
def client(session: Session, user: User) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_spending_endpoint(client: TestClient, session: Session, user: User) -> None:
    add_order(session, user, status_changed_at=datetime.now(UTC))

    body = client.get("/insights/spending").json()

    assert (body["currency"], body["spent_this_month"], body["monthly_budget"]) == (
        "USD",
        "40.00",
        "500.00",
    )
    assert len(body["by_month"]) == 6
    assert body["by_category"] == [{"label": "Kitchen", "total": "40.00"}]
