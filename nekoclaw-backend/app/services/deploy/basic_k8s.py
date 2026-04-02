from __future__ import annotations

import logging
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.deploy.adapter import DeploymentAdapter, EgressPolicyConfig

logger = logging.getLogger(__name__)


class BasicK8sAdapter(DeploymentAdapter):

    async def resolve_cluster(
        self,
        cluster_id: str,
        db: AsyncSession,
        org_id: str | None,
        *,
        cpu_limit: str = "0",
        mem_limit: str = "0",
        storage_size: str = "0",
    ) -> tuple[str, Any]:
        return cluster_id, None

    def build_namespace(self, slug: str, org: Any) -> str:
        return f"nekoclaw-default-{slug}"

    def get_namespace_labels(self, org_id: str | None) -> dict[str, str] | None:
        return None

    async def setup_proxy(self, ctx: Any, ingress_host: str) -> None:
        pass

    async def cleanup_proxy(self, ctx: Any) -> None:
        pass

    def get_network_policy_org_id(self, org_id: str | None) -> str | None:
        return None

    def get_tls_secret(self, tls_secret_name: str | None, has_proxy: bool) -> str | None:
        return tls_secret_name

    def get_egress_config(self, advanced_config: dict | None) -> EgressPolicyConfig:
        return EgressPolicyConfig(
            deny_cidrs=[c.strip() for c in settings.EGRESS_DENY_CIDRS.split(",") if c.strip()],
            allow_ports=[int(p.strip()) for p in settings.EGRESS_ALLOW_PORTS.split(",") if p.strip()],
        )
