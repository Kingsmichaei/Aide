from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import AlertKind


class Notification(Base):
    """An in-app alert. Stored as a kind plus params, not finished text, so each
    app can show (and speak) it in the reader's own language."""

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[AlertKind] = mapped_column(
        Enum(AlertKind, native_enum=False, create_constraint=True)
    )
    order_id: Mapped[int | None] = mapped_column(ForeignKey("orders.id"))
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
