"""Caregiver dashboard data: the orders ledger, one order's details, and spending.
Every route needs the caregiver to look after the shopper (app.auth)."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.llm import LLMClient
from app.auth import CaredForShopper, SessionDep
from app.deps import get_llm
from app.models import (
    Approval,
    ConfirmationMethod,
    Conversation,
    Decision,
    Order,
    OrderEvent,
    OrderStatus,
    User,
)
from app.services.orders import total
from app.services.spending import spending
from app.services.spending_questions import ChartType, SpendingQuery, answer_question

router = APIRouter(prefix="/care/shoppers/{shopper_id}", tags=["care"])

TRANSCRIPT_MESSAGES = 30


class LedgerRow(BaseModel):
    id: int
    created_at: datetime
    title: str
    retailer: str
    category: str | None
    price: Decimal
    total: Decimal
    currency: str
    status: OrderStatus
    method: ConfirmationMethod | None  # voice or button
    approved_by: str | None  # caregiver who approved; None if no approval was needed
    declined_by: str | None


class EventOut(BaseModel):
    at: datetime
    event: str
    actor: str
    status: OrderStatus


class DecisionOut(BaseModel):
    decision: Decision
    caregiver: str
    note: str | None
    at: datetime


class MessageOut(BaseModel):
    role: str  # "shopper" or "aide"
    text: str


class OrderDetail(BaseModel):
    order: LedgerRow
    confirmation_transcript: str | None
    events: list[EventOut]
    decisions: list[DecisionOut]
    # The shopper's recent conversation with Aide (text only, no tool calls).
    conversation: list[MessageOut]


class Point(BaseModel):
    label: str
    total: Decimal


class SpendingOut(BaseModel):
    currency: str
    spent_this_month: Decimal
    monthly_max: Decimal | None
    per_order_max: Decimal | None
    limit_left: Decimal | None
    waiting: int
    by_month: list[Point]
    by_category: list[Point]


@router.get("/orders")
def ledger(shopper: CaredForShopper, session: SessionDep) -> list[LedgerRow]:
    """Every order the shopper confirmed or went further with, newest first.
    Drafts the shopper never confirmed are left out."""
    orders = session.scalars(
        select(Order)
        .where(Order.shopper_id == shopper.id, Order.status != OrderStatus.draft)
        .order_by(Order.created_at.desc(), Order.id.desc())
    ).all()
    deciders = _deciders(session, [order.id for order in orders])
    return [_row(order, deciders.get(order.id, {})) for order in orders]


@router.get("/orders/{order_id}")
def order_detail(order_id: int, shopper: CaredForShopper, session: SessionDep) -> OrderDetail:
    order = session.get(Order, order_id)
    if order is None or order.shopper_id != shopper.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    events = session.scalars(
        select(OrderEvent).where(OrderEvent.order_id == order.id).order_by(OrderEvent.id)
    )
    decisions = session.execute(
        select(Approval, User.name)
        .join(User, User.id == Approval.caregiver_id)
        .where(Approval.order_id == order.id)
        .order_by(Approval.id)
    ).all()
    return OrderDetail(
        order=_row(order, _deciders(session, [order.id]).get(order.id, {})),
        confirmation_transcript=order.confirmation_transcript,
        events=[
            EventOut(
                at=e.created_at,
                event=e.detail.get("event", ""),
                actor=e.actor,
                status=e.to_status,
            )
            for e in events
        ],
        decisions=[
            DecisionOut(decision=a.decision, caregiver=name, note=a.note, at=a.decided_at)
            for a, name in decisions
        ],
        conversation=_conversation(session, shopper.id),
    )


@router.get("/spending")
def spending_summary(shopper: CaredForShopper, session: SessionDep) -> SpendingOut:
    figures = spending(session, shopper.id)
    return SpendingOut(
        currency=figures.currency,
        spent_this_month=figures.spent_this_month,
        monthly_max=figures.monthly_max,
        per_order_max=figures.per_order_max,
        limit_left=figures.limit_left,
        waiting=figures.waiting,
        by_month=[Point(label=m, total=t) for m, t in figures.by_month],
        by_category=[Point(label=c, total=t) for c, t in figures.by_category],
    )


def _deciders(session: Session, order_ids: list[int]) -> dict[int, dict[Decision, str]]:
    """For each order, who approved or declined it (the latest decision of each kind)."""
    found: dict[int, dict[Decision, str]] = {}
    rows = session.execute(
        select(Approval.order_id, Approval.decision, User.name)
        .join(User, User.id == Approval.caregiver_id)
        .where(Approval.order_id.in_(order_ids))
        .order_by(Approval.id)
    )
    for order_id, decision, name in rows:
        found.setdefault(order_id, {})[decision] = name
    return found


def _row(order: Order, deciders: dict[Decision, str]) -> LedgerRow:
    return LedgerRow(
        id=order.id,
        created_at=order.created_at,
        title=order.title,
        retailer=order.retailer,
        category=order.category,
        price=order.price,
        total=total(order),
        currency=order.currency,
        status=order.status,
        method=order.confirmation_method,
        approved_by=deciders.get(Decision.approved),
        declined_by=deciders.get(Decision.declined),
    )


def _conversation(session: Session, shopper_id: int) -> list[MessageOut]:
    conversation = session.scalar(
        select(Conversation)
        .where(Conversation.shopper_id == shopper_id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    if conversation is None:
        return []
    texts = [
        MessageOut(role="shopper" if m["role"] == "user" else "aide", text=m["text"])
        for m in conversation.messages
        if m.get("role") in ("user", "model") and m.get("text")
    ]
    return texts[-TRANSCRIPT_MESSAGES:]


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=300)


class AskRow(BaseModel):
    label: str
    total: Decimal
    count: int


class AskOut(BaseModel):
    answered: bool  # False when the question was refused
    answer: str  # one sentence
    chart: ChartType  # chosen from the grouping, not by the model
    currency: str
    rows: list[AskRow]
    query: SpendingQuery | None  # the template and values that ran


@router.post("/ask")
async def ask_about_spending(
    body: AskIn,
    shopper: CaredForShopper,
    session: SessionDep,
    llm: Annotated[LLMClient, Depends(get_llm)],
) -> AskOut:
    result = await answer_question(llm, session, shopper.id, shopper.name, body.question)
    return AskOut(
        answered=result.answered,
        answer=result.answer,
        chart=result.chart,
        currency=result.currency,
        rows=[AskRow(label=r.label, total=r.total, count=r.count) for r in result.rows],
        query=result.query,
    )
