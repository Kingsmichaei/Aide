"""Request and response models for /notifications."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

MAX_LISTED = 50  # the most notifications listed (and marked read) at once


class NotificationOut(BaseModel):
    id: int
    kind: str
    payload: dict[str, Any]
    created_at: datetime
    read_at: datetime | None


class NotificationsOut(BaseModel):
    unread: int
    items: list[NotificationOut]  # newest first


class MarkRead(BaseModel):
    # None marks everything read.
    ids: list[int] | None = Field(default=None, max_length=MAX_LISTED)
