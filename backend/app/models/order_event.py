from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.enums import Actor, OrderStatus


class OrderEvent(Base):
    """Append-only log of every order state change (CLAUDE.md payment rule 7)."""

    __tablename__ = "order_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    # Explicit names: Postgres needs distinct CHECK constraint names within one table.
    from_status: Mapped[OrderStatus | None] = mapped_column(
        Enum(OrderStatus, name="from_status", native_enum=False, create_constraint=True)
    )
    to_status: Mapped[OrderStatus] = mapped_column(
        Enum(OrderStatus, name="to_status", native_enum=False, create_constraint=True)
    )
    actor: Mapped[Actor] = mapped_column(Enum(Actor, native_enum=False, create_constraint=True))
    # A short human note, e.g. which spending-rule warnings the user accepted.
    note: Mapped[str | None] = mapped_column(Text)
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
