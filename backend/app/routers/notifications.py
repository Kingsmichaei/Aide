"""The signed-in user's in-app alerts. Apps poll GET every few seconds."""

from fastapi import APIRouter, status

from app.core.security import CurrentUser, SessionDep
from app.schemas.notifications import MAX_LISTED, MarkRead, NotificationOut, NotificationsOut
from app.services import alerts

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def my_notifications(user: CurrentUser, session: SessionDep) -> NotificationsOut:
    return NotificationsOut(
        unread=alerts.unread_count(session, user.id),
        items=[
            NotificationOut(
                id=n.id,
                kind=n.kind,
                payload=n.payload,
                created_at=n.created_at,
                read_at=n.read_at,
            )
            for n in alerts.newest(session, user.id, MAX_LISTED)
        ],
    )


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(body: MarkRead, user: CurrentUser, session: SessionDep) -> None:
    alerts.mark_read(session, user.id, body.ids)
