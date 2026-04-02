from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass(frozen=True)
class SmtpConfig:
    smtp_host: str
    smtp_port: int
    smtp_username: str
    smtp_password: str
    from_email: str
    from_name: str | None = None
    use_tls: bool = True


class EmailTransport(ABC):

    @abstractmethod
    async def resolve_smtp_config(
        self, db: AsyncSession, email: str,
    ) -> SmtpConfig | None:
        ...
