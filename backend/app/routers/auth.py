"""Demo sign-in: pick a seeded user, get a session cookie."""

from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select

from app.auth import CurrentUser, SessionDep, clear_session, set_session
from app.models import Role, User

router = APIRouter(prefix="/auth", tags=["auth"])


class UserOut(BaseModel):
    id: int
    name: str
    role: Role

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(id=user.id, name=user.name, role=user.role)


class SignIn(BaseModel):
    user_id: int


@router.get("/users")
def users(session: SessionDep) -> list[UserOut]:
    """Everyone who can sign in. Demo only: there are no passwords."""
    return [UserOut.of(user) for user in session.scalars(select(User).order_by(User.id))]


@router.post("/session")
def sign_in(body: SignIn, response: Response, session: SessionDep) -> UserOut:
    user = session.get(User, body.user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such user")
    set_session(response, user)
    return UserOut.of(user)


@router.get("/me")
def me(user: CurrentUser) -> UserOut:
    return UserOut.of(user)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(response: Response) -> None:
    clear_session(response)
