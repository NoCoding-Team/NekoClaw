import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, get_current_org
from app.core import hooks
from app.core.security import get_current_user
from app.core.exceptions import AppException
from app.schemas.gene import (
    ApplyGenomeRequest,
    EffectivenessRequest,
    GeneCreateRequest,
    GenomeCreateRequest,
    InstallGeneRequest,
    RatingRequest,
    UninstallGeneRequest,
    UpdateGeneRequest,
)
from app.services import gene_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/genes", tags=["genes"])


def _ok(data=None, message: str = "success"):
    return {"code": 0, "message": message, "data": data}


def _dump(obj):
    if obj is None:
        return None
    if isinstance(obj, list):
        return [i.model_dump(mode="json") for i in obj]
    return obj.model_dump(mode="json")


# ── Gene CRUD ─────────────────────────────────────

@router.post("")
async def create_gene(
    data: GeneCreateRequest,
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    gene = await gene_service.create_gene(db, org.id, user.id, data)
    await hooks.emit(
        "operation_audit", action="gene.created", target_type="gene",
        target_id=gene.id, actor_id=user.id, org_id=org.id,
    )
    return _ok(_dump(gene))


@router.get("")
async def list_genes(
    category: str | None = Query(None),
    search: str | None = Query(None),
    featured: bool = Query(False),
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    _, org = org_ctx
    genes = await gene_service.list_genes(db, org_id=org.id, category=category, search=search, featured_only=featured)
    return _ok(_dump(genes))


@router.get("/{gene_id}")
async def get_gene(
    gene_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    gene = await gene_service.get_gene(db, gene_id)
    if gene is None:
        raise AppException(status_code=404, error_code=40471, message_key="errors.gene.not_found", message="gene not found")
    return _ok(_dump(gene))


@router.put("/{gene_id}")
async def update_gene(
    gene_id: str,
    data: UpdateGeneRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gene = await gene_service.update_gene(db, gene_id, data)
    if gene is None:
        raise AppException(status_code=404, error_code=40471, message_key="errors.gene.not_found", message="gene not found")
    return _ok(_dump(gene))


@router.delete("/{gene_id}")
async def delete_gene(
    gene_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await gene_service.delete_gene(db, gene_id)
    if not ok:
        raise AppException(status_code=404, error_code=40471, message_key="errors.gene.not_found", message="gene not found")
    return _ok(message="deleted")


# ── Gene Rating ───────────────────────────────────

@router.post("/{gene_id}/ratings")
async def rate_gene(
    gene_id: str,
    data: RatingRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rating = await gene_service.rate_gene(db, gene_id, user.id, data)
    return _ok(_dump(rating))


# ── Genome ────────────────────────────────────────

@router.post("/genomes")
async def create_genome(
    data: GenomeCreateRequest,
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    gm = await gene_service.create_genome(db, org.id, user.id, data)
    return _ok(_dump(gm))


@router.get("/genomes")
async def list_genomes(
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    _, org = org_ctx
    genomes = await gene_service.list_genomes(db, org.id)
    return _ok(_dump(genomes))


@router.post("/genomes/{genome_id}/ratings")
async def rate_genome(
    genome_id: str,
    data: RatingRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rating = await gene_service.rate_genome(db, genome_id, user.id, data)
    return _ok(_dump(rating))


# ── Instance Gene Operations ──────────────────────

@router.post("/instances/{instance_id}/install")
async def install_gene(
    instance_id: str,
    data: InstallGeneRequest,
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    ig = await gene_service.install_gene(db, instance_id, data.gene_slug, org.id)
    await hooks.emit(
        "operation_audit", action="gene.installed", target_type="instance",
        target_id=instance_id, actor_id=user.id,
        details={"gene_slug": data.gene_slug},
    )
    return _ok(_dump(ig))


@router.post("/instances/{instance_id}/uninstall")
async def uninstall_gene(
    instance_id: str,
    data: UninstallGeneRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ok = await gene_service.uninstall_gene(db, instance_id, data.gene_id)
    if not ok:
        raise AppException(status_code=404, error_code=40473, message_key="errors.gene.not_installed", message="gene not installed on this instance")
    return _ok(message="uninstalled")


@router.get("/instances/{instance_id}/genes")
async def list_instance_genes(
    instance_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    genes = await gene_service.list_instance_genes(db, instance_id)
    return _ok(_dump(genes))


@router.post("/instances/{instance_id}/apply-genome")
async def apply_genome(
    instance_id: str,
    data: ApplyGenomeRequest,
    org_ctx=Depends(get_current_org),
    db: AsyncSession = Depends(get_db),
):
    user, org = org_ctx
    results = await gene_service.apply_genome(db, instance_id, data.genome_id, org.id)
    return _ok(_dump(results))


# ── Effectiveness ─────────────────────────────────

@router.post("/instances/{instance_id}/genes/{gene_id}/effectiveness")
async def log_effectiveness(
    instance_id: str,
    gene_id: str,
    data: EffectivenessRequest,
    db: AsyncSession = Depends(get_db),
):
    log = await gene_service.log_effectiveness(db, instance_id, gene_id, data)
    return _ok(_dump(log))


# ── Evolution Events ──────────────────────────────

@router.get("/instances/{instance_id}/evolution")
async def list_evolution_events(
    instance_id: str,
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    events = await gene_service.list_evolution_events(db, instance_id, limit)
    return _ok(_dump(events))
