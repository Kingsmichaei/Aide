"""Request and response models for /me."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.models import Theme, User

Language = Literal["en", "es", "fr", "ar"]


Currency = Literal["USD", "EUR", "GBP", "CAD", "AUD"]


VoiceSpeed = Annotated[float, Field(ge=0.5, le=1.5)]


# Enough to catch typos; we never send mail to it.
Email = Annotated[str, Field(max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]


class Profile(BaseModel):
    id: int
    name: str
    email: str | None
    language: Language
    currency: Currency
    theme: Theme
    voice_speed: VoiceSpeed
    auto_send: bool
    read_aloud: bool

    @classmethod
    def of(cls, user: User) -> "Profile":
        return cls(
            id=user.id,
            name=user.name,
            email=user.email,
            language=user.language,
            currency=user.currency,
            theme=user.theme,
            voice_speed=user.voice_speed,
            auto_send=user.auto_send,
            read_aloud=user.read_aloud,
        )


class ProfilePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: Email | None = None
    language: Language | None = None
    currency: Currency | None = None
    theme: Theme | None = None
    voice_speed: VoiceSpeed | None = None
    auto_send: bool | None = None
    read_aloud: bool | None = None
