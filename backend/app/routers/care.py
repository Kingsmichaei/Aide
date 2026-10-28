"""Caregiver area. Every route needs a caregiver; shopper routes also need an
active care link to that shopper (see app.auth)."""

import asyncio
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select

from app.auth import CaredForShopper, Caregiver, SessionDep
from app.deps import get_channel3
from app.models import CareLink, CareLinkStatus, Limit, User
from app.services.channel3 import Category, Channel3Client, Channel3Error

router = APIRouter(prefix="/care", tags=["care"])

Channel3Dep = Annotated[Channel3Client, Depends(get_channel3)]

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
