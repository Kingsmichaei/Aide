"""Response models shared by more than one router."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel

from app.models import ConfirmationMethod, Order, OrderStatus
from app.services.orders import total


class OrderOut(BaseModel):
    id: int
    user_id: int
    status: OrderStatus
    channel3_product_id: str
    title: str
    retailer: str
    price: Decimal
    currency: str
    total: Decimal
    confirmed_total: Decimal | None
    confirmed_at: datetime | None
    confirmation_method: ConfirmationMethod | None
    paypal_order_id: str | None
    status_changed_at: datetime

    @classmethod
    def of(cls, order: Order) -> "OrderOut":
        fields = {name: getattr(order, name) for name in cls.model_fields if name != "total"}
        return cls(**fields, total=total(order))
