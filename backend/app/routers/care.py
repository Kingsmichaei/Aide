"""Caregiver area. Every route needs a caregiver; shopper routes also need an
active care link to that shopper (see app.auth)."""

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.auth import CaredForShopper, Caregiver, SessionDep
from app.models import CareLink, CareLinkStatus, User

router = APIRouter(prefix="/care", tags=["care"])


class ShopperOut(BaseModel):
    id: int
    name: str
    language: str


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
