"""
WebSocket callback handler for LangChain streaming.

Bridges LangChain's AsyncCallbackHandler events to the WebSocket event protocol.
Token streaming, thinking/working state events are pushed to the client
as the LLM generates output.
"""
from __future__ import annotations

from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler

from app.api.ws import send_event


class WebSocketStreamHandler(AsyncCallbackHandler):
    """Stream LLM tokens and state events to a connected WebSocket."""

    def __init__(self, ws: Any) -> None:
        self.ws = ws

    # ── LLM lifecycle ──────────────────────────────────────────────────

    async def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[Any]],
        **kwargs: Any,
    ) -> None:
        """Fired when a chat model starts generating."""
        try:
            await send_event(self.ws, "llm_thinking", {})
            await send_event(self.ws, "cat_state", {"state": "thinking"})
        except Exception:
            pass  # WS may be closed; never crash the agent

    async def on_llm_new_token(self, token: str, **kwargs: Any) -> None:
        """Fired for each streamed token."""
        try:
            if token:
                await send_event(self.ws, "llm_token", {"token": token})
        except Exception:
            pass

    async def on_llm_error(
        self,
        error: Exception | BaseException,
        **kwargs: Any,
    ) -> None:
        """Errors are handled by the calling node; silently ignore here."""
        pass
