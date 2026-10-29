"""Checkout: confirm -> PayPal order -> the user approves in PayPal -> authorize -> capture.

CLAUDE.md payment rules, in order:
- The user's yes is stored with the exact title, price, currency and total shown (3).
- Spending rules are checked; breaking one needs a second, explicit yes (5).
- The price is checked again just before the PayPal order is created (4).
- Money only moves here, on the server, for the total the user confirmed (1, 2).
- Every state change is logged (7).
"""

from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Upstream
from app.integrations.channel3 import Channel3Client, Channel3Error
from app.integrations.paypal import PayPalClient, PayPalError, Purchase
from app.models import Actor, ConfirmationMethod, Order, OrderEvent, OrderStatus, User
from app.services import consent, rules
from app.services.alerts import send_alert
from app.services.orders import (
    RecheckResult,
    apply_new_offer,
    clear_confirmation,
    recheck_price,
    record,
    total,
)
from app.services.rules import RuleWarning

# Reasons to ask the user again instead of confirming.
NEEDS_EXTRA_CONFIRMATION = "needs_extra_confirmation"


@dataclass(frozen=True)
class Shown:
    """What the user saw (and heard) when they said yes."""

    title: str
    price: Decimal
    currency: str
    total: Decimal
    method: ConfirmationMethod = ConfirmationMethod.button
    transcript: str | None = None
    # Spending-rule warnings the user saw and said yes to anyway.
    acknowledged: frozenset[str] = frozenset()


@dataclass
class ConfirmResult:
    confirmed: bool
    reason: str | None = None
    warnings: list[RuleWarning] = field(default_factory=list)


async def confirm(
    session: Session, channel3: Channel3Client, order: Order, user: User, shown: Shown
) -> ConfirmResult:
    if order.status not in (OrderStatus.draft, OrderStatus.confirmed):
        raise Conflict(f"Order is {order.status}; it can't be confirmed again")

    if shown.method == ConfirmationMethod.voice:
        answer = consent.classify(shown.transcript or "")
        if answer != "yes":
            # Not a yes: nothing changes. The app drops the order on "no" and asks
            # again on anything else.
            record(session, order, Actor.user, f"voice_{answer}", transcript=shown.transcript)
            session.commit()
            return ConfirmResult(False, "declined" if answer == "no" else "unclear")

    if (shown.title, shown.price, shown.currency, shown.total) != (
        order.title,
        order.price,
        order.currency,
        total(order),
    ):
        return ConfirmResult(False, "details_changed")

    changed = await _recheck(session, channel3, order)
    if changed:
        return ConfirmResult(False, changed)

    warnings = rules.check(session, user, total(order), order.currency)
    unaccepted = [w for w in warnings if w.code not in shown.acknowledged]
    if unaccepted:
        record(
            session,
            order,
            Actor.system,
            "rules_warning",
            warnings=[w.code for w in unaccepted],
            note=" ".join(w.message for w in unaccepted),
        )
        session.commit()
        return ConfirmResult(False, NEEDS_EXTRA_CONFIRMATION, warnings)

    order.confirmed_total = shown.total
    order.confirmed_at = datetime.now(UTC)
    order.confirmation_method = shown.method
    order.confirmation_transcript = shown.transcript
    accepted = sorted(w.code for w in warnings)
    record(
        session,
        order,
        Actor.user,
        "confirmed",
        OrderStatus.confirmed,
        note=("Accepted: " + " ".join(w.message for w in warnings)) if warnings else None,
        title=shown.title,
        price=shown.price,
        currency=shown.currency,
        total=shown.total,
        method=shown.method,
        transcript=shown.transcript,
        acknowledged=accepted,
    )
    session.commit()
    return ConfirmResult(True, warnings=warnings)


class NeedsReconfirm(Conflict):
    """Something changed since the user's yes; the app must ask again."""


async def start_payment(
    session: Session, channel3: Channel3Client, paypal: PayPalClient, order: Order, user: User
) -> str:
    """Create the PayPal order (intent AUTHORIZE) and return its id."""
    if order.status == OrderStatus.awaiting_payment and order.paypal_order_id:
        return order.paypal_order_id  # safe to call twice
    if order.status != OrderStatus.confirmed or order.confirmed_total is None:
        raise Conflict("The order has not been confirmed")

    # Rule 4: re-check the price just before creating the PayPal order.
    changed = await _recheck(session, channel3, order)
    if changed:
        raise NeedsReconfirm("The order changed", reason=changed, order_id=order.id)

    # Rule 5: rules can change between the yes and paying (e.g. another order).
    warnings = rules.check(session, user, order.confirmed_total, order.currency)
    accepted = _acknowledged(session, order)
    if any(w.code not in accepted for w in warnings):
        clear_confirmation(order)
        record(session, order, Actor.system, "rules_changed", OrderStatus.draft)
        session.commit()
        raise NeedsReconfirm(
            "A spending rule needs your yes",
            reason=NEEDS_EXTRA_CONFIRMATION,
            order_id=order.id,
        )

    try:
        paypal_order = await paypal.create_order(purchase_for(order))
    except PayPalError as error:
        raise Upstream("PayPal is unavailable") from error
    order.paypal_order_id = paypal_order.id
    record(
        session,
        order,
        Actor.system,
        "paypal_order_created",
        OrderStatus.awaiting_payment,
        paypal_order_id=paypal_order.id,
    )
    session.commit()
    return paypal_order.id


async def complete_payment(session: Session, paypal: PayPalClient, order: Order) -> Order:
    """After the user approves in PayPal: authorize, then capture. Safe to call again:
    it carries on from wherever it stopped."""
    if order.status == OrderStatus.captured:
        return order
    if order.status == OrderStatus.awaiting_payment and order.paypal_order_id:
        await _authorize(session, paypal, order)
    if order.status != OrderStatus.authorized or not order.paypal_auth_id:
        raise Conflict("Order is not waiting for payment")

    try:
        capture = await paypal.capture(order.paypal_auth_id)
    except PayPalError as error:
        # The hold stays; calling again retries the capture (same idempotency key).
        raise Upstream("PayPal did not finish the payment; please try again") from error
    record(session, order, Actor.system, "captured", OrderStatus.captured, capture_id=capture.id)
    user = session.get(User, order.user_id)
    if user is not None:
        send_alert(
            session,
            user,
            "order_paid",
            order_id=order.id,
            title=order.title,
            total=str(order.confirmed_total),
            currency=order.currency,
        )
    session.commit()
    return order


async def _authorize(session: Session, paypal: PayPalClient, order: Order) -> None:
    assert order.paypal_order_id is not None and order.confirmed_total is not None
    try:
        auth = await paypal.authorize(order.paypal_order_id)
    except PayPalError as error:
        raise Upstream("PayPal is unavailable") from error
    order.paypal_auth_id = auth.id
    record(
        session,
        order,
        Actor.system,
        "authorized",
        OrderStatus.authorized,
        auth_id=auth.id,
        amount=auth.amount,
    )
    session.commit()
    if (auth.amount, auth.currency) != (order.confirmed_total, order.currency):
        await paypal.void(auth.id)
        record(session, order, Actor.system, "amount_mismatch_voided", OrderStatus.voided)
        session.commit()
        raise Conflict("PayPal held a different amount, so it was released. Nothing was paid.")


def _acknowledged(session: Session, order: Order) -> set[str]:
    """Warnings the user accepted with their latest yes."""
    detail = session.scalars(
        select(OrderEvent.detail)
        .where(OrderEvent.order_id == order.id)
        .order_by(OrderEvent.id.desc())
    )
    for entry in detail:
        if entry.get("event") == "confirmed":
            return set(entry.get("acknowledged") or [])
    return set()


async def _recheck(session: Session, channel3: Channel3Client, order: Order) -> str | None:
    """A reason to ask again (after updating the order), or None if nothing changed."""
    try:
        result, offer = await recheck_price(session, channel3, order)
    except Channel3Error as error:
        raise Upstream("Product search is unavailable") from error
    if result == RecheckResult.unchanged:
        return None
    apply_new_offer(session, order, result, offer)
    session.commit()
    return result.value


def purchase_for(order: Order) -> Purchase:
    """What PayPal is asked to authorize: exactly what the user confirmed."""
    if order.confirmed_total is None:
        raise Conflict(f"Order {order.id} has no confirmation from the user", order_id=order.id)
    return Purchase(
        reference=str(order.id),
        title=order.title,
        price=order.price,
        total=order.confirmed_total,
        currency=order.currency,
    )
