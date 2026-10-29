"""Request and response models for /chat."""

from pydantic import BaseModel, Field

from app.integrations.channel3 import Product
from app.schemas.common import OrderOut


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    conversation_id: int
    reply: str
    products: list[Product]
    draft_order: OrderOut | None
    # The language the reply is in, when it differs from the user's setting.
    reply_language: str | None = None
