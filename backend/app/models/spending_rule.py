from decimal import Decimal

from sqlalchemy import JSON, ForeignKey, Numeric
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class SpendingRule(Base):
    """The user's own rules. Breaking one never blocks a purchase silently: Aide
    warns and asks for an extra yes (CLAUDE.md payment rule 5)."""

    __tablename__ = "spending_rules"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    # In the user's currency; None means "no budget" / "never ask".
    monthly_budget: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    ask_above: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    # Channel3 category slugs; never shown in results.
    blocked_categories: Mapped[list[str]] = mapped_column(JSON, default=list)
