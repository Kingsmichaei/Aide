import json
from collections.abc import Collection, Iterator
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.tools import TOOLS
from app.core.db import get_session
from app.core.deps import get_channel3, get_llm
from app.core.security import current_user
from app.integrations.channel3 import Offer, Product, ProductDetail
from app.integrations.llm import GeminiClient, History, LLMError, LLMTurn, ToolCall, ToolSpec
from app.main import app
from app.models import Actor, Conversation, Order, OrderEvent, SpendingRule, User

pytestmark = pytest.mark.anyio


def product(pid: str, price: str) -> ProductDetail:
    offer = Offer(price=Decimal(price), currency="USD", retailer="target.com", url="https://x")
    return ProductDetail(
        id=pid,
        title=f"Kettle {pid}",
        image_url=f"https://img/{pid}.png",
        category="kettles",
        best_offer=offer,
        description=None,
        offers=[offer],
    )


class FakeChannel3:
    def __init__(self) -> None:
        self.catalog = {"k1": product("k1", "29.99"), "k2": product("k2", "24.50")}
        self.blocked_seen: list[Collection[str]] = []

    async def search_products(
        self,
        query: str,
        max_price: Decimal | None = None,
        limit: int = 5,
        blocked_categories: Collection[str] = (),
    ) -> list[Product]:
        self.blocked_seen.append(blocked_categories)
        found: list[Product] = []
        found.extend(self.catalog.values())
        return found[:limit]

    async def get_product(
        self, product_id: str, blocked_categories: Collection[str] = ()
    ) -> ProductDetail | None:
        return self.catalog.get(product_id)

    async def find_similar(
        self, product_id: str, limit: int = 5, blocked_categories: Collection[str] = ()
    ) -> list[Product]:
        return [p for pid, p in self.catalog.items() if pid != product_id]


class ScriptedLLM:
    """Returns pre-written turns in order and records the history it was given."""

    def __init__(self, turns: list[LLMTurn]) -> None:
        self.turns = turns
        self.seen: list[History] = []

    async def generate(self, system: str, history: History, tools: list[ToolSpec]) -> LLMTurn:
        self.seen.append(json.loads(json.dumps(history)))
        return self.turns.pop(0)


def call(name: str, **arguments: Any) -> LLMTurn:
    step = {"type": "function_call", "id": f"call-{name}", "name": name, "arguments": arguments}
    return LLMTurn(
        text="",
        tool_calls=[ToolCall(id=f"call-{name}", name=name, arguments=arguments)],
        raw=[step],
    )


def say(text: str) -> LLMTurn:
    step = {"type": "model_output", "content": [{"type": "text", "text": text}]}
    return LLMTurn(text=text, tool_calls=[], raw=[step])


@pytest.fixture
def channel3() -> FakeChannel3:
    return FakeChannel3()


@pytest.fixture
def user_id(session: Session) -> int:
    user = User(name="Rosa", language="es")
    session.add(user)
    session.flush()
    session.add(
        SpendingRule(
            user_id=user.id,
            monthly_budget=Decimal("300"),
            ask_above=Decimal("100"),
            blocked_categories=["alcohol"],
        )
    )
    session.commit()
    return user.id


def make_client(session: Session, channel3: FakeChannel3, llm: object) -> TestClient:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    # Signed in as the test's user; the cookie itself is tested in test_auth.
    app.dependency_overrides[current_user] = lambda: session.scalars(
        select(User).order_by(User.id)
    ).first()
    app.dependency_overrides[get_channel3] = lambda: channel3
    app.dependency_overrides[get_llm] = lambda: llm
    return TestClient(app)


@pytest.fixture(autouse=True)
def clear_overrides() -> Iterator[None]:
    yield
    app.dependency_overrides.clear()


def test_agent_tools_cannot_move_money() -> None:
    assert set(TOOLS) == {
        "search_products",
        "compare_offers",
        "find_cheaper",
        "propose_order",
        "reply_in_language",
    }
    agent_dir = Path(__file__).parents[1] / "app" / "agent"
    for source in agent_dir.glob("*.py"):
        assert "services.paypal" not in source.read_text(), f"{source.name} imports PayPal"


def test_search_turn_returns_reply_and_product_cards(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    llm = ScriptedLLM([call("search_products", query="kettle"), say("Encontré dos teteras.")])
    client = make_client(session, channel3, llm)

    response = client.post("/chat", json={"message": "Quiero una tetera"})

    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "Encontré dos teteras."
    assert [p["id"] for p in body["products"]] == ["k1", "k2"]
    assert body["products"][0]["best_offer"]["price"] == "29.99"
    assert body["draft_order"] is None
    assert channel3.blocked_seen == [["alcohol"]]

    # The model saw the tool result on its second call.
    tool_entry = llm.seen[1][-1]
    assert tool_entry["role"] == "tool"
    assert tool_entry["result"]["products"][1]["price"] == "24.50"

    conversation = session.get(Conversation, body["conversation_id"])
    assert [m["role"] for m in conversation.messages] == ["user", "model", "tool", "model"]
    assert conversation.language == "es"


def test_reply_in_another_language_is_reported(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    llm = ScriptedLLM([call("reply_in_language", language="fr"), say("Bonjour !")])
    client = make_client(session, channel3, llm)

    body = client.post("/chat", json={"message": "Bonjour"}).json()

    assert body["reply"] == "Bonjour !"
    assert body["reply_language"] == "fr"
    user = session.get(User, user_id)
    assert user.language == "es"  # the setting only changes when the user says so


@pytest.mark.parametrize("language", ["es", "de"])
def test_reply_language_ignores_the_setting_and_unknown_codes(
    session: Session, channel3: FakeChannel3, user_id: int, language: str
) -> None:
    llm = ScriptedLLM([call("reply_in_language", language=language), say("Hola.")])
    client = make_client(session, channel3, llm)

    body = client.post("/chat", json={"message": "Hola"}).json()

    assert body["reply_language"] is None


def test_propose_turn_drafts_order_without_paying(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    llm = ScriptedLLM(
        [call("propose_order", product_id="k2"), say("Son 24.50 dólares en total. ¿Lo compro?")]
    )
    client = make_client(session, channel3, llm)

    body = client.post("/chat", json={"message": "La segunda"}).json()

    draft = body["draft_order"]
    assert draft["status"] == "draft"
    assert draft["total"] == "24.50"
    assert draft["confirmed_total"] is None
    order = session.get(Order, draft["id"])
    assert order is not None
    assert order.paypal_order_id is None
    event = session.scalars(select(OrderEvent).where(OrderEvent.order_id == order.id)).one()
    assert event.actor == Actor.system
    assert event.detail["event"] == "drafted"


def test_follow_up_turn_continues_the_conversation(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    llm = ScriptedLLM([say("Hola Rosa."), say("Claro.")])
    client = make_client(session, channel3, llm)

    first = client.post("/chat", json={"message": "Hola"}).json()
    second = client.post("/chat", json={"message": "Gracias"}).json()

    assert first["conversation_id"] == second["conversation_id"]
    assert [m.get("text") for m in llm.seen[1]] == ["Hola", "Hola Rosa.", "Gracias"]


def test_unknown_tool_is_reported_back_as_error(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    llm = ScriptedLLM([call("capture_payment", auth_id="AUTH-1"), say("No puedo hacer eso.")])
    client = make_client(session, channel3, llm)

    client.post("/chat", json={"message": "Paga ya"})

    tool_entry = llm.seen[1][-1]
    assert tool_entry["is_error"] is True
    assert "Unknown tool" in tool_entry["result"]["error"]


def test_llm_failure_returns_503_and_saves_nothing(
    session: Session, channel3: FakeChannel3, user_id: int
) -> None:
    class BrokenLLM:
        async def generate(self, *_: Any) -> LLMTurn:
            raise LLMError("down")

    client = make_client(session, channel3, BrokenLLM())

    response = client.post("/chat", json={"message": "Hola"})

    assert response.status_code == 503
    assert session.scalars(select(Conversation)).all() == []


async def test_gemini_adapter_request_and_response() -> None:
    sent: list[dict[str, Any]] = []
    thought = {"type": "thought", "signature": "sig-1"}
    fc = {
        "type": "function_call",
        "id": "c1",
        "name": "search_products",
        "arguments": {"query": "x"},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        assert request.headers["x-goog-api-key"] == "key"
        return httpx.Response(
            200,
            json={
                "steps": [
                    thought,
                    fc,
                    {"type": "model_output", "content": [{"type": "text", "text": "Hi"}]},
                ]
            },
        )

    client = GeminiClient(
        "key", "gemini-test", http=httpx.AsyncClient(transport=httpx.MockTransport(handler))
    )
    history: History = [
        {"role": "user", "text": "Find x"},
        {"role": "model", "text": "", "raw": [thought, fc]},
        {"role": "tool", "call_id": "c1", "name": "search_products", "result": {"products": []}},
    ]
    spec = ToolSpec(name="search_products", description="d", parameters={"type": "object"})

    turn = await client.generate("Be kind.", history, [spec])

    body = sent[0]
    assert body["model"] == "gemini-test"
    assert body["store"] is False
    assert body["system_instruction"] == "Be kind."
    assert body["input"] == [
        {"type": "user_input", "content": "Find x"},
        thought,
        fc,
        {
            "type": "function_result",
            "call_id": "c1",
            "name": "search_products",
            "result": {"products": []},
            "is_error": False,
        },
    ]
    assert body["tools"] == [
        {
            "type": "function",
            "name": "search_products",
            "description": "d",
            "parameters": {"type": "object"},
        }
    ]
    assert turn.text == "Hi"
    assert turn.tool_calls == [ToolCall(id="c1", name="search_products", arguments={"query": "x"})]
    assert turn.raw[0] == thought


async def test_gemini_adapter_raises_on_http_error() -> None:
    http = httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(429)))

    with pytest.raises(LLMError, match="HTTP 429"):
        await GeminiClient("key", "m", http=http).generate("s", [], [])
