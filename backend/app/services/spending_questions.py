"""'Ask about your spending': answer a question from a fixed, safe query.

The model never writes SQL. It may call one tool, `query_spending`, whose
arguments are a few typed filters (date range, category, store, status) and a
grouping (none, month, category or store). We validate them, build the query
ourselves (read-only, one user only), then ask the model for one sentence
about the numbers. Anything else (e.g. "delete all orders") is refused.
"""

import contextlib
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.llm import History, LLMClient, LLMError, ToolSpec
from app.models import Order, OrderStatus, User

ChartType = Literal["bar", "donut", "none"]
GroupBy = Literal["none", "month", "category", "retailer"]

REFUSAL = (
    "I can only answer questions about spending, like totals by month, category or store. "
    "I can't change or delete anything."
)
OTHER = "Other"


class SpendingQuery(BaseModel):
    """The only query the model can ask for. Unknown fields are refused."""

    model_config = ConfigDict(extra="forbid")

    date_from: date
    date_to: date
    category: str | None = None
    retailer: str | None = None
    # Paid orders by default; they may ask about held, voided or refunded ones.
    status: Literal["captured", "authorized", "voided", "refunded", "failed"] = "captured"
    group_by: GroupBy = "none"

    @model_validator(mode="after")
    def sensible_dates(self) -> "SpendingQuery":
        if self.date_to < self.date_from:
            raise ValueError("date_to is before date_from")
        if (self.date_to - self.date_from).days > 3 * 366:
            raise ValueError("at most three years at a time")
        return self


@dataclass
class Row:
    label: str
    total: Decimal
    count: int


@dataclass
class Answer:
    answered: bool
    answer: str
    chart: ChartType = "none"
    currency: str = "USD"
    rows: list[Row] = field(default_factory=list)
    query: SpendingQuery | None = None


QUERY_TOOL = ToolSpec(
    name="query_spending",
    description=(
        "Total the user's orders, filtered and optionally grouped. Dates are inclusive "
        "(YYYY-MM-DD). Leave category, retailer or status out to include all."
    ),
    parameters={
        "type": "object",
        "properties": {
            "date_from": {"type": "string", "description": "First day, YYYY-MM-DD"},
            "date_to": {"type": "string", "description": "Last day, YYYY-MM-DD"},
            "category": {"type": "string", "description": "One of the known categories"},
            "retailer": {"type": "string", "description": "One of the known stores"},
            "status": {
                "type": "string",
                "enum": ["captured", "authorized", "voided", "refunded", "failed"],
                "description": "captured = paid (default)",
            },
            "group_by": {"type": "string", "enum": ["none", "month", "category", "retailer"]},
        },
        "required": ["date_from", "date_to"],
    },
)
CANNOT_TOOL = ToolSpec(
    name="cannot_answer",
    description="Use when the question is not about reading spending figures.",
    parameters={"type": "object", "properties": {"reason": {"type": "string"}}},
)

SYSTEM = """You answer a person's questions about their own spending.
Today is {today}. The person is called {name}. Amounts are in {currency}.
Known categories: {categories}. Known stores: {retailers}.

1. Call query_spending once with the right dates, filters and grouping. Map words like
   "health products" to the closest known category. "This month" means from the 1st of
   this month to today.
2. If the question asks to change, delete or do anything other than read spending, or
   is not about spending at all, call cannot_answer.
3. When you get the result, reply with ONE plain sentence (at most 30 words) using only
   the numbers in the result. Speak to them as "you"."""


async def answer_question(
    llm: LLMClient,
    session: Session,
    user: User,
    question: str,
    today: date | None = None,
) -> Answer:
    today = today or datetime.now(UTC).date()
    user_id, user_name, currency = user.id, user.name, user.currency
    system = SYSTEM.format(
        today=today.isoformat(),
        name=user_name,
        currency=currency,
        categories=", ".join(_known(session, user_id, Order.category)) or "none yet",
        retailers=", ".join(_known(session, user_id, Order.retailer)) or "none yet",
    )
    tools = [QUERY_TOOL, CANNOT_TOOL]
    history: History = [{"role": "user", "text": question}]

    try:
        turn = await llm.generate(system, history, tools)
    except LLMError:
        return Answer(answered=False, answer="Sorry, I can't answer right now. Try again soon.")
    call = next((c for c in turn.tool_calls if c.name == QUERY_TOOL.name), None)
    if call is None:
        return Answer(answered=False, answer=REFUSAL, currency=currency)
    try:
        query = SpendingQuery.model_validate(call.arguments)
    except ValidationError:
        return Answer(answered=False, answer=REFUSAL, currency=currency)

    rows = run_query(session, user_id, currency, query)
    result = {
        "currency": currency,
        "rows": [{"label": r.label, "total": str(r.total), "orders": r.count} for r in rows],
    }
    history += [
        {"role": "model", "text": turn.text, "raw": turn.raw},
        {
            "role": "tool",
            "call_id": call.id,
            "name": call.name,
            "result": result,
            "is_error": False,
        },
    ]
    sentence = ""
    with contextlib.suppress(LLMError):  # no sentence: fall back to a plain one
        sentence = " ".join((await llm.generate(system, history, tools)).text.split())
    return Answer(
        answered=True,
        answer=sentence[:300] or _plain_sentence(rows, currency, query),
        chart=_chart_for(query.group_by),
        currency=currency,
        rows=rows,
        query=query,
    )


def run_query(session: Session, user_id: int, currency: str, query: SpendingQuery) -> list[Row]:
    """The template: filter one user's orders, then total them (optionally grouped).
    Built with the ORM from validated values only; it can only read."""
    start = datetime.combine(query.date_from, datetime.min.time(), tzinfo=UTC)
    end = datetime.combine(query.date_to + timedelta(days=1), datetime.min.time(), tzinfo=UTC)
    # Paid orders are dated by payment (as in the monthly limit); others by creation.
    when = Order.status_changed_at if query.status == "captured" else Order.created_at
    statement = select(Order).where(
        Order.user_id == user_id,
        Order.currency == currency,
        Order.status == OrderStatus(query.status),
        when >= start,
        when < end,
    )
    if query.category:
        statement = statement.where(Order.category.ilike(query.category))
    if query.retailer:
        statement = statement.where(Order.retailer.ilike(f"%{query.retailer}%"))

    totals: dict[str, Row] = defaultdict(lambda: Row(label="", total=Decimal(0), count=0))
    for order in session.scalars(statement):
        label = _label(order, query.group_by)
        row = totals[label]
        row.label = label
        row.total += order.confirmed_total or order.price
        row.count += 1
    if query.group_by == "none":
        return [totals["Total"] if "Total" in totals else Row("Total", Decimal(0), 0)]
    if query.group_by == "month":
        return sorted(totals.values(), key=lambda r: r.label)
    return sorted(totals.values(), key=lambda r: (-r.total, r.label))


def _label(order: Order, group_by: GroupBy) -> str:
    match group_by:
        case "month":
            return order.status_changed_at.strftime("%Y-%m")
        case "category":
            return order.category or OTHER
        case "retailer":
            return order.retailer
        case _:
            return "Total"


def _chart_for(group_by: GroupBy) -> ChartType:
    # Chosen by us, not the model: time and stores as bars, shares as a donut.
    charts: dict[GroupBy, ChartType] = {
        "none": "none",
        "month": "bar",
        "retailer": "bar",
        "category": "donut",
    }
    return charts[group_by]


def _known(session: Session, user_id: int, column: Any) -> list[str]:
    values = session.scalars(
        select(column).where(Order.user_id == user_id, column.is_not(None)).distinct()
    )
    return sorted(values)[:50]


def _plain_sentence(rows: list[Row], currency: str, query: SpendingQuery) -> str:
    """Used if the model gives no sentence: the facts, plainly."""
    spent = sum((r.total for r in rows), Decimal(0))
    orders = sum(r.count for r in rows)
    return (
        f"You spent {spent:.2f} {currency} on {orders} order{'s' if orders != 1 else ''} "
        f"from {query.date_from.isoformat()} to {query.date_to.isoformat()}."
    )
