"""
AgentState definition for the LangGraph StateGraph.

All fields are populated by the prepare node before the agent loop begins.
"""
from __future__ import annotations

from typing import Annotated, Any

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict


class AgentState(TypedDict):
    # Conversation messages - grows via add_messages reducer
    messages: Annotated[list[BaseMessage], add_messages]

    # Runtime identity
    session_id: str
    user_id: str
    ws: Any  # fastapi.WebSocket — runtime only, not serializable

    # Loaded by prepare node
    llm_config: Any   # LLMConfig ORM instance | None
    skill: Any        # Skill ORM instance | None
    context_limit: int
    user_turn_count: int

    # Inputs passed from ws.py when spawning the agent
    skill_id: str | None
    allowed_tools: list[str] | None  # None=all, []=none, [...]=whitelist
    # Optional user-supplied LLM config (stored locally, passed per-message).
    # Keys: provider, model, api_key, base_url, temperature, context_limit.
    # When present, overrides DB-looked-up config in the prepare node.
    custom_llm_config: dict | None
