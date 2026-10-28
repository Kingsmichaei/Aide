"""The one place alerts are sent from.

Every alert is stored as an in-app notification. To add email or SMS later,
write a function with the `Channel` signature and append it to CHANNELS: it
receives the saved notification and its recipient.
"""

from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AlertKind, CareLink, CareLinkStatus, Notification, Order, User
from app.services.orders import total

Channel = Callable[[Notification, User], None]
CHANNELS: list[Channel] = []  # e.g. send_email, send_sms


def send_alert(
    session: Session, to: User, kind: AlertKind, order: Order | None = None, **params: Any
) -> Notification:
    """Alert one person. The caller commits, so the alert and the change it
    describes are saved together."""
    if order is not None:
        params = {
            "title": order.title,
            "total": str(total(order)),
            "currency": order.currency,
            **params,
        }
    notification = Notification(
        user_id=to.id, kind=kind, order_id=order and order.id, params=params
    )
    session.add(notification)
    session.flush()
    for channel in CHANNELS:
        channel(notification, to)
    return notification


def caregivers_of(session: Session, shopper_id: int) -> list[User]:
    return list(
        session.scalars(
            select(User)
            .join(CareLink, CareLink.caregiver_id == User.id)
            .where(CareLink.shopper_id == shopper_id, CareLink.status == CareLinkStatus.active)
            .order_by(User.id)
        )
    )


def ask_caregivers(session: Session, order: Order) -> None:
    """An order went over a limit: tell everyone who looks after the shopper."""
    shopper = session.get(User, order.shopper_id)
    for caregiver in caregivers_of(session, order.shopper_id):
        send_alert(
            session,
            caregiver,
            AlertKind.approval_needed,
            order,
            shopper_name=shopper.name if shopper else "",
        )
