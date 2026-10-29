import pytest
from sqlalchemy.orm import Session

from app.models import Notification, User
from app.services import alerts


@pytest.fixture
def maya(session: Session) -> User:
    user = User(name="Maya")
    session.add_all([user, User(name="Leo")])
    session.commit()
    return user


def test_send_alert_stores_a_notification_and_runs_each_channel(
    session: Session, maya: User, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(alerts, "CHANNELS", [lambda n, to: sent.append((n.kind, to.name))])

    notification = alerts.send_alert(session, maya, "order_paid", order_id=7)

    assert notification.id is not None
    assert notification.payload == {"order_id": 7}
    assert sent == [("order_paid", "Maya")]


def test_inbox_is_newest_first_and_counts_unread(session: Session, maya: User) -> None:
    for n in range(3):
        alerts.send_alert(session, maya, "order_paid", order_id=n)
    session.commit()

    newest = alerts.newest(session, maya.id, limit=2)

    assert [n.payload["order_id"] for n in newest] == [2, 1]
    assert alerts.unread_count(session, maya.id) == 3


def test_mark_read_touches_only_the_users_own(session: Session, maya: User) -> None:
    mine = alerts.send_alert(session, maya, "order_paid")
    other = session.query(User).filter_by(name="Leo").one()
    theirs = alerts.send_alert(session, other, "order_paid")
    session.commit()

    alerts.mark_read(session, maya.id, [mine.id, theirs.id])

    session.expire_all()
    assert session.get(Notification, mine.id).read_at is not None
    assert session.get(Notification, theirs.id).read_at is None
    assert alerts.unread_count(session, maya.id) == 0
