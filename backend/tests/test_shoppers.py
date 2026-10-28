from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import current_user
from app.db import get_session
from app.main import app
from app.models import Role, User


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    # Signed in as the test's shopper; access rules have their own tests in test_auth.
    app.dependency_overrides[current_user] = lambda: session.scalars(
        select(User).where(User.role == Role.shopper).order_by(User.id)
    ).first()
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def shopper_id(session: Session) -> int:
    user = User(name="Rosa", role=Role.shopper)
    session.add(user)
    session.commit()
    return user.id


def test_get_returns_defaults(client: TestClient, shopper_id: int) -> None:
    response = client.get(f"/shoppers/{shopper_id}/settings")

    assert response.status_code == 200
    assert response.json() == {
        "language": "en",
        "voice_speed": 1.0,
        "text_size": 20,
        "auto_send": True,
        "read_aloud": True,
    }


def test_patch_updates_only_given_fields(
    client: TestClient, session: Session, shopper_id: int
) -> None:
    response = client.patch(
        f"/shoppers/{shopper_id}/settings",
        json={"language": "ar", "text_size": 28, "read_aloud": False},
    )

    assert response.json() == {
        "language": "ar",
        "voice_speed": 1.0,
        "text_size": 28,
        "auto_send": True,
        "read_aloud": False,
    }
    user = session.get(User, shopper_id)
    assert (user.language, user.text_size, user.read_aloud) == ("ar", 28, False)


@pytest.mark.parametrize(
    "body",
    [
        {"language": "de"},
        {"text_size": 18},
        {"text_size": 34},
        {"voice_speed": 3},
        {"auto_send": "maybe"},
    ],
)
def test_patch_rejects_out_of_range_values(
    client: TestClient, shopper_id: int, body: dict[str, object]
) -> None:
    assert client.patch(f"/shoppers/{shopper_id}/settings", json=body).status_code == 422


def test_shopper_cannot_see_someone_elses_settings(
    client: TestClient, session: Session, shopper_id: int
) -> None:
    caregiver = User(name="Sam", role=Role.caregiver)
    session.add(caregiver)
    session.commit()

    assert client.get(f"/shoppers/{caregiver.id}/settings").status_code == 403
