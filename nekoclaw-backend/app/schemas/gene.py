from datetime import datetime

from pydantic import BaseModel, Field


class GeneInfo(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    short_description: str | None = None
    category: str | None = None
    tags: list[str] = []
    source: str = "official"
    source_ref: str | None = None
    icon: str | None = None
    version: str = "1.0.0"
    manifest: dict | None = None
    dependencies: list[str] = []
    synergies: list[str] = []
    parent_gene_id: str | None = None
    created_by_instance_id: str | None = None
    install_count: int = 0
    avg_rating: float = 0.0
    effectiveness_score: float = 0.0
    is_featured: bool = False
    review_status: str | None = None
    is_published: bool = True
    created_by: str | None = None
    org_id: str | None = None
    visibility: str = "public"
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class GeneListItem(BaseModel):
    id: str
    name: str
    slug: str
    short_description: str | None = None
    category: str | None = None
    tags: list[str] = []
    source: str = "official"
    icon: str | None = None
    version: str = "1.0.0"
    install_count: int = 0
    avg_rating: float = 0.0
    effectiveness_score: float = 0.0
    is_featured: bool = False
    visibility: str = "public"

    model_config = {"from_attributes": True}


class GeneCreateRequest(BaseModel):
    name: str = Field(..., max_length=128)
    slug: str = Field(..., max_length=128)
    description: str | None = None
    short_description: str | None = Field(None, max_length=256)
    category: str | None = Field(None, max_length=32)
    tags: list[str] = []
    source: str = "official"
    source_ref: str | None = None
    icon: str | None = Field(None, max_length=32)
    version: str = Field("1.0.0", max_length=16)
    manifest: dict | None = None
    dependencies: list[str] = []
    synergies: list[str] = []
    is_featured: bool = False
    is_published: bool = True


class UpdateGeneRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    short_description: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    icon: str | None = None
    version: str | None = None
    manifest: dict | None = None
    is_featured: bool | None = None
    is_published: bool | None = None


class GenomeInfo(BaseModel):
    id: str
    name: str
    slug: str
    description: str | None = None
    short_description: str | None = None
    icon: str | None = None
    gene_slugs: list[str] = []
    config_override: dict | None = None
    install_count: int = 0
    avg_rating: float = 0.0
    is_featured: bool = False
    is_published: bool = True
    created_by: str | None = None
    org_id: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class GenomeCreateRequest(BaseModel):
    name: str = Field(..., max_length=128)
    slug: str = Field(..., max_length=128)
    description: str | None = None
    short_description: str | None = Field(None, max_length=256)
    icon: str | None = Field(None, max_length=32)
    gene_slugs: list[str] = []
    config_override: dict | None = None
    is_featured: bool = False
    is_published: bool = True


class InstanceGeneInfo(BaseModel):
    id: str
    instance_id: str
    gene_id: str
    genome_id: str | None = None
    status: str = "installing"
    installed_version: str | None = None
    learning_output: str | None = None
    config_snapshot: dict | None = None
    agent_self_eval: float | None = None
    usage_count: int = 0
    variant_published: bool = False
    installed_at: datetime | None = None
    created_at: datetime | None = None
    gene: GeneListItem | None = None

    model_config = {"from_attributes": True}


class InstallGeneRequest(BaseModel):
    gene_slug: str


class ApplyGenomeRequest(BaseModel):
    genome_id: str


class UninstallGeneRequest(BaseModel):
    gene_id: str


class RatingRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: str | None = None


class RatingInfo(BaseModel):
    id: str
    user_id: str
    rating: int
    comment: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class EffectivenessRequest(BaseModel):
    metric_type: str
    value: float = 1.0
    context: str | None = None


class GeneEffectLogInfo(BaseModel):
    id: str
    instance_id: str
    gene_id: str
    metric_type: str
    value: float
    context: str | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class EvolutionEventInfo(BaseModel):
    id: str
    instance_id: str
    event_type: str
    gene_name: str
    gene_slug: str | None = None
    gene_id: str | None = None
    genome_id: str | None = None
    details: dict | None = None
    created_at: datetime | None = None

    model_config = {"from_attributes": True}


class LearningCallbackPayload(BaseModel):
    task_id: str
    instance_id: str
    mode: str
    decision: str
    content: str | None = None
    self_eval: float | None = None
    meta: dict | None = None
    reason: str | None = None
