from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.security import current_user
from app.main import app
from app.models import User


@pytest.fixture
def user(session: Session) -> User:
    user = User(name="Maya Chen", email="maya@example.com")
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def client(session: Session, user: User) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[current_user] = lambda: user
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_profile_defaults(client: TestClient, user: User) -> None:
    assert client.get("/me").json() == {
        "id": user.id,
        "name": "Maya Chen",
        "email": "maya@example.com",
        "language": "en",
        "currency": "USD",
        "theme": "system",
        "voice_speed": 1.0,
        "auto_send": True,
        "read_aloud": False,  # text first; reading aloud is opt-in
    }


def test_patch_changes_only_what_is_sent(client: TestClient, session: Session, user: User) -> None:
    body = client.patch(
        "/me", json={"theme": "dark", "currency": "EUR", "name": " Maya C. "}
    ).json()

    assert (body["theme"], body["currency"], body["name"], body["language"]) == (
        "dark",
        "EUR",
        "Maya C.",
        "en",
    )
    session.refresh(user)
    assert user.theme == "dark"


@pytest.mark.parametrize(
    "body",
    [
        {"language": "de"},
        {"currency": "XYZ"},
        {"theme": "sepia"},
        {"voice_speed": 3},
        {"name": ""},
        {"email": "not-an-email"},
    ],
)
def test_invalid_values_are_refused(client: TestClient, body: dict[str, object]) -> None:
    assert client.patch("/me", json=body).status_code == 422


def test_email_can_be_set(client: TestClient) -> None:
    assert client.patch("/me", json={"email": "m@chen.dev"}).json()["email"] == "m@chen.dev"
