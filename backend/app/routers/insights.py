"""Spending insights for the signed-in user: totals and "Ask about your spending"."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_llm
from app.core.security import CurrentUser, SessionDep
from app.integrations.llm import LLMClient
from app.schemas.insights import AskIn, AskOut, AskRow, Point, SpendingOut
from app.services.spending import spending
from app.services.spending_questions import answer_question

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/spending")
def spending_summary(user: CurrentUser, session: SessionDep) -> SpendingOut:
    figures = spending(session, user)
    return SpendingOut(
        currency=figures.currency,
        spent_this_month=figures.spent_this_month,
        orders_this_month=figures.orders_this_month,
        monthly_budget=figures.monthly_budget,
        budget_left=figures.budget_left,
        ask_above=figures.ask_above,
        by_month=[Point(label=m, total=t) for m, t in figures.by_month],
        by_category=[Point(label=c, total=t) for c, t in figures.by_category],
    )


@router.post("/ask")
async def ask_about_spending(
    body: AskIn,
    user: CurrentUser,
    session: SessionDep,
    llm: Annotated[LLMClient, Depends(get_llm)],
) -> AskOut:
    result = await answer_question(llm, session, user, body.question)
    return AskOut(
        answered=result.answered,
        answer=result.answer,
        chart=result.chart,
        currency=result.currency,
        rows=[AskRow(label=r.label, total=r.total, count=r.count) for r in result.rows],
        query=result.query,
    )
