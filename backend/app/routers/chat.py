from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_channel3, get_llm
from app.core.security import CurrentUser, SessionDep
from app.integrations.channel3 import Channel3Client
from app.integrations.llm import LLMClient
from app.schemas.chat import ChatIn, ChatOut
from app.schemas.common import OrderOut
from app.services import chat as chat_service

router = APIRouter(tags=["chat"])


@router.post("/chat")
async def chat(
    body: ChatIn,
    session: SessionDep,
    channel3: Annotated[Channel3Client, Depends(get_channel3)],
    llm: Annotated[LLMClient, Depends(get_llm)],
    user: CurrentUser,
) -> ChatOut:
    reply = await chat_service.reply(session, channel3, llm, user, body.message)
    return ChatOut(
        conversation_id=reply.conversation_id,
        reply=reply.text,
        products=reply.products,
        draft_order=OrderOut.of(reply.draft_order) if reply.draft_order else None,
        reply_language=reply.reply_language,
    )
