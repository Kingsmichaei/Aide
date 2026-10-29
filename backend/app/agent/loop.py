"""One user turn: send history to the model, run any tool calls, repeat until it replies."""

import logging
from typing import Any

from app.agent.tools import TOOLS, ToolContext, ToolInputError
from app.integrations.channel3 import Channel3Error
from app.integrations.llm import History, LLMClient

logger = logging.getLogger(__name__)

MAX_STEPS = 6  # model calls per turn, so a confused model cannot loop forever
FALLBACK_REPLY = "Sorry, I had trouble with that. Could you say it another way?"


async def run_turn(
    llm: LLMClient, system: str, history: History, user_text: str, ctx: ToolContext
) -> str:
    """Append this turn to `history` (in place) and return the reply text."""
    history.append({"role": "user", "text": user_text})
    specs = [tool.spec for tool in TOOLS.values()]
    for _ in range(MAX_STEPS):
        turn = await llm.generate(system, history, specs)
        history.append({"role": "model", "text": turn.text, "raw": turn.raw})
        if not turn.tool_calls:
            return turn.text or FALLBACK_REPLY
        for call in turn.tool_calls:
            result, is_error = await _run_tool(ctx, call.name, call.arguments)
            history.append(
                {
                    "role": "tool",
                    "call_id": call.id,
                    "name": call.name,
                    "result": result,
                    "is_error": is_error,
                }
            )
    return FALLBACK_REPLY


async def _run_tool(
    ctx: ToolContext, name: str, arguments: dict[str, Any]
) -> tuple[dict[str, Any], bool]:
    tool = TOOLS.get(name)
    if tool is None:
        return {"error": f"Unknown tool {name!r}."}, True
    try:
        return await tool.run(ctx, arguments), False
    except ToolInputError as error:
        return {"error": str(error)}, True
    except Channel3Error:
        logger.exception("Tool %s failed", name)
        return {"error": "Product search is not working right now."}, True
