"""Request and response models for /auth."""

from pydantic import BaseModel

from app.models import User


class UserOut(BaseModel):
    id: int
    name: str
    email: str | None

    @classmethod
    def of(cls, user: User) -> "UserOut":
        return cls(id=user.id, name=user.name, email=user.email)


class SignIn(BaseModel):
    user_id: int
