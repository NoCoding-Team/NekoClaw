from abc import ABC, abstractmethod


class ChannelAdapter(ABC):
    @abstractmethod
    async def send_message(
        self, *, channel_config: dict, sender_name: str, content: str,
        workspace_name: str, metadata: dict | None = None,
    ) -> bool:
        ...

    @abstractmethod
    async def send_approval_request(
        self, *, channel_config: dict, agent_name: str, action_type: str,
        proposal: dict, workspace_name: str, callback_url: str,
    ) -> bool:
        ...
