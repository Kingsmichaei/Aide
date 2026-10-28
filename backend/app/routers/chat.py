from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.agent.llm import LLMClient, LLMError
from app.agent.loop import run_turn
from app.agent.prompts import system_prompt
from app.agent.tools import ToolContext
from app.auth import CurrentUser, check_is_shopper
from app.db import get_session
from app.deps import get_channel3, get_llm
from app.models import Conversation
from app.schemas import OrderOut
from app.services.channel3 import Channel3Client, Product
from app.services.orders import blocked_categories

router = APIRouter(tags=["chat"])


class ChatIn(BaseModel):
    shopper_id: int
    message: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    conversation_id: int
    reply: str
    products: list[Product]
    draft_order: OrderOut | None
    # The language the reply is in, when it differs from the shopper's setting.
    reply_language: str | None = None


@router.post("/chat")
async def chat(
    body: ChatIn,
    session: Annotated[Session, Depends(get_session)],
    channel3: Annotated[Channel3Client, Depends(get_channel3)],
    llm: Annotated[LLMClient, Depends(get_llm)],
    user: CurrentUser,
) -> ChatOut:
    check_is_shopper(user, body.shopper_id)
    shopper = user

    conversation = session.scalar(
        select(Conversation)
        .where(Conversation.shopper_id == shopper.id)
        .order_by(Conversation.id.desc())
        .limit(1)
    )
    if conversation is None:
        conversation = Conversation(shopper_id=shopper.id, language=shopper.language, messages=[])
        session.add(conversation)

    history = list(conversation.messages)
    ctx = ToolContext(
        session=session,
        channel3=channel3,
        shopper_id=shopper.id,
        blocked_categories=blocked_categories(session, shopper.id),
        language=shopper.language,
    )
    try:
        reply = await run_turn(
            llm, system_prompt(shopper.name, shopper.language), history, body.message, ctx
        )
    except LLMError as error:
        session.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Aide cannot answer right now"
        ) from error

    conversation.messages = history  # new list so SQLAlchemy sees the change
    session.commit()
    return ChatOut(
        conversation_id=conversation.id,
        reply=reply,
        products=ctx.products,
        draft_order=OrderOut.of(ctx.draft_order) if ctx.draft_order else None,
        reply_language=ctx.reply_language,
    )
