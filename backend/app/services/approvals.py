"""Caregiver decisions on over-limit orders (CLAUDE.md payment rule 5).

Approve -> capture; decline -> void. Both write an `approvals` row and an order
event. Only an order in `awaiting_caregiver` can be decided, so a second click,
or a decision on a voided order, changes nothing and moves no money.

PayPal holds authorized money for 29 days (3-day honor period; see
developer.paypal.com/docs/checkout/standard/customize/authorization/). If the
hold has run out, capture fails with AUTHORIZATION_EXPIRED: then nothing is
paid, and the order goes back to the shopper to confirm and pay again.
"""

import enum
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.models import Actor, Approval, Decision, Order, OrderStatus, User
from app.services.orders import record
from app.services.paypal import AUTHORIZATION_EXPIRED, PayPalClient, PayPalError


class Outcome(enum.StrEnum):
    captured = "captured"  # approved and paid
    voided = "voided"  # declined; the hold on the shopper's money is released
    expired = "expired"  # approved, but the hold had run out: nothing was paid


class NotWaiting(Exception):
    """The order is not waiting for a caregiver (already decided, voided, ...)."""


async def approve(
    session: Session, paypal: PayPalClient, order: Order, caregiver: User, note: str | None
) -> Outcome:
    auth_id = _waiting_auth(order)
    try:
        capture = await paypal.capture(auth_id)
    except PayPalError as error:
        if error.issue != AUTHORIZATION_EXPIRED:
            raise  # PayPal unavailable: nothing changed, the caregiver can try again
        _decide(session, order, caregiver, Decision.approved, note)
        _send_back_to_shopper(session, order, caregiver)
        session.commit()
        return Outcome.expired

    _decide(session, order, caregiver, Decision.approved, note)
    record(
        session,
        order,
        Actor.caregiver,
        "approved_and_captured",
        OrderStatus.captured,
        caregiver_id=caregiver.id,
        capture_id=capture.id,
    )
    session.commit()
    return Outcome.captured


async def decline(
    session: Session, paypal: PayPalClient, order: Order, caregiver: User, note: str | None
) -> Outcome:
    auth_id = _waiting_auth(order)
    try:
        await paypal.void(auth_id)
    except PayPalError as error:
        # An expired hold has already released the money: declining still stands.
        if error.issue != AUTHORIZATION_EXPIRED:
            raise
    _decide(session, order, caregiver, Decision.declined, note)
    record(
        session,
        order,
        Actor.caregiver,
        "declined_and_voided",
        OrderStatus.voided,
        caregiver_id=caregiver.id,
        note=note,
    )
    session.commit()
    return Outcome.voided


def _waiting_auth(order: Order) -> str:
    if order.status != OrderStatus.awaiting_caregiver or not order.paypal_auth_id:
        raise NotWaiting(f"Order {order.id} is {order.status}")
    return order.paypal_auth_id


def _decide(
    session: Session, order: Order, caregiver: User, decision: Decision, note: str | None
) -> None:
    session.add(
        Approval(
            order_id=order.id,
            caregiver_id=caregiver.id,
            decision=decision,
            note=note,
            decided_at=datetime.now(UTC),
        )
    )


def _send_back_to_shopper(session: Session, order: Order, caregiver: User) -> None:
    """The PayPal order is used up: the shopper must confirm (rule 3) and pay again."""
    old = {"paypal_order_id": order.paypal_order_id, "auth_id": order.paypal_auth_id}
    order.paypal_order_id = None
    order.paypal_auth_id = None
    order.confirmed_total = None
    order.confirmed_at = None
    order.confirmation_method = None
    order.confirmation_transcript = None
    record(
        session,
        order,
        Actor.system,
        "authorization_expired",
        OrderStatus.awaiting_shopper,
        caregiver_id=caregiver.id,
        **old,
    )
