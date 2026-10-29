"""Request and response models for /insights."""

from decimal import Decimal

from pydantic import BaseModel, Field

from app.services.spending_questions import ChartType, SpendingQuery


class Point(BaseModel):
    label: str
    total: Decimal


class SpendingOut(BaseModel):
    currency: str
    spent_this_month: Decimal
    orders_this_month: int
    monthly_budget: Decimal | None
    budget_left: Decimal | None
    ask_above: Decimal | None
    by_month: list[Point]
    by_category: list[Point]


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
