from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.models.user import User


class OrgProvider(ABC):

    @abstractmethod
    async def resolve_org_for_user(
        self, user: User, db: AsyncSession,
    ) -> Any:
        ...

    @abstractmethod
    async def ensure_user_has_org(
        self, user: User, db: AsyncSession,
    ) -> None:
        ...

    @abstractmethod
    def is_multi_org(self) -> bool:
        ...
