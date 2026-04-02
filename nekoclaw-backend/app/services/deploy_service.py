import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import async_session_factory
from app.models.cluster import Cluster
from app.models.deploy_record import DeployAction, DeployRecord, DeployStatus
from app.models.instance import Instance, InstanceStatus
from app.services.k8s import resource_builder as rb
from app.services.k8s.event_bus import event_bus
from app.services.k8s.k8s_client import K8sClient, client_manager

logger = logging.getLogger(__name__)

DEPLOY_TIMEOUT = 300


@dataclass
class _DeployContext:
    deploy_id: str
    instance: Instance
    cluster: Cluster
    k8s: K8sClient
    labels: dict
    namespace: str


async def _publish(deploy_id: str, step: int, step_name: str, status: str, logs: list[str] | None = None, percentage: int = 0):
    await event_bus.publish("deploy_progress", {
        "deploy_id": deploy_id,
        "step": step,
        "step_name": step_name,
        "status": status,
        "logs": logs or [],
        "percentage": percentage,
    })


async def deploy_instance(
    instance: Instance,
    user_id: str,
    db: AsyncSession,
) -> str:
    cluster = (await db.execute(
        select(Cluster).where(Cluster.id == instance.cluster_id, Cluster.deleted_at.is_(None))
    )).scalar_one_or_none()

    if cluster is None:
        raise ValueError(f"Cluster {instance.cluster_id} not found")

    instance.status = InstanceStatus.deploying
    instance.current_revision += 1

    record = DeployRecord(
        instance_id=instance.id,
        revision=instance.current_revision,
        action=DeployAction.create,
        image_version=instance.image_version,
        replicas=instance.replicas,
        config_snapshot=json.dumps({
            "cpu_request": instance.cpu_request,
            "cpu_limit": instance.cpu_limit,
            "mem_request": instance.mem_request,
            "mem_limit": instance.mem_limit,
            "storage_size": instance.storage_size,
        }),
        status=DeployStatus.running,
        triggered_by=user_id,
        started_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)

    k8s = await client_manager.get_or_create(cluster.id, cluster.credentials_encrypted)
    labels = rb.build_labels(instance.slug, instance.id)

    ctx = _DeployContext(
        deploy_id=record.id,
        instance=instance,
        cluster=cluster,
        k8s=k8s,
        labels=labels,
        namespace=instance.namespace,
    )

    asyncio.create_task(_execute_pipeline(ctx))
    return record.id


PIPELINE_STEPS = [
    (1, "precheck", "Pre-check"),
    (2, "namespace", "Create Namespace"),
    (3, "configmap", "Create ConfigMap"),
    (4, "pvc", "Create PVC"),
    (5, "deployment", "Create Deployment"),
    (6, "service", "Create Service"),
    (7, "ingress", "Create Ingress"),
    (8, "network_policy", "Create NetworkPolicy"),
    (9, "wait_ready", "Wait for Ready"),
]


async def _execute_pipeline(ctx: _DeployContext) -> None:
    total_steps = len(PIPELINE_STEPS)
    try:
        for step_num, step_key, step_name in PIPELINE_STEPS:
            pct = int((step_num - 1) / total_steps * 100)
            await _publish(ctx.deploy_id, step_num, step_name, "in_progress", percentage=pct)

            await _run_step(ctx, step_key)

            pct = int(step_num / total_steps * 100)
            await _publish(ctx.deploy_id, step_num, step_name, "success", percentage=pct)

        await _mark_deploy_success(ctx)
        await _publish(ctx.deploy_id, total_steps, "Complete", "success", percentage=100)

    except Exception as e:
        logger.exception("Deploy pipeline failed for %s", ctx.instance.id)
        await _mark_deploy_failed(ctx, str(e))
        await _publish(ctx.deploy_id, 0, "Error", "failed", logs=[str(e)])


async def _run_step(ctx: _DeployContext, step_key: str) -> None:
    inst = ctx.instance
    ns = ctx.namespace
    slug = inst.slug

    if step_key == "precheck":
        return

    if step_key == "namespace":
        quota = rb.build_resource_quota(ns, ctx.labels, inst.quota_cpu, inst.quota_mem, inst.quota_max_pods)
        await ctx.k8s.ensure_namespace(ns, ctx.labels)
        await ctx.k8s.apply("ResourceQuota", ns, "nekoclaw-quota", quota)

    elif step_key == "configmap":
        if inst.env_vars:
            env_data = json.loads(inst.env_vars)
            cm = rb.build_configmap(ns, f"{slug}-env", ctx.labels, env_data)
            await ctx.k8s.apply("ConfigMap", ns, f"{slug}-env", cm)

    elif step_key == "pvc":
        pvc = rb.build_pvc(ns, f"{slug}-data", ctx.labels, inst.storage_size, inst.storage_class)
        await ctx.k8s.apply("PersistentVolumeClaim", ns, f"{slug}-data", pvc)

    elif step_key == "deployment":
        dep = rb.build_deployment(
            ns, slug, ctx.labels,
            image_version=inst.image_version,
            replicas=inst.replicas,
            cpu_request=inst.cpu_request,
            cpu_limit=inst.cpu_limit,
            mem_request=inst.mem_request,
            mem_limit=inst.mem_limit,
            env_configmap=f"{slug}-env" if inst.env_vars else None,
            pvc_name=f"{slug}-data",
            proxy_token=inst.proxy_token,
        )
        await ctx.k8s.apply("Deployment", ns, slug, dep)

    elif step_key == "service":
        svc = rb.build_service(ns, slug, ctx.labels, inst.service_type)
        await ctx.k8s.apply("Service", ns, slug, svc)

    elif step_key == "ingress":
        if inst.ingress_domain:
            ing = rb.build_ingress(ns, slug, ctx.labels, inst.ingress_domain, slug)
            await ctx.k8s.apply("Ingress", ns, slug, ing)

    elif step_key == "network_policy":
        np = rb.build_network_policy(ns, f"{slug}-egress", ctx.labels)
        await ctx.k8s.apply("NetworkPolicy", ns, f"{slug}-egress", np)

    elif step_key == "wait_ready":
        await _wait_deployment_ready(ctx)


async def _wait_deployment_ready(ctx: _DeployContext) -> None:
    elapsed = 0
    interval = 4
    while elapsed < DEPLOY_TIMEOUT:
        try:
            dep = await ctx.k8s.get_deployment(ctx.namespace, ctx.instance.slug)
            ready = dep.status.ready_replicas or 0
            desired = dep.spec.replicas or 1
            if ready >= desired:
                return
            await _publish(
                ctx.deploy_id, 9, "Wait for Ready", "in_progress",
                logs=[f"Pods ready: {ready}/{desired}"],
                percentage=88 + int(ready / desired * 12),
            )
        except Exception as e:
            await _publish(
                ctx.deploy_id, 9, "Wait for Ready", "in_progress",
                logs=[f"Checking: {e}"],
            )

        await asyncio.sleep(interval)
        elapsed += interval

    raise TimeoutError(f"Deployment not ready after {DEPLOY_TIMEOUT}s")


async def _mark_deploy_success(ctx: _DeployContext) -> None:
    async with async_session_factory() as db:
        record = (await db.execute(
            select(DeployRecord).where(DeployRecord.id == ctx.deploy_id)
        )).scalar_one()
        record.status = DeployStatus.success
        record.finished_at = datetime.now(timezone.utc)

        instance = (await db.execute(
            select(Instance).where(Instance.id == ctx.instance.id)
        )).scalar_one()
        instance.status = InstanceStatus.running
        instance.available_replicas = instance.replicas

        await db.commit()
    logger.info("Deploy success: %s", ctx.deploy_id)


async def _mark_deploy_failed(ctx: _DeployContext, message: str) -> None:
    async with async_session_factory() as db:
        record = (await db.execute(
            select(DeployRecord).where(DeployRecord.id == ctx.deploy_id)
        )).scalar_one()
        record.status = DeployStatus.failed
        record.message = message
        record.finished_at = datetime.now(timezone.utc)

        instance = (await db.execute(
            select(Instance).where(Instance.id == ctx.instance.id)
        )).scalar_one()
        instance.status = InstanceStatus.failed

        await db.commit()
    logger.warning("Deploy failed: %s — %s", ctx.deploy_id, message)
