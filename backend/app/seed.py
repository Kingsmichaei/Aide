"""Demo data: Rosa (shopper) and Sam (her caregiver), plus two months of orders.

Rosa has a $100 per-order and $500 monthly limit. Her orders cover five
categories; one waits for Sam's approval and one was declined with a note.

Run with `uv run python -m app.seed`. Safe to run more than once: demo orders are
only added if Rosa has none yet.

Seeded orders carry made-up PayPal ids (DEMO-...). They show the dashboard and
queue; they cannot be captured or voided in the PayPal sandbox. Place a real
over-limit order to demo approving.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Actor,
    AlertKind,
    Approval,
    CareLink,
    CareLinkStatus,
    ConfirmationMethod,
    Conversation,
    Decision,
    Limit,
    Notification,
    Order,
    OrderEvent,
    OrderStatus,
    Role,
    User,
)

SHOPPER_NAME = "Rosa"
CAREGIVER_NAME = "Sam"
DEMO_PREFIX = "demo-"  # channel3_product_id prefix of seeded orders


@dataclass(frozen=True)
class DemoOrder:
    days_ago: int
    title: str
    retailer: str
    category: str
    price: str
    method: ConfirmationMethod
    transcript: str | None = None
    outcome: str = "paid"  # paid | approved | waiting | declined
    note: str | None = None


# Prices and stores a real shopper might see. Over $100 needs Sam's approval.
DEMO_ORDERS = [
    DemoOrder(
        58,
        "Vitamin D3 1000 IU, 180 softgels",
        "cvs.com",
        "Health",
        "14.99",
        ConfirmationMethod.voice,
        "Yes, please",
    ),
    DemoOrder(
        55,
        "Electric kettle, 1.7 L, auto shut-off",
        "target.com",
        "Kitchen",
        "34.99",
        ConfirmationMethod.button,
    ),
    DemoOrder(
        51,
        "Unscented laundry detergent, 92 loads",
        "walmart.com",
        "Home",
        "17.48",
        ConfirmationMethod.voice,
        "Yes",
    ),
    DemoOrder(
        47,
        "Large-print word search puzzle book",
        "amazon.com",
        "Books",
        "9.99",
        ConfirmationMethod.button,
    ),
    DemoOrder(
        43,
        "Non-slip slippers, size 8",
        "walmart.com",
        "Clothing",
        "19.97",
        ConfirmationMethod.voice,
        "Yes, buy it",
    ),
    DemoOrder(
        40,
        "Heated throw blanket with auto shut-off",
        "target.com",
        "Home",
        "129.99",
        ConfirmationMethod.voice,
        "Yes please",
        outcome="approved",
        note="Good choice for winter.",
    ),
    DemoOrder(
        36,
        "Blood pressure monitor, upper arm",
        "walgreens.com",
        "Health",
        "49.99",
        ConfirmationMethod.button,
    ),
    DemoOrder(
        30,
        "Omega-3 fish oil, 120 softgels",
        "cvs.com",
        "Health",
        "21.49",
        ConfirmationMethod.voice,
        "Yes",
    ),
    DemoOrder(
        26, "Easy-grip can opener", "target.com", "Kitchen", "15.99", ConfirmationMethod.button
    ),
    DemoOrder(
        21,
        "Cardigan sweater, navy, medium",
        "kohls.com",
        "Clothing",
        "32.00",
        ConfirmationMethod.voice,
        "Yes, I want it",
    ),
    DemoOrder(
        15,
        "Weekly pill organizer, large compartments",
        "walgreens.com",
        "Health",
        "12.99",
        ConfirmationMethod.voice,
        "Yes please",
    ),
    DemoOrder(
        11,
        "Premium multivitamin bundle, 6-month supply",
        "vitaminshoppe.com",
        "Health",
        "189.00",
        ConfirmationMethod.voice,
        "Yes",
        outcome="declined",
        note="You still have plenty of vitamins. Let's ask Dr. Lee before buying more.",
    ),
    DemoOrder(
        8,
        "LED reading lamp with magnifier",
        "amazon.com",
        "Home",
        "38.95",
        ConfirmationMethod.button,
    ),
    DemoOrder(
        4,
        "Large-print crossword collection",
        "amazon.com",
        "Books",
        "11.95",
        ConfirmationMethod.voice,
        "Yes",
    ),
    DemoOrder(
        1,
        "Bluetooth TV hearing amplifier",
        "bestbuy.com",
        "Health",
        "149.99",
        ConfirmationMethod.voice,
        "Yes, please buy it",
        outcome="waiting",
    ),
]

DEMO_CONVERSATION = [
    ("user", "I can't hear the TV very well. Is there something that helps?"),
    ("model", "I found three TV hearing helpers. Which one would you like?"),
    ("user", "The Bluetooth one, number one."),
    ("model", "It costs $149.99 in total. Shall I buy it?"),
    ("user", "Yes, please buy it"),
]


def seed(session: Session, now: datetime | None = None) -> tuple[User, User]:
    shopper = _user(session, SHOPPER_NAME, Role.shopper, address="12 Elm Street, Springfield")
    caregiver = _user(session, CAREGIVER_NAME, Role.caregiver)
    if session.get(CareLink, (shopper.id, caregiver.id)) is None:
        session.add(
            CareLink(shopper_id=shopper.id, caregiver_id=caregiver.id, status=CareLinkStatus.active)
        )
    if session.get(Limit, shopper.id) is None:
        session.add(
            Limit(
                shopper_id=shopper.id,
                per_order_max=Decimal("100.00"),
                monthly_max=Decimal("500.00"),
                currency="USD",
                blocked_categories=[],
            )
        )
    session.flush()
    if not _has_demo_orders(session, shopper):
        _add_demo_orders(session, shopper, caregiver, now or datetime.now(UTC))
    session.commit()
    return shopper, caregiver


def _user(session: Session, name: str, role: Role, address: str | None = None) -> User:
    user = session.scalar(select(User).where(User.name == name, User.role == role))
    if user is None:
        user = User(name=name, role=role, language="en", address=address)
        session.add(user)
        session.flush()
    return user


def _has_demo_orders(session: Session, shopper: User) -> bool:
    return (
        session.scalar(
            select(Order.id)
            .where(
                Order.shopper_id == shopper.id,
                Order.channel3_product_id.startswith(DEMO_PREFIX),
            )
            .limit(1)
        )
        is not None
    )


def _add_demo_orders(session: Session, shopper: User, caregiver: User, now: datetime) -> None:
    for number, demo in enumerate(DEMO_ORDERS, start=1):
        _add_order(session, shopper, caregiver, number, demo, now)
    session.add(
        Conversation(
            shopper_id=shopper.id,
            language="en",
            messages=[{"role": role, "text": text, "raw": []} for role, text in DEMO_CONVERSATION],
        )
    )


def _add_order(
    session: Session,
    shopper: User,
    caregiver: User,
    number: int,
    demo: DemoOrder,
    now: datetime,
) -> None:
    created = (now - timedelta(days=demo.days_ago)).replace(hour=10, minute=0, second=0)
    created = min(created, now - timedelta(minutes=30))
    price = Decimal(demo.price)
    final = {
        "paid": OrderStatus.captured,
        "approved": OrderStatus.captured,
        "waiting": OrderStatus.awaiting_caregiver,
        "declined": OrderStatus.voided,
    }[demo.outcome]
    decided = created + timedelta(hours=3)
    order = Order(
        shopper_id=shopper.id,
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
        status=final,
        status_changed_at=decided
        if demo.outcome in ("approved", "declined")
        else (created + timedelta(minutes=5)),
        created_at=created,
    )
    session.add(order)
    session.flush()

    # The same trail of events a real order leaves (CLAUDE.md payment rule 7).
    steps: list[tuple[timedelta, Actor, OrderStatus | None, OrderStatus, str, dict[str, Any]]] = [
        (timedelta(0), Actor.system, None, OrderStatus.draft, "drafted", {}),
        (
            timedelta(minutes=2),
            Actor.shopper,
            OrderStatus.draft,
            OrderStatus.draft,
            "confirmed",
            {"method": demo.method, "transcript": demo.transcript, "total": demo.price},
        ),
        (
            timedelta(minutes=3),
            Actor.system,
            OrderStatus.draft,
            OrderStatus.awaiting_shopper,
            "paypal_order_created",
            {},
        ),
        (
            timedelta(minutes=5),
            Actor.system,
            OrderStatus.awaiting_shopper,
            OrderStatus.awaiting_shopper,
            "authorized",
            {"amount": demo.price},
        ),
    ]
    if demo.outcome == "paid":
        steps.append(
            (
                timedelta(minutes=5),
                Actor.system,
                OrderStatus.awaiting_shopper,
                OrderStatus.captured,
                "captured",
                {},
            )
        )
    else:
        steps.append(
            (
                timedelta(minutes=5),
                Actor.system,
                OrderStatus.awaiting_shopper,
                OrderStatus.awaiting_caregiver,
                "sent_to_caregiver",
                {},
            )
        )
    if demo.outcome == "approved":
        steps.append(
            (
                timedelta(hours=3),
                Actor.caregiver,
                OrderStatus.awaiting_caregiver,
                OrderStatus.captured,
                "approved_and_captured",
                {"caregiver_id": caregiver.id},
            )
        )
    if demo.outcome == "declined":
        steps.append(
            (
                timedelta(hours=3),
                Actor.caregiver,
                OrderStatus.awaiting_caregiver,
                OrderStatus.voided,
                "declined_and_voided",
                {"caregiver_id": caregiver.id, "note": demo.note},
            )
        )
    for after, actor, before, to, event, detail in steps:
        session.add(
            OrderEvent(
                order_id=order.id,
                from_status=before,
                to_status=to,
                actor=actor,
                detail={"event": event, **detail, "demo": True},
                created_at=created + after,
            )
        )

    params = {"title": demo.title, "total": demo.price, "currency": "USD"}
    if demo.outcome in ("approved", "declined"):
        session.add(
            Approval(
                order_id=order.id,
                caregiver_id=caregiver.id,
                decision=Decision.approved if demo.outcome == "approved" else Decision.declined,
                note=demo.note,
                decided_at=decided,
            )
        )
        session.add(
            Notification(
                user_id=shopper.id,
                kind=AlertKind.approved if demo.outcome == "approved" else AlertKind.declined,
                order_id=order.id,
                params={**params, "caregiver_name": caregiver.name, "note": demo.note},
                created_at=decided,
                read_at=decided + timedelta(minutes=10),
            )
        )
    if demo.outcome != "paid":
        # Sam was asked; only the newest request is still unread.
        session.add(
            Notification(
                user_id=caregiver.id,
                kind=AlertKind.approval_needed,
                order_id=order.id,
                params={**params, "shopper_name": shopper.name},
                created_at=created + timedelta(minutes=5),
                read_at=None if demo.outcome == "waiting" else decided,
            )
        )


if __name__ == "__main__":
    from app.db import SessionLocal

    with SessionLocal() as session:
        shopper, caregiver = seed(session)
        orders = session.scalars(select(Order).where(Order.shopper_id == shopper.id)).all()
        print(f"Shopper {shopper.name} (id {shopper.id}) and caregiver {caregiver.name}")
        print(f"(id {caregiver.id}). {shopper.name} has {len(orders)} orders.")
        print("Sign in at /signin by choosing either of them.")
