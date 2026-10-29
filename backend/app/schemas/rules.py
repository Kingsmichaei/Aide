"""Request and response models for /rules."""

from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.integrations.channel3 import Category

Money = Annotated[Decimal, Field(gt=0, le=Decimal("99999999.99"), decimal_places=2)]


class RulesIn(BaseModel):
    # None switches a rule off.
    monthly_budget: Money | None = None
    ask_above: Money | None = None
    # Channel3 category slugs; never free text (unknown slugs are refused).
    blocked_categories: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("blocked_categories")
    @classmethod
    def unique(cls, slugs: list[str]) -> list[str]:
        return list(dict.fromkeys(slug.strip() for slug in slugs if slug.strip()))


class RulesOut(BaseModel):
    currency: str  # the user's currency; amounts are in it
    monthly_budget: Decimal | None
    ask_above: Decimal | None
    blocked_categories: list[Category]
