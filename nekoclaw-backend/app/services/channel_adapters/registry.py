import logging
from typing import Type

from app.services.channel_adapters.base import ChannelAdapter

logger = logging.getLogger(__name__)

_REGISTRY: dict[str, Type[ChannelAdapter]] = {}


def register_channel_adapter(channel_id: str, adapter_cls: Type[ChannelAdapter]) -> None:
    _REGISTRY[channel_id] = adapter_cls
    logger.info("Registered channel adapter: %s", channel_id)


def get_channel_adapter(channel_id: str) -> Type[ChannelAdapter] | None:
    return _REGISTRY.get(channel_id)


def list_channel_ids() -> list[str]:
    return list(_REGISTRY.keys())
