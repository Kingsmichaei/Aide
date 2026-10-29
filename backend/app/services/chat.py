"""One chat turn: the user's message in, Aide's reply (and any products or draft) out."""

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.agent.loop import run_turn
from app.agent.prompts import system_prompt
from app.agent.tools import ToolContext
from app.core.errors import Unavailable
from app.integrations.channel3 import Channel3Client, Product
from app.integrations.llm import LLMClient, LLMError
from app.models import Order, User
from app.services import conversations
from app.services.rules import blocked_categories


@dataclass(frozen=True)
class Reply:
    conversation_id: int
    text: str
    products: list[Product]
    draft_order: Order | None
    reply_language: str | None


async def reply(
    session: Session, channel3: Channel3Client, llm: LLMClient, user: User, message: str
) -> Reply:
    conversation = conversations.latest_or_new(session, user)
    history = list(conversation.messages)
    ctx = ToolContext(
        session=session,
        channel3=channel3,
        user_id=user.id,
        blocked_categories=blocked_categories(session, user.id),
        language=user.language,
    )
    try:
        text = await run_turn(llm, system_prompt(user.name, user.language), history, message, ctx)
    except LLMError as error:
        session.rollback()
        raise Unavailable("Aide can't answer right now") from error

    conversation.messages = history  # new list so SQLAlchemy sees the change
    session.commit()
    return Reply(
        conversation_id=conversation.id,
        text=text,
        products=ctx.products,
        draft_order=ctx.draft_order,
        reply_language=ctx.reply_language,
    )
