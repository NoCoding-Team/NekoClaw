import json
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.models.base import not_deleted
from app.models.gene import (
    EvolutionEvent,
    Gene,
    GeneEffectLog,
    GeneRating,
    Genome,
    GenomeRating,
    InstanceGene,
    InstanceGeneStatus,
)
from app.schemas.gene import (
    EffectivenessRequest,
    EvolutionEventInfo,
    GeneCreateRequest,
    GeneEffectLogInfo,
    GeneInfo,
    GeneListItem,
    GenomeCreateRequest,
    GenomeInfo,
    InstanceGeneInfo,
    InstallGeneRequest,
    RatingInfo,
    RatingRequest,
    UpdateGeneRequest,
)

logger = logging.getLogger(__name__)


def _parse_json_field(raw: str | None) -> list | dict | None:
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _gene_to_info(g: Gene) -> GeneInfo:
    return GeneInfo(
        id=g.id, name=g.name, slug=g.slug,
        description=g.description, short_description=g.short_description,
        category=g.category, tags=_parse_json_field(g.tags) or [],
        source=g.source, source_ref=g.source_ref, icon=g.icon,
        version=g.version, manifest=_parse_json_field(g.manifest),
        dependencies=_parse_json_field(g.dependencies) or [],
        synergies=_parse_json_field(g.synergies) or [],
        parent_gene_id=g.parent_gene_id,
        created_by_instance_id=g.created_by_instance_id,
        install_count=g.install_count, avg_rating=g.avg_rating,
        effectiveness_score=g.effectiveness_score,
        is_featured=g.is_featured, review_status=g.review_status,
        is_published=g.is_published, created_by=g.created_by,
        org_id=g.org_id, visibility=g.visibility,
        created_at=g.created_at, updated_at=g.updated_at,
    )


def _gene_to_list_item(g: Gene) -> GeneListItem:
    return GeneListItem(
        id=g.id, name=g.name, slug=g.slug,
        short_description=g.short_description,
        category=g.category, tags=_parse_json_field(g.tags) or [],
        source=g.source, icon=g.icon, version=g.version,
        install_count=g.install_count, avg_rating=g.avg_rating,
        effectiveness_score=g.effectiveness_score,
        is_featured=g.is_featured, visibility=g.visibility,
    )


def _instance_gene_to_info(ig: InstanceGene, gene: Gene | None = None) -> InstanceGeneInfo:
    return InstanceGeneInfo(
        id=ig.id, instance_id=ig.instance_id, gene_id=ig.gene_id,
        genome_id=ig.genome_id, status=ig.status,
        installed_version=ig.installed_version,
        learning_output=ig.learning_output,
        config_snapshot=_parse_json_field(ig.config_snapshot),
        agent_self_eval=ig.agent_self_eval,
        usage_count=ig.usage_count, variant_published=ig.variant_published,
        installed_at=ig.installed_at, created_at=ig.created_at,
        gene=_gene_to_list_item(gene) if gene else None,
    )


# ── Gene CRUD ─────────────────────────────────────

async def create_gene(
    db: AsyncSession, org_id: str | None, user_id: str, data: GeneCreateRequest,
) -> GeneInfo:
    existing = (await db.execute(
        select(Gene).where(Gene.slug == data.slug, Gene.org_id == org_id, not_deleted(Gene))
    )).scalar_one_or_none()
    if existing:
        raise AppException(status_code=409, error_code=40970, message_key="errors.gene.slug_exists", message="gene slug already exists")

    g = Gene(
        name=data.name, slug=data.slug,
        description=data.description, short_description=data.short_description,
        category=data.category, tags=json.dumps(data.tags) if data.tags else None,
        source=data.source, source_ref=data.source_ref, icon=data.icon,
        version=data.version,
        manifest=json.dumps(data.manifest) if data.manifest else None,
        dependencies=json.dumps(data.dependencies) if data.dependencies else None,
        synergies=json.dumps(data.synergies) if data.synergies else None,
        is_featured=data.is_featured, is_published=data.is_published,
        created_by=user_id, org_id=org_id,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return _gene_to_info(g)


async def list_genes(
    db: AsyncSession, org_id: str | None = None, category: str | None = None,
    search: str | None = None, featured_only: bool = False,
) -> list[GeneListItem]:
    stmt = select(Gene).where(Gene.is_published.is_(True), not_deleted(Gene))
    if org_id:
        stmt = stmt.where((Gene.visibility == "public") | (Gene.org_id == org_id))
    else:
        stmt = stmt.where(Gene.visibility == "public")
    if category:
        stmt = stmt.where(Gene.category == category)
    if featured_only:
        stmt = stmt.where(Gene.is_featured.is_(True))
    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(Gene.name.ilike(pattern) | Gene.slug.ilike(pattern))
    stmt = stmt.order_by(Gene.install_count.desc(), Gene.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [_gene_to_list_item(g) for g in rows]


async def get_gene(db: AsyncSession, gene_id: str) -> GeneInfo | None:
    g = (await db.execute(select(Gene).where(Gene.id == gene_id, not_deleted(Gene)))).scalar_one_or_none()
    if g is None:
        return None
    return _gene_to_info(g)


async def get_gene_by_slug(db: AsyncSession, slug: str, org_id: str | None = None) -> Gene | None:
    stmt = select(Gene).where(Gene.slug == slug, not_deleted(Gene))
    if org_id:
        stmt = stmt.where((Gene.org_id == org_id) | (Gene.visibility == "public"))
    return (await db.execute(stmt)).scalar_one_or_none()


async def update_gene(db: AsyncSession, gene_id: str, data: UpdateGeneRequest) -> GeneInfo | None:
    g = (await db.execute(select(Gene).where(Gene.id == gene_id, not_deleted(Gene)))).scalar_one_or_none()
    if g is None:
        return None
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field in ("tags", "manifest") and value is not None:
            setattr(g, field, json.dumps(value))
        else:
            setattr(g, field, value)
    await db.commit()
    await db.refresh(g)
    return _gene_to_info(g)


async def delete_gene(db: AsyncSession, gene_id: str) -> bool:
    g = (await db.execute(select(Gene).where(Gene.id == gene_id, not_deleted(Gene)))).scalar_one_or_none()
    if g is None:
        return False
    g.deleted_at = func.now()
    await db.commit()
    return True


# ── Genome CRUD ───────────────────────────────────

async def create_genome(
    db: AsyncSession, org_id: str | None, user_id: str, data: GenomeCreateRequest,
) -> GenomeInfo:
    gm = Genome(
        name=data.name, slug=data.slug,
        description=data.description, short_description=data.short_description,
        icon=data.icon,
        gene_slugs=json.dumps(data.gene_slugs) if data.gene_slugs else None,
        config_override=json.dumps(data.config_override) if data.config_override else None,
        is_featured=data.is_featured, is_published=data.is_published,
        created_by=user_id, org_id=org_id,
    )
    db.add(gm)
    await db.commit()
    await db.refresh(gm)
    return GenomeInfo(
        id=gm.id, name=gm.name, slug=gm.slug,
        description=gm.description, short_description=gm.short_description,
        icon=gm.icon, gene_slugs=_parse_json_field(gm.gene_slugs) or [],
        config_override=_parse_json_field(gm.config_override),
        install_count=gm.install_count, avg_rating=gm.avg_rating,
        is_featured=gm.is_featured, is_published=gm.is_published,
        created_by=gm.created_by, org_id=gm.org_id,
        created_at=gm.created_at,
    )


async def list_genomes(db: AsyncSession, org_id: str | None = None) -> list[GenomeInfo]:
    stmt = select(Genome).where(Genome.is_published.is_(True), not_deleted(Genome))
    if org_id:
        stmt = stmt.where((Genome.visibility == "public") | (Genome.org_id == org_id))
    stmt = stmt.order_by(Genome.install_count.desc())
    rows = (await db.execute(stmt)).scalars().all()
    return [
        GenomeInfo(
            id=gm.id, name=gm.name, slug=gm.slug,
            description=gm.description, short_description=gm.short_description,
            icon=gm.icon, gene_slugs=_parse_json_field(gm.gene_slugs) or [],
            config_override=_parse_json_field(gm.config_override),
            install_count=gm.install_count, avg_rating=gm.avg_rating,
            is_featured=gm.is_featured, is_published=gm.is_published,
            created_by=gm.created_by, org_id=gm.org_id,
            created_at=gm.created_at,
        ) for gm in rows
    ]


# ── Install / Uninstall ──────────────────────────

async def install_gene(
    db: AsyncSession, instance_id: str, slug: str, org_id: str | None = None,
) -> InstanceGeneInfo:
    gene = await get_gene_by_slug(db, slug, org_id)
    if gene is None:
        raise AppException(status_code=404, error_code=40471, message_key="errors.gene.not_found", message="gene not found")

    existing = (await db.execute(
        select(InstanceGene).where(
            InstanceGene.instance_id == instance_id,
            InstanceGene.gene_id == gene.id,
            not_deleted(InstanceGene),
        )
    )).scalar_one_or_none()
    if existing and existing.status == InstanceGeneStatus.installed:
        raise AppException(status_code=409, error_code=40971, message_key="errors.gene.already_installed", message="gene already installed")

    ig = InstanceGene(
        instance_id=instance_id,
        gene_id=gene.id,
        status=InstanceGeneStatus.installing,
        installed_version=gene.version,
    )
    db.add(ig)

    gene.install_count += 1
    await db.commit()
    await db.refresh(ig)

    ig.status = InstanceGeneStatus.installed
    ig.installed_at = func.now()
    await db.commit()
    await db.refresh(ig)

    await _record_evolution_event(
        db, instance_id=instance_id, gene_id=gene.id,
        event_type="learned", gene_name=gene.name, gene_slug=gene.slug,
    )

    return _instance_gene_to_info(ig, gene)


async def uninstall_gene(db: AsyncSession, instance_id: str, gene_id: str) -> bool:
    ig = (await db.execute(
        select(InstanceGene).where(
            InstanceGene.instance_id == instance_id,
            InstanceGene.gene_id == gene_id,
            not_deleted(InstanceGene),
        )
    )).scalar_one_or_none()
    if ig is None:
        return False

    gene = (await db.execute(select(Gene).where(Gene.id == gene_id))).scalar_one_or_none()

    ig.deleted_at = func.now()
    if gene and gene.install_count > 0:
        gene.install_count -= 1

    await db.commit()

    if gene:
        await _record_evolution_event(
            db, instance_id=instance_id, gene_id=gene_id,
            event_type="forgotten", gene_name=gene.name, gene_slug=gene.slug,
        )

    return True


async def list_instance_genes(db: AsyncSession, instance_id: str) -> list[InstanceGeneInfo]:
    stmt = (
        select(InstanceGene, Gene)
        .join(Gene, InstanceGene.gene_id == Gene.id)
        .where(InstanceGene.instance_id == instance_id, not_deleted(InstanceGene))
        .order_by(InstanceGene.created_at)
    )
    rows = (await db.execute(stmt)).all()
    return [_instance_gene_to_info(ig, gene) for ig, gene in rows]


async def apply_genome(
    db: AsyncSession, instance_id: str, genome_id: str, org_id: str | None = None,
) -> list[InstanceGeneInfo]:
    gm = (await db.execute(
        select(Genome).where(Genome.id == genome_id, not_deleted(Genome))
    )).scalar_one_or_none()
    if gm is None:
        raise AppException(status_code=404, error_code=40472, message_key="errors.genome.not_found", message="genome not found")

    gene_slugs = _parse_json_field(gm.gene_slugs) or []
    results = []
    for slug in gene_slugs:
        try:
            info = await install_gene(db, instance_id, slug, org_id)
            results.append(info)
        except AppException:
            logger.warning("skipping gene %s during genome apply", slug)
    gm.install_count += 1
    await db.commit()

    await _record_evolution_event(
        db, instance_id=instance_id, genome_id=gm.id,
        event_type="genome_applied", gene_name=gm.name, gene_slug=gm.slug,
    )
    return results


# ── Rating ────────────────────────────────────────

async def rate_gene(db: AsyncSession, gene_id: str, user_id: str, data: RatingRequest) -> RatingInfo:
    existing = (await db.execute(
        select(GeneRating).where(
            GeneRating.gene_id == gene_id, GeneRating.user_id == user_id, not_deleted(GeneRating),
        )
    )).scalar_one_or_none()

    if existing:
        existing.rating = data.rating
        existing.comment = data.comment
        await db.commit()
        await db.refresh(existing)
        r = existing
    else:
        r = GeneRating(gene_id=gene_id, user_id=user_id, rating=data.rating, comment=data.comment)
        db.add(r)
        await db.commit()
        await db.refresh(r)

    await _recalc_avg_rating(db, gene_id)
    return RatingInfo(id=r.id, user_id=r.user_id, rating=r.rating, comment=r.comment, created_at=r.created_at)


async def _recalc_avg_rating(db: AsyncSession, gene_id: str):
    result = await db.execute(
        select(func.avg(GeneRating.rating)).where(GeneRating.gene_id == gene_id, not_deleted(GeneRating))
    )
    avg = result.scalar() or 0.0
    gene = (await db.execute(select(Gene).where(Gene.id == gene_id))).scalar_one_or_none()
    if gene:
        gene.avg_rating = round(float(avg), 2)
        await db.commit()


async def rate_genome(db: AsyncSession, genome_id: str, user_id: str, data: RatingRequest) -> RatingInfo:
    existing = (await db.execute(
        select(GenomeRating).where(
            GenomeRating.genome_id == genome_id, GenomeRating.user_id == user_id, not_deleted(GenomeRating),
        )
    )).scalar_one_or_none()

    if existing:
        existing.rating = data.rating
        existing.comment = data.comment
        await db.commit()
        await db.refresh(existing)
        r = existing
    else:
        r = GenomeRating(genome_id=genome_id, user_id=user_id, rating=data.rating, comment=data.comment)
        db.add(r)
        await db.commit()
        await db.refresh(r)

    return RatingInfo(id=r.id, user_id=r.user_id, rating=r.rating, comment=r.comment, created_at=r.created_at)


# ── Effectiveness ─────────────────────────────────

async def log_effectiveness(
    db: AsyncSession, instance_id: str, gene_id: str, data: EffectivenessRequest,
) -> GeneEffectLogInfo:
    log = GeneEffectLog(
        instance_id=instance_id, gene_id=gene_id,
        metric_type=data.metric_type, value=data.value, context=data.context,
    )
    db.add(log)

    ig = (await db.execute(
        select(InstanceGene).where(
            InstanceGene.instance_id == instance_id,
            InstanceGene.gene_id == gene_id,
            not_deleted(InstanceGene),
        )
    )).scalar_one_or_none()
    if ig:
        ig.usage_count += 1

    await db.commit()
    await db.refresh(log)
    return GeneEffectLogInfo(
        id=log.id, instance_id=log.instance_id, gene_id=log.gene_id,
        metric_type=log.metric_type, value=log.value, context=log.context,
        created_at=log.created_at,
    )


# ── Evolution Events ──────────────────────────────

async def _record_evolution_event(
    db: AsyncSession, *, instance_id: str, event_type: str, gene_name: str,
    gene_id: str | None = None, genome_id: str | None = None,
    gene_slug: str | None = None, details: str | None = None,
):
    evt = EvolutionEvent(
        instance_id=instance_id, gene_id=gene_id, genome_id=genome_id,
        event_type=event_type, gene_name=gene_name, gene_slug=gene_slug,
        details=details,
    )
    db.add(evt)
    await db.commit()


async def list_evolution_events(
    db: AsyncSession, instance_id: str, limit: int = 50,
) -> list[EvolutionEventInfo]:
    stmt = (
        select(EvolutionEvent)
        .where(EvolutionEvent.instance_id == instance_id, not_deleted(EvolutionEvent))
        .order_by(EvolutionEvent.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [
        EvolutionEventInfo(
            id=e.id, instance_id=e.instance_id, event_type=e.event_type,
            gene_name=e.gene_name, gene_slug=e.gene_slug,
            gene_id=e.gene_id, genome_id=e.genome_id,
            details=_parse_json_field(e.details),
            created_at=e.created_at,
        ) for e in rows
    ]
