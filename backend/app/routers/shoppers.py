from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import CurrentUser, check_is_shopper
from app.db import get_session
from app.models import User

router = APIRouter(prefix="/shoppers", tags=["shoppers"])

Language = Literal["en", "es", "fr", "ar"]
VoiceSpeed = Annotated[float, Field(ge=0.5, le=1.5)]
TextSize = Annotated[int, Field(ge=20, le=32)]


class Settings(BaseModel):
    language: Language
    voice_speed: VoiceSpeed
    text_size: TextSize
    auto_send: bool
    read_aloud: bool


class SettingsPatch(BaseModel):
    language: Language | None = None
    voice_speed: VoiceSpeed | None = None
    text_size: TextSize | None = None
    auto_send: bool | None = None
    read_aloud: bool | None = None


@router.get("/{shopper_id}/settings")
def get_settings(shopper_id: int, user: CurrentUser) -> Settings:
    check_is_shopper(user, shopper_id)
    return _settings(user)


@router.patch("/{shopper_id}/settings")
def update_settings(
    shopper_id: int,
    body: SettingsPatch,
    user: CurrentUser,
    session: Annotated[Session, Depends(get_session)],
) -> Settings:
    check_is_shopper(user, shopper_id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(user, field, value)
    session.commit()
    return _settings(user)


def _settings(shopper: User) -> Settings:
    return Settings(
        language=shopper.language,  # type: ignore[arg-type]
        voice_speed=shopper.voice_speed,
        text_size=shopper.text_size,
        auto_send=shopper.auto_send,
        read_aloud=shopper.read_aloud,
    )
