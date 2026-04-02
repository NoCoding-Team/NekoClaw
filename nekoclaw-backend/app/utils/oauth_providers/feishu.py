import logging

import httpx

from app.core.config import settings
from app.utils.oauth_providers.base import OAuthProvider, OAuthUserInfo

logger = logging.getLogger(__name__)

FEISHU_USER_TOKEN_URL = "https://open.feishu.cn/open-apis/authen/v2/oauth/token"
FEISHU_USER_INFO_URL = "https://open.feishu.cn/open-apis/authen/v1/user_info"


class FeishuProvider(OAuthProvider):

    @property
    def name(self) -> str:
        return "feishu"

    async def exchange_code(
        self, code: str, redirect_uri: str | None = None, client_id: str | None = None
    ) -> OAuthUserInfo:
        app_id = settings.FEISHU_APP_ID
        app_secret = settings.FEISHU_APP_SECRET
        actual_redirect_uri = redirect_uri or settings.FEISHU_REDIRECT_URI

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                FEISHU_USER_TOKEN_URL,
                json={
                    "grant_type": "authorization_code",
                    "client_id": app_id,
                    "client_secret": app_secret,
                    "code": code,
                    "redirect_uri": actual_redirect_uri,
                },
            )
            token_data = resp.json()

            if "access_token" in token_data:
                user_access_token = token_data["access_token"]
            elif token_data.get("data", {}).get("access_token"):
                user_access_token = token_data["data"]["access_token"]
            else:
                raise ValueError(f"Feishu code exchange failed: {token_data}")

            resp = await client.get(
                FEISHU_USER_INFO_URL,
                headers={"Authorization": f"Bearer {user_access_token}"},
            )
            info_data = resp.json()
            if info_data.get("code") != 0:
                raise ValueError(f"Feishu user_info failed: {info_data}")

            data = info_data.get("data", {})
            return OAuthUserInfo(
                provider="feishu",
                provider_user_id=data.get("user_id", data.get("open_id", "")),
                provider_tenant_id=data.get("tenant_key"),
                name=data.get("name", ""),
                email=data.get("email"),
                avatar_url=data.get("avatar_url"),
            )
