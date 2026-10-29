"""The signed-in user's spending rules, and the Channel3 categories they can block."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.deps import get_channel3
from app.core.security import CurrentUser, SessionDep
from app.integrations.channel3 import Category, Channel3Client
from app.schemas.rules import RulesIn, RulesOut
from app.services import rules
from app.services.rules import RulesView

router = APIRouter(prefix="/rules", tags=["rules"])

Channel3Dep = Annotated[Channel3Client, Depends(get_channel3)]


@router.get("")
async def get_rules(user: CurrentUser, session: SessionDep, channel3: Channel3Dep) -> RulesOut:
    return _out(await rules.view(session, channel3, user))


@router.put("")
async def put_rules(
    body: RulesIn, user: CurrentUser, session: SessionDep, channel3: Channel3Dep
) -> RulesOut:
    saved = await rules.save(
        session,
        channel3,
        user,
        monthly_budget=body.monthly_budget,
        ask_above=body.ask_above,
        blocked=body.blocked_categories,
    )
    return _out(saved)


@router.get("/categories")
async def categories(user: CurrentUser, channel3: Channel3Dep, query: str = "") -> list[Category]:
    return await rules.find_categories(channel3, query)


def _out(view: RulesView) -> RulesOut:
    return RulesOut(
        currency=view.currency,
        monthly_budget=view.monthly_budget,
        ask_above=view.ask_above,
        blocked_categories=view.blocked_categories,
    )
