"""Demo sign-in: a signed, HTTP-only session cookie holding the user id.

There are no passwords; anyone can pick a seeded user. The cookie is signed so
it cannot be edited to become someone else, and access rules are enforced here:
shoppers only see their own data, caregivers only see shoppers linked to them.
"""

import hashlib
import hmac
import time
from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_session
from app.models import CareLink, CareLinkStatus, Role, User

COOKIE = "aide_session"
MAX_AGE = 7 * 24 * 60 * 60  # a week, so a demo survives a few days of testing


def _signature(payload: str) -> str:
    key = get_settings().secret_key.encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def make_token(user_id: int, now: float | None = None) -> str:
    payload = f"{user_id}.{int(now if now is not None else time.time())}"
    return f"{payload}.{_signature(payload)}"


def read_token(token: str, now: float | None = None) -> int | None:
    """The user id in a valid, unexpired token; None for anything else."""
    try:
        user_id, issued, signature = token.split(".")
        expected = _signature(f"{user_id}.{issued}")
        if not hmac.compare_digest(signature, expected):
            return None
        if (now if now is not None else time.time()) - int(issued) > MAX_AGE:
            return None
        return int(user_id)
    except ValueError:
        return None


def set_session(response: Response, user: User) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE,
        make_token(user.id),
        max_age=MAX_AGE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


def clear_session(response: Response) -> None:
    settings = get_settings()
    response.delete_cookie(
        COOKIE,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


SessionDep = Annotated[Session, Depends(get_session)]


def current_user(request: Request, session: SessionDep) -> User:
    token = request.cookies.get(COOKIE)
    user_id = read_token(token) if token else None
    user = session.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in")
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_shopper(user: CurrentUser) -> User:
    if user.role != Role.shopper:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only shoppers can do this")
    return user


def check_is_shopper(user: User, shopper_id: int) -> None:
    """Shoppers may only act for themselves."""
    if user.role != Role.shopper or user.id != shopper_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only see your own account")


def require_caregiver(user: CurrentUser) -> User:
    if user.role != Role.caregiver:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only caregivers can do this")
    return user


Caregiver = Annotated[User, Depends(require_caregiver)]


def linked_shopper_ids(session: Session, caregiver: User) -> set[int]:
    """Shoppers this caregiver has an active care link to."""
    return set(
        session.scalars(
            select(CareLink.shopper_id).where(
                CareLink.caregiver_id == caregiver.id,
                CareLink.status == CareLinkStatus.active,
            )
        )
    )


def check_looks_after(session: Session, caregiver: User, shopper_id: int) -> None:
    if shopper_id not in linked_shopper_ids(session, caregiver):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not look after this shopper")


def cared_for_shopper(shopper_id: int, caregiver: Caregiver, session: SessionDep) -> User:
    """The shopper in the path, if this caregiver has an active link to them."""
    check_looks_after(session, caregiver, shopper_id)
    shopper = session.get(User, shopper_id)
    assert shopper is not None  # the link's foreign key guarantees it
    return shopper


CaredForShopper = Annotated[User, Depends(cared_for_shopper)]
