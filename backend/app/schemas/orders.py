"""Request and response models for /orders."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models import Actor, ConfirmationMethod, OrderStatus
from app.schemas.common import OrderOut


class DraftIn(BaseModel):
    channel3_product_id: str


class ConfirmIn(BaseModel):
    """Exactly what the user was shown (and read) when they said yes."""

    title: str
    price: Decimal
    currency: str
    total: Decimal
    method: ConfirmationMethod = ConfirmationMethod.button
    # Required for voice: the server, not the browser, decides if it was a yes.
    transcript: str | None = Field(default=None, max_length=500)
    # Spending-rule warnings (codes) the user was shown and said yes to anyway.
    acknowledged: list[Literal["ask_above", "over_budget", "other_currency"]] = []

    @model_validator(mode="after")
    def voice_needs_transcript(self) -> "ConfirmIn":
        if self.method == ConfirmationMethod.voice and not (self.transcript or "").strip():
            raise ValueError("A voice confirmation needs the transcript")
        if self.method == ConfirmationMethod.button:
            self.transcript = None
        return self


class WarningOut(BaseModel):
    code: str
    message: str
    amount: Decimal | None
    currency: str


class ConfirmOut(BaseModel):
    confirmed: bool
    # Why not: details_changed, price_changed, retailer_changed, unavailable,
    # declined, unclear, needs_extra_confirmation
    reason: str | None = None
    warnings: list[WarningOut] = []
    order: OrderOut


class PayPalOut(BaseModel):
    paypal_order_id: str


class OrderRow(BaseModel):
    id: int
    created_at: datetime
    title: str
    retailer: str
    category: str | None
    price: Decimal
    total: Decimal
    currency: str
    status: OrderStatus
    method: ConfirmationMethod | None


class EventOut(BaseModel):
    at: datetime
    event: str
    actor: Actor
    status: OrderStatus
    note: str | None


class MessageOut(BaseModel):
    role: Literal["user", "aide"]
    text: str


class OrderDetail(BaseModel):
    order: OrderOut
    confirmation_transcript: str | None
    events: list[EventOut]
    # The conversation that led to the order (text only, no tool calls).
    conversation: list[MessageOut]
