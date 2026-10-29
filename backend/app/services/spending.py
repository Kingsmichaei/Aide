"""Spending figures for insights: this month, by month, by category.

Money counts once it is captured, dated by when it was captured (the same rule
as the monthly budget), and only in the user's currency: we never convert.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Order, OrderStatus, SpendingRule, User
from app.services.rules import monthly_spend

MONTHS = 6
OTHER = "Other"


@dataclass
class Spending:
    currency: str
    spent_this_month: Decimal
    orders_this_month: int
    monthly_budget: Decimal | None
    budget_left: Decimal | None  # None when no monthly budget is set
    ask_above: Decimal | None
    by_month: list[tuple[str, Decimal]]  # ("2026-10", total), oldest first, gaps as 0
    by_category: list[tuple[str, Decimal]]  # largest first


def spending(session: Session, user: User, now: datetime | None = None) -> Spending:
    now = now or datetime.now(UTC)
    rules = session.get(SpendingRule, user.id)
    currency = user.currency
    spent = monthly_spend(session, user.id, currency, now)
    months = _last_months(now)
    month_start = f"{months[-1]}"

    captured = session.scalars(
        select(Order).where(
            Order.user_id == user.id,
            Order.status == OrderStatus.captured,
            Order.currency == currency,
            Order.status_changed_at >= datetime.fromisoformat(f"{months[0]}-01T00:00:00+00:00"),
        )
    )
    per_month: dict[str, Decimal] = defaultdict(Decimal)
    per_category: dict[str, Decimal] = defaultdict(Decimal)
    this_month = 0
    for order in captured:
        amount = order.confirmed_total or Decimal(0)
        label = order.status_changed_at.strftime("%Y-%m")
        per_month[label] += amount
        per_category[order.category or OTHER] += amount
        this_month += label == month_start

    budget = rules.monthly_budget if rules else None
    return Spending(
        currency=currency,
        spent_this_month=spent,
        orders_this_month=this_month,
        monthly_budget=budget,
        budget_left=max(budget - spent, Decimal(0)) if budget is not None else None,
        ask_above=rules.ask_above if rules else None,
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
