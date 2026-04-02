import logging
import tempfile
from pathlib import Path

from kubernetes_asyncio import client as k8s_client
from kubernetes_asyncio import config as k8s_config
from kubernetes_asyncio.client import ApiClient

from app.core.security import decrypt_sensitive

logger = logging.getLogger(__name__)


class K8sClient:
    def __init__(self, api_client: ApiClient) -> None:
        self._api_client = api_client
        self.core_v1 = k8s_client.CoreV1Api(api_client)
        self.apps_v1 = k8s_client.AppsV1Api(api_client)
        self.networking_v1 = k8s_client.NetworkingV1Api(api_client)

    async def close(self) -> None:
        await self._api_client.close()

    async def test_connection(self) -> dict:
        version = await k8s_client.VersionApi(self._api_client).get_code()
        return {"git_version": version.git_version, "platform": version.platform}

    async def ensure_namespace(self, name: str, labels: dict | None = None) -> None:
        try:
            await self.core_v1.read_namespace(name)
        except k8s_client.ApiException as e:
            if e.status == 404:
                body = k8s_client.V1Namespace(
                    metadata=k8s_client.V1ObjectMeta(name=name, labels=labels or {}),
                )
                await self.core_v1.create_namespace(body)
            else:
                raise

    async def apply(self, kind: str, namespace: str, name: str, body: dict) -> None:
        try:
            if kind == "ConfigMap":
                await self.core_v1.create_namespaced_config_map(namespace, body)
            elif kind == "PersistentVolumeClaim":
                await self.core_v1.create_namespaced_persistent_volume_claim(namespace, body)
            elif kind == "Deployment":
                await self.apps_v1.create_namespaced_deployment(namespace, body)
            elif kind == "Service":
                await self.core_v1.create_namespaced_service(namespace, body)
            elif kind == "Ingress":
                await self.networking_v1.create_namespaced_ingress(namespace, body)
            elif kind == "NetworkPolicy":
                await self.networking_v1.create_namespaced_network_policy(namespace, body)
            elif kind == "ResourceQuota":
                await self.core_v1.create_namespaced_resource_quota(namespace, body)
        except k8s_client.ApiException as e:
            if e.status == 409:
                logger.info("Resource %s/%s already exists, patching", kind, name)
                await self._patch(kind, namespace, name, body)
            else:
                raise

    async def _patch(self, kind: str, namespace: str, name: str, body: dict) -> None:
        if kind == "ConfigMap":
            await self.core_v1.patch_namespaced_config_map(name, namespace, body)
        elif kind == "Deployment":
            await self.apps_v1.patch_namespaced_deployment(name, namespace, body)
        elif kind == "Service":
            await self.core_v1.patch_namespaced_service(name, namespace, body)
        elif kind == "Ingress":
            await self.networking_v1.patch_namespaced_ingress(name, namespace, body)
        elif kind == "NetworkPolicy":
            await self.networking_v1.patch_namespaced_network_policy(name, namespace, body)

    async def get_deployment(self, namespace: str, name: str):
        return await self.apps_v1.read_namespaced_deployment(name, namespace)

    async def scale_deployment(self, namespace: str, name: str, replicas: int) -> None:
        body = {"spec": {"replicas": replicas}}
        await self.apps_v1.patch_namespaced_deployment_scale(name, namespace, body)

    async def restart_deployment(self, namespace: str, name: str) -> None:
        from datetime import datetime, timezone
        body = {
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": datetime.now(timezone.utc).isoformat()
                        }
                    }
                }
            }
        }
        await self.apps_v1.patch_namespaced_deployment(name, namespace, body)

    async def list_pods(self, namespace: str, label_selector: str | None = None) -> list:
        resp = await self.core_v1.list_namespaced_pod(
            namespace, label_selector=label_selector,
        )
        return resp.items

    async def get_pod_logs(self, namespace: str, pod_name: str, tail_lines: int = 100) -> str:
        return await self.core_v1.read_namespaced_pod_log(
            pod_name, namespace, tail_lines=tail_lines,
        )

    async def delete_namespace(self, name: str) -> None:
        try:
            await self.core_v1.delete_namespace(name)
        except k8s_client.ApiException as e:
            if e.status != 404:
                raise

    async def list_events(self, namespace: str) -> list:
        resp = await self.core_v1.list_namespaced_event(namespace)
        return resp.items


class K8sClientManager:
    def __init__(self) -> None:
        self._clients: dict[str, K8sClient] = {}

    async def get_or_create(self, cluster_id: str, credentials_encrypted: str | None = None) -> K8sClient:
        if cluster_id in self._clients:
            return self._clients[cluster_id]

        if credentials_encrypted:
            kubeconfig_str = decrypt_sensitive(credentials_encrypted)
            with tempfile.NamedTemporaryFile(mode="w", suffix=".yaml", delete=False) as f:
                f.write(kubeconfig_str)
                kubeconfig_path = f.name
            api_client = await k8s_config.new_client_from_config(config_file=kubeconfig_path)
            Path(kubeconfig_path).unlink(missing_ok=True)
        else:
            k8s_config.load_incluster_config()
            api_client = ApiClient()

        k8s = K8sClient(api_client)
        self._clients[cluster_id] = k8s
        return k8s

    async def rebuild(self, cluster_id: str, credentials_encrypted: str | None = None) -> K8sClient:
        old = self._clients.pop(cluster_id, None)
        if old:
            await old.close()
        return await self.get_or_create(cluster_id, credentials_encrypted)

    async def close_all(self) -> None:
        for c in self._clients.values():
            await c.close()
        self._clients.clear()


client_manager = K8sClientManager()
