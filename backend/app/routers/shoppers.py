from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db import get_session
from app.models import Role, User

router = APIRouter(prefix="/shoppers", tags=["shoppers"])

Language = Literal["en", "es", "fr", "ar"]
VoiceSpeed = Annotated[float, Field(ge=0.5, le=1.5)]
TextSize = Annotated[int, Field(ge=20, le=32)]


class Settings(BaseModel):
    language: Language
    voice_speed: VoiceSpeed
    text_size: TextSize


class SettingsPatch(BaseModel):
    language: Language | None = None
    voice_speed: VoiceSpeed | None = None
    text_size: TextSize | None = None


@router.get("/{shopper_id}/settings")
def get_settings(shopper_id: int, session: Annotated[Session, Depends(get_session)]) -> Settings:
    return _settings(_shopper(session, shopper_id))


@router.patch("/{shopper_id}/settings")
def update_settings(
    shopper_id: int, body: SettingsPatch, session: Annotated[Session, Depends(get_session)]
) -> Settings:
    shopper = _shopper(session, shopper_id)
    for field, value in body.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(shopper, field, value)
    session.commit()
    return _settings(shopper)


def _shopper(session: Session, shopper_id: int) -> User:
    shopper = session.get(User, shopper_id)
    if shopper is None or shopper.role != Role.shopper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shopper not found")
    return shopper


def _settings(shopper: User) -> Settings:
    return Settings(
        language=shopper.language,  # type: ignore[arg-type]
        voice_speed=shopper.voice_speed,
        text_size=shopper.text_size,
    )
