"""The one place alerts are sent from, and the user's in-app inbox.

Every alert is stored as an in-app notification. To add email or push later,
write a function with the `Channel` signature and append it to CHANNELS: it
receives the saved notification and its recipient.
"""

from collections.abc import Callable, Collection
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models import Notification, User

Channel = Callable[[Notification, User], None]
CHANNELS: list[Channel] = []  # e.g. send_email, send_push


def send_alert(session: Session, to: User, kind: str, **payload: Any) -> Notification:
    """Alert one person. The caller commits, so the alert and the change it
    describes are saved together. `payload` must be JSON-safe."""
    notification = Notification(user_id=to.id, kind=kind, payload=payload)
    session.add(notification)
    session.flush()
    for channel in CHANNELS:
        channel(notification, to)
    return notification


def unread_count(session: Session, user_id: int) -> int:
    count = session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id, Notification.read_at.is_(None))
    )
    return count or 0


def newest(session: Session, user_id: int, limit: int) -> list[Notification]:
    return list(
        session.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.id.desc())
            .limit(limit)
        )
    )


def mark_read(session: Session, user_id: int, ids: Collection[int] | None = None) -> None:
    """Mark the user's unread notifications read: these ids, or all of them."""
    query = update(Notification).where(
        Notification.user_id == user_id, Notification.read_at.is_(None)
    )
    if ids is not None:
        query = query.where(Notification.id.in_(ids))
    session.execute(query.values(read_at=datetime.now(UTC)))
    session.commit()
