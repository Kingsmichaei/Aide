"""Caregiver spending limits. Decides whether an order can be captured straight away."""

import enum
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Limit, Order, OrderStatus


class LimitDecision(enum.StrEnum):
    within_limit = "within_limit"
    needs_caregiver = "needs_caregiver"


def check(
    session: Session,
    shopper_id: int,
    amount: Decimal,
    currency: str,
    now: datetime | None = None,
) -> LimitDecision:
    limit = session.get(Limit, shopper_id)
    if limit is None:
        return LimitDecision.within_limit
    # Limits are set in one currency; never guess an exchange rate.
    if currency != limit.currency:
        return LimitDecision.needs_caregiver
    if amount > limit.per_order_max:
        return LimitDecision.needs_caregiver
    if monthly_spend(session, shopper_id, currency, now) + amount > limit.monthly_max:
        return LimitDecision.needs_caregiver
    return LimitDecision.within_limit


def monthly_spend(
    session: Session, shopper_id: int, currency: str, now: datetime | None = None
) -> Decimal:
    """Total captured this calendar month (UTC) in `currency`."""
    month_start = (now or datetime.now(UTC)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    total = session.scalar(
        select(func.coalesce(func.sum(Order.confirmed_total), 0)).where(
            Order.shopper_id == shopper_id,
            Order.currency == currency,
            Order.status == OrderStatus.captured,
            Order.created_at >= month_start,
        )
    )
    return Decimal(total)
