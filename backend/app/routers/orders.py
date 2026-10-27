"""Order endpoints: draft -> confirm -> PayPal order -> shopper approves -> authorize -> capture.

Money only moves in `approved`, and only for the total the shopper confirmed.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.deps import get_channel3, get_paypal
from app.models import Actor, Order, OrderStatus, Role, User
from app.schemas import OrderOut
from app.services import limits
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
    """Exactly what the shopper was shown when they said yes."""

    title: str
    price: Decimal
    currency: str
    total: Decimal


class ConfirmOut(BaseModel):
    confirmed: bool
    reason: str | None = None
    order: OrderOut


class PayPalOut(BaseModel):
    paypal_order_id: str


@router.post("/draft", status_code=status.HTTP_201_CREATED)
async def draft_order(body: DraftIn, session: SessionDep, channel3: Channel3Dep) -> OrderOut:
    shopper = session.get(User, body.shopper_id)
    if shopper is None or shopper.role != Role.shopper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shopper not found")
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


@router.post("/{order_id}/confirm")
async def confirm(
    order_id: int, body: ConfirmIn, session: SessionDep, channel3: Channel3Dep
) -> ConfirmOut:
    order = _get(session, order_id)
    if order.status != OrderStatus.draft:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Order is {order.status}, not a draft")

    shown = (body.title, body.price, body.currency, body.total)
    if shown != (order.title, order.price, order.currency, total(order)):
        return ConfirmOut(confirmed=False, reason="details_changed", order=OrderOut.of(order))

    result = await _recheck(session, channel3, order)
    if result is not None:
        return ConfirmOut(confirmed=False, reason=result, order=OrderOut.of(order))

    order.confirmed_total = body.total
    order.confirmed_at = datetime.now(UTC)
    record(
        session,
        order,
        Actor.shopper,
        "confirmed",
        title=body.title,
        price=body.price,
        currency=body.currency,
        total=body.total,
    )
    session.commit()
    return ConfirmOut(confirmed=True, order=OrderOut.of(order))


@router.post("/{order_id}/paypal")
async def create_paypal_order(
    order_id: int, session: SessionDep, channel3: Channel3Dep, paypal: PayPalDep
) -> PayPalOut:
    order = _get(session, order_id)
    if order.status == OrderStatus.awaiting_shopper and order.paypal_order_id:
        return PayPalOut(paypal_order_id=order.paypal_order_id)
    if order.status != OrderStatus.draft or order.confirmed_total is None:
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
async def approved(order_id: int, session: SessionDep, paypal: PayPalDep) -> OrderOut:
    order = _get(session, order_id)
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


def _get(session: Session, order_id: int) -> Order:
    order = session.get(Order, order_id)
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
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
