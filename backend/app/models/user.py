from sqlalchemy import Enum, String, Text, false, true
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base
from app.models.enums import Theme


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str | None] = mapped_column(String(320), unique=True)
    language: Mapped[str] = mapped_column(String(16), default="en")
    # Everything the user sees is priced and budgeted in this currency.
    currency: Mapped[str] = mapped_column(String(3), default="USD", server_default="USD")
    theme: Mapped[Theme] = mapped_column(
        Enum(Theme, native_enum=False, create_constraint=True),
        default=Theme.system,
        server_default=Theme.system.value,
    )
    # Voice is optional: text first, speech on request.
    voice_speed: Mapped[float] = mapped_column(default=1.0)
    auto_send: Mapped[bool] = mapped_column(default=True, server_default=true())
    read_aloud: Mapped[bool] = mapped_column(default=False, server_default=false())
    address: Mapped[str | None] = mapped_column(Text)
