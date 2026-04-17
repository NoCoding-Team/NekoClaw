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

from app.core.security import decrypt_api_key


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
    from langchain_openai import ChatOpenAI  # type: ignore[import-untyped]

    kwargs: dict[str, Any] = {
        "model": config.model,
        "api_key": api_key,
        "temperature": temperature,
        "streaming": True,
    }
    if config.base_url:
        kwargs["base_url"] = config.base_url

    return ChatOpenAI(**kwargs)  # type: ignore[call-arg]
