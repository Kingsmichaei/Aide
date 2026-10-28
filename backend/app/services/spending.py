"""Spending figures for the caregiver dashboard: this month, by month, by category.

Money counts once it is captured, dated by when it was captured (the same rule
as app/services/limits.py), and only in the limit's currency: we never convert.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Limit, Order, OrderStatus
from app.services.limits import monthly_spend

MONTHS = 6
OTHER = "Other"


@dataclass
class Spending:
    currency: str
    spent_this_month: Decimal
    monthly_max: Decimal | None
    per_order_max: Decimal | None
    limit_left: Decimal | None  # None when no monthly limit is set
    waiting: int  # orders waiting for the caregiver
    by_month: list[tuple[str, Decimal]]  # ("2026-10", total), oldest first, gaps as 0
    by_category: list[tuple[str, Decimal]]  # largest first


def spending(session: Session, shopper_id: int, now: datetime | None = None) -> Spending:
    now = now or datetime.now(UTC)
    limit = session.get(Limit, shopper_id)
    currency = limit.currency if limit else "USD"
    spent = monthly_spend(session, shopper_id, currency, now)
    months = _last_months(now)

    captured = session.scalars(
        select(Order).where(
            Order.shopper_id == shopper_id,
            Order.status == OrderStatus.captured,
            Order.currency == currency,
            Order.status_changed_at >= datetime.fromisoformat(f"{months[0]}-01T00:00:00+00:00"),
        )
    )
    per_month: dict[str, Decimal] = defaultdict(Decimal)
    per_category: dict[str, Decimal] = defaultdict(Decimal)
    for order in captured:
        amount = order.confirmed_total or Decimal(0)
        per_month[order.status_changed_at.strftime("%Y-%m")] += amount
        per_category[order.category or OTHER] += amount

    waiting = session.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.shopper_id == shopper_id, Order.status == OrderStatus.awaiting_caregiver)
    )
    return Spending(
        currency=currency,
        spent_this_month=spent,
        monthly_max=limit.monthly_max if limit else None,
        per_order_max=limit.per_order_max if limit else None,
        limit_left=max(limit.monthly_max - spent, Decimal(0)) if limit else None,
        waiting=waiting or 0,
        by_month=[(month, per_month[month]) for month in months],
        by_category=sorted(per_category.items(), key=lambda item: (-item[1], item[0])),
    )


def _last_months(now: datetime, count: int = MONTHS) -> list[str]:
    """["2026-05", ..., "2026-10"]: this month and the ones before it."""
    year, month = now.year, now.month
    months = []
    for _ in range(count):
        months.append(f"{year:04d}-{month:02d}")
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)
    return months[::-1]
