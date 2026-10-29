from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.security import COOKIE, MAX_AGE, make_token, read_token
from app.main import app
from app.models import User


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {
        "maya": User(name="Maya Chen", email="maya@example.com"),
        "leo": User(name="Leo Martin", email="leo@example.com"),
    }
    session.add_all(people.values())
    session.commit()
    return people


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


def test_picker_lists_everyone(client: TestClient, people: dict[str, User]) -> None:
    assert client.get("/auth/users").json() == [
        {"id": people["maya"].id, "name": "Maya Chen", "email": "maya@example.com"},
        {"id": people["leo"].id, "name": "Leo Martin", "email": "leo@example.com"},
    ]


def test_sign_in_sets_an_http_only_cookie(client: TestClient, people: dict[str, User]) -> None:
    response = client.post("/auth/session", json={"user_id": people["maya"].id})

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{COOKIE}=")
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()
    assert f"Max-Age={MAX_AGE}" in cookie
    assert client.get("/auth/me").json()["name"] == "Maya Chen"


def test_sign_out_ends_the_session(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["maya"])

    assert client.delete("/auth/session").status_code == 204
    assert client.get("/auth/me").status_code == 401


def test_unknown_user_cannot_sign_in(client: TestClient, people: dict[str, User]) -> None:
    assert client.post("/auth/session", json={"user_id": 999}).status_code == 404


@pytest.mark.parametrize(
    "path", ["/auth/me", "/me", "/rules", "/orders", "/insights/spending", "/notifications"]
)
def test_signed_out_gets_401(client: TestClient, people: dict[str, User], path: str) -> None:
    assert client.get(path).status_code == 401


def test_edited_cookie_is_rejected(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["maya"])
    _, issued, signature = client.cookies[COOKIE].split(".")
    client.cookies.set(COOKIE, f"{people['leo'].id}.{issued}.{signature}")

    assert client.get("/auth/me").status_code == 401


def test_tokens_expire_and_garbage_is_ignored() -> None:
    token = make_token(7, now=1_000)

    assert read_token(token, now=1_000 + MAX_AGE) == 7
    assert read_token(token, now=1_001 + MAX_AGE) is None
    assert read_token("not-a-token") is None
    assert read_token("7.1000.") is None


def test_each_person_only_sees_their_own_data(client: TestClient, people: dict[str, User]) -> None:
    sign_in(client, people["leo"])

    assert client.get("/me").json()["name"] == "Leo Martin"
    assert client.get("/orders").json() == []
