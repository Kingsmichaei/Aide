"""Provider-agnostic LLM interface, plus one adapter per provider (set by LLM_PROVIDER).

History is a list of provider-neutral entries, stored as JSON in `conversations.messages`:
  {"role": "user", "text": ...}
  {"role": "model", "text": ..., "raw": [...]}   # raw = provider steps, replayed verbatim
  {"role": "tool", "call_id": ..., "name": ..., "result": {...}, "is_error": bool}
"""

from typing import Any, Protocol

import httpx
from pydantic import BaseModel

from app.integrations.http import make_client

History = list[dict[str, Any]]


class LLMError(Exception):
    pass


class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]  # JSON Schema


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]


class LLMTurn(BaseModel):
    text: str
    tool_calls: list[ToolCall]
    raw: list[dict[str, Any]]


class LLMClient(Protocol):
    async def generate(self, system: str, history: History, tools: list[ToolSpec]) -> LLMTurn: ...


class GeminiClient:
    """Gemini Interactions API, stateless (store=false): we send the whole history each turn.

    Docs: https://ai.google.dev/gemini-api/docs/function-calling
    """

    URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

    def __init__(self, api_key: str, model: str, http: httpx.AsyncClient | None = None) -> None:
        self._headers = {"x-goog-api-key": api_key}
        self._model = model
        self._http = http or make_client(timeout=60)

    async def generate(self, system: str, history: History, tools: list[ToolSpec]) -> LLMTurn:
        body = {
            "model": self._model,
            "store": False,
            "system_instruction": system,
            "input": [step for entry in history for step in _to_gemini(entry)],
            "tools": [{"type": "function", **tool.model_dump()} for tool in tools],
        }
        try:
            response = await self._http.post(self.URL, json=body, headers=self._headers)
        except httpx.HTTPError as error:  # no connection, DNS, timeout
            raise LLMError(f"Gemini request failed: {error!r}") from error
        if response.is_error:
            raise LLMError(f"Gemini request failed: HTTP {response.status_code}")
        steps: list[dict[str, Any]] = response.json().get("steps", [])
        return LLMTurn(
            text="".join(
                block.get("text", "")
                for step in steps
                if step.get("type") == "model_output"
                for block in step.get("content") or []
                if block.get("type") == "text"
            ).strip(),
            tool_calls=[
                ToolCall(id=step["id"], name=step["name"], arguments=step.get("arguments") or {})
                for step in steps
                if step.get("type") == "function_call"
            ],
            raw=steps,
        )


def _to_gemini(entry: dict[str, Any]) -> list[dict[str, Any]]:
    if entry["role"] == "user":
        return [{"type": "user_input", "content": entry["text"]}]
    if entry["role"] == "model":
        raw: list[dict[str, Any]] = entry["raw"]
        return raw  # thoughts and function calls must be replayed exactly
    return [
        {
            "type": "function_result",
            "call_id": entry["call_id"],
            "name": entry["name"],
            "result": entry["result"],
            "is_error": entry.get("is_error", False),
        }
    ]


def make_llm(provider: str, api_key: str, model: str) -> LLMClient:
    if provider.lower() == "gemini":
        return GeminiClient(api_key, model)
    raise LLMError(f"Unsupported LLM_PROVIDER: {provider!r}")
