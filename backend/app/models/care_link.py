from sqlalchemy import Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base
from app.models.enums import CareLinkStatus


class CareLink(Base):
    __tablename__ = "care_links"

    shopper_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    caregiver_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    status: Mapped[CareLinkStatus] = mapped_column(
        Enum(CareLinkStatus, native_enum=False, create_constraint=True),
        default=CareLinkStatus.pending,
    )
