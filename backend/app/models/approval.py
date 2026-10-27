from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import Decision


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"), index=True)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    decision: Mapped[Decision] = mapped_column(
        Enum(Decision, native_enum=False, create_constraint=True)
    )
    note: Mapped[str | None] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
