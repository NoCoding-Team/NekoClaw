"""
LangGraph StateGraph definition and compiled entry point.

Graph topology:
    START → prepare → llm_call → should_continue → tools → llm_call (loop)
                                                 ↘ finalize → END
"""
from __future__ import annotations

from typing import Any

from langgraph.graph import END, START, StateGraph

from app.services.agent.nodes import finalize, llm_call, prepare, should_continue, tools_node
from app.services.agent.state import AgentState


def _build_graph() -> Any:
    workflow: StateGraph = StateGraph(AgentState)

    workflow.add_node("prepare", prepare)
    workflow.add_node("llm_call", llm_call)
    workflow.add_node("tools", tools_node)
    workflow.add_node("finalize", finalize)

    workflow.add_edge(START, "prepare")
    workflow.add_edge("prepare", "llm_call")
    workflow.add_conditional_edges(
        "llm_call",
        should_continue,
        {"tools": "tools", "finalize": "finalize"},
    )
    workflow.add_edge("tools", "llm_call")
    workflow.add_edge("finalize", END)

    return workflow.compile()


# Compiled graph (module-level singleton, built once on first import)
_graph = _build_graph()


async def run_agent(
    session_id: str,
    user_id: str,
    skill_id: str | None,
    ws: Any,
    allowed_tools_override: list[str] | None = None,
) -> None:
    """Invoke the LangGraph agent for a single user-message turn.

    Called by ws.py after persisting the incoming user message.
    """
    initial_state: AgentState = {  # type: ignore[typeddict-item]
        "messages": [],
        "session_id": session_id,
        "user_id": user_id,
        "ws": ws,
        "llm_config": None,
        "skill": None,
        "context_limit": 128000,
        "user_turn_count": 0,
        "skill_id": skill_id,
        "allowed_tools": allowed_tools_override,
    }
    await _graph.ainvoke(initial_state)
