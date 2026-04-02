from datetime import datetime

from pydantic import BaseModel, Field


class InstanceCreate(BaseModel):
    name: str = Field(max_length=128)
    slug: str = Field(max_length=128, pattern=r"^[a-z][a-z0-9-]{0,61}[a-z0-9]$")
    cluster_id: str
    image_version: str = Field(max_length=64)
    replicas: int = Field(default=1, ge=1, le=10)
    cpu_request: str = Field(default="500m", max_length=16)
    cpu_limit: str = Field(default="2000m", max_length=16)
    mem_request: str = Field(default="2Gi", max_length=16)
    mem_limit: str = Field(default="2Gi", max_length=16)
    storage_size: str = Field(default="80Gi", max_length=16)
    compute_provider: str = Field(default="k8s", max_length=32)
    cat_breed: str | None = None
    cat_fur_color: str | None = None
    cat_personality: str | None = None
    cat_theme_color: str | None = Field(default=None, max_length=7)


class InstanceUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=128)
    image_version: str | None = Field(default=None, max_length=64)
    replicas: int | None = Field(default=None, ge=1, le=10)
    cpu_request: str | None = Field(default=None, max_length=16)
    cpu_limit: str | None = Field(default=None, max_length=16)
    mem_request: str | None = Field(default=None, max_length=16)
    mem_limit: str | None = Field(default=None, max_length=16)
    storage_size: str | None = Field(default=None, max_length=16)
    env_vars: str | None = None
    cat_breed: str | None = None
    cat_fur_color: str | None = None
    cat_personality: str | None = None
    cat_theme_color: str | None = Field(default=None, max_length=7)


class InstanceInfo(BaseModel):
    id: str
    name: str
    slug: str
    status: str
    cat_state: str
    cluster_id: str
    image_version: str
    replicas: int
    available_replicas: int
    compute_provider: str
    cat_breed: str | None = None
    cat_fur_color: str | None = None
    cat_personality: str | None = None
    cat_theme_color: str | None = None
    org_id: str | None = None
    created_by: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


class InstanceDetail(InstanceInfo):
    namespace: str
    cpu_request: str
    cpu_limit: str
    mem_request: str
    mem_limit: str
    storage_size: str
    storage_class: str
    service_type: str
    ingress_domain: str | None = None
    proxy_token: str | None = None
    env_vars: str | None = None
    advanced_config: str | None = None
    health_status: str
    current_revision: int
    runtime: str
    workspace_id: str | None = None

    model_config = {"from_attributes": True}


class ScaleRequest(BaseModel):
    replicas: int = Field(ge=0, le=10)


class InstanceMemberCreate(BaseModel):
    user_id: str
    role: str = Field(default="viewer", pattern=r"^(admin|editor|user|viewer)$")


class InstanceMemberUpdate(BaseModel):
    role: str = Field(pattern=r"^(admin|editor|user|viewer)$")


class InstanceMemberInfo(BaseModel):
    id: str
    instance_id: str
    user_id: str
    role: str
    user_name: str | None = None
    user_email: str | None = None

    model_config = {"from_attributes": True}
