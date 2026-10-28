"""Caregiver area. Every route needs a caregiver; shopper routes also need an
active care link to that shopper (see app.auth)."""

import asyncio
from datetime import datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select

from app.agent.llm import LLMClient
from app.auth import (
    CaredForShopper,
    Caregiver,
    SessionDep,
    check_looks_after,
    linked_shopper_ids,
)
from app.deps import get_channel3, get_llm, get_paypal
from app.models import CareLink, CareLinkStatus, Limit, Order, OrderStatus, User
from app.schemas import OrderOut
from app.services import approvals
from app.services.channel3 import Category, Channel3Client, Channel3Error
from app.services.orders import total
from app.services.paypal import PayPalClient, PayPalError
from app.services.summary import approval_summary

router = APIRouter(prefix="/care", tags=["care"])

Channel3Dep = Annotated[Channel3Client, Depends(get_channel3)]
PayPalDep = Annotated[PayPalClient, Depends(get_paypal)]
LLMDep = Annotated[LLMClient, Depends(get_llm)]

# Limits are kept in one currency; the shopper's orders in other currencies always
# go to the caregiver (app/services/limits.py), so offer the common ones only.
Currency = Literal["USD", "EUR", "GBP", "CAD", "AUD"]
Money = Annotated[Decimal, Field(gt=0, le=Decimal("99999999.99"), decimal_places=2)]


class ShopperOut(BaseModel):
    id: int
    name: str
    language: str


class LimitsIn(BaseModel):
    per_order_max: Money
    monthly_max: Money
    currency: Currency
    # Channel3 category slugs; never free text (unknown slugs are refused).
    blocked_categories: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("blocked_categories")
    @classmethod
    def unique(cls, slugs: list[str]) -> list[str]:
        return list(dict.fromkeys(slug.strip() for slug in slugs if slug.strip()))

    @model_validator(mode="after")
    def monthly_covers_one_order(self) -> "LimitsIn":
        if self.monthly_max < self.per_order_max:
            raise ValueError("The monthly limit must be at least the per-order limit")
        return self


class LimitsOut(BaseModel):
    is_set: bool  # False until a caregiver saves limits: then nothing needs approval
    per_order_max: Decimal | None
    monthly_max: Decimal | None
    currency: Currency
    blocked_categories: list[Category]


@router.get("/shoppers")
def my_shoppers(caregiver: Caregiver, session: SessionDep) -> list[ShopperOut]:
    """The shoppers this caregiver actively looks after."""
    shoppers = session.scalars(
        select(User)
        .join(CareLink, CareLink.shopper_id == User.id)
        .where(CareLink.caregiver_id == caregiver.id, CareLink.status == CareLinkStatus.active)
        .order_by(User.name)
    )
    return [ShopperOut(id=s.id, name=s.name, language=s.language) for s in shoppers]


@router.get("/shoppers/{shopper_id}")
def shopper(shopper: CaredForShopper) -> ShopperOut:
    return ShopperOut(id=shopper.id, name=shopper.name, language=shopper.language)


@router.get("/categories")
async def categories(
    caregiver: Caregiver, channel3: Channel3Dep, query: str = ""
) -> list[Category]:
    """Top-level Channel3 categories, or those matching `query` (e.g. "vitamins")."""
    try:
        if query.strip():
            return await channel3.search_categories(query.strip())
        return await channel3.list_root_categories()
    except Channel3Error as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Categories are unavailable") from error


@router.get("/shoppers/{shopper_id}/limits")
async def get_limits(
    shopper: CaredForShopper, session: SessionDep, channel3: Channel3Dep
) -> LimitsOut:
    limit = session.get(Limit, shopper.id)
    if limit is None:
        return LimitsOut(
            is_set=False,
            per_order_max=None,
            monthly_max=None,
            currency="USD",
            blocked_categories=[],
        )
    return await _limits_out(limit, channel3)


@router.put("/shoppers/{shopper_id}/limits")
async def put_limits(
    body: LimitsIn, shopper: CaredForShopper, session: SessionDep, channel3: Channel3Dep
) -> LimitsOut:
    limit = session.get(Limit, shopper.id)
    already = set(limit.blocked_categories) if limit else set()

    # Check new categories exist in Channel3, so a typo can never "block" nothing.
    new = [slug for slug in body.blocked_categories if slug not in already]
    try:
        found = await asyncio.gather(*(channel3.get_category(slug) for slug in new))
    except Channel3Error as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Categories are unavailable") from error
    unknown = [slug for slug, category in zip(new, found, strict=True) if category is None]
    if unknown:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            {"message": "These are not Channel3 categories", "unknown_categories": unknown},
        )

    if limit is None:
        limit = Limit(shopper_id=shopper.id)
        session.add(limit)
    limit.per_order_max = body.per_order_max
    limit.monthly_max = body.monthly_max
    limit.currency = body.currency
    limit.blocked_categories = body.blocked_categories
    session.commit()
    return await _limits_out(limit, channel3)


async def _limits_out(limit: Limit, channel3: Channel3Client) -> LimitsOut:
    return LimitsOut(
        is_set=True,
        per_order_max=limit.per_order_max,
        monthly_max=limit.monthly_max,
        currency=limit.currency,  # type: ignore[arg-type]
        blocked_categories=list(
            await asyncio.gather(*(_titled(slug, channel3) for slug in limit.blocked_categories))
        ),
    )


async def _titled(slug: str, channel3: Channel3Client) -> Category:
    """The category's title for display; the slug itself if Channel3 can't say."""
    try:
        category = await channel3.get_category(slug)
    except Channel3Error:
        category = None
    fallback = slug.replace("-", " ").capitalize()
    return category or Category(slug=slug, title=fallback, path=[fallback])


# --- Approvals -----------------------------------------------------------------


class WaitingOrder(BaseModel):
    order_id: int
    shopper: ShopperOut
    title: str
    retailer: str
    price: Decimal
    total: Decimal
    currency: str
    confirmation_method: str | None
    # What the shopper said when they confirmed by voice, word for word.
    confirmation_transcript: str | None
    waiting_since: datetime
    summary: str  # one sentence, written by the AI from the facts only


class DecisionIn(BaseModel):
    decision: Literal["approve", "decline"]
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def blank_is_none(cls, note: str | None) -> str | None:
        return note.strip() or None if note else None


class DecisionOut(BaseModel):
    outcome: approvals.Outcome
    message: str  # plain words for the caregiver
    order: OrderOut


@router.get("/approvals")
async def waiting_for_me(
    caregiver: Caregiver, session: SessionDep, llm: LLMDep
) -> list[WaitingOrder]:
    """Orders over a limit, from the shoppers this caregiver looks after, oldest first."""
    orders = session.scalars(
        select(Order)
        .where(
            Order.status == OrderStatus.awaiting_caregiver,
            Order.shopper_id.in_(linked_shopper_ids(session, caregiver)),
        )
        .order_by(Order.status_changed_at)
    ).all()
    waiting = []
    for order in orders:
        shopper = session.get(User, order.shopper_id)
        assert shopper is not None
        waiting.append(
            WaitingOrder(
                order_id=order.id,
                shopper=ShopperOut(id=shopper.id, name=shopper.name, language=shopper.language),
                title=order.title,
                retailer=order.retailer,
                price=order.price,
                total=total(order),
                currency=order.currency,
                confirmation_method=order.confirmation_method,
                confirmation_transcript=order.confirmation_transcript,
                waiting_since=order.status_changed_at,
                summary=await approval_summary(llm, session, order),
            )
        )
    return waiting


@router.post("/approvals/{order_id}")
async def decide(
    order_id: int,
    body: DecisionIn,
    caregiver: Caregiver,
    session: SessionDep,
    paypal: PayPalDep,
) -> DecisionOut:
    # Lock the row (Postgres) so two quick clicks cannot both capture.
    order = session.scalar(select(Order).where(Order.id == order_id).with_for_update())
    if order is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    check_looks_after(session, caregiver, order.shopper_id)
    shopper = session.get(User, order.shopper_id)
    assert shopper is not None

    act = approvals.approve if body.decision == "approve" else approvals.decline
    try:
        outcome = await act(session, paypal, order, caregiver, body.note)
    except approvals.NotWaiting as error:
        session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This order is no longer waiting for you. Nothing was changed.",
        ) from error
    except PayPalError as error:
        session.rollback()
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "PayPal did not answer. Nothing was changed; please try again.",
        ) from error
    return DecisionOut(
        outcome=outcome, message=_message(outcome, order, shopper), order=OrderOut.of(order)
    )


def _message(outcome: approvals.Outcome, order: Order, shopper: User) -> str:
    match outcome:
        case approvals.Outcome.captured:
            return f"Approved. {shopper.name}'s order for {order.title} is paid."
        case approvals.Outcome.voided:
            return f"Declined. Nothing was paid, and {shopper.name} will be told kindly."
        case approvals.Outcome.expired:
            return (
                f"The payment hold for {order.title} ran out before you approved it, so "
                f"nothing was paid. {shopper.name} will be asked to confirm and pay again, "
                "and the order will come back to you."
            )
