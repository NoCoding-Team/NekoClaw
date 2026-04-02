from app.core.config import settings


def build_labels(instance_slug: str, instance_id: str) -> dict:
    return {
        "app": instance_slug,
        "managed-by": "nekoclaw",
        "nekoclaw/instance-id": instance_id,
    }


def build_configmap(namespace: str, name: str, labels: dict, env_data: dict) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "ConfigMap",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "data": {k: str(v) for k, v in env_data.items()},
    }


def build_pvc(
    namespace: str, name: str, labels: dict,
    storage_size: str, storage_class: str,
) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "PersistentVolumeClaim",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "spec": {
            "accessModes": ["ReadWriteMany"],
            "storageClassName": storage_class,
            "resources": {"requests": {"storage": storage_size}},
        },
    }


def build_resource_quota(namespace: str, labels: dict, cpu: str, mem: str, max_pods: int) -> dict:
    return {
        "apiVersion": "v1",
        "kind": "ResourceQuota",
        "metadata": {"name": "nekoclaw-quota", "namespace": namespace, "labels": labels},
        "spec": {
            "hard": {
                "requests.cpu": cpu,
                "requests.memory": mem,
                "limits.cpu": cpu,
                "limits.memory": mem,
                "pods": str(max_pods),
            }
        },
    }


def build_deployment(
    namespace: str, name: str, labels: dict,
    *,
    image_version: str,
    replicas: int,
    cpu_request: str,
    cpu_limit: str,
    mem_request: str,
    mem_limit: str,
    env_configmap: str | None = None,
    pvc_name: str | None = None,
    proxy_token: str | None = None,
) -> dict:
    env_vars = []
    if proxy_token:
        env_vars.append({"name": "GATEWAY_TOKEN", "value": proxy_token})

    env_from = []
    if env_configmap:
        env_from.append({"configMapRef": {"name": env_configmap}})

    volume_mounts = []
    volumes = []
    if pvc_name:
        volume_mounts.append({"name": "data", "mountPath": "/app/data"})
        volumes.append({"name": "data", "persistentVolumeClaim": {"claimName": pvc_name}})

    container = {
        "name": "openclaw",
        "image": image_version,
        "ports": [{"containerPort": 18789, "name": "gateway"}],
        "env": env_vars,
        "envFrom": env_from,
        "resources": {
            "requests": {"cpu": cpu_request, "memory": mem_request},
            "limits": {"cpu": cpu_limit, "memory": mem_limit},
        },
        "volumeMounts": volume_mounts,
        "readinessProbe": {
            "httpGet": {"path": "/health", "port": 18789},
            "initialDelaySeconds": 10,
            "periodSeconds": 10,
        },
        "livenessProbe": {
            "httpGet": {"path": "/health", "port": 18789},
            "initialDelaySeconds": 30,
            "periodSeconds": 30,
        },
    }

    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "spec": {
            "replicas": replicas,
            "selector": {"matchLabels": {"app": labels["app"]}},
            "template": {
                "metadata": {"labels": labels},
                "spec": {
                    "containers": [container],
                    "volumes": volumes,
                },
            },
        },
    }


def build_service(namespace: str, name: str, labels: dict, service_type: str = "ClusterIP") -> dict:
    return {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "spec": {
            "type": service_type,
            "selector": {"app": labels["app"]},
            "ports": [
                {"name": "gateway", "port": 18789, "targetPort": 18789, "protocol": "TCP"},
                {"name": "sse", "port": 9721, "targetPort": 9721, "protocol": "TCP"},
            ],
        },
    }


def build_ingress(
    namespace: str, name: str, labels: dict,
    domain: str, service_name: str,
) -> dict:
    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "Ingress",
        "metadata": {
            "name": name,
            "namespace": namespace,
            "labels": labels,
            "annotations": {
                "nginx.ingress.kubernetes.io/proxy-read-timeout": "3600",
                "nginx.ingress.kubernetes.io/proxy-send-timeout": "3600",
            },
        },
        "spec": {
            "ingressClassName": "nginx",
            "rules": [{
                "host": domain,
                "http": {
                    "paths": [{
                        "path": "/",
                        "pathType": "Prefix",
                        "backend": {
                            "service": {
                                "name": service_name,
                                "port": {"number": 18789},
                            }
                        },
                    }],
                },
            }],
        },
    }


def build_network_policy(
    namespace: str, name: str, labels: dict,
    *,
    egress_deny_cidrs: list[str] | None = None,
    egress_allow_ports: list[int] | None = None,
) -> dict:
    deny_cidrs = egress_deny_cidrs or [c.strip() for c in settings.EGRESS_DENY_CIDRS.split(",") if c.strip()]
    allow_ports = egress_allow_ports or [int(p.strip()) for p in settings.EGRESS_ALLOW_PORTS.split(",") if p.strip()]

    egress_rules = []
    if deny_cidrs:
        except_blocks = [{"cidr": c} for c in deny_cidrs]
        egress_rules.append({
            "to": [{"ipBlock": {"cidr": "0.0.0.0/0", "except": [c for c in deny_cidrs]}}],
            "ports": [{"port": p, "protocol": "TCP"} for p in allow_ports],
        })

    return {
        "apiVersion": "networking.k8s.io/v1",
        "kind": "NetworkPolicy",
        "metadata": {"name": name, "namespace": namespace, "labels": labels},
        "spec": {
            "podSelector": {"matchLabels": {"app": labels["app"]}},
            "policyTypes": ["Egress"],
            "egress": egress_rules if egress_rules else [{}],
        },
    }
