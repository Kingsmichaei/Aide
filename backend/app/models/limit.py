from decimal import Decimal

from sqlalchemy import JSON, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Limit(Base):
    __tablename__ = "limits"

    shopper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    per_order_max: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    monthly_max: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3))
    blocked_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
