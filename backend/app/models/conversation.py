from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(primary_key=True)
    shopper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    language: Mapped[str] = mapped_column(String(16))
    messages: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
