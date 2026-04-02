from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.email.transport import EmailTransport, SmtpConfig

logger = logging.getLogger(__name__)


class GlobalSmtpTransport(EmailTransport):

    async def resolve_smtp_config(
        self, db: AsyncSession, email: str,
    ) -> SmtpConfig | None:
        logger.debug("GlobalSmtpTransport: SMTP 尚未配置")
        return None
