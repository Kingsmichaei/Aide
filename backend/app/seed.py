"""Demo data: two people who use Aide as their personal shopper.

Maya has spending rules ($600 a month, ask first above $150) and two months of
orders across five categories; one went over her ask-first amount and she said
yes to it anyway. Leo is new: no rules, no orders.

Run with `uv run python -m app.seed`. Safe to run more than once: demo orders are
only added if Maya has none yet.

Seeded orders carry made-up PayPal ids (DEMO-...). They fill the orders list and
insights; they cannot be refunded in the PayPal sandbox.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Actor,
    ConfirmationMethod,
    Conversation,
    Order,
    OrderEvent,
    OrderStatus,
    SpendingRule,
    User,
)

DEMO_PREFIX = "demo-"  # channel3_product_id prefix of seeded orders


@dataclass(frozen=True)
class Person:
    name: str
    email: str
    language: str = "en"


MAYA = Person("Maya Chen", "maya@example.com")
LEO = Person("Leo Martin", "leo@example.com")


@dataclass(frozen=True)
class DemoOrder:
    days_ago: int
    title: str
    retailer: str
    category: str
    price: str
    method: ConfirmationMethod = ConfirmationMethod.button
    transcript: str | None = None
    # Spending-rule warnings Maya saw and said yes to anyway.
    acknowledged: tuple[str, ...] = ()


DEMO_ORDERS = [
    DemoOrder(
        58,
        "Sony WH-1000XM5 wireless headphones",
        "bestbuy.com",
        "Electronics",
        "328.00",
        ConfirmationMethod.voice,
        "Yes, buy them",
        acknowledged=("ask_above",),
    ),
    DemoOrder(55, "Hydro Flask 32 oz wide mouth bottle", "rei.com", "Sports", "44.95"),
    DemoOrder(51, "Le Creuset 5.5 qt Dutch oven", "williams-sonoma.com", "Kitchen", "119.95"),
    DemoOrder(
        47,
        "Nike Pegasus 41 running shoes",
        "nike.com",
        "Sports",
        "139.99",
        ConfirmationMethod.voice,
        "Yes",
    ),
    DemoOrder(43, "Anker 737 power bank", "amazon.com", "Electronics", "89.99"),
    DemoOrder(40, "Aesop Resurrection hand balm", "aesop.com", "Beauty", "35.00"),
    DemoOrder(36, "OXO Good Grips chef's knife", "target.com", "Kitchen", "29.99"),
    DemoOrder(
        30,
        "Patagonia Nano Puff jacket",
        "patagonia.com",
        "Clothing",
        "239.00",
        acknowledged=("ask_above",),
    ),
    DemoOrder(
        26,
        "Theragun Mini",
        "bestbuy.com",
        "Electronics",
        "149.00",
        ConfirmationMethod.voice,
        "Yes please",
    ),
    DemoOrder(21, "Merino wool crew socks, 3 pack", "rei.com", "Clothing", "59.85"),
    DemoOrder(15, "Bamboo cutting board set", "target.com", "Kitchen", "34.99"),
    DemoOrder(11, "Glossier Balm Dotcom trio", "glossier.com", "Beauty", "36.00"),
    DemoOrder(8, "Lululemon Align leggings", "lululemon.com", "Clothing", "98.00"),
    DemoOrder(
        4,
        "Kindle Paperwhite case",
        "amazon.com",
        "Electronics",
        "24.99",
        ConfirmationMethod.voice,
        "Yes",
    ),
]

DEMO_CONVERSATION = [
    ("user", "I need noise-cancelling headphones for long flights, under $350."),
    ("model", "I found three that suit long flights. Which would you like?"),
    ("user", "The Sony ones."),
    ("model", "They're $328.00 in total from Best Buy. Shall I buy them?"),
    ("user", "Yes, buy them"),
]


def seed(session: Session, now: datetime | None = None) -> tuple[User, User]:
    maya = _user(session, MAYA)
    leo = _user(session, LEO)
    if session.get(SpendingRule, maya.id) is None:
        session.add(
            SpendingRule(
                user_id=maya.id,
                monthly_budget=Decimal("600.00"),
                ask_above=Decimal("150.00"),
                blocked_categories=[],
            )
        )
    session.flush()
    if not _has_demo_orders(session, maya):
        _add_demo_orders(session, maya, now or datetime.now(UTC))
    session.commit()
    return maya, leo


def _user(session: Session, person: Person) -> User:
    user = session.scalar(select(User).where(User.email == person.email))
    if user is None:
        user = User(name=person.name, email=person.email, language=person.language)
        session.add(user)
        session.flush()
    return user


def _has_demo_orders(session: Session, user: User) -> bool:
    found = session.scalar(
        select(Order.id)
        .where(Order.user_id == user.id, Order.channel3_product_id.startswith(DEMO_PREFIX))
        .limit(1)
    )
    return found is not None


def _add_demo_orders(session: Session, user: User, now: datetime) -> None:
    for number, demo in enumerate(DEMO_ORDERS, start=1):
        _add_order(session, user, number, demo, now)
    session.add(
        Conversation(
            user_id=user.id,
            language=user.language,
            messages=[{"role": role, "text": text, "raw": []} for role, text in DEMO_CONVERSATION],
        )
    )


def _add_order(session: Session, user: User, number: int, demo: DemoOrder, now: datetime) -> None:
    created = (now - timedelta(days=demo.days_ago)).replace(hour=10, minute=0, second=0)
    created = min(created, now - timedelta(minutes=30))
    price = Decimal(demo.price)
    paid_at = created + timedelta(minutes=5)
    order = Order(
        user_id=user.id,
        channel3_product_id=f"{DEMO_PREFIX}{number}",
        title=demo.title,
        retailer=demo.retailer,
        category=demo.category,
        price=price,
        currency="USD",
        confirmed_total=price,
        confirmed_at=created + timedelta(minutes=2),
        confirmation_method=demo.method,
        confirmation_transcript=demo.transcript,
        paypal_order_id=f"DEMO-ORDER-{number}",
        paypal_auth_id=f"DEMO-AUTH-{number}",
        status=OrderStatus.captured,
        status_changed_at=paid_at,
        created_at=created,
    )
    session.add(order)
    session.flush()

    # The same trail a real order leaves (CLAUDE.md payment rule 7).
    accepted = "Accepted: over your ask-first amount." if demo.acknowledged else None
    steps: list[
        tuple[timedelta, Actor, OrderStatus | None, OrderStatus, str, str | None, dict[str, Any]]
    ] = [
        (timedelta(0), Actor.system, None, OrderStatus.draft, "drafted", None, {}),
        (
            timedelta(minutes=2),
            Actor.user,
            OrderStatus.draft,
            OrderStatus.confirmed,
            "confirmed",
            accepted,
            {
                "method": demo.method,
                "transcript": demo.transcript,
                "total": demo.price,
                "acknowledged": list(demo.acknowledged),
            },
        ),
        (
            timedelta(minutes=3),
            Actor.system,
            OrderStatus.confirmed,
            OrderStatus.awaiting_payment,
            "paypal_order_created",
            None,
            {},
        ),
        (
            timedelta(minutes=5),
            Actor.system,
            OrderStatus.awaiting_payment,
            OrderStatus.authorized,
            "authorized",
            None,
            {"amount": demo.price},
        ),
        (
            timedelta(minutes=5),
            Actor.system,
            OrderStatus.authorized,
            OrderStatus.captured,
            "captured",
            None,
            {},
        ),
    ]
    for after, actor, before, to, event, note, detail in steps:
        session.add(
            OrderEvent(
                order_id=order.id,
                from_status=before,
                to_status=to,
                actor=actor,
                note=note,
                detail={"event": event, **detail, "demo": True},
                created_at=created + after,
            )
        )


if __name__ == "__main__":
    from app.core.db import SessionLocal

    with SessionLocal() as session:
        maya, leo = seed(session)
        orders = session.scalars(select(Order).where(Order.user_id == maya.id)).all()
        print(f"{maya.name} (id {maya.id}) has {len(orders)} orders and spending rules.")
        print(f"{leo.name} (id {leo.id}) is a new user. Sign in at /signin as either.")
