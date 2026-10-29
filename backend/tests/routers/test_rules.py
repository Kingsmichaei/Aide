from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_channel3
from app.core.security import current_user
from app.integrations.channel3 import Category, Channel3Error
from app.main import app
from app.models import Order, OrderStatus, SpendingRule, User
from app.services import rules

NOW = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)

KNOWN = {
    "health": Category(slug="health", title="Health", path=["Health"]),
    "vitamins": Category(slug="vitamins", title="Vitamins", path=["Health", "Vitamins"]),
    "alcohol": Category(slug="alcohol", title="Alcohol", path=["Food", "Alcohol"]),
}


class FakeChannel3:
    def __init__(self) -> None:
        self.down = False

    async def list_root_categories(self) -> list[Category]:
        return [KNOWN["health"]]

    async def search_categories(self, query: str) -> list[Category]:
        return [c for c in KNOWN.values() if query.lower() in c.title.lower()]

    async def get_category(self, slug: str) -> Category | None:
        if self.down:
            raise Channel3Error("down")
        return KNOWN.get(slug)


@pytest.fixture
def channel3() -> FakeChannel3:
    return FakeChannel3()


@pytest.fixture
def user(session: Session) -> User:
    user = User(name="Maya", currency="USD")
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def client(session: Session, channel3: FakeChannel3, user: User) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_channel3] = lambda: channel3
    app.dependency_overrides[current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def paid(session: Session, user: User, amount: str, when: datetime = NOW) -> None:
    session.add(
        Order(
            user_id=user.id,
            channel3_product_id="p",
            title="Thing",
            retailer="x.com",
            price=Decimal(amount),
            currency="USD",
            confirmed_total=Decimal(amount),
            status=OrderStatus.captured,
            status_changed_at=when,
        )
    )
    session.commit()


# --- The rules service ---------------------------------------------------------------


def test_no_rules_no_warnings(session: Session, user: User) -> None:
    assert rules.check(session, user, Decimal("9999"), "USD", NOW) == []


def test_ask_above_is_strictly_above(session: Session, user: User) -> None:
    session.add(SpendingRule(user_id=user.id, ask_above=Decimal("150"), blocked_categories=[]))
    session.commit()

    assert rules.check(session, user, Decimal("150.00"), "USD", NOW) == []
    [warning] = rules.check(session, user, Decimal("150.01"), "USD", NOW)
    assert (warning.code, warning.amount) == ("ask_above", Decimal("150"))


def test_budget_counts_only_this_months_paid_orders(session: Session, user: User) -> None:
    session.add(SpendingRule(user_id=user.id, monthly_budget=Decimal("500"), blocked_categories=[]))
    session.commit()
    paid(session, user, "400")
    paid(session, user, "300", when=datetime(2026, 9, 30, tzinfo=UTC))  # last month
    session.add(  # not paid: does not count
        Order(
            user_id=user.id,
            channel3_product_id="q",
            title="Pending",
            retailer="x.com",
            price=Decimal(999),
            currency="USD",
            confirmed_total=Decimal(999),
            status=OrderStatus.awaiting_payment,
        )
    )
    session.commit()

    assert rules.check(session, user, Decimal("100"), "USD", NOW) == []  # exactly the budget
    [warning] = rules.check(session, user, Decimal("140"), "USD", NOW)
    assert warning.code == "over_budget"
    assert warning.amount == Decimal("40")
    assert warning.message == "This puts you $40.00 over your monthly budget."


def test_other_currencies_are_never_converted(session: Session, user: User) -> None:
    session.add(SpendingRule(user_id=user.id, ask_above=Decimal("10"), blocked_categories=[]))
    session.commit()

    [warning] = rules.check(session, user, Decimal("5"), "EUR", NOW)

    assert warning.code == "other_currency"


# --- GET / PUT /rules ------------------------------------------------------------------


GOOD = {"monthly_budget": "600.00", "ask_above": "150.00", "blocked_categories": ["alcohol"]}


def test_no_rules_yet(client: TestClient) -> None:
    assert client.get("/rules").json() == {
        "currency": "USD",
        "monthly_budget": None,
        "ask_above": None,
        "blocked_categories": [],
    }


def test_save_and_read_rules(client: TestClient, session: Session, user: User) -> None:
    body = client.put("/rules", json=GOOD).json()

    assert (body["monthly_budget"], body["ask_above"]) == ("600.00", "150.00")
    assert body["blocked_categories"] == [
        {"slug": "alcohol", "title": "Alcohol", "path": ["Food", "Alcohol"]}
    ]
    assert rules.blocked_categories(session, user.id) == ["alcohol"]
    assert client.get("/rules").json() == body


def test_rules_can_be_switched_off(client: TestClient) -> None:
    client.put("/rules", json=GOOD)

    body = client.put("/rules", json={"monthly_budget": None, "ask_above": None}).json()

    assert (body["monthly_budget"], body["ask_above"], body["blocked_categories"]) == (
        None,
        None,
        [],
    )


@pytest.mark.parametrize(
    "change",
    [
        {"monthly_budget": "0"},
        {"monthly_budget": "-5"},
        {"ask_above": "abc"},
        {"ask_above": "10.005"},
    ],
)
def test_invalid_amounts_are_refused(client: TestClient, change: dict[str, str]) -> None:
    assert client.put("/rules", json={**GOOD, **change}).status_code == 422


def test_unknown_categories_are_refused(client: TestClient) -> None:
    response = client.put("/rules", json={**GOOD, "blocked_categories": ["alcohol", "booze!!"]})

    assert response.status_code == 422
    assert response.json()["detail"]["unknown_categories"] == ["booze!!"]


def test_categories_already_saved_are_not_checked_again(
    client: TestClient, session: Session, user: User
) -> None:
    session.add(SpendingRule(user_id=user.id, blocked_categories=["legacy-slug"]))
    session.commit()

    response = client.put("/rules", json={"blocked_categories": ["legacy-slug", "health"]})

    assert response.status_code == 200
    assert response.json()["blocked_categories"][0]["title"] == "Legacy slug"


def test_channel3_down_gives_502(client: TestClient, channel3: FakeChannel3) -> None:
    channel3.down = True

    assert client.put("/rules", json=GOOD).status_code == 502


def test_categories_list_and_search(client: TestClient) -> None:
    assert [c["slug"] for c in client.get("/rules/categories").json()] == ["health"]
    found = client.get("/rules/categories", params={"query": "vit"}).json()
    assert found == [{"slug": "vitamins", "title": "Vitamins", "path": ["Health", "Vitamins"]}]
