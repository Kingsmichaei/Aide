from collections.abc import Collection, Iterator
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.llm import History, LLMError, LLMTurn, ToolSpec
from app.db import get_session
from app.deps import get_channel3, get_llm, get_paypal
from app.main import app
from app.models import (
    AlertKind,
    Approval,
    CareLink,
    CareLinkStatus,
    ConfirmationMethod,
    Conversation,
    Decision,
    Notification,
    Order,
    OrderEvent,
    OrderStatus,
    Role,
    User,
)
from app.services import summary
from app.services.channel3 import Offer, ProductDetail
from app.services.paypal import AUTHORIZATION_EXPIRED, Capture, PayPalError


class FakePayPal:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.capture_error: PayPalError | None = None
        self.void_error: PayPalError | None = None

    async def capture(self, auth_id: str) -> Capture:
        self.calls.append(f"capture {auth_id}")
        if self.capture_error:
            raise self.capture_error
        return Capture(id="CAP-1", status="COMPLETED")

    async def void(self, auth_id: str) -> None:
        self.calls.append(f"void {auth_id}")
        if self.void_error:
            raise self.void_error


class FakeLLM:
    def __init__(self) -> None:
        self.seen: list[str] = []
        self.fail = False

    async def generate(self, system: str, history: History, tools: list[ToolSpec]) -> LLMTurn:
        assert tools == []  # the summary never gets tools
        self.seen.append(history[0]["text"])
        if self.fail:
            raise LLMError("down")
        return LLMTurn(
            text="Rosa asked for cheaper vitamins;\nthis is $4 less than last month.",
            tool_calls=[],
            raw=[],
        )


class FakeChannel3:
    """Enough for the shopper to confirm again after an expired hold."""

    async def get_product(
        self, product_id: str, blocked_categories: Collection[str] = ()
    ) -> ProductDetail | None:
        offer = Offer(price=Decimal("150.00"), currency="USD", retailer="cvs.com", url="https://x")
        return ProductDetail(
            id=product_id,
            title="Vitamin D, 120 tablets",
            image_url=None,
            category="vitamins",
            best_offer=offer,
            description=None,
            offers=[offer],
        )


@pytest.fixture
def paypal() -> FakePayPal:
    return FakePayPal()


@pytest.fixture
def llm() -> FakeLLM:
    summary._cache.clear()
    return FakeLLM()


@pytest.fixture
def client(session: Session, paypal: FakePayPal, llm: FakeLLM) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_paypal] = lambda: paypal
    app.dependency_overrides[get_llm] = lambda: llm
    app.dependency_overrides[get_channel3] = FakeChannel3
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {
        "rosa": User(name="Rosa", role=Role.shopper),
        "ana": User(name="Ana", role=Role.shopper),
        "sam": User(name="Sam", role=Role.caregiver),
        "kim": User(name="Kim", role=Role.caregiver),
    }
    session.add_all(people.values())
    session.flush()
    session.add_all(
        [
            CareLink(
                shopper_id=people["rosa"].id,
                caregiver_id=people["sam"].id,
                status=CareLinkStatus.active,
            ),
            CareLink(
                shopper_id=people["ana"].id,
                caregiver_id=people["kim"].id,
                status=CareLinkStatus.active,
            ),
        ]
    )
    session.commit()
    return people


def make_order(session: Session, shopper: User, **changes: Any) -> Order:
    fields: dict[str, Any] = {
        "shopper_id": shopper.id,
        "channel3_product_id": "vit-d",
        "title": "Vitamin D, 120 tablets",
        "retailer": "cvs.com",
        "price": Decimal("150.00"),
        "currency": "USD",
        "confirmed_total": Decimal("150.00"),
        "confirmed_at": datetime.now(UTC),
        "confirmation_method": ConfirmationMethod.voice,
        "confirmation_transcript": "Sí, cómpralo",
        "paypal_order_id": f"PP-{shopper.id}-{len(changes)}",
        "paypal_auth_id": f"AUTH-{shopper.id}-{len(changes)}",
        "status": OrderStatus.awaiting_caregiver,
        **changes,
    }
    order = Order(**fields)
    session.add(order)
    session.commit()
    return order


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


def decide(client: TestClient, order: Order, decision: str, note: str | None = None):
    return client.post(f"/care/approvals/{order.id}", json={"decision": decision, "note": note})


def approvals_for(session: Session, order: Order) -> list[Approval]:
    return list(session.scalars(select(Approval).where(Approval.order_id == order.id)))


def alerts_to(session: Session, user: User) -> list[tuple[AlertKind, str, str | None]]:
    return [
        (n.kind, n.params["caregiver_name"], n.params["note"])
        for n in session.scalars(select(Notification).where(Notification.user_id == user.id))
    ]


def last_event(session: Session, order: Order) -> dict[str, Any]:
    event = session.scalars(
        select(OrderEvent).where(OrderEvent.order_id == order.id).order_by(OrderEvent.id.desc())
    ).first()
    assert event is not None
    return event.detail


# --- The queue -------------------------------------------------------------------


def test_queue_lists_only_my_shoppers_waiting_orders(
    client: TestClient, session: Session, people: dict[str, User], llm: FakeLLM
) -> None:
    waiting = make_order(session, people["rosa"])
    make_order(session, people["rosa"], status=OrderStatus.captured)  # not waiting
    make_order(session, people["ana"])  # Kim's shopper, not Sam's
    session.add(
        Conversation(
            shopper_id=people["rosa"].id,
            language="es",
            messages=[{"role": "user", "text": "Quiero vitaminas más baratas"}],
        )
    )
    session.commit()
    sign_in(client, people["sam"])

    [item] = client.get("/care/approvals").json()

    assert item["order_id"] == waiting.id
    assert item["shopper"]["name"] == "Rosa"
    assert (item["title"], item["retailer"], item["total"]) == (
        "Vitamin D, 120 tablets",
        "cvs.com",
        "150.00",
    )
    assert item["confirmation_method"] == "voice"
    assert item["confirmation_transcript"] == "Sí, cómpralo"
    # One sentence, one line, from the model.
    assert item["summary"] == "Rosa asked for cheaper vitamins; this is $4 less than last month."
    # The model was given the shopper's own words to summarise.
    assert "Quiero vitaminas m" in llm.seen[0]


def test_summary_falls_back_to_a_plain_sentence(
    client: TestClient, session: Session, people: dict[str, User], llm: FakeLLM
) -> None:
    make_order(session, people["rosa"])
    llm.fail = True
    sign_in(client, people["sam"])

    [item] = client.get("/care/approvals").json()

    assert (
        item["summary"]
        == "Rosa asked for Vitamin D, 120 tablets from cvs.com, 150.00 USD in total."
    )


def test_summary_is_made_once_per_order(
    client: TestClient, session: Session, people: dict[str, User], llm: FakeLLM
) -> None:
    make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    client.get("/care/approvals")
    client.get("/care/approvals")

    assert len(llm.seen) == 1


# --- Deciding ----------------------------------------------------------------------


def test_approve_captures_and_records_the_decision(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    response = decide(client, order, "approve", "Fine this time")

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "captured"
    assert body["message"] == "Approved. Rosa's order for Vitamin D, 120 tablets is paid."
    assert body["order"]["status"] == "captured"
    assert paypal.calls == [f"capture {order.paypal_auth_id}"]
    [approval] = approvals_for(session, order)
    assert (approval.decision, approval.caregiver_id, approval.note) == (
        Decision.approved,
        people["sam"].id,
        "Fine this time",
    )
    assert last_event(session, order)["event"] == "approved_and_captured"
    assert alerts_to(session, people["rosa"]) == [(AlertKind.approved, "Sam", "Fine this time")]


def test_decline_voids_and_keeps_the_note(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    body = decide(client, order, "decline", "We have plenty at home").json()

    assert body["outcome"] == "voided"
    assert body["order"]["status"] == "voided"
    assert paypal.calls == [f"void {order.paypal_auth_id}"]
    [approval] = approvals_for(session, order)
    assert (approval.decision, approval.note) == (Decision.declined, "We have plenty at home")
    assert last_event(session, order)["note"] == "We have plenty at home"
    assert alerts_to(session, people["rosa"]) == [
        (AlertKind.declined, "Sam", "We have plenty at home")
    ]
    # The shopper's app shows the note with the decline.
    sign_in(client, people["rosa"])
    status = client.get(f"/orders/{order.id}").json()
    assert (status["order"]["status"], status["note"]) == ("voided", "We have plenty at home")


def test_blank_note_is_stored_as_none(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    decide(client, order, "decline", "   ")

    assert approvals_for(session, order)[0].note is None


def test_approving_twice_captures_once(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    first = decide(client, order, "approve")
    second = decide(client, order, "approve")

    assert first.status_code == 200
    assert second.status_code == 409
    assert "Nothing was changed" in second.json()["detail"]
    assert paypal.calls == [f"capture {order.paypal_auth_id}"]
    assert len(approvals_for(session, order)) == 1


@pytest.mark.parametrize("decision", ["approve", "decline"])
@pytest.mark.parametrize("status", [OrderStatus.voided, OrderStatus.captured, OrderStatus.draft])
def test_orders_not_waiting_cannot_be_decided(
    client: TestClient,
    session: Session,
    paypal: FakePayPal,
    people: dict[str, User],
    decision: str,
    status: OrderStatus,
) -> None:
    order = make_order(session, people["rosa"], status=status)
    sign_in(client, people["sam"])

    assert decide(client, order, decision).status_code == 409
    assert paypal.calls == []
    assert approvals_for(session, order) == []
    assert alerts_to(session, people["rosa"]) == []
    assert session.get(Order, order.id).status == status


def test_decline_after_approve_is_refused(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    decide(client, order, "approve")

    assert decide(client, order, "decline").status_code == 409
    assert session.get(Order, order.id).status == OrderStatus.captured
    assert paypal.calls == [f"capture {order.paypal_auth_id}"]


def test_expired_authorization_goes_back_to_the_shopper(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    paypal.capture_error = PayPalError("expired", status=422, issue=AUTHORIZATION_EXPIRED)
    sign_in(client, people["sam"])

    body = decide(client, order, "approve").json()

    assert body["outcome"] == "expired"
    assert "nothing was paid" in body["message"]
    assert "Rosa will be asked to confirm and pay again" in body["message"]
    stored = session.get(Order, order.id)
    assert stored.status == OrderStatus.awaiting_shopper
    # The old PayPal order and the shopper's yes are used up.
    assert (stored.paypal_order_id, stored.paypal_auth_id, stored.confirmed_total) == (
        None,
        None,
        None,
    )
    assert stored.confirmation_transcript is None
    [approval] = approvals_for(session, order)
    assert approval.decision == Decision.approved
    assert last_event(session, order)["event"] == "authorization_expired"
    assert alerts_to(session, people["rosa"]) == [(AlertKind.payment_expired, "Sam", None)]

    # The shopper can confirm the same order again.
    sign_in(client, people["rosa"])
    shown = {"title": order.title, "price": "150.00", "currency": "USD", "total": "150.00"}
    confirm = client.post(f"/orders/{order.id}/confirm", json=shown)
    assert confirm.json()["confirmed"] is True


def test_decline_with_an_expired_hold_still_declines(
    client: TestClient, session: Session, paypal: FakePayPal, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    paypal.void_error = PayPalError("expired", status=422, issue=AUTHORIZATION_EXPIRED)
    sign_in(client, people["sam"])

    body = decide(client, order, "decline").json()

    assert body["outcome"] == "voided"
    assert session.get(Order, order.id).status == OrderStatus.voided


@pytest.mark.parametrize("decision", ["approve", "decline"])
def test_paypal_down_changes_nothing(
    client: TestClient,
    session: Session,
    paypal: FakePayPal,
    people: dict[str, User],
    decision: str,
) -> None:
    order = make_order(session, people["rosa"])
    paypal.capture_error = PayPalError("down", status=503)
    paypal.void_error = PayPalError("down", status=503)
    sign_in(client, people["sam"])

    response = decide(client, order, decision)

    assert response.status_code == 502
    session.expire_all()
    assert session.get(Order, order.id).status == OrderStatus.awaiting_caregiver
    assert approvals_for(session, order) == []


# --- Access ------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["kim", "rosa"])
def test_only_the_linked_caregiver_can_decide(
    client: TestClient,
    session: Session,
    paypal: FakePayPal,
    people: dict[str, User],
    who: str,
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people[who])

    assert decide(client, order, "approve").status_code == 403
    assert paypal.calls == []


def test_shoppers_cannot_see_the_queue(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    assert client.get("/care/approvals").status_code == 403


def test_unknown_order_is_404(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    assert client.post("/care/approvals/999", json={"decision": "approve"}).status_code == 404


def test_decision_must_be_approve_or_decline(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    order = make_order(session, people["rosa"])
    sign_in(client, people["sam"])

    assert decide(client, order, "maybe").status_code == 422
