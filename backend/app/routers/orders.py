"""Order endpoints: draft -> confirm -> PayPal order -> shopper approves -> authorize -> capture.

Money only moves in `approved`, and only for the total the shopper confirmed.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import CurrentUser, check_is_shopper
from app.db import get_session
from app.deps import get_channel3, get_paypal
from app.models import Actor, Approval, ConfirmationMethod, Order, OrderStatus, User
from app.schemas import OrderOut
from app.services import consent, limits
from app.services.alerts import ask_caregivers, caregivers_of
from app.services.channel3 import Channel3Client, Channel3Error
from app.services.orders import (
    RecheckResult,
    apply_new_offer,
    blocked_categories,
    create_draft,
    recheck_price,
    record,
    total,
)
from app.services.paypal import PayPalClient, PayPalError

router = APIRouter(prefix="/orders", tags=["orders"])

SessionDep = Annotated[Session, Depends(get_session)]
Channel3Dep = Annotated[Channel3Client, Depends(get_channel3)]
PayPalDep = Annotated[PayPalClient, Depends(get_paypal)]


class DraftIn(BaseModel):
    shopper_id: int
    channel3_product_id: str


class ConfirmIn(BaseModel):
    """Exactly what the shopper was shown (and read) when they said yes."""

    title: str
    price: Decimal
    currency: str
    total: Decimal
    method: ConfirmationMethod = ConfirmationMethod.button
    # Required for voice: the server, not the browser, decides if it was a yes.
    transcript: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def voice_needs_transcript(self) -> "ConfirmIn":
        if self.method == ConfirmationMethod.voice and not (self.transcript or "").strip():
            raise ValueError("A voice confirmation needs the transcript")
        if self.method == ConfirmationMethod.button:
            self.transcript = None
        return self


class ConfirmOut(BaseModel):
    confirmed: bool
    reason: str | None = None
    order: OrderOut


class PayPalOut(BaseModel):
    paypal_order_id: str


class OrderStatusOut(BaseModel):
    """What the shopper app polls while an order waits for a caregiver."""

    order: OrderOut
    caregiver_name: str | None  # who will decide; None if nobody looks after them
    note: str | None  # the caregiver's note with their latest decision


@router.post("/draft", status_code=status.HTTP_201_CREATED)
async def draft_order(
    body: DraftIn, session: SessionDep, channel3: Channel3Dep, user: CurrentUser
) -> OrderOut:
    check_is_shopper(user, body.shopper_id)
    shopper = user
    try:
        product = await channel3.get_product(
            body.channel3_product_id, blocked_categories(session, shopper.id)
        )
    except Channel3Error as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Product search is unavailable") from error
    if product is None or product.best_offer is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not available")

    order = create_draft(session, shopper.id, product, Actor.shopper)
    session.commit()
    return OrderOut.of(order)


@router.get("/{order_id}")
def order_status(order_id: int, session: SessionDep, user: CurrentUser) -> OrderStatusOut:
    order = _get(session, order_id, user)
    caregivers = caregivers_of(session, order.shopper_id)
    decision = session.scalars(
        select(Approval).where(Approval.order_id == order.id).order_by(Approval.id.desc())
    ).first()
    return OrderStatusOut(
        order=OrderOut.of(order),
        caregiver_name=caregivers[0].name if caregivers else None,
        note=decision.note if decision else None,
    )


@router.post("/{order_id}/confirm")
async def confirm(
    order_id: int, body: ConfirmIn, session: SessionDep, channel3: Channel3Dep, user: CurrentUser
) -> ConfirmOut:
    order = _get(session, order_id, user)
    if not _needs_confirmation(order):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is {order.status}, not a draft")

    if body.method == ConfirmationMethod.voice:
        answer = consent.classify(body.transcript or "")
        if answer != "yes":
            # Not a yes: nothing changes. "no" lets the app drop the order; anything
            # else means Aide answers or asks again.
            record(session, order, Actor.shopper, f"voice_{answer}", transcript=body.transcript)
            session.commit()
            reason = "declined" if answer == "no" else "unclear"
            return ConfirmOut(confirmed=False, reason=reason, order=OrderOut.of(order))

    shown = (body.title, body.price, body.currency, body.total)
    if shown != (order.title, order.price, order.currency, total(order)):
        return ConfirmOut(confirmed=False, reason="details_changed", order=OrderOut.of(order))

    result = await _recheck(session, channel3, order)
    if result is not None:
        return ConfirmOut(confirmed=False, reason=result, order=OrderOut.of(order))

    order.confirmed_total = body.total
    order.confirmed_at = datetime.now(UTC)
    order.confirmation_method = body.method
    order.confirmation_transcript = body.transcript
    record(
        session,
        order,
        Actor.shopper,
        "confirmed",
        title=body.title,
        price=body.price,
        currency=body.currency,
        total=body.total,
        method=body.method,
        transcript=body.transcript,
    )
    session.commit()
    return ConfirmOut(confirmed=True, order=OrderOut.of(order))


@router.post("/{order_id}/paypal")
async def create_paypal_order(
    order_id: int, session: SessionDep, channel3: Channel3Dep, paypal: PayPalDep, user: CurrentUser
) -> PayPalOut:
    order = _get(session, order_id, user)
    if order.status == OrderStatus.awaiting_shopper and order.paypal_order_id:
        return PayPalOut(paypal_order_id=order.paypal_order_id)
    if not _needs_confirmation(order) or order.confirmed_total is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "The shopper has not confirmed this order")

    # Rule 4: re-check the price just before creating the PayPal order.
    result = await _recheck(session, channel3, order)
    if result is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {"reason": result, "order": OrderOut.of(order).model_dump(mode="json")},
        )

    try:
        paypal_order = await paypal.create_order(order)
    except PayPalError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PayPal is unavailable") from error
    order.paypal_order_id = paypal_order.id
    record(
        session,
        order,
        Actor.system,
        "paypal_order_created",
        OrderStatus.awaiting_shopper,
        paypal_order_id=paypal_order.id,
    )
    session.commit()
    return PayPalOut(paypal_order_id=paypal_order.id)


@router.post("/{order_id}/approved")
async def approved(
    order_id: int, session: SessionDep, paypal: PayPalDep, user: CurrentUser
) -> OrderOut:
    order = _get(session, order_id, user)
    if order.status in (OrderStatus.captured, OrderStatus.awaiting_caregiver):
        return OrderOut.of(order)  # already handled; safe to call twice
    if order.status != OrderStatus.awaiting_shopper or not order.paypal_order_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Order is not waiting for PayPal approval")
    assert order.confirmed_total is not None

    try:
        auth = await paypal.authorize(order.paypal_order_id)
    except PayPalError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PayPal is unavailable") from error
    order.paypal_auth_id = auth.id
    record(session, order, Actor.system, "authorized", auth_id=auth.id, amount=auth.amount)
    session.commit()

    if (auth.amount, auth.currency) != (order.confirmed_total, order.currency):
        await paypal.void(auth.id)
        record(session, order, Actor.system, "amount_mismatch_voided", OrderStatus.voided)
        session.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "Authorized amount did not match")

    decision = limits.check(session, order.shopper_id, order.confirmed_total, order.currency)
    if decision == limits.LimitDecision.needs_caregiver:
        record(session, order, Actor.system, "sent_to_caregiver", OrderStatus.awaiting_caregiver)
        ask_caregivers(session, order)
    else:
        try:
            capture = await paypal.capture(auth.id)
        except PayPalError as error:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "PayPal is unavailable") from error
        record(
            session, order, Actor.system, "captured", OrderStatus.captured, capture_id=capture.id
        )
    session.commit()
    return OrderOut.of(order)


def _needs_confirmation(order: Order) -> bool:
    """A draft, or an order sent back to the shopper after its PayPal hold expired."""
    return order.status == OrderStatus.draft or (
        order.status == OrderStatus.awaiting_shopper and order.paypal_order_id is None
    )


def _get(session: Session, order_id: int, user: User) -> Order:
    """The order, if it belongs to the signed-in shopper."""
    order = session.get(Order, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    check_is_shopper(user, order.shopper_id)
    return order


async def _recheck(session: Session, channel3: Channel3Client, order: Order) -> str | None:
    """Return a reason to ask the shopper again, after updating the order; None if unchanged."""
    try:
        result, offer = await recheck_price(session, channel3, order)
    except Channel3Error as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Product search is unavailable") from error
    if result == RecheckResult.unchanged:
        return None
    apply_new_offer(session, order, result, offer)
    session.commit()
    return result.value
