"""One-sentence AI summary of an order waiting for a caregiver, e.g.
"Rosa asked for cheaper vitamins; this is $4 less than last month."

The model only sees facts we give it and has no tools. If it fails, a plain
sentence built from the order is used instead, so the queue always works.
"""

import json
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.llm import LLMClient, LLMError
from app.models import Conversation, Order, OrderStatus, User
from app.services.orders import total

MAX_CHARS = 300

SYSTEM = """You help a caregiver decide on a purchase made by someone they look after.
Write ONE short, plain sentence (at most 30 words) that explains what the person asked for
and how this order compares with their past orders, if one is clearly the same kind of item.
Use only the facts given. Never invent numbers. Use the person's name; never guess
"he" or "she". No markdown, no lists, no greeting."""

_cache: dict[tuple[int, datetime], str] = {}


async def approval_summary(llm: LLMClient, session: Session, order: Order) -> str:
    key = (order.id, order.status_changed_at)
    if key not in _cache:
        _cache[key] = await _summarise(llm, session, order)
    return _cache[key]


async def _summarise(llm: LLMClient, session: Session, order: Order) -> str:
    shopper = session.get(User, order.shopper_id)
    name = shopper.name if shopper else "The shopper"
    fallback = (
        f"{name} asked for {order.title} from {order.retailer}, "
        f"{total(order)} {order.currency} in total."
    )
    facts = {
        "person": name,
        "this_order": _describe(order),
        "what_they_said_recently": _recent_requests(session, order.shopper_id),
        "past_paid_orders": [
            _describe(past) for past in _past_orders(session, order.shopper_id, order)
        ],
    }
    try:
        turn = await llm.generate(SYSTEM, [{"role": "user", "text": json.dumps(facts)}], [])
    except LLMError:
        return fallback
    sentence = " ".join(turn.text.split())  # one line, however the model formatted it
    return sentence[:MAX_CHARS] if sentence else fallback


def _describe(order: Order) -> dict[str, str]:
    return {
        "item": order.title,
        "store": order.retailer,
        "total": f"{total(order)} {order.currency}",
        "date": order.created_at.date().isoformat() if order.created_at else "",
    }


def _recent_requests(session: Session, shopper_id: int, count: int = 5) -> list[str]:
    conversation = session.scalar(
        select(Conversation)
        .where(Conversation.shopper_id == shopper_id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    if conversation is None:
        return []
    said = [m["text"] for m in conversation.messages if m.get("role") == "user"]
    return said[-count:]


def _past_orders(session: Session, shopper_id: int, current: Order, days: int = 90) -> list[Order]:
    since = (current.created_at or datetime.now()) - timedelta(days=days)
    return list(
        session.scalars(
            select(Order)
            .where(
                Order.shopper_id == shopper_id,
                Order.status == OrderStatus.captured,
                Order.id != current.id,
                Order.created_at >= since,
            )
            .order_by(Order.created_at.desc())
            .limit(5)
        )
    )
