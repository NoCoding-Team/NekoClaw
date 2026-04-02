from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


class QuotaChecker(ABC):

    @abstractmethod
    async def check_deploy_quota(
        self,
        org: Any,
        db: AsyncSession,
        *,
        cpu_request: str = "0",
        mem_request: str = "0",
        storage_size: str = "0",
    ) -> None:
        ...
