"""Orders for the signed-in user: the list, one order, and the checkout steps.

The logic lives in app.services (orders, checkout); this module only translates HTTP.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import get_channel3, get_paypal
from app.core.security import CurrentUser, SessionDep
from app.integrations.channel3 import Channel3Client
from app.integrations.paypal import PayPalClient
from app.schemas.common import OrderOut
from app.schemas.orders import (
    ConfirmIn,
    ConfirmOut,
    DraftIn,
    EventOut,
    MessageOut,
    OrderDetail,
    OrderRow,
    PayPalOut,
    WarningOut,
)
from app.services import checkout, conversations, orders

router = APIRouter(prefix="/orders", tags=["orders"])

Channel3Dep = Annotated[Channel3Client, Depends(get_channel3)]
PayPalDep = Annotated[PayPalClient, Depends(get_paypal)]

TRANSCRIPT_MESSAGES = 30


@router.get("")
def my_orders(user: CurrentUser, session: SessionDep) -> list[OrderRow]:
    """Every order the user confirmed or went further with, newest first."""
    return [
        OrderRow(
            id=o.id,
            created_at=o.created_at,
            title=o.title,
            retailer=o.retailer,
            category=o.category,
            price=o.price,
            total=orders.total(o),
            currency=o.currency,
            status=o.status,
            method=o.confirmation_method,
        )
        for o in orders.placed(session, user.id)
    ]


@router.post("/draft", status_code=status.HTTP_201_CREATED)
async def draft_order(
    body: DraftIn, user: CurrentUser, session: SessionDep, channel3: Channel3Dep
) -> OrderOut:
    order = await orders.draft_product(session, channel3, user.id, body.channel3_product_id)
    return OrderOut.of(order)


@router.get("/{order_id}")
def order_detail(order_id: int, user: CurrentUser, session: SessionDep) -> OrderDetail:
    order = orders.own(session, order_id, user.id)
    return OrderDetail(
        order=OrderOut.of(order),
        confirmation_transcript=order.confirmation_transcript,
        events=[
            EventOut(
                at=e.created_at,
                event=e.detail.get("event", ""),
                actor=e.actor,
                status=e.to_status,
                note=e.note,
            )
            for e in orders.events(session, order)
        ],
        conversation=[
            MessageOut(role=m.role, text=m.text)
            for m in conversations.transcript(session, user.id, TRANSCRIPT_MESSAGES)
        ],
    )


@router.post("/{order_id}/confirm")
async def confirm(
    order_id: int, body: ConfirmIn, user: CurrentUser, session: SessionDep, channel3: Channel3Dep
) -> ConfirmOut:
    order = orders.own(session, order_id, user.id)
    result = await checkout.confirm(
        session,
        channel3,
        order,
        user,
        checkout.Shown(
            title=body.title,
            price=body.price,
            currency=body.currency,
            total=body.total,
            method=body.method,
            transcript=body.transcript,
            acknowledged=frozenset(body.acknowledged),
        ),
    )
    return ConfirmOut(
        confirmed=result.confirmed,
        reason=result.reason,
        warnings=[
            WarningOut(code=w.code, message=w.message, amount=w.amount, currency=w.currency)
            for w in result.warnings
        ],
        order=OrderOut.of(order),
    )


@router.post("/{order_id}/paypal")
async def create_paypal_order(
    order_id: int,
    user: CurrentUser,
    session: SessionDep,
    channel3: Channel3Dep,
    paypal: PayPalDep,
) -> PayPalOut:
    order = orders.own(session, order_id, user.id)
    try:
        paypal_order_id = await checkout.start_payment(session, channel3, paypal, order, user)
    except checkout.NeedsReconfirm as error:
        # The app shows the order again with the new figures.
        error.detail["order"] = OrderOut.of(order).model_dump(mode="json")
        raise
    return PayPalOut(paypal_order_id=paypal_order_id)


@router.post("/{order_id}/approved")
async def approved(
    order_id: int, user: CurrentUser, session: SessionDep, paypal: PayPalDep
) -> OrderOut:
    """The user approved in PayPal: authorize and capture. Safe to call twice."""
    order = orders.own(session, order_id, user.id)
    return OrderOut.of(await checkout.complete_payment(session, paypal, order))
