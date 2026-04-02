from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class OAuthUserInfo:
    provider: str
    provider_user_id: str
    provider_tenant_id: str | None
    name: str
    email: str | None
    avatar_url: str | None


class OAuthProvider(ABC):

    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    async def exchange_code(
        self, code: str, redirect_uri: str | None = None, client_id: str | None = None
    ) -> OAuthUserInfo: ...
