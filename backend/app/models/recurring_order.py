from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RecurringOrder(Base):
    __tablename__ = "recurring_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    channel3_product_id: Mapped[str] = mapped_column(String(200))
    every_days: Mapped[int]
    next_date: Mapped[date] = mapped_column(Date)
    max_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
