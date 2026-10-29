from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Order, OrderEvent, OrderStatus, SpendingRule, User
from app.seed import seed
from app.services.rules import monthly_spend
from app.services.spending import spending

NOW = datetime(2026, 10, 29, 12, 0, tzinfo=UTC)


def orders_of(session: Session, user: User) -> list[Order]:
    return list(session.scalars(select(Order).where(Order.user_id == user.id)))


def test_two_people_one_with_rules(session: Session) -> None:
    maya, leo = seed(session, NOW)

    assert (maya.name, maya.email, leo.name) == ("Maya Chen", "maya@example.com", "Leo Martin")
    rules = session.get(SpendingRule, maya.id)
    assert rules is not None
    assert (rules.monthly_budget, rules.ask_above) == (Decimal("600.00"), Decimal("150.00"))
    assert session.get(SpendingRule, leo.id) is None
    assert orders_of(session, leo) == []


def test_seed_is_idempotent(session: Session) -> None:
    seed(session, NOW)
    maya, _ = seed(session, NOW)

    assert session.scalar(select(func.count()).select_from(User)) == 2
    assert len(orders_of(session, maya)) == 14


def test_two_months_of_paid_orders_across_five_categories(session: Session) -> None:
    maya, _ = seed(session, NOW)
    orders = orders_of(session, maya)

    assert {o.category for o in orders} == {
        "Electronics",
        "Sports",
        "Kitchen",
        "Beauty",
        "Clothing",
    }
    assert all(o.status == OrderStatus.captured for o in orders)
    oldest = min(o.created_at for o in orders).replace(tzinfo=UTC)
    assert NOW - timedelta(days=62) <= oldest <= NOW - timedelta(days=50)
    assert {o.confirmation_method for o in orders} == {"voice", "button"}


def test_every_order_has_its_event_trail(session: Session) -> None:
    maya, _ = seed(session, NOW)

    for order in orders_of(session, maya):
        statuses = session.scalars(
            select(OrderEvent.to_status)
            .where(OrderEvent.order_id == order.id)
            .order_by(OrderEvent.id)
        ).all()
        assert statuses == ["draft", "confirmed", "awaiting_payment", "authorized", "captured"]


def test_over_the_ask_first_amount_was_accepted_explicitly(session: Session) -> None:
    maya, _ = seed(session, NOW)
    big = [o for o in orders_of(session, maya) if o.confirmed_total and o.confirmed_total > 150]

    assert big
    for order in big:
        confirmed = session.scalars(
            select(OrderEvent).where(
                OrderEvent.order_id == order.id, OrderEvent.to_status == OrderStatus.confirmed
            )
        ).one()
        assert confirmed.detail["acknowledged"] == ["ask_above"]
        assert confirmed.note


def test_figures_leave_room_in_the_budget_for_a_live_demo(session: Session) -> None:
    maya, _ = seed(session, NOW)

    spent = monthly_spend(session, maya.id, "USD", NOW)
    figures = spending(session, maya, NOW)

    assert Decimal("100") < spent < Decimal("450")
    assert len(figures.by_category) == 5
    assert sum(1 for _, total in figures.by_month if total > 0) >= 2
