"""Users: the demo sign-in list and each user's own profile."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.models import User

PROFILE_FIELDS = {
    "name",
    "email",
    "language",
    "currency",
    "theme",
    "voice_speed",
    "auto_send",
    "read_aloud",
}


def everyone(session: Session) -> list[User]:
    """Everyone who can sign in. Demo only: there are no passwords."""
    return list(session.scalars(select(User).order_by(User.id)))


def get(session: Session, user_id: int) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFound("No such user")
    return user


def update_profile(session: Session, user: User, changes: dict[str, Any]) -> User:
    """Apply validated profile changes; text is trimmed."""
    unknown = changes.keys() - PROFILE_FIELDS
    if unknown:
        raise ValueError(f"Not profile fields: {sorted(unknown)}")
    for field, value in changes.items():
        setattr(user, field, value.strip() if isinstance(value, str) else value)
    session.commit()
    return user
