from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.main import app
from app.models import Notification, User
from app.services import alerts
from app.services.alerts import send_alert


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    def override_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = override_session
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture
def people(session: Session) -> dict[str, User]:
    people = {"maya": User(name="Maya"), "leo": User(name="Leo")}
    session.add_all(people.values())
    session.commit()
    return people


def sign_in(client: TestClient, user: User) -> None:
    assert client.post("/auth/session", json={"user_id": user.id}).status_code == 200


def test_lists_my_notifications_newest_first(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    send_alert(session, people["maya"], "order_paid", title="Kettle")
    send_alert(session, people["maya"], "order_paid", title="Lamp")
    send_alert(session, people["leo"], "order_paid", title="Not mine")
    session.commit()
    sign_in(client, people["maya"])

    body = client.get("/notifications").json()

    assert body["unread"] == 2
    assert [n["payload"]["title"] for n in body["items"]] == ["Lamp", "Kettle"]
    assert body["items"][0]["kind"] == "order_paid"
    assert body["items"][0]["read_at"] is None


def test_mark_some_or_all_read(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    first = send_alert(session, people["maya"], "order_paid")
    send_alert(session, people["maya"], "order_paid")
    session.commit()
    sign_in(client, people["maya"])

    assert client.post("/notifications/read", json={"ids": [first.id]}).status_code == 204
    assert client.get("/notifications").json()["unread"] == 1

    client.post("/notifications/read", json={})
    assert client.get("/notifications").json()["unread"] == 0


def test_cannot_mark_someone_elses_read(
    client: TestClient, session: Session, people: dict[str, User]
) -> None:
    theirs = send_alert(session, people["leo"], "order_paid")
    session.commit()
    sign_in(client, people["maya"])

    client.post("/notifications/read", json={"ids": [theirs.id]})

    session.refresh(theirs)
    assert theirs.read_at is None


def test_every_alert_goes_through_the_channels(
    session: Session, people: dict[str, User], monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(alerts, "CHANNELS", [lambda note, to: sent.append((note.kind, to.name))])

    notification = send_alert(session, people["maya"], "price_dropped", watch_id=3)

    assert sent == [("price_dropped", "Maya")]
    assert isinstance(notification, Notification)
    assert notification.id is not None  # saved, so channels can link to it
    assert notification.payload == {"watch_id": 3}
