import json
import logging

import httpx

from app.services.channel_adapters.base import ChannelAdapter

logger = logging.getLogger(__name__)

DINGTALK_API_BASE = "https://oapi.dingtalk.com"


class DingTalkChannelAdapter(ChannelAdapter):
    def __init__(self, webhook_url: str) -> None:
        self._webhook_url = webhook_url

    async def send_message(
        self, *, channel_config: dict, sender_name: str, content: str,
        workspace_name: str, metadata: dict | None = None,
    ) -> bool:
        webhook = channel_config.get("webhook_url") or self._webhook_url
        if not webhook:
            logger.warning("DingTalk channel_config missing webhook_url")
            return False

        text = f"[{workspace_name}] {sender_name}:\n{content}"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    webhook,
                    json={"msgtype": "text", "text": {"content": text}},
                )
                data = resp.json()
                if data.get("errcode") == 0:
                    return True
                logger.warning("DingTalk send failed: %s", data)
                return False
        except Exception as e:
            logger.error("DingTalk send error: %s", e)
            return False

    async def send_approval_request(
        self, *, channel_config: dict, agent_name: str, action_type: str,
        proposal: dict, workspace_name: str, callback_url: str,
    ) -> bool:
        webhook = channel_config.get("webhook_url") or self._webhook_url
        if not webhook:
            return False

        text = (
            f"[{workspace_name}] {agent_name} 请求审批\n"
            f"操作: {action_type}\n"
            f"详情: {json.dumps(proposal, ensure_ascii=False)[:500]}"
        )
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(
                    webhook,
                    json={"msgtype": "text", "text": {"content": text}},
                )
                return resp.json().get("errcode") == 0
        except Exception as e:
            logger.error("DingTalk approval error: %s", e)
            return False
