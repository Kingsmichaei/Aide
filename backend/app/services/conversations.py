"""The user's chat with Aide: one running conversation, kept as LLM history."""

from dataclasses import dataclass
from typing import Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Conversation, User


@dataclass(frozen=True)
class Message:
    role: Literal["user", "aide"]
    text: str


def latest(session: Session, user_id: int) -> Conversation | None:
    return session.scalar(
        select(Conversation)
        .where(Conversation.user_id == user_id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )


def start(session: Session, user: User) -> Conversation:
    conversation = Conversation(user_id=user.id, language=user.language, messages=[])
    session.add(conversation)
    return conversation


def latest_or_new(session: Session, user: User) -> Conversation:
    return latest(session, user.id) or start(session, user)


def transcript(session: Session, user_id: int, limit: int) -> list[Message]:
    """The last `limit` things said in the latest conversation (tool calls left out)."""
    conversation = latest(session, user_id)
    if conversation is None:
        return []
    said = [
        Message(role="user" if m["role"] == "user" else "aide", text=m["text"])
        for m in conversation.messages
        if m.get("role") in ("user", "model") and m.get("text")
    ]
    return said[-limit:]
