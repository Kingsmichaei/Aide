"""The signed-in user's profile and preferences."""

from fastapi import APIRouter

from app.core.security import CurrentUser, SessionDep
from app.schemas.me import Profile, ProfilePatch
from app.services import users as users_service

router = APIRouter(prefix="/me", tags=["me"])


@router.get("")
def get_profile(user: CurrentUser) -> Profile:
    return Profile.of(user)


@router.patch("")
def update_profile(body: ProfilePatch, user: CurrentUser, session: SessionDep) -> Profile:
    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    return Profile.of(users_service.update_profile(session, user, changes))
