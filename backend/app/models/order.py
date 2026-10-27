from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import OrderStatus


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel3_product_id: Mapped[str] = mapped_column(String(200))
    title: Mapped[str] = mapped_column(String(500))
    retailer: Mapped[str] = mapped_column(String(200))
    price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    confirmed_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paypal_order_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    paypal_auth_id: Mapped[str | None] = mapped_column(String(64), unique=True)
    status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, native_enum=False, create_constraint=True),
        default=OrderStatus.draft,
        index=True,
    )
    status_changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
