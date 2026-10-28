from datetime import UTC, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AlertKind,
    Approval,
    CareLink,
    Decision,
    Limit,
    Notification,
    Order,
    OrderEvent,
    OrderStatus,
    Role,
    User,
)
from app.seed import seed
from app.services.limits import monthly_spend
from app.services.spending import spending

NOW = datetime(2026, 10, 28, 12, 0, tzinfo=UTC)


def orders_of(session: Session, user: User) -> list[Order]:
    return list(session.scalars(select(Order).where(Order.shopper_id == user.id)))


def test_seed_creates_shopper_caregiver_link_and_limit(session: Session) -> None:
    shopper, caregiver = seed(session, NOW)

    assert shopper.role == Role.shopper
    assert caregiver.role == Role.caregiver
    assert session.get(CareLink, (shopper.id, caregiver.id)) is not None
    limit = session.get(Limit, shopper.id)
    assert limit is not None
    assert (limit.per_order_max, limit.monthly_max) == (Decimal("100.00"), Decimal("500.00"))


def test_seed_is_idempotent(session: Session) -> None:
    seed(session, NOW)
    shopper, _ = seed(session, NOW)

    assert session.scalar(select(func.count()).select_from(User)) == 2
    assert len(orders_of(session, shopper)) == 15


def test_two_months_of_orders_across_five_categories(session: Session) -> None:
    shopper, _ = seed(session, NOW)
    orders = orders_of(session, shopper)

    assert {o.category for o in orders} == {"Health", "Kitchen", "Home", "Books", "Clothing"}
    oldest = min(o.created_at for o in orders).replace(tzinfo=UTC)
    newest = max(o.created_at for o in orders).replace(tzinfo=UTC)
    assert NOW - timedelta(days=62) <= oldest <= NOW - timedelta(days=50)
    assert newest < NOW
    # Both ways of confirming appear, voice ones with what was said.
    assert {o.confirmation_method for o in orders} == {"voice", "button"}
    assert all(o.confirmation_transcript for o in orders if o.confirmation_method == "voice")


def test_one_waiting_one_declined_with_a_note_one_approved(session: Session) -> None:
    shopper, caregiver = seed(session, NOW)
    by_status: dict[OrderStatus, list[Order]] = {}
    for order in orders_of(session, shopper):
        by_status.setdefault(order.status, []).append(order)

    [waiting] = by_status[OrderStatus.awaiting_caregiver]
    [declined] = by_status[OrderStatus.voided]
    assert waiting.title == "Bluetooth TV hearing amplifier"
    assert waiting.confirmed_total > Decimal("100")  # over the per-order limit
    decisions = {a.order_id: a for a in session.scalars(select(Approval)).all()}
    assert decisions[declined.id].decision == Decision.declined
    assert "Dr. Lee" in (decisions[declined.id].note or "")
    approved = [d for d in decisions.values() if d.decision == Decision.approved]
    assert len(approved) == 1
    assert waiting.id not in decisions


def test_every_order_has_its_event_trail(session: Session) -> None:
    shopper, _ = seed(session, NOW)

    for order in orders_of(session, shopper):
        events = session.scalars(
            select(OrderEvent.detail).where(OrderEvent.order_id == order.id).order_by(OrderEvent.id)
        ).all()
        names = [e["event"] for e in events]
        assert names[:4] == ["drafted", "confirmed", "paypal_order_created", "authorized"]
        assert names[-1] in {
            "captured",
            "sent_to_caregiver",
            "approved_and_captured",
            "declined_and_voided",
        }


def test_sam_has_one_unread_alert_for_the_waiting_order(session: Session) -> None:
    shopper, caregiver = seed(session, NOW)
    unread = session.scalars(
        select(Notification).where(
            Notification.user_id == caregiver.id, Notification.read_at.is_(None)
        )
    ).all()

    assert [(n.kind, n.params["title"]) for n in unread] == [
        (AlertKind.approval_needed, "Bluetooth TV hearing amplifier")
    ]


def test_dashboard_figures_make_sense(session: Session) -> None:
    shopper, _ = seed(session, NOW)

    figures = spending(session, shopper.id, NOW)

    # This month leaves room under the $500 limit for a live demo order.
    spent = monthly_spend(session, shopper.id, "USD", NOW)
    assert Decimal("50") < spent < Decimal("300")
    assert figures.waiting == 1
    assert {label for label, _ in figures.by_category} == {
        "Health",
        "Kitchen",
        "Home",
        "Books",
        "Clothing",
    }
    assert sum(1 for _, total in figures.by_month if total > 0) >= 2
