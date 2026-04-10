-- ============================================================
-- NekoClaw Database Init SQL
-- 从 SQLAlchemy Models 生成，用于手动导入外部 PostgreSQL
-- 使用方式: psql -h <host> -p <port> -U <user> -d nekoclaw -f init.sql
-- ============================================================

\set ON_ERROR_STOP on

-- Alembic 版本追踪表
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- ============================================================
-- clusters（先建表暂不加外键，organizations 和 users 依赖它，它也依赖它们）
-- ============================================================
CREATE TABLE IF NOT EXISTS clusters (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    compute_provider VARCHAR(32) NOT NULL DEFAULT 'k8s',
    status VARCHAR(16) NOT NULL DEFAULT 'disconnected',
    health_status VARCHAR(32),
    last_health_check TIMESTAMPTZ,
    proxy_endpoint VARCHAR(512),
    created_by VARCHAR(36) NOT NULL,
    provider_config JSONB NOT NULL DEFAULT '{}',
    credentials_encrypted TEXT,
    org_id VARCHAR(36)
);

CREATE INDEX IF NOT EXISTS ix_clusters_deleted_at ON clusters (deleted_at);
CREATE INDEX IF NOT EXISTS ix_clusters_org_id ON clusters (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clusters_name_org ON clusters (name, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- organizations
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL UNIQUE,
    plan VARCHAR(32) NOT NULL DEFAULT 'free',
    max_instances INTEGER NOT NULL DEFAULT 1,
    max_cpu_total VARCHAR(16) NOT NULL DEFAULT '4',
    max_mem_total VARCHAR(16) NOT NULL DEFAULT '8Gi',
    max_storage_total VARCHAR(16) NOT NULL DEFAULT '500Gi',
    cluster_id VARCHAR(36) REFERENCES clusters(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_organizations_deleted_at ON organizations (deleted_at);
CREATE INDEX IF NOT EXISTS ix_organizations_slug ON organizations (slug);

-- clusters.org_id 外键（打破循环依赖）
ALTER TABLE clusters
    ADD CONSTRAINT fk_clusters_org_id FOREIGN KEY (org_id) REFERENCES organizations(id);

-- ============================================================
-- users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    email VARCHAR(256) UNIQUE,
    phone VARCHAR(32) UNIQUE,
    username VARCHAR(128),
    password_hash VARCHAR(256),
    avatar_url VARCHAR(512),
    role VARCHAR(16) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    current_org_id VARCHAR(36) REFERENCES organizations(id)
);

CREATE INDEX IF NOT EXISTS ix_users_deleted_at ON users (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users (username)
    WHERE deleted_at IS NULL;

-- clusters.created_by 外键（users 建好后才能加）
ALTER TABLE clusters
    ADD CONSTRAINT fk_clusters_created_by FOREIGN KEY (created_by) REFERENCES users(id);

-- ============================================================
-- org_memberships
-- ============================================================
CREATE TABLE IF NOT EXISTS org_memberships (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    role VARCHAR(16) NOT NULL DEFAULT 'viewer',
    job_title VARCHAR(32)
);

CREATE INDEX IF NOT EXISTS ix_org_memberships_deleted_at ON org_memberships (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_membership ON org_memberships (user_id, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- org_oauth_bindings
-- ============================================================
CREATE TABLE IF NOT EXISTS org_oauth_bindings (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    provider VARCHAR(32) NOT NULL,
    provider_tenant_id VARCHAR(128) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_org_oauth_bindings_deleted_at ON org_oauth_bindings (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_oauth_binding ON org_oauth_bindings (provider, provider_tenant_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- user_oauth_connections
-- ============================================================
CREATE TABLE IF NOT EXISTS user_oauth_connections (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    provider VARCHAR(32) NOT NULL,
    provider_user_id VARCHAR(128) NOT NULL,
    provider_tenant_id VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS ix_user_oauth_connections_deleted_at ON user_oauth_connections (deleted_at);
CREATE INDEX IF NOT EXISTS ix_user_oauth_connections_provider ON user_oauth_connections (provider);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_provider_user ON user_oauth_connections (provider, provider_user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- workspaces
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    org_id VARCHAR(36) NOT NULL REFERENCES organizations(id),
    name VARCHAR(128) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color VARCHAR(16) NOT NULL DEFAULT '#a78bfa',
    icon VARCHAR(32) NOT NULL DEFAULT 'cat',
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    decoration_config JSONB
);

CREATE INDEX IF NOT EXISTS ix_workspaces_deleted_at ON workspaces (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspaces_org_id ON workspaces (org_id);

-- ============================================================
-- workspace_members
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'editor',
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    permissions JSON NOT NULL DEFAULT '[]',
    hex_q INTEGER,
    hex_r INTEGER,
    display_color VARCHAR(20) DEFAULT '#f59e0b'
);

CREATE INDEX IF NOT EXISTS ix_workspace_members_deleted_at ON workspace_members (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_members_workspace_id ON workspace_members (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_members_user_id ON workspace_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_member ON workspace_members (workspace_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instances
-- ============================================================
CREATE TABLE IF NOT EXISTS instances (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL DEFAULT '',
    cluster_id VARCHAR(36) NOT NULL REFERENCES clusters(id),
    namespace VARCHAR(128) NOT NULL,
    image_version VARCHAR(64) NOT NULL,
    replicas INTEGER NOT NULL DEFAULT 1,
    cpu_request VARCHAR(16) NOT NULL DEFAULT '500m',
    cpu_limit VARCHAR(16) NOT NULL DEFAULT '2000m',
    mem_request VARCHAR(16) NOT NULL DEFAULT '2Gi',
    mem_limit VARCHAR(16) NOT NULL DEFAULT '2Gi',
    service_type VARCHAR(16) NOT NULL DEFAULT 'ClusterIP',
    ingress_domain VARCHAR(256),
    proxy_token VARCHAR(64) UNIQUE,
    wp_api_key VARCHAR(96) UNIQUE,
    env_vars TEXT,
    quota_cpu VARCHAR(16) NOT NULL DEFAULT '4',
    quota_mem VARCHAR(16) NOT NULL DEFAULT '8Gi',
    quota_max_pods INTEGER NOT NULL DEFAULT 20,
    storage_class VARCHAR(64) NOT NULL DEFAULT 'nas-subpath',
    storage_size VARCHAR(16) NOT NULL DEFAULT '80Gi',
    advanced_config TEXT,
    llm_providers JSON,
    pending_config TEXT,
    available_replicas INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'creating',
    health_status VARCHAR(16) NOT NULL DEFAULT 'unknown',
    current_revision INTEGER NOT NULL DEFAULT 0,
    compute_provider VARCHAR(32) NOT NULL DEFAULT 'k8s',
    runtime VARCHAR(32) NOT NULL DEFAULT 'openclaw',
    cat_breed VARCHAR(64),
    cat_fur_color VARCHAR(32),
    cat_personality VARCHAR(128),
    cat_theme_color VARCHAR(7),
    created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    org_id VARCHAR(36) REFERENCES organizations(id),
    workspace_id VARCHAR(36) REFERENCES workspaces(id) ON DELETE SET NULL,
    hex_position_q INTEGER NOT NULL DEFAULT 0,
    hex_position_r INTEGER NOT NULL DEFAULT 0,
    agent_display_name VARCHAR(64),
    agent_label VARCHAR(128)
);

CREATE INDEX IF NOT EXISTS ix_instances_deleted_at ON instances (deleted_at);
CREATE INDEX IF NOT EXISTS ix_instances_proxy_token ON instances (proxy_token);
CREATE INDEX IF NOT EXISTS ix_instances_wp_api_key ON instances (wp_api_key);
CREATE INDEX IF NOT EXISTS ix_instances_org_id ON instances (org_id);
CREATE INDEX IF NOT EXISTS ix_instances_workspace_id ON instances (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instances_slug_org_active ON instances (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instance_members
-- ============================================================
CREATE TABLE IF NOT EXISTS instance_members (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    role VARCHAR(16) NOT NULL DEFAULT 'viewer'
);

CREATE INDEX IF NOT EXISTS ix_instance_members_deleted_at ON instance_members (deleted_at);
CREATE INDEX IF NOT EXISTS ix_instance_member_instance ON instance_members (instance_id);
CREATE INDEX IF NOT EXISTS ix_instance_member_user ON instance_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_member_active ON instance_members (instance_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- deploy_records
-- ============================================================
CREATE TABLE IF NOT EXISTS deploy_records (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    revision INTEGER NOT NULL,
    action VARCHAR(16) NOT NULL,
    image_version VARCHAR(64),
    replicas INTEGER,
    config_snapshot TEXT,
    status VARCHAR(16) NOT NULL DEFAULT 'in_progress',
    message TEXT,
    triggered_by VARCHAR(36) NOT NULL REFERENCES users(id),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_deploy_records_deleted_at ON deploy_records (deleted_at);

-- ============================================================
-- workspace_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_messages (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sender_type VARCHAR(16) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(16) NOT NULL DEFAULT 'chat',
    target_instance_id VARCHAR(36),
    depth INTEGER NOT NULL DEFAULT 0,
    attachments JSONB
);

CREATE INDEX IF NOT EXISTS ix_workspace_messages_deleted_at ON workspace_messages (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_messages_workspace_id ON workspace_messages (workspace_id);

-- ============================================================
-- workspace_agents
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_agents (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    hex_q INTEGER,
    hex_r INTEGER,
    channel_type VARCHAR(32),
    channel_config JSONB
);

CREATE INDEX IF NOT EXISTS ix_workspace_agents_deleted_at ON workspace_agents (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_agents_workspace_id ON workspace_agents (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_agents_instance_id ON workspace_agents (instance_id);

-- ============================================================
-- workspace_objectives
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_objectives (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title VARCHAR(256) NOT NULL,
    description TEXT,
    progress FLOAT NOT NULL DEFAULT 0.0,
    obj_type VARCHAR(20) NOT NULL DEFAULT 'objective',
    parent_id VARCHAR(36) REFERENCES workspace_objectives(id) ON DELETE CASCADE,
    created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_workspace_objectives_deleted_at ON workspace_objectives (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_workspace_id ON workspace_objectives (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_obj_type ON workspace_objectives (obj_type);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_parent_id ON workspace_objectives (parent_id);

-- ============================================================
-- blackboards
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboards (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    content TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS ix_blackboards_deleted_at ON blackboards (deleted_at);

-- ============================================================
-- blackboard_posts
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboard_posts (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    blackboard_id VARCHAR(36) NOT NULL REFERENCES blackboards(id) ON DELETE CASCADE,
    title VARCHAR(256) NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    author_id VARCHAR(36) NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_blackboard_posts_deleted_at ON blackboard_posts (deleted_at);
CREATE INDEX IF NOT EXISTS ix_blackboard_posts_blackboard_id ON blackboard_posts (blackboard_id);

-- ============================================================
-- blackboard_replies
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboard_replies (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    post_id VARCHAR(36) NOT NULL REFERENCES blackboard_posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    author_id VARCHAR(36) NOT NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS ix_blackboard_replies_deleted_at ON blackboard_replies (deleted_at);
CREATE INDEX IF NOT EXISTS ix_blackboard_replies_post_id ON blackboard_replies (post_id);

-- ============================================================
-- genes
-- ============================================================
CREATE TABLE IF NOT EXISTS genes (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    description TEXT,
    short_description VARCHAR(256),
    category VARCHAR(32),
    tags TEXT,
    source VARCHAR(16) NOT NULL DEFAULT 'official',
    source_ref VARCHAR(512),
    icon VARCHAR(32),
    version VARCHAR(16) NOT NULL DEFAULT '1.0.0',
    manifest TEXT,
    dependencies TEXT,
    synergies TEXT,
    parent_gene_id VARCHAR(36) REFERENCES genes(id),
    created_by_instance_id VARCHAR(36) REFERENCES instances(id),
    install_count INTEGER NOT NULL DEFAULT 0,
    avg_rating FLOAT NOT NULL DEFAULT 0.0,
    effectiveness_score FLOAT NOT NULL DEFAULT 0.0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    review_status VARCHAR(16),
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(36) REFERENCES users(id),
    org_id VARCHAR(36) REFERENCES organizations(id),
    visibility VARCHAR(16) NOT NULL DEFAULT 'public'
);

CREATE INDEX IF NOT EXISTS ix_genes_deleted_at ON genes (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genes_slug_org_active ON genes (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- genomes
-- ============================================================
CREATE TABLE IF NOT EXISTS genomes (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    name VARCHAR(128) NOT NULL,
    slug VARCHAR(128) NOT NULL,
    description TEXT,
    short_description VARCHAR(256),
    icon VARCHAR(32),
    gene_slugs TEXT,
    config_override TEXT,
    install_count INTEGER NOT NULL DEFAULT 0,
    avg_rating FLOAT NOT NULL DEFAULT 0.0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_published BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(36) REFERENCES users(id),
    org_id VARCHAR(36) REFERENCES organizations(id),
    visibility VARCHAR(16) NOT NULL DEFAULT 'public'
);

CREATE INDEX IF NOT EXISTS ix_genomes_deleted_at ON genomes (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genomes_slug_org_active ON genomes (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instance_genes
-- ============================================================
CREATE TABLE IF NOT EXISTS instance_genes (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    gene_id VARCHAR(36) NOT NULL REFERENCES genes(id),
    genome_id VARCHAR(36) REFERENCES genomes(id),
    status VARCHAR(20) NOT NULL DEFAULT 'installing',
    installed_version VARCHAR(16),
    learning_output TEXT,
    config_snapshot TEXT,
    agent_self_eval FLOAT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    variant_published BOOLEAN NOT NULL DEFAULT FALSE,
    installed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_instance_genes_deleted_at ON instance_genes (deleted_at);
CREATE INDEX IF NOT EXISTS ix_instance_genes_instance_id ON instance_genes (instance_id);
CREATE INDEX IF NOT EXISTS ix_instance_genes_gene_id ON instance_genes (gene_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_gene_active ON instance_genes (instance_id, gene_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- gene_effect_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS gene_effect_logs (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    gene_id VARCHAR(36) NOT NULL REFERENCES genes(id),
    metric_type VARCHAR(20) NOT NULL,
    value FLOAT NOT NULL DEFAULT 0.0,
    context TEXT
);

CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_deleted_at ON gene_effect_logs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_instance_id ON gene_effect_logs (instance_id);
CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_gene_id ON gene_effect_logs (gene_id);

-- ============================================================
-- gene_ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS gene_ratings (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    gene_id VARCHAR(36) NOT NULL REFERENCES genes(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL,
    comment TEXT
);

CREATE INDEX IF NOT EXISTS ix_gene_ratings_deleted_at ON gene_ratings (deleted_at);
CREATE INDEX IF NOT EXISTS ix_gene_ratings_gene_id ON gene_ratings (gene_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gene_rating_user ON gene_ratings (gene_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- genome_ratings
-- ============================================================
CREATE TABLE IF NOT EXISTS genome_ratings (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    genome_id VARCHAR(36) NOT NULL REFERENCES genomes(id),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id),
    rating INTEGER NOT NULL,
    comment TEXT
);

CREATE INDEX IF NOT EXISTS ix_genome_ratings_deleted_at ON genome_ratings (deleted_at);
CREATE INDEX IF NOT EXISTS ix_genome_ratings_genome_id ON genome_ratings (genome_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genome_rating_user ON genome_ratings (genome_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- evolution_events
-- ============================================================
CREATE TABLE IF NOT EXISTS evolution_events (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    gene_id VARCHAR(36),
    genome_id VARCHAR(36),
    event_type VARCHAR(32) NOT NULL,
    gene_name VARCHAR(128) NOT NULL,
    gene_slug VARCHAR(128),
    details TEXT
);

CREATE INDEX IF NOT EXISTS ix_evolution_events_deleted_at ON evolution_events (deleted_at);
CREATE INDEX IF NOT EXISTS ix_evolution_events_instance_id ON evolution_events (instance_id);
CREATE INDEX IF NOT EXISTS ix_evolution_events_gene_id ON evolution_events (gene_id);
CREATE INDEX IF NOT EXISTS ix_evolution_events_event_type ON evolution_events (event_type);

-- ============================================================
-- org_llm_keys（org_id 无外键约束，跨服务访问不依赖 FK）
-- ============================================================
CREATE TABLE IF NOT EXISTS org_llm_keys (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    org_id VARCHAR(36) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    display_name VARCHAR(128) NOT NULL DEFAULT '',
    api_key TEXT NOT NULL,
    base_url VARCHAR(512),
    org_token_limit BIGINT,
    system_token_limit BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_org_llm_keys_deleted_at ON org_llm_keys (deleted_at);
CREATE INDEX IF NOT EXISTS ix_org_llm_keys_org_id ON org_llm_keys (org_id);

-- ============================================================
-- user_llm_keys
-- ============================================================
CREATE TABLE IF NOT EXISTS user_llm_keys (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id VARCHAR(36) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    api_key TEXT NOT NULL,
    base_url VARCHAR(512)
);

CREATE INDEX IF NOT EXISTS ix_user_llm_keys_deleted_at ON user_llm_keys (deleted_at);
CREATE INDEX IF NOT EXISTS ix_user_llm_keys_user_id ON user_llm_keys (user_id);

-- ============================================================
-- user_llm_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS user_llm_configs (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id VARCHAR(36) NOT NULL,
    org_id VARCHAR(36) NOT NULL,
    provider VARCHAR(32) NOT NULL,
    key_source VARCHAR(16) NOT NULL DEFAULT 'personal'
);

CREATE INDEX IF NOT EXISTS ix_user_llm_configs_deleted_at ON user_llm_configs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_user_llm_configs_user_id ON user_llm_configs (user_id);

-- ============================================================
-- llm_usage_logs
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    org_llm_key_id VARCHAR(36),
    user_id VARCHAR(36),
    instance_id VARCHAR(36),
    org_id VARCHAR(36),
    provider VARCHAR(32),
    model VARCHAR(128),
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    key_source VARCHAR(16),
    request_path VARCHAR(256),
    is_stream BOOLEAN NOT NULL DEFAULT FALSE,
    status_code INTEGER,
    latency_ms INTEGER,
    error_message VARCHAR(512),
    request_body TEXT,
    response_body TEXT
);

CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_deleted_at ON llm_usage_logs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_user_id ON llm_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_instance_id ON llm_usage_logs (instance_id);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_org_id ON llm_usage_logs (org_id);
