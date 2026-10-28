from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.db import get_session
from app.main import app
from app.models import Role, User


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
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
    assert response.json() == {"language": "en", "voice_speed": 1.0, "text_size": 20}


def test_patch_updates_only_given_fields(
    client: TestClient, session: Session, shopper_id: int
) -> None:
    response = client.patch(
        f"/shoppers/{shopper_id}/settings", json={"language": "ar", "text_size": 28}
    )

    assert response.json() == {"language": "ar", "voice_speed": 1.0, "text_size": 28}
    user = session.get(User, shopper_id)
    assert (user.language, user.text_size) == ("ar", 28)


@pytest.mark.parametrize(
    "body",
    [{"language": "de"}, {"text_size": 18}, {"text_size": 34}, {"voice_speed": 3}],
)
def test_patch_rejects_out_of_range_values(
    client: TestClient, shopper_id: int, body: dict[str, object]
) -> None:
    assert client.patch(f"/shoppers/{shopper_id}/settings", json=body).status_code == 422


def test_caregiver_is_not_a_shopper(client: TestClient, session: Session) -> None:
    caregiver = User(name="Sam", role=Role.caregiver)
    session.add(caregiver)
    session.commit()

    assert client.get(f"/shoppers/{caregiver.id}/settings").status_code == 404
