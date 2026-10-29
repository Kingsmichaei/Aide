"""The user's own spending rules (CLAUDE.md payment rule 5).

Rules never block a purchase silently. `check` returns warnings; the user can
still buy after an extra, explicit yes. Blocked categories are different: those
products never appear in results at all.
"""

import asyncio
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import Invalid, Upstream
from app.integrations.channel3 import Category, Channel3Client, Channel3Error
from app.models import Order, OrderStatus, SpendingRule, User

WarningCode = Literal["ask_above", "over_budget", "other_currency"]


@dataclass(frozen=True)
class RuleWarning:
    code: WarningCode
    message: str  # English; apps word it themselves from `code` and `amount`
    # ask_above: the ask-first amount; over_budget: how far over; other_currency: none
    amount: Decimal | None
    currency: str


@dataclass(frozen=True)
class RulesView:
    """The rules as the user sees them: amounts in their currency, categories titled."""

    currency: str
    monthly_budget: Decimal | None
    ask_above: Decimal | None
    blocked_categories: list[Category]


def rules_for(session: Session, user_id: int) -> SpendingRule | None:
    return session.get(SpendingRule, user_id)


def blocked_categories(session: Session, user_id: int) -> list[str]:
    rules = rules_for(session, user_id)
    return list(rules.blocked_categories) if rules else []


async def view(session: Session, channel3: Channel3Client, user: User) -> RulesView:
    rules = rules_for(session, user.id)
    slugs = rules.blocked_categories if rules else []
    return RulesView(
        currency=user.currency,
        monthly_budget=rules.monthly_budget if rules else None,
        ask_above=rules.ask_above if rules else None,
        blocked_categories=list(await asyncio.gather(*(_titled(s, channel3) for s in slugs))),
    )


async def save(
    session: Session,
    channel3: Channel3Client,
    user: User,
    *,
    monthly_budget: Decimal | None,
    ask_above: Decimal | None,
    blocked: list[str],
) -> RulesView:
    """Replace the user's rules. None switches a rule off."""
    rules = rules_for(session, user.id)
    already = set(rules.blocked_categories) if rules else set()

    # Check new categories exist, so a typo can never "block" nothing.
    new = [slug for slug in blocked if slug not in already]
    try:
        found = await asyncio.gather(*(channel3.get_category(slug) for slug in new))
    except Channel3Error as error:
        raise Upstream("Categories are unavailable") from error
    unknown = [slug for slug, category in zip(new, found, strict=True) if category is None]
    if unknown:
        raise Invalid("These are not Channel3 categories", unknown_categories=unknown)

    if rules is None:
        rules = SpendingRule(user_id=user.id)
        session.add(rules)
    rules.monthly_budget = monthly_budget
    rules.ask_above = ask_above
    rules.blocked_categories = blocked
    session.commit()
    return await view(session, channel3, user)


async def find_categories(channel3: Channel3Client, query: str) -> list[Category]:
    """Top-level Channel3 categories, or those matching `query` (e.g. "vitamins")."""
    try:
        if query.strip():
            return await channel3.search_categories(query.strip())
        return await channel3.list_root_categories()
    except Channel3Error as error:
        raise Upstream("Categories are unavailable") from error


def monthly_spend(
    session: Session, user_id: int, currency: str, now: datetime | None = None
) -> Decimal:
    """Total paid this calendar month (UTC) in `currency`, by payment time."""
    month_start = (now or datetime.now(UTC)).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    spent = session.scalar(
        select(func.coalesce(func.sum(Order.confirmed_total), 0)).where(
            Order.user_id == user_id,
            Order.currency == currency,
            Order.status == OrderStatus.captured,
            Order.status_changed_at >= month_start,
        )
    )
    return Decimal(spent or 0)


def check(
    session: Session,
    user: User,
    amount: Decimal,
    currency: str,
    now: datetime | None = None,
) -> list[RuleWarning]:
    """Warnings for buying `amount` now. Empty means no rule is broken."""
    rules = rules_for(session, user.id)
    if rules is None or (rules.ask_above is None and rules.monthly_budget is None):
        return []
    if currency != user.currency:
        # Budgets are in the user's currency; we never guess an exchange rate.
        return [
            RuleWarning(
                code="other_currency",
                message=(
                    f"This is priced in {currency}, so it can't be checked against your "
                    f"{user.currency} spending rules."
                ),
                amount=None,
                currency=currency,
            )
        ]

    warnings = []
    if rules.ask_above is not None and amount > rules.ask_above:
        warnings.append(
            RuleWarning(
                code="ask_above",
                message=(
                    f"This is over your ask-first amount of {_money(rules.ask_above, currency)}."
                ),
                amount=rules.ask_above,
                currency=currency,
            )
        )
    if rules.monthly_budget is not None:
        over = monthly_spend(session, user.id, currency, now) + amount - rules.monthly_budget
        if over > 0:
            warnings.append(
                RuleWarning(
                    code="over_budget",
                    message=f"This puts you {_money(over, currency)} over your monthly budget.",
                    amount=over,
                    currency=currency,
                )
            )
    return warnings


def _money(amount: Decimal, currency: str) -> str:
    symbol = {"USD": "$", "EUR": "€", "GBP": "£", "CAD": "CA$", "AUD": "A$"}.get(currency)
    return f"{symbol}{amount:,.2f}" if symbol else f"{amount:,.2f} {currency}"


async def _titled(slug: str, channel3: Channel3Client) -> Category:
    """The category's title for display; the slug itself if Channel3 can't say."""
    try:
        category = await channel3.get_category(slug)
    except Channel3Error:
        category = None
    fallback = slug.replace("-", " ").capitalize()
    return category or Category(slug=slug, title=fallback, path=[fallback])
