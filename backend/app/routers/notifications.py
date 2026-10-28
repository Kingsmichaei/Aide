"""The signed-in user's in-app alerts. Apps poll GET every few seconds."""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update

from app.auth import CurrentUser, SessionDep
from app.models import AlertKind, Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

MAX_LISTED = 50


class NotificationOut(BaseModel):
    id: int
    kind: AlertKind
    order_id: int | None
    params: dict[str, Any]
    created_at: datetime
    read_at: datetime | None


class NotificationsOut(BaseModel):
    unread: int
    items: list[NotificationOut]  # newest first


class MarkRead(BaseModel):
    # None marks everything read.
    ids: list[int] | None = Field(default=None, max_length=MAX_LISTED)


@router.get("")
def my_notifications(user: CurrentUser, session: SessionDep) -> NotificationsOut:
    unread = session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    items = session.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.id.desc())
        .limit(MAX_LISTED)
    )
    return NotificationsOut(
        unread=unread or 0,
        items=[
            NotificationOut(
                id=n.id,
                kind=n.kind,
                order_id=n.order_id,
                params=n.params,
                created_at=n.created_at,
                read_at=n.read_at,
            )
            for n in items
        ],
    )


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(body: MarkRead, user: CurrentUser, session: SessionDep) -> None:
    query = update(Notification).where(
        Notification.user_id == user.id, Notification.read_at.is_(None)
    )
    if body.ids is not None:
        query = query.where(Notification.id.in_(body.ids))
    session.execute(query.values(read_at=datetime.now(UTC)))
    session.commit()
