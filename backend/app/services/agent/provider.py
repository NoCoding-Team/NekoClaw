"""
Provider factory: returns the appropriate LangChain ChatModel for a given LLMConfig.

Supported providers:
  openai    → ChatOpenAI
  anthropic → ChatAnthropic
  gemini    → ChatGoogleGenerativeAI
  custom    → ChatOpenAI (OpenAI-compatible base_url)
"""
from __future__ import annotations

from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage

from app.core.security import decrypt_api_key


class _ReasoningChatOpenAI:
    """
    Mixin that adds DeepSeek R1-style reasoning_content support to ChatOpenAI.

    Two-sided fix:
      1. Streaming ingest: captures delta.reasoning_content from each chunk and
         accumulates it in AIMessageChunk.additional_kwargs["reasoning_content"].
      2. Request serialization: injects reasoning_content back into the serialized
         assistant message dict so DeepSeek's thinking-mode API doesn't reject it.

    Harmless for non-reasoning models (reasoning_content simply won't be present).
    """

    def _convert_chunk_to_generation_chunk(self, chunk, default_chunk_class, base_generation_info):  # type: ignore[override]
        from langchain_core.messages import AIMessageChunk

        gen_chunk = super()._convert_chunk_to_generation_chunk(  # type: ignore[misc]
            chunk, default_chunk_class, base_generation_info
        )
        if gen_chunk is None:
            return None

        choices = chunk.get("choices", []) or chunk.get("chunk", {}).get("choices", [])
        if choices and isinstance(gen_chunk.message, AIMessageChunk):
            delta = choices[0].get("delta", {})
            reasoning: str | None = None
            if isinstance(delta, dict):
                reasoning = delta.get("reasoning_content")
            else:
                # OpenAI SDK object — may carry it as model_extra
                reasoning = getattr(delta, "reasoning_content", None) or (
                    getattr(delta, "model_extra", None) or {}
                ).get("reasoning_content")
            if reasoning:
                gen_chunk.message.additional_kwargs["reasoning_content"] = reasoning

        return gen_chunk

    def _get_request_payload(self, input_: Any, *, stop: list[str] | None = None, **kwargs: Any) -> dict:  # type: ignore[override]
        messages = self._convert_input(input_).to_messages()  # type: ignore[attr-defined]
        payload = super()._get_request_payload(input_, stop=stop, **kwargs)  # type: ignore[misc]

        # Inject reasoning_content from AIMessage.additional_kwargs back into the
        # serialized message dicts so the thinking-mode API receives it.
        if "messages" in payload:
            for i, lc_msg in enumerate(messages):
                if (
                    isinstance(lc_msg, AIMessage)
                    and i < len(payload["messages"])
                    and isinstance(payload["messages"][i], dict)
                    and payload["messages"][i].get("role") == "assistant"
                ):
                    rc = lc_msg.additional_kwargs.get("reasoning_content")
                    if rc:
                        payload["messages"][i]["reasoning_content"] = rc

        return payload


def _make_openai_model(kwargs: dict[str, Any]):
    """Return a ChatOpenAI subclass that handles reasoning_content transparently."""
    from langchain_openai import ChatOpenAI  # type: ignore[import-untyped]

    class ReasoningChatOpenAI(_ReasoningChatOpenAI, ChatOpenAI):  # type: ignore[misc]
        pass

    return ReasoningChatOpenAI(**kwargs)  # type: ignore[call-arg]


def get_chat_model(config: Any) -> BaseChatModel:
    """Factory: return the appropriate LangChain ChatModel for the given LLMConfig."""
    api_key = decrypt_api_key(config.api_key_encrypted)
    provider = (config.provider or "openai").lower()
    temperature = getattr(config, "temperature", 0.7)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic  # type: ignore[import-untyped]

        return ChatAnthropic(  # type: ignore[call-arg]
            model=config.model,
            api_key=api_key,
            temperature=temperature,
            streaming=True,
        )

    if provider in ("gemini", "google"):
        from langchain_google_genai import ChatGoogleGenerativeAI  # type: ignore[import-untyped]

        return ChatGoogleGenerativeAI(  # type: ignore[call-arg]
            model=config.model,
            google_api_key=api_key,
            temperature=temperature,
            streaming=True,
        )

    # "openai" or "custom" (OpenAI-compatible endpoint)
    kwargs: dict[str, Any] = {
        "model": config.model,
        "api_key": api_key,
        "temperature": temperature,
        "streaming": True,
    }
    if config.base_url:
        kwargs["base_url"] = config.base_url

    return _make_openai_model(kwargs)

