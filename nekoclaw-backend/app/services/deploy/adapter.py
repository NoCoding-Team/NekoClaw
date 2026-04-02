from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class EgressPolicyConfig:
    deny_cidrs: list[str] = field(default_factory=list)
    allow_ports: list[int] = field(default_factory=lambda: [80, 443])


class DeploymentAdapter(ABC):

    @abstractmethod
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
        ...

    @abstractmethod
    def build_namespace(self, slug: str, org: Any) -> str:
        ...

    @abstractmethod
    def get_namespace_labels(self, org_id: str | None) -> dict[str, str] | None:
        ...

    @abstractmethod
    async def setup_proxy(self, ctx: Any, ingress_host: str) -> None:
        ...

    @abstractmethod
    async def cleanup_proxy(self, ctx: Any) -> None:
        ...

    @abstractmethod
    def get_network_policy_org_id(self, org_id: str | None) -> str | None:
        ...

    @abstractmethod
    def get_tls_secret(self, tls_secret_name: str | None, has_proxy: bool) -> str | None:
        ...

    @abstractmethod
    def get_egress_config(self, advanced_config: dict | None) -> EgressPolicyConfig:
        ...
