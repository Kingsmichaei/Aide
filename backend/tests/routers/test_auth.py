from collections.abc import Iterator
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.auth import COOKIE, MAX_AGE, make_token, read_token
from app.db import get_session
from app.main import app
from app.models import CareLink, CareLinkStatus, Order, Role, User


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    """Rosa is looked after by Sam. Ana has no caregiver. Kim's link to Rosa ended."""
    people = {
        "rosa": User(name="Rosa", role=Role.shopper),
        "ana": User(name="Ana", role=Role.shopper),
        "sam": User(name="Sam", role=Role.caregiver),
        "kim": User(name="Kim", role=Role.caregiver),
        "lee": User(name="Lee", role=Role.caregiver),
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
                shopper_id=people["rosa"].id,
                caregiver_id=people["kim"].id,
                status=CareLinkStatus.revoked,
            ),
            CareLink(
                shopper_id=people["rosa"].id,
                caregiver_id=people["lee"].id,
                status=CareLinkStatus.pending,
            ),
        ]
    )
    session.commit()
    return people


def sign_in(client: TestClient, user: User) -> None:
    response = client.post("/auth/session", json={"user_id": user.id})
    assert response.status_code == 200


# --- Sign-in -----------------------------------------------------------------


def test_picker_lists_every_user(client: TestClient, people: dict[str, User]) -> None:
    users = client.get("/auth/users").json()

    assert [(u["name"], u["role"]) for u in users] == [
        ("Rosa", "shopper"),
        ("Ana", "shopper"),
        ("Sam", "caregiver"),
        ("Kim", "caregiver"),
        ("Lee", "caregiver"),
    ]


def test_sign_in_sets_an_http_only_cookie(client: TestClient, people: dict[str, User]) -> None:
    response = client.post("/auth/session", json={"user_id": people["sam"].id})

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()
    assert f"Max-Age={MAX_AGE}" in cookie
    assert client.get("/auth/me").json() == {
        "id": people["sam"].id,
        "name": "Sam",
        "role": "caregiver",
    }


def test_sign_out_ends_the_session(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    assert client.delete("/auth/session").status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_unknown_user_cannot_sign_in(client: TestClient, people: dict[str, User]) -> None:
    assert client.post("/auth/session", json={"user_id": 999}).status_code == 404


@pytest.mark.parametrize("path", ["/auth/me", "/care/shoppers", "/shoppers/1/settings"])
def test_signed_out_gets_401(client: TestClient, people: dict[str, User], path: str) -> None:
    assert client.get(path).status_code == 401


def test_edited_cookie_is_rejected(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])
    user_id, issued, signature = client.cookies[COOKIE].split(".")
    client.cookies.set(COOKIE, f"{people['sam'].id}.{issued}.{signature}")

    assert client.get("/auth/me").status_code == 401


def test_tokens_expire_and_garbage_is_ignored() -> None:
    token = make_token(7, now=1_000)

    assert read_token(token, now=1_000 + MAX_AGE) == 7
    assert read_token(token, now=1_001 + MAX_AGE) is None
    assert read_token("not-a-token") is None
    assert read_token("7.1000.") is None


# --- Caregiver access ----------------------------------------------------------


def test_caregiver_sees_only_linked_shoppers(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    assert [s["name"] for s in client.get("/care/shoppers").json()] == ["Rosa"]
    response = client.get(f"/care/shoppers/{people['rosa'].id}")
    assert response.status_code == 200
    assert response.json()["name"] == "Rosa"


def test_caregiver_gets_403_for_a_shopper_they_do_not_look_after(
    client: TestClient, people: dict[str, User]
) -> None:
    sign_in(client, people["sam"])

    assert client.get(f"/care/shoppers/{people['ana'].id}").status_code == 403


@pytest.mark.parametrize("caregiver", ["kim", "lee"])
def test_revoked_or_pending_links_give_no_access(
    client: TestClient, people: dict[str, User], caregiver: str
) -> None:
    sign_in(client, people[caregiver])

    assert client.get(f"/care/shoppers/{people['rosa'].id}").status_code == 403
    assert client.get("/care/shoppers").json() == []


def test_shoppers_cannot_use_care_routes(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    assert client.get("/care/shoppers").status_code == 403
    assert client.get(f"/care/shoppers/{people['rosa'].id}").status_code == 403


def test_caregiver_cannot_use_shopper_routes(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["sam"])

    assert client.get(f"/shoppers/{people['rosa'].id}/settings").status_code == 403


# --- Shopper access ------------------------------------------------------------


def test_shopper_sees_only_their_own_settings(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    assert client.get(f"/shoppers/{people['rosa'].id}/settings").status_code == 200
    assert client.get(f"/shoppers/{people['ana'].id}/settings").status_code == 403


def test_shopper_cannot_confirm_or_pay_for_someone_elses_order(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    order = Order(
        shopper_id=people["ana"].id,
        channel3_product_id="c3",
        title="Kettle",
        retailer="shop.com",
        price=Decimal("10.00"),
        currency="USD",
    )
    session.add(order)
    session.commit()
    sign_in(client, people["rosa"])
    shown = {"title": "Kettle", "price": "10.00", "currency": "USD", "total": "10.00"}

    assert client.post(f"/orders/{order.id}/confirm", json=shown).status_code == 403
    assert client.post(f"/orders/{order.id}/paypal").status_code == 403
    assert client.post(f"/orders/{order.id}/approved").status_code == 403


def test_shopper_cannot_chat_as_someone_else(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["rosa"])

    response = client.post("/chat", json={"shopper_id": people["ana"].id, "message": "hi"})

    assert response.status_code == 403
