from sqlalchemy import Enum, String, Text, true
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import Role


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False, create_constraint=True))
    language: Mapped[str] = mapped_column(String(16), default="en")
    voice_speed: Mapped[float] = mapped_column(default=1.0)
    text_size: Mapped[int] = mapped_column(default=20)
    auto_send: Mapped[bool] = mapped_column(default=True, server_default=true())
    read_aloud: Mapped[bool] = mapped_column(default=True, server_default=true())
    address: Mapped[str | None] = mapped_column(Text)
