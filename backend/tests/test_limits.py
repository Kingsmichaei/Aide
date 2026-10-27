from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.models import Limit, Order, OrderStatus, Role, User
from app.services.limits import LimitDecision, check, monthly_spend

NOW = datetime(2026, 11, 15, 12, 0, tzinfo=UTC)


@pytest.fixture
def shopper(session: Session) -> User:
    user = User(name="Rosa", role=Role.shopper)
    session.add(user)
    session.flush()
    return user


def set_limits(session: Session, shopper: User, per_order: str, monthly: str) -> None:
    session.add(
        Limit(
            shopper_id=shopper.id,
            per_order_max=Decimal(per_order),
            monthly_max=Decimal(monthly),
            currency="USD",
            blocked_categories=[],
        )
    )
    session.flush()


def add_order(
    session: Session,
    shopper: User,
    total: str,
    status: OrderStatus = OrderStatus.captured,
    changed_at: datetime = NOW,
    currency: str = "USD",
) -> None:
    session.add(
        Order(
            shopper_id=shopper.id,
            channel3_product_id="c3",
            title="Item",
            retailer="shop.com",
            price=Decimal(total),
            currency=currency,
            confirmed_total=Decimal(total),
            status=status,
            status_changed_at=changed_at,
        )
    )
    session.flush()


def test_under_limit(session: Session, shopper: User) -> None:
    set_limits(session, shopper, per_order="100", monthly="300")
    add_order(session, shopper, "150")

    assert check(session, shopper.id, Decimal("100.00"), "USD", NOW) == LimitDecision.within_limit


def test_over_per_order_limit(session: Session, shopper: User) -> None:
    set_limits(session, shopper, per_order="100", monthly="300")

    decision = check(session, shopper.id, Decimal("100.01"), "USD", NOW)

    assert decision == LimitDecision.needs_caregiver


def test_over_monthly_limit(session: Session, shopper: User) -> None:
    set_limits(session, shopper, per_order="100", monthly="300")
    add_order(session, shopper, "90")
    add_order(session, shopper, "150")

    decision = check(session, shopper.id, Decimal("60.01"), "USD", NOW)

    assert decision == LimitDecision.needs_caregiver


def test_no_limits_set(session: Session, shopper: User) -> None:
    decision = check(session, shopper.id, Decimal("5000"), "USD", NOW)

    assert decision == LimitDecision.within_limit


def test_other_currency_needs_caregiver(session: Session, shopper: User) -> None:
    set_limits(session, shopper, per_order="100", monthly="300")

    assert check(session, shopper.id, Decimal("10"), "EUR", NOW) == LimitDecision.needs_caregiver


def test_monthly_spend_counts_only_captured_this_month_in_currency(
    session: Session, shopper: User
) -> None:
    add_order(session, shopper, "10")
    add_order(session, shopper, "20", status=OrderStatus.awaiting_caregiver)
    add_order(session, shopper, "40", status=OrderStatus.refunded)
    add_order(session, shopper, "80", changed_at=datetime(2026, 10, 31, 23, 59, tzinfo=UTC))
    add_order(session, shopper, "160", currency="EUR")

    assert monthly_spend(session, shopper.id, "USD", NOW) == Decimal("10")
