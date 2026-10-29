"""Demo sign-in: pick a seeded user, get a session cookie."""

from fastapi import APIRouter, Response, status

from app.core.security import CurrentUser, SessionDep, clear_session, set_session
from app.schemas.auth import SignIn, UserOut
from app.services import users as users_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/users")
def users(session: SessionDep) -> list[UserOut]:
    """Everyone who can sign in. Demo only: there are no passwords."""
    return [UserOut.of(user) for user in users_service.everyone(session)]


@router.post("/session")
def sign_in(body: SignIn, response: Response, session: SessionDep) -> UserOut:
    user = users_service.get(session, body.user_id)
    set_session(response, user)
    return UserOut.of(user)


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.of(user)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(response: Response) -> None:
    clear_session(response)
