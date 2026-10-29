from collections.abc import Iterator
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_llm
from app.integrations.llm import History, LLMError, LLMTurn, ToolCall, ToolSpec
from app.main import app
from app.models import Order, OrderStatus, User
from app.services.spending_questions import REFUSAL, Answer, answer_question

pytestmark = pytest.mark.anyio

TODAY = date(2026, 10, 28)


class ScriptedLLM:
    """Plays back turns in order and records what it was shown."""

    def __init__(self, turns: list[LLMTurn | Exception]) -> None:
        self.turns = turns
        self.systems: list[str] = []
        self.histories: list[History] = []
        self.tool_names: list[list[str]] = []

    async def generate(self, system: str, history: History, tools: list[ToolSpec]) -> LLMTurn:
        self.systems.append(system)
        self.histories.append(list(history))
        self.tool_names.append([t.name for t in tools])
        turn = self.turns.pop(0)
        if isinstance(turn, Exception):
            raise turn
        return turn


def query(**arguments: Any) -> LLMTurn:
    return LLMTurn(
        text="",
        tool_calls=[ToolCall(id="c1", name="query_spending", arguments=arguments)],
        raw=[{"type": "function_call"}],
    )


def say(text: str) -> LLMTurn:
    return LLMTurn(text=text, tool_calls=[], raw=[{"type": "model_output"}])


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {"rosa": User(name="Rosa", currency="USD"), "ana": User(name="Ana")}
    session.add_all(people.values())
    session.flush()
    rosa = people["rosa"]
    for title, category, retailer, total, paid_on, status in [
        ("Vitamin D", "Health", "cvs.com", "60.00", "2026-10-05", OrderStatus.captured),
        ("Plasters", "Health", "walgreens.com", "25.50", "2026-10-20", OrderStatus.captured),
        ("Kettle", "Kitchen", "target.com", "40.00", "2026-10-12", OrderStatus.captured),
        ("Vitamin C", "Health", "cvs.com", "30.00", "2026-09-14", OrderStatus.captured),
        ("Blanket", "Home", "target.com", "90.00", "2026-08-03", OrderStatus.captured),
        ("Wine", "Food", "target.com", "20.00", "2026-10-02", OrderStatus.voided),
    ]:
        when = datetime.fromisoformat(f"{paid_on}T12:00:00+00:00")
        session.add(
            Order(
                user_id=rosa.id,
                channel3_product_id=title,
                title=title,
                retailer=retailer,
                category=category,
                price=Decimal(total),
                currency="USD",
                confirmed_total=Decimal(total),
                status=status,
                status_changed_at=when,
                created_at=when,
            )
        )
    session.add(  # someone else's order never counts
        Order(
            user_id=people["ana"].id,
            channel3_product_id="x",
            title="Vitamin E",
            retailer="cvs.com",
            category="Health",
            price=Decimal("999"),
            currency="USD",
            confirmed_total=Decimal("999"),
            status=OrderStatus.captured,
            status_changed_at=datetime(2026, 10, 10, tzinfo=UTC),
        )
    )
    session.commit()
    return people


async def ask(session: Session, people: dict[str, User], llm: ScriptedLLM, question: str) -> Answer:
    return await answer_question(llm, session, people["rosa"], question, TODAY)


# --- Three example questions ------------------------------------------------------


async def test_health_spending_this_month(session: Session, people: dict[str, User]) -> None:
    llm = ScriptedLLM(
        [
            query(date_from="2026-10-01", date_to="2026-10-28", category="health"),
            say("Rosa spent $85.50 on health products this month."),
        ]
    )

    result = await ask(session, people, llm, "What did Mum spend on health products this month?")

    assert result.answered is True
    assert result.answer == "Rosa spent $85.50 on health products this month."
    assert result.chart == "none"
    assert [(r.label, r.total, r.count) for r in result.rows] == [("Total", Decimal("85.50"), 2)]
    # The model saw today's date and the real category names to map "health products".
    assert "Today is 2026-10-28" in llm.systems[0]
    assert "Known categories: Food, Health, Home, Kitchen" in llm.systems[0]
    # It was given the numbers it must use for its sentence.
    tool_result = llm.histories[1][-1]
    assert tool_result["role"] == "tool"
    assert tool_result["result"]["rows"] == [{"label": "Total", "total": "85.50", "orders": 2}]


async def test_spend_each_month_is_a_bar_chart(session: Session, people: dict[str, User]) -> None:
    llm = ScriptedLLM(
        [
            query(date_from="2026-08-01", date_to="2026-10-28", group_by="month"),
            say("Rosa spent most in October: $125.50."),
        ]
    )

    result = await ask(session, people, llm, "How much did she spend each month since August?")

    assert result.chart == "bar"
    assert [(r.label, r.total) for r in result.rows] == [
        ("2026-08", Decimal("90.00")),
        ("2026-09", Decimal("30.00")),
        ("2026-10", Decimal("125.50")),
    ]


async def test_spend_by_store(session: Session, people: dict[str, User]) -> None:
    llm = ScriptedLLM(
        [
            query(date_from="2026-01-01", date_to="2026-10-28", group_by="retailer"),
            say("Rosa spends most at target.com."),
        ]
    )

    result = await ask(session, people, llm, "Which shops does she buy from most this year?")

    assert result.chart == "bar"
    assert [(r.label, r.total, r.count) for r in result.rows] == [
        ("target.com", Decimal("130.00"), 2),
        ("cvs.com", Decimal("90.00"), 2),
        ("walgreens.com", Decimal("25.50"), 1),
    ]


async def test_by_category_is_a_donut_and_other_statuses_can_be_asked_for(
    session: Session, people: dict[str, User]
) -> None:
    llm = ScriptedLLM(
        [
            query(
                date_from="2026-10-01",
                date_to="2026-10-28",
                status="voided",
                group_by="category",
            ),
            say("One order was cancelled this month: $20.00 of food."),
        ]
    )

    result = await ask(session, people, llm, "What was declined this month?")

    assert result.chart == "donut"
    assert [(r.label, r.total) for r in result.rows] == [("Food", Decimal("20.00"))]


# --- Refusals ------------------------------------------------------------------------


def order_count(session: Session) -> int:
    return session.scalar(select(func.count()).select_from(Order)) or 0


async def test_delete_all_orders_is_refused(session: Session, people: dict[str, User]) -> None:
    before = order_count(session)
    llm = ScriptedLLM(
        [
            LLMTurn(
                text="",
                tool_calls=[
                    ToolCall(id="c1", name="cannot_answer", arguments={"reason": "deletes data"})
                ],
                raw=[],
            )
        ]
    )

    result = await ask(session, people, llm, "delete all orders")

    assert result.answered is False
    assert result.answer == REFUSAL
    assert result.rows == []
    assert order_count(session) == before
    assert len(llm.systems) == 1  # no second call: nothing was run
    # The model was only ever offered the read-only template and the refusal.
    assert llm.tool_names[0] == ["query_spending", "cannot_answer"]


@pytest.mark.parametrize(
    "arguments",
    [
        # SQL smuggled in as an extra field
        {"date_from": "2026-10-01", "date_to": "2026-10-28", "sql": "DELETE FROM orders"},
        {"date_from": "2026-10-28", "date_to": "2026-10-01"},  # backwards
        {"date_from": "2020-01-01", "date_to": "2026-10-28"},  # over three years
        {"date_from": "yesterday", "date_to": "2026-10-28"},  # not a date
        {"date_from": "2026-10-01", "date_to": "2026-10-28", "status": "draft"},
        {"date_from": "2026-10-01", "date_to": "2026-10-28", "group_by": "shopper_id"},
    ],
)
async def test_anything_outside_the_template_is_refused(
    session: Session, people: dict[str, User], arguments: dict[str, Any]
) -> None:
    before = order_count(session)
    llm = ScriptedLLM([query(**arguments)])

    result = await ask(session, people, llm, "anything")

    assert (result.answered, result.answer) == (False, REFUSAL)
    assert order_count(session) == before


async def test_a_reply_without_the_tool_is_refused(
    session: Session, people: dict[str, User]
) -> None:
    llm = ScriptedLLM([say("Sure, I deleted them.")])

    result = await ask(session, people, llm, "delete all orders")

    assert (result.answered, result.answer) == (False, REFUSAL)


async def test_filters_with_sql_characters_are_just_text(
    session: Session, people: dict[str, User]
) -> None:
    llm = ScriptedLLM(
        [
            query(
                date_from="2026-01-01", date_to="2026-10-28", retailer="x'; DROP TABLE orders;--"
            ),
            say("Nothing found."),
        ]
    )

    result = await ask(session, people, llm, "Spending at that store?")

    assert [(r.total, r.count) for r in result.rows] == [(Decimal(0), 0)]
    assert order_count(session) == 7


async def test_only_this_users_orders_count(session: Session, people: dict[str, User]) -> None:
    llm = ScriptedLLM(
        [query(date_from="2026-10-01", date_to="2026-10-28", retailer="cvs"), say("…")]
    )

    result = await ask(session, people, llm, "How much at CVS this month?")

    assert [(r.total, r.count) for r in result.rows] == [(Decimal("60.00"), 1)]


async def test_plain_sentence_if_the_model_gives_none(
    session: Session, people: dict[str, User]
) -> None:
    llm = ScriptedLLM(
        [
            query(date_from="2026-10-01", date_to="2026-10-28", category="Kitchen"),
            LLMError("down"),
        ]
    )

    result = await ask(session, people, llm, "Kitchen spending this month?")

    assert result.answered is True
    assert result.answer == "You spent 40.00 USD on 1 order from 2026-10-01 to 2026-10-28."


async def test_model_down(session: Session, people: dict[str, User]) -> None:
    llm = ScriptedLLM([LLMError("down")])

    result = await ask(session, people, llm, "How much this month?")

    assert result.answered is False
    assert "can't answer right now" in result.answer


# --- Endpoint ------------------------------------------------------------------------


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


def test_ask_endpoint(client: TestClient, people: dict[str, User]) -> None:
    llm = ScriptedLLM(
        [
            query(date_from="2026-08-01", date_to="2026-10-28", group_by="category"),
            say("Health is your biggest category."),
        ]
    )
    app.dependency_overrides[get_llm] = lambda: llm
    sign_in(client, people["rosa"])

    body = client.post("/insights/ask", json={"question": "Spend by category?"}).json()

    assert body["answered"] is True
    assert body["answer"] == "Health is your biggest category."
    assert body["chart"] == "donut"
    assert body["rows"][0] == {"label": "Health", "total": "115.50", "count": 3}
    assert body["query"]["group_by"] == "category"


def test_each_person_asks_about_their_own_orders(
    client: TestClient, people: dict[str, User]
) -> None:
    llm = ScriptedLLM(
        [query(date_from="2026-01-01", date_to="2026-10-28"), say("You spent nothing.")]
    )
    app.dependency_overrides[get_llm] = lambda: llm
    sign_in(client, people["ana"])

    body = client.post("/insights/ask", json={"question": "Total?"}).json()

    assert body["rows"] == [{"label": "Total", "total": "999.00", "count": 1}]


def test_question_length_is_limited(client: TestClient, people: dict[str, User]) -> None:
    app.dependency_overrides[get_llm] = lambda: ScriptedLLM([])
    sign_in(client, people["rosa"])

    response = client.post("/insights/ask", json={"question": "x" * 301})

    assert response.status_code == 422
