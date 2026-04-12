-- ============================================================
-- NekoClaw Database Init SQL
-- 从 SQLAlchemy Models 生成，用于手动导入外部 PostgreSQL
-- 使用方式:
--   1. 先连接到 postgres 默认库执行建库命令
--   2. 再切换到 nekoclaw 库执行建表命令
--   或直接: psql -h <host> -p <port> -U <user> -d nekoclaw -f init.sql
-- ============================================================

-- ============================================================
-- 建库（如已存在可跳过此步骤）
-- ============================================================
-- CREATE DATABASE nekoclaw
--     WITH ENCODING = 'UTF8'
--          LC_COLLATE = 'en_US.UTF-8'
--          LC_CTYPE = 'en_US.UTF-8'
--          TEMPLATE = template0;

-- ============================================================
-- Alembic 迁移版本追踪表
-- ============================================================
CREATE TABLE IF NOT EXISTS alembic_version (
    version_num VARCHAR(32) NOT NULL,
    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
);

-- ============================================================
-- clusters 计算集群
-- ============================================================
CREATE TABLE IF NOT EXISTS clusters (
    id               VARCHAR(36)  PRIMARY KEY,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ  DEFAULT NULL,
    name             VARCHAR(128) NOT NULL,
    compute_provider VARCHAR(32)  NOT NULL DEFAULT 'k8s',
    status           VARCHAR(16)  NOT NULL DEFAULT 'disconnected',
    health_status    VARCHAR(32),
    last_health_check TIMESTAMPTZ,
    proxy_endpoint   VARCHAR(512),
    created_by       VARCHAR(36)  NOT NULL,
    provider_config  JSONB        NOT NULL DEFAULT '{}',
    credentials_encrypted TEXT,
    org_id           VARCHAR(36)
);

COMMENT ON TABLE  clusters                        IS '计算集群（K8s / Docker 等）';
COMMENT ON COLUMN clusters.id                     IS '主键 UUID';
COMMENT ON COLUMN clusters.created_at             IS '创建时间';
COMMENT ON COLUMN clusters.updated_at             IS '更新时间';
COMMENT ON COLUMN clusters.deleted_at             IS '软删除时间，NULL 表示未删除';
COMMENT ON COLUMN clusters.name                   IS '集群名称';
COMMENT ON COLUMN clusters.compute_provider       IS '计算提供商（k8s / docker）';
COMMENT ON COLUMN clusters.status                 IS '连接状态（connected / disconnected / connecting）';
COMMENT ON COLUMN clusters.health_status          IS '健康状态描述';
COMMENT ON COLUMN clusters.last_health_check      IS '最近一次健康检查时间';
COMMENT ON COLUMN clusters.proxy_endpoint         IS '代理接入点地址';
COMMENT ON COLUMN clusters.created_by             IS '创建者用户 ID';
COMMENT ON COLUMN clusters.provider_config        IS '云厂商扩展配置（JSONB）';
COMMENT ON COLUMN clusters.credentials_encrypted  IS '加密凭证（KubeConfig 等）';
COMMENT ON COLUMN clusters.org_id                 IS '所属组织 ID';

CREATE INDEX       IF NOT EXISTS ix_clusters_deleted_at ON clusters (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_clusters_org_id     ON clusters (org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clusters_name_org  ON clusters (name, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- organizations 组织
-- ============================================================
CREATE TABLE IF NOT EXISTS organizations (
    id                VARCHAR(36)  PRIMARY KEY,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ  DEFAULT NULL,
    name              VARCHAR(128) NOT NULL,
    slug              VARCHAR(128) NOT NULL UNIQUE,
    plan              VARCHAR(32)  NOT NULL DEFAULT 'free',
    max_instances     INTEGER      NOT NULL DEFAULT 1,
    max_cpu_total     VARCHAR(16)  NOT NULL DEFAULT '4',
    max_mem_total     VARCHAR(16)  NOT NULL DEFAULT '8Gi',
    max_storage_total VARCHAR(16)  NOT NULL DEFAULT '500Gi',
    cluster_id        VARCHAR(36)  REFERENCES clusters(id),
    is_active         BOOLEAN      NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE  organizations                   IS '组织（多租户隔离单元）';
COMMENT ON COLUMN organizations.id                IS '主键 UUID';
COMMENT ON COLUMN organizations.created_at        IS '创建时间';
COMMENT ON COLUMN organizations.updated_at        IS '更新时间';
COMMENT ON COLUMN organizations.deleted_at        IS '软删除时间';
COMMENT ON COLUMN organizations.name              IS '组织显示名称';
COMMENT ON COLUMN organizations.slug              IS '组织唯一标识符（URL 安全）';
COMMENT ON COLUMN organizations.plan              IS '订阅计划（free / pro / enterprise）';
COMMENT ON COLUMN organizations.max_instances     IS '最大实例数配额';
COMMENT ON COLUMN organizations.max_cpu_total     IS '总 CPU 配额（如 4 表示 4 核）';
COMMENT ON COLUMN organizations.max_mem_total     IS '总内存配额（如 8Gi）';
COMMENT ON COLUMN organizations.max_storage_total IS '总存储配额（如 500Gi）';
COMMENT ON COLUMN organizations.cluster_id        IS '默认绑定集群 ID';
COMMENT ON COLUMN organizations.is_active         IS '是否启用';

CREATE INDEX       IF NOT EXISTS ix_organizations_deleted_at ON organizations (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_organizations_slug       ON organizations (slug);

-- ============================================================
-- users 用户
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id                   VARCHAR(36)  PRIMARY KEY,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at           TIMESTAMPTZ  DEFAULT NULL,
    name                 VARCHAR(128) NOT NULL,
    email                VARCHAR(256) UNIQUE,
    phone                VARCHAR(32)  UNIQUE,
    username             VARCHAR(128),
    password_hash        VARCHAR(256),
    avatar_url           VARCHAR(512),
    role                 VARCHAR(16)  NOT NULL DEFAULT 'user',
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    must_change_password BOOLEAN      NOT NULL DEFAULT FALSE,
    last_login_at        TIMESTAMPTZ,
    is_super_admin       BOOLEAN      NOT NULL DEFAULT FALSE,
    current_org_id       VARCHAR(36)  REFERENCES organizations(id)
);

COMMENT ON TABLE  users                       IS '系统用户';
COMMENT ON COLUMN users.id                    IS '主键 UUID';
COMMENT ON COLUMN users.created_at            IS '创建时间';
COMMENT ON COLUMN users.updated_at            IS '更新时间';
COMMENT ON COLUMN users.deleted_at            IS '软删除时间';
COMMENT ON COLUMN users.name                  IS '用户显示名称';
COMMENT ON COLUMN users.email                 IS '邮箱地址（唯一）';
COMMENT ON COLUMN users.phone                 IS '手机号（唯一）';
COMMENT ON COLUMN users.username              IS '登录用户名（软删除内唯一）';
COMMENT ON COLUMN users.password_hash         IS 'bcrypt 哈希密码';
COMMENT ON COLUMN users.avatar_url            IS '头像 URL';
COMMENT ON COLUMN users.role                  IS '用户角色（admin / user）';
COMMENT ON COLUMN users.is_active             IS '是否启用';
COMMENT ON COLUMN users.must_change_password  IS '是否强制下次登录修改密码';
COMMENT ON COLUMN users.last_login_at         IS '最近登录时间';
COMMENT ON COLUMN users.is_super_admin        IS '是否超级管理员';
COMMENT ON COLUMN users.current_org_id        IS '当前激活的组织 ID';

CREATE INDEX       IF NOT EXISTS ix_users_deleted_at  ON users (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username   ON users (username)
    WHERE deleted_at IS NULL;

-- ============================================================
-- org_memberships 组织成员关系
-- ============================================================
CREATE TABLE IF NOT EXISTS org_memberships (
    id         VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
    org_id     VARCHAR(36) NOT NULL REFERENCES organizations(id),
    role       VARCHAR(16) NOT NULL DEFAULT 'viewer',
    job_title  VARCHAR(32)
);

COMMENT ON TABLE  org_memberships            IS '组织成员关系';
COMMENT ON COLUMN org_memberships.id         IS '主键 UUID';
COMMENT ON COLUMN org_memberships.created_at IS '创建时间';
COMMENT ON COLUMN org_memberships.updated_at IS '更新时间';
COMMENT ON COLUMN org_memberships.deleted_at IS '软删除时间';
COMMENT ON COLUMN org_memberships.user_id    IS '用户 ID';
COMMENT ON COLUMN org_memberships.org_id     IS '组织 ID';
COMMENT ON COLUMN org_memberships.role       IS '角色（viewer / operator / manager / admin）';
COMMENT ON COLUMN org_memberships.job_title  IS '职位头衔';

CREATE INDEX       IF NOT EXISTS ix_org_memberships_deleted_at ON org_memberships (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_membership             ON org_memberships (user_id, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- org_oauth_bindings 组织 OAuth 绑定
-- ============================================================
CREATE TABLE IF NOT EXISTS org_oauth_bindings (
    id                 VARCHAR(36)  PRIMARY KEY,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ  DEFAULT NULL,
    org_id             VARCHAR(36)  NOT NULL REFERENCES organizations(id),
    provider           VARCHAR(32)  NOT NULL,
    provider_tenant_id VARCHAR(128) NOT NULL
);

COMMENT ON TABLE  org_oauth_bindings                    IS '组织 OAuth 第三方租户绑定（如飞书企业）';
COMMENT ON COLUMN org_oauth_bindings.id                 IS '主键 UUID';
COMMENT ON COLUMN org_oauth_bindings.created_at         IS '创建时间';
COMMENT ON COLUMN org_oauth_bindings.updated_at         IS '更新时间';
COMMENT ON COLUMN org_oauth_bindings.deleted_at         IS '软删除时间';
COMMENT ON COLUMN org_oauth_bindings.org_id             IS '组织 ID';
COMMENT ON COLUMN org_oauth_bindings.provider           IS 'OAuth 提供商（feishu / dingtalk 等）';
COMMENT ON COLUMN org_oauth_bindings.provider_tenant_id IS '第三方平台租户 ID';

CREATE INDEX       IF NOT EXISTS ix_org_oauth_bindings_deleted_at ON org_oauth_bindings (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_oauth_binding             ON org_oauth_bindings (provider, provider_tenant_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- user_oauth_connections 用户 OAuth 连接
-- ============================================================
CREATE TABLE IF NOT EXISTS user_oauth_connections (
    id                 VARCHAR(36)  PRIMARY KEY,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ  DEFAULT NULL,
    user_id            VARCHAR(36)  NOT NULL REFERENCES users(id),
    provider           VARCHAR(32)  NOT NULL,
    provider_user_id   VARCHAR(128) NOT NULL,
    provider_tenant_id VARCHAR(128)
);

COMMENT ON TABLE  user_oauth_connections                    IS '用户第三方 OAuth 账号关联';
COMMENT ON COLUMN user_oauth_connections.id                 IS '主键 UUID';
COMMENT ON COLUMN user_oauth_connections.created_at         IS '创建时间';
COMMENT ON COLUMN user_oauth_connections.updated_at         IS '更新时间';
COMMENT ON COLUMN user_oauth_connections.deleted_at         IS '软删除时间';
COMMENT ON COLUMN user_oauth_connections.user_id            IS '本地用户 ID';
COMMENT ON COLUMN user_oauth_connections.provider           IS 'OAuth 提供商';
COMMENT ON COLUMN user_oauth_connections.provider_user_id   IS '第三方平台用户 ID';
COMMENT ON COLUMN user_oauth_connections.provider_tenant_id IS '第三方平台租户 ID';

CREATE INDEX       IF NOT EXISTS ix_user_oauth_connections_deleted_at ON user_oauth_connections (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_user_oauth_connections_provider   ON user_oauth_connections (provider);
CREATE UNIQUE INDEX IF NOT EXISTS uq_oauth_provider_user               ON user_oauth_connections (provider, provider_user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- workspaces 工作区
-- ============================================================
CREATE TABLE IF NOT EXISTS workspaces (
    id               VARCHAR(36)  PRIMARY KEY,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at       TIMESTAMPTZ  DEFAULT NULL,
    org_id           VARCHAR(36)  NOT NULL REFERENCES organizations(id),
    name             VARCHAR(128) NOT NULL,
    description      TEXT         NOT NULL DEFAULT '',
    color            VARCHAR(16)  NOT NULL DEFAULT '#a78bfa',
    icon             VARCHAR(32)  NOT NULL DEFAULT 'cat',
    created_by       VARCHAR(36)  NOT NULL REFERENCES users(id),
    decoration_config JSONB
);

COMMENT ON TABLE  workspaces                    IS '工作区（多猫咪协作空间）';
COMMENT ON COLUMN workspaces.id                 IS '主键 UUID';
COMMENT ON COLUMN workspaces.created_at         IS '创建时间';
COMMENT ON COLUMN workspaces.updated_at         IS '更新时间';
COMMENT ON COLUMN workspaces.deleted_at         IS '软删除时间';
COMMENT ON COLUMN workspaces.org_id             IS '所属组织 ID';
COMMENT ON COLUMN workspaces.name               IS '工作区名称';
COMMENT ON COLUMN workspaces.description        IS '工作区描述';
COMMENT ON COLUMN workspaces.color              IS '工作区主题色（HEX）';
COMMENT ON COLUMN workspaces.icon               IS '工作区图标标识';
COMMENT ON COLUMN workspaces.created_by         IS '创建者用户 ID';
COMMENT ON COLUMN workspaces.decoration_config  IS '装饰配置（背景、特效等，JSONB）';

CREATE INDEX IF NOT EXISTS ix_workspaces_deleted_at ON workspaces (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspaces_org_id     ON workspaces (org_id);

-- ============================================================
-- workspace_members 工作区成员
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_members (
    id           VARCHAR(36) PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         VARCHAR(16) NOT NULL DEFAULT 'editor',
    is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
    permissions  JSON        NOT NULL DEFAULT '[]',
    hex_q        INTEGER,
    hex_r        INTEGER,
    display_color VARCHAR(20) DEFAULT '#f59e0b'
);

COMMENT ON TABLE  workspace_members               IS '工作区成员';
COMMENT ON COLUMN workspace_members.id            IS '主键 UUID';
COMMENT ON COLUMN workspace_members.created_at    IS '创建时间';
COMMENT ON COLUMN workspace_members.updated_at    IS '更新时间';
COMMENT ON COLUMN workspace_members.deleted_at    IS '软删除时间';
COMMENT ON COLUMN workspace_members.workspace_id  IS '工作区 ID';
COMMENT ON COLUMN workspace_members.user_id       IS '用户 ID';
COMMENT ON COLUMN workspace_members.role          IS '角色（owner / editor / viewer）';
COMMENT ON COLUMN workspace_members.is_admin      IS '是否工作区管理员';
COMMENT ON COLUMN workspace_members.permissions   IS '细粒度权限列表（JSON 数组）';
COMMENT ON COLUMN workspace_members.hex_q         IS '六边形地图 Q 轴坐标';
COMMENT ON COLUMN workspace_members.hex_r         IS '六边形地图 R 轴坐标';
COMMENT ON COLUMN workspace_members.display_color IS '成员在工作区中的展示颜色';

CREATE INDEX       IF NOT EXISTS ix_workspace_members_deleted_at   ON workspace_members (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_workspace_members_workspace_id ON workspace_members (workspace_id);
CREATE INDEX       IF NOT EXISTS ix_workspace_members_user_id      ON workspace_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_member              ON workspace_members (workspace_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instances 猫咪实例
-- ============================================================
CREATE TABLE IF NOT EXISTS instances (
    id                  VARCHAR(36)  PRIMARY KEY,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ  DEFAULT NULL,
    name                VARCHAR(128) NOT NULL,
    slug                VARCHAR(128) NOT NULL DEFAULT '',
    cluster_id          VARCHAR(36)  NOT NULL REFERENCES clusters(id),
    namespace           VARCHAR(128) NOT NULL,
    image_version       VARCHAR(64)  NOT NULL,
    replicas            INTEGER      NOT NULL DEFAULT 1,
    cpu_request         VARCHAR(16)  NOT NULL DEFAULT '500m',
    cpu_limit           VARCHAR(16)  NOT NULL DEFAULT '2000m',
    mem_request         VARCHAR(16)  NOT NULL DEFAULT '2Gi',
    mem_limit           VARCHAR(16)  NOT NULL DEFAULT '2Gi',
    service_type        VARCHAR(16)  NOT NULL DEFAULT 'ClusterIP',
    ingress_domain      VARCHAR(256),
    proxy_token         VARCHAR(64)  UNIQUE,
    wp_api_key          VARCHAR(96)  UNIQUE,
    env_vars            TEXT,
    quota_cpu           VARCHAR(16)  NOT NULL DEFAULT '4',
    quota_mem           VARCHAR(16)  NOT NULL DEFAULT '8Gi',
    quota_max_pods      INTEGER      NOT NULL DEFAULT 20,
    storage_class       VARCHAR(64)  NOT NULL DEFAULT 'nas-subpath',
    storage_size        VARCHAR(16)  NOT NULL DEFAULT '80Gi',
    advanced_config     TEXT,
    llm_providers       JSON,
    pending_config      TEXT,
    available_replicas  INTEGER      NOT NULL DEFAULT 0,
    status              VARCHAR(16)  NOT NULL DEFAULT 'creating',
    health_status       VARCHAR(16)  NOT NULL DEFAULT 'unknown',
    current_revision    INTEGER      NOT NULL DEFAULT 0,
    compute_provider    VARCHAR(32)  NOT NULL DEFAULT 'k8s',
    runtime             VARCHAR(32)  NOT NULL DEFAULT 'openclaw',
    cat_breed           VARCHAR(64),
    cat_fur_color       VARCHAR(32),
    cat_personality     VARCHAR(128),
    cat_theme_color     VARCHAR(7),
    created_by          VARCHAR(36)  NOT NULL REFERENCES users(id),
    org_id              VARCHAR(36)  REFERENCES organizations(id),
    workspace_id        VARCHAR(36)  REFERENCES workspaces(id) ON DELETE SET NULL,
    hex_position_q      INTEGER      NOT NULL DEFAULT 0,
    hex_position_r      INTEGER      NOT NULL DEFAULT 0,
    agent_display_name  VARCHAR(64),
    agent_label         VARCHAR(128)
);

COMMENT ON TABLE  instances                    IS '猫咪 AI 实例（K8s Deployment 对应单元）';
COMMENT ON COLUMN instances.id                 IS '主键 UUID';
COMMENT ON COLUMN instances.created_at         IS '创建时间';
COMMENT ON COLUMN instances.updated_at         IS '更新时间';
COMMENT ON COLUMN instances.deleted_at         IS '软删除时间';
COMMENT ON COLUMN instances.name               IS '实例显示名称';
COMMENT ON COLUMN instances.slug               IS '实例唯一标识符（组织内唯一）';
COMMENT ON COLUMN instances.cluster_id         IS '所在集群 ID';
COMMENT ON COLUMN instances.namespace          IS 'K8s 命名空间';
COMMENT ON COLUMN instances.image_version      IS '镜像版本号';
COMMENT ON COLUMN instances.replicas           IS '期望副本数';
COMMENT ON COLUMN instances.cpu_request        IS 'CPU 请求量';
COMMENT ON COLUMN instances.cpu_limit          IS 'CPU 上限';
COMMENT ON COLUMN instances.mem_request        IS '内存请求量';
COMMENT ON COLUMN instances.mem_limit          IS '内存上限';
COMMENT ON COLUMN instances.service_type       IS 'K8s Service 类型（ClusterIP / NodePort / LoadBalancer）';
COMMENT ON COLUMN instances.ingress_domain     IS 'Ingress 域名';
COMMENT ON COLUMN instances.proxy_token        IS '代理访问 Token（唯一）';
COMMENT ON COLUMN instances.wp_api_key         IS 'WP API Key（唯一）';
COMMENT ON COLUMN instances.env_vars           IS '环境变量（JSON 序列化文本）';
COMMENT ON COLUMN instances.quota_cpu          IS '实例 CPU 配额';
COMMENT ON COLUMN instances.quota_mem          IS '实例内存配额';
COMMENT ON COLUMN instances.quota_max_pods     IS '实例最大 Pod 数配额';
COMMENT ON COLUMN instances.storage_class      IS 'PVC StorageClass 名称';
COMMENT ON COLUMN instances.storage_size       IS 'PVC 存储大小';
COMMENT ON COLUMN instances.advanced_config    IS '高级配置（JSONC 文本）';
COMMENT ON COLUMN instances.llm_providers      IS 'LLM 提供商列表（JSON）';
COMMENT ON COLUMN instances.pending_config     IS '待生效配置（升级暂存）';
COMMENT ON COLUMN instances.available_replicas IS '当前可用副本数（运行时同步）';
COMMENT ON COLUMN instances.status             IS '实例状态（creating / running / failed 等）';
COMMENT ON COLUMN instances.health_status      IS '健康状态（healthy / unhealthy / unknown）';
COMMENT ON COLUMN instances.current_revision   IS '当前配置版本号';
COMMENT ON COLUMN instances.compute_provider   IS '计算提供商（k8s / docker）';
COMMENT ON COLUMN instances.runtime            IS '运行时类型（openclaw / zeroclaw）';
COMMENT ON COLUMN instances.cat_breed          IS '猫咪品种';
COMMENT ON COLUMN instances.cat_fur_color      IS '猫咪毛色';
COMMENT ON COLUMN instances.cat_personality    IS '猫咪性格描述';
COMMENT ON COLUMN instances.cat_theme_color    IS '猫咪主题色（HEX 7位）';
COMMENT ON COLUMN instances.created_by         IS '创建者用户 ID';
COMMENT ON COLUMN instances.org_id             IS '所属组织 ID';
COMMENT ON COLUMN instances.workspace_id       IS '所属工作区 ID（可为空）';
COMMENT ON COLUMN instances.hex_position_q     IS '六边形地图 Q 轴坐标';
COMMENT ON COLUMN instances.hex_position_r     IS '六边形地图 R 轴坐标';
COMMENT ON COLUMN instances.agent_display_name IS '实例对外展示名称';
COMMENT ON COLUMN instances.agent_label        IS '实例标签（用于分类展示）';

CREATE INDEX       IF NOT EXISTS ix_instances_deleted_at       ON instances (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_instances_proxy_token      ON instances (proxy_token);
CREATE INDEX       IF NOT EXISTS ix_instances_wp_api_key       ON instances (wp_api_key);
CREATE INDEX       IF NOT EXISTS ix_instances_org_id           ON instances (org_id);
CREATE INDEX       IF NOT EXISTS ix_instances_workspace_id     ON instances (workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instances_slug_org_active ON instances (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instance_members 实例成员
-- ============================================================
CREATE TABLE IF NOT EXISTS instance_members (
    id          VARCHAR(36) PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    user_id     VARCHAR(36) NOT NULL REFERENCES users(id),
    role        VARCHAR(16) NOT NULL DEFAULT 'viewer'
);

COMMENT ON TABLE  instance_members             IS '实例访问成员';
COMMENT ON COLUMN instance_members.id          IS '主键 UUID';
COMMENT ON COLUMN instance_members.created_at  IS '创建时间';
COMMENT ON COLUMN instance_members.updated_at  IS '更新时间';
COMMENT ON COLUMN instance_members.deleted_at  IS '软删除时间';
COMMENT ON COLUMN instance_members.instance_id IS '实例 ID';
COMMENT ON COLUMN instance_members.user_id     IS '用户 ID';
COMMENT ON COLUMN instance_members.role        IS '角色（admin / editor / user / viewer）';

CREATE INDEX       IF NOT EXISTS ix_instance_members_deleted_at ON instance_members (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_instance_member_instance    ON instance_members (instance_id);
CREATE INDEX       IF NOT EXISTS ix_instance_member_user        ON instance_members (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_member_active     ON instance_members (instance_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- deploy_records 部署记录
-- ============================================================
CREATE TABLE IF NOT EXISTS deploy_records (
    id              VARCHAR(36) PRIMARY KEY,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ DEFAULT NULL,
    instance_id     VARCHAR(36) NOT NULL REFERENCES instances(id),
    revision        INTEGER     NOT NULL,
    action          VARCHAR(16) NOT NULL,
    image_version   VARCHAR(64),
    replicas        INTEGER,
    config_snapshot TEXT,
    status          VARCHAR(16) NOT NULL DEFAULT 'in_progress',
    message         TEXT,
    triggered_by    VARCHAR(36) NOT NULL REFERENCES users(id),
    started_at      TIMESTAMPTZ,
    finished_at     TIMESTAMPTZ
);

COMMENT ON TABLE  deploy_records                IS '实例部署/操作历史记录';
COMMENT ON COLUMN deploy_records.id             IS '主键 UUID';
COMMENT ON COLUMN deploy_records.created_at     IS '创建时间';
COMMENT ON COLUMN deploy_records.updated_at     IS '更新时间';
COMMENT ON COLUMN deploy_records.deleted_at     IS '软删除时间';
COMMENT ON COLUMN deploy_records.instance_id    IS '关联实例 ID';
COMMENT ON COLUMN deploy_records.revision       IS '操作时对应的配置版本号';
COMMENT ON COLUMN deploy_records.action         IS '操作类型（deploy / upgrade / rollback / scale / restart / delete）';
COMMENT ON COLUMN deploy_records.image_version  IS '操作时使用的镜像版本';
COMMENT ON COLUMN deploy_records.replicas       IS '操作时期望副本数';
COMMENT ON COLUMN deploy_records.config_snapshot IS '操作时的配置快照（JSON 文本）';
COMMENT ON COLUMN deploy_records.status         IS '执行状态（pending / in_progress / success / failed）';
COMMENT ON COLUMN deploy_records.message        IS '结果消息或错误详情';
COMMENT ON COLUMN deploy_records.triggered_by   IS '操作触发者用户 ID';
COMMENT ON COLUMN deploy_records.started_at     IS '开始执行时间';
COMMENT ON COLUMN deploy_records.finished_at    IS '执行完成时间';

CREATE INDEX IF NOT EXISTS ix_deploy_records_deleted_at ON deploy_records (deleted_at);

-- ============================================================
-- workspace_messages 工作区消息
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_messages (
    id                 VARCHAR(36)  PRIMARY KEY,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ  DEFAULT NULL,
    workspace_id       VARCHAR(36)  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sender_type        VARCHAR(16)  NOT NULL,
    sender_id          VARCHAR(36)  NOT NULL,
    sender_name        VARCHAR(128) NOT NULL,
    content            TEXT         NOT NULL,
    message_type       VARCHAR(16)  NOT NULL DEFAULT 'chat',
    target_instance_id VARCHAR(36),
    depth              INTEGER      NOT NULL DEFAULT 0,
    attachments        JSONB
);

COMMENT ON TABLE  workspace_messages                    IS '工作区聊天消息';
COMMENT ON COLUMN workspace_messages.id                 IS '主键 UUID';
COMMENT ON COLUMN workspace_messages.created_at         IS '创建时间';
COMMENT ON COLUMN workspace_messages.updated_at         IS '更新时间';
COMMENT ON COLUMN workspace_messages.deleted_at         IS '软删除时间';
COMMENT ON COLUMN workspace_messages.workspace_id       IS '所属工作区 ID';
COMMENT ON COLUMN workspace_messages.sender_type        IS '发送者类型（user / agent）';
COMMENT ON COLUMN workspace_messages.sender_id          IS '发送者 ID';
COMMENT ON COLUMN workspace_messages.sender_name        IS '发送者显示名称';
COMMENT ON COLUMN workspace_messages.content            IS '消息正文';
COMMENT ON COLUMN workspace_messages.message_type       IS '消息类型（chat / system / task）';
COMMENT ON COLUMN workspace_messages.target_instance_id IS '@指定的目标实例 ID';
COMMENT ON COLUMN workspace_messages.depth              IS '消息嵌套深度（0 为顶层）';
COMMENT ON COLUMN workspace_messages.attachments        IS '附件列表（JSONB）';

CREATE INDEX IF NOT EXISTS ix_workspace_messages_deleted_at   ON workspace_messages (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_messages_workspace_id ON workspace_messages (workspace_id);

-- ============================================================
-- workspace_agents 工作区中的猫咪代理
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_agents (
    id             VARCHAR(36) PRIMARY KEY,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at     TIMESTAMPTZ DEFAULT NULL,
    workspace_id   VARCHAR(36) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    instance_id    VARCHAR(36) NOT NULL REFERENCES instances(id) ON DELETE CASCADE,
    hex_q          INTEGER,
    hex_r          INTEGER,
    channel_type   VARCHAR(32),
    channel_config JSONB
);

COMMENT ON TABLE  workspace_agents               IS '工作区内驻场的猫咪代理';
COMMENT ON COLUMN workspace_agents.id            IS '主键 UUID';
COMMENT ON COLUMN workspace_agents.created_at    IS '创建时间';
COMMENT ON COLUMN workspace_agents.updated_at    IS '更新时间';
COMMENT ON COLUMN workspace_agents.deleted_at    IS '软删除时间';
COMMENT ON COLUMN workspace_agents.workspace_id  IS '所属工作区 ID';
COMMENT ON COLUMN workspace_agents.instance_id   IS '对应猫咪实例 ID';
COMMENT ON COLUMN workspace_agents.hex_q         IS '六边形地图 Q 轴坐标';
COMMENT ON COLUMN workspace_agents.hex_r         IS '六边形地图 R 轴坐标';
COMMENT ON COLUMN workspace_agents.channel_type  IS '接入渠道类型（如 dingtalk / feishu）';
COMMENT ON COLUMN workspace_agents.channel_config IS '渠道配置（JSONB）';

CREATE INDEX IF NOT EXISTS ix_workspace_agents_deleted_at   ON workspace_agents (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_agents_workspace_id ON workspace_agents (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_agents_instance_id  ON workspace_agents (instance_id);

-- ============================================================
-- workspace_objectives 工作区目标/OKR
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_objectives (
    id           VARCHAR(36)  PRIMARY KEY,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ  DEFAULT NULL,
    workspace_id VARCHAR(36)  NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title        VARCHAR(256) NOT NULL,
    description  TEXT,
    progress     FLOAT        NOT NULL DEFAULT 0.0,
    obj_type     VARCHAR(20)  NOT NULL DEFAULT 'objective',
    parent_id    VARCHAR(36)  REFERENCES workspace_objectives(id) ON DELETE CASCADE,
    created_by   VARCHAR(36)  REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE  workspace_objectives              IS '工作区目标（支持 OKR 树形结构）';
COMMENT ON COLUMN workspace_objectives.id           IS '主键 UUID';
COMMENT ON COLUMN workspace_objectives.created_at   IS '创建时间';
COMMENT ON COLUMN workspace_objectives.updated_at   IS '更新时间';
COMMENT ON COLUMN workspace_objectives.deleted_at   IS '软删除时间';
COMMENT ON COLUMN workspace_objectives.workspace_id IS '所属工作区 ID';
COMMENT ON COLUMN workspace_objectives.title        IS '目标标题';
COMMENT ON COLUMN workspace_objectives.description  IS '目标描述';
COMMENT ON COLUMN workspace_objectives.progress     IS '完成进度（0.0 ~ 1.0）';
COMMENT ON COLUMN workspace_objectives.obj_type     IS '节点类型（objective / key_result）';
COMMENT ON COLUMN workspace_objectives.parent_id    IS '父节点 ID（树形结构）';
COMMENT ON COLUMN workspace_objectives.created_by   IS '创建者用户 ID';

CREATE INDEX IF NOT EXISTS ix_workspace_objectives_deleted_at   ON workspace_objectives (deleted_at);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_workspace_id ON workspace_objectives (workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_obj_type     ON workspace_objectives (obj_type);
CREATE INDEX IF NOT EXISTS ix_workspace_objectives_parent_id    ON workspace_objectives (parent_id);

-- ============================================================
-- blackboards 黑板
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboards (
    id           VARCHAR(36) PRIMARY KEY,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ DEFAULT NULL,
    workspace_id VARCHAR(36) NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    content      TEXT        NOT NULL DEFAULT ''
);

COMMENT ON TABLE  blackboards              IS '工作区黑板（每个工作区唯一）';
COMMENT ON COLUMN blackboards.id           IS '主键 UUID';
COMMENT ON COLUMN blackboards.created_at   IS '创建时间';
COMMENT ON COLUMN blackboards.updated_at   IS '更新时间';
COMMENT ON COLUMN blackboards.deleted_at   IS '软删除时间';
COMMENT ON COLUMN blackboards.workspace_id IS '所属工作区 ID（唯一）';
COMMENT ON COLUMN blackboards.content      IS '黑板主内容（Markdown 或富文本）';

CREATE INDEX IF NOT EXISTS ix_blackboards_deleted_at ON blackboards (deleted_at);

-- ============================================================
-- blackboard_posts 黑板帖子
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboard_posts (
    id            VARCHAR(36)  PRIMARY KEY,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ  DEFAULT NULL,
    blackboard_id VARCHAR(36)  NOT NULL REFERENCES blackboards(id) ON DELETE CASCADE,
    title         VARCHAR(256) NOT NULL,
    content       TEXT         NOT NULL DEFAULT '',
    author_id     VARCHAR(36)  NOT NULL REFERENCES users(id)
);

COMMENT ON TABLE  blackboard_posts               IS '黑板帖子';
COMMENT ON COLUMN blackboard_posts.id            IS '主键 UUID';
COMMENT ON COLUMN blackboard_posts.created_at    IS '创建时间';
COMMENT ON COLUMN blackboard_posts.updated_at    IS '更新时间';
COMMENT ON COLUMN blackboard_posts.deleted_at    IS '软删除时间';
COMMENT ON COLUMN blackboard_posts.blackboard_id IS '所属黑板 ID';
COMMENT ON COLUMN blackboard_posts.title         IS '帖子标题';
COMMENT ON COLUMN blackboard_posts.content       IS '帖子内容';
COMMENT ON COLUMN blackboard_posts.author_id     IS '作者用户 ID';

CREATE INDEX IF NOT EXISTS ix_blackboard_posts_deleted_at    ON blackboard_posts (deleted_at);
CREATE INDEX IF NOT EXISTS ix_blackboard_posts_blackboard_id ON blackboard_posts (blackboard_id);

-- ============================================================
-- blackboard_replies 黑板回复
-- ============================================================
CREATE TABLE IF NOT EXISTS blackboard_replies (
    id         VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    post_id    VARCHAR(36) NOT NULL REFERENCES blackboard_posts(id) ON DELETE CASCADE,
    content    TEXT        NOT NULL,
    author_id  VARCHAR(36) NOT NULL REFERENCES users(id)
);

COMMENT ON TABLE  blackboard_replies            IS '黑板帖子回复';
COMMENT ON COLUMN blackboard_replies.id         IS '主键 UUID';
COMMENT ON COLUMN blackboard_replies.created_at IS '创建时间';
COMMENT ON COLUMN blackboard_replies.updated_at IS '更新时间';
COMMENT ON COLUMN blackboard_replies.deleted_at IS '软删除时间';
COMMENT ON COLUMN blackboard_replies.post_id    IS '所属帖子 ID';
COMMENT ON COLUMN blackboard_replies.content    IS '回复内容';
COMMENT ON COLUMN blackboard_replies.author_id  IS '作者用户 ID';

CREATE INDEX IF NOT EXISTS ix_blackboard_replies_deleted_at ON blackboard_replies (deleted_at);
CREATE INDEX IF NOT EXISTS ix_blackboard_replies_post_id    ON blackboard_replies (post_id);

-- ============================================================
-- genes 基因（技能包）
-- ============================================================
CREATE TABLE IF NOT EXISTS genes (
    id                     VARCHAR(36)  PRIMARY KEY,
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at             TIMESTAMPTZ  DEFAULT NULL,
    name                   VARCHAR(128) NOT NULL,
    slug                   VARCHAR(128) NOT NULL,
    description            TEXT,
    short_description      VARCHAR(256),
    category               VARCHAR(32),
    tags                   TEXT,
    source                 VARCHAR(16)  NOT NULL DEFAULT 'official',
    source_ref             VARCHAR(512),
    icon                   VARCHAR(32),
    version                VARCHAR(16)  NOT NULL DEFAULT '1.0.0',
    manifest               TEXT,
    dependencies           TEXT,
    synergies              TEXT,
    parent_gene_id         VARCHAR(36)  REFERENCES genes(id),
    created_by_instance_id VARCHAR(36)  REFERENCES instances(id),
    install_count          INTEGER      NOT NULL DEFAULT 0,
    avg_rating             FLOAT        NOT NULL DEFAULT 0.0,
    effectiveness_score    FLOAT        NOT NULL DEFAULT 0.0,
    is_featured            BOOLEAN      NOT NULL DEFAULT FALSE,
    review_status          VARCHAR(16),
    is_published           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by             VARCHAR(36)  REFERENCES users(id),
    org_id                 VARCHAR(36)  REFERENCES organizations(id),
    visibility             VARCHAR(16)  NOT NULL DEFAULT 'public'
);

COMMENT ON TABLE  genes                        IS '基因（猫咪可学习的技能包）';
COMMENT ON COLUMN genes.id                     IS '主键 UUID';
COMMENT ON COLUMN genes.created_at             IS '创建时间';
COMMENT ON COLUMN genes.updated_at             IS '更新时间';
COMMENT ON COLUMN genes.deleted_at             IS '软删除时间';
COMMENT ON COLUMN genes.name                   IS '基因名称';
COMMENT ON COLUMN genes.slug                   IS '基因唯一标识符';
COMMENT ON COLUMN genes.description            IS '基因详细描述';
COMMENT ON COLUMN genes.short_description      IS '基因简短描述';
COMMENT ON COLUMN genes.category               IS '基因分类';
COMMENT ON COLUMN genes.tags                   IS '标签列表（逗号分隔文本）';
COMMENT ON COLUMN genes.source                 IS '来源（official / community / agent / manual）';
COMMENT ON COLUMN genes.source_ref             IS '来源引用（URL 等）';
COMMENT ON COLUMN genes.icon                   IS '图标标识';
COMMENT ON COLUMN genes.version                IS '当前版本号';
COMMENT ON COLUMN genes.manifest               IS '基因清单（YAML/JSON 文本）';
COMMENT ON COLUMN genes.dependencies           IS '依赖基因列表（slug 逗号分隔）';
COMMENT ON COLUMN genes.synergies              IS '协同基因列表（slug 逗号分隔）';
COMMENT ON COLUMN genes.parent_gene_id         IS '父基因 ID（变体场景）';
COMMENT ON COLUMN genes.created_by_instance_id IS '由哪个实例产生（agent 来源）';
COMMENT ON COLUMN genes.install_count          IS '安装次数';
COMMENT ON COLUMN genes.avg_rating             IS '平均评分';
COMMENT ON COLUMN genes.effectiveness_score    IS '有效性评分（AI 自评）';
COMMENT ON COLUMN genes.is_featured            IS '是否推荐展示';
COMMENT ON COLUMN genes.review_status          IS '审核状态（pending_owner / pending_admin / approved / rejected）';
COMMENT ON COLUMN genes.is_published           IS '是否已发布';
COMMENT ON COLUMN genes.created_by             IS '创建者用户 ID';
COMMENT ON COLUMN genes.org_id                 IS '所属组织 ID（NULL 表示公开）';
COMMENT ON COLUMN genes.visibility             IS '可见性（public / org_private）';

CREATE INDEX       IF NOT EXISTS ix_genes_deleted_at       ON genes (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genes_slug_org_active ON genes (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- genomes 基因组（技能包集合）
-- ============================================================
CREATE TABLE IF NOT EXISTS genomes (
    id                VARCHAR(36)  PRIMARY KEY,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ  DEFAULT NULL,
    name              VARCHAR(128) NOT NULL,
    slug              VARCHAR(128) NOT NULL,
    description       TEXT,
    short_description VARCHAR(256),
    icon              VARCHAR(32),
    gene_slugs        TEXT,
    config_override   TEXT,
    install_count     INTEGER      NOT NULL DEFAULT 0,
    avg_rating        FLOAT        NOT NULL DEFAULT 0.0,
    is_featured       BOOLEAN      NOT NULL DEFAULT FALSE,
    is_published      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by        VARCHAR(36)  REFERENCES users(id),
    org_id            VARCHAR(36)  REFERENCES organizations(id),
    visibility        VARCHAR(16)  NOT NULL DEFAULT 'public'
);

COMMENT ON TABLE  genomes                   IS '基因组（多基因预置组合包）';
COMMENT ON COLUMN genomes.id                IS '主键 UUID';
COMMENT ON COLUMN genomes.created_at        IS '创建时间';
COMMENT ON COLUMN genomes.updated_at        IS '更新时间';
COMMENT ON COLUMN genomes.deleted_at        IS '软删除时间';
COMMENT ON COLUMN genomes.name              IS '基因组名称';
COMMENT ON COLUMN genomes.slug              IS '基因组唯一标识符';
COMMENT ON COLUMN genomes.description       IS '基因组详细描述';
COMMENT ON COLUMN genomes.short_description IS '基因组简短描述';
COMMENT ON COLUMN genomes.icon              IS '图标标识';
COMMENT ON COLUMN genomes.gene_slugs        IS '包含基因 slug 列表（逗号分隔）';
COMMENT ON COLUMN genomes.config_override   IS '各基因配置覆盖（JSON 文本）';
COMMENT ON COLUMN genomes.install_count     IS '安装次数';
COMMENT ON COLUMN genomes.avg_rating        IS '平均评分';
COMMENT ON COLUMN genomes.is_featured       IS '是否推荐展示';
COMMENT ON COLUMN genomes.is_published      IS '是否已发布';
COMMENT ON COLUMN genomes.created_by        IS '创建者用户 ID';
COMMENT ON COLUMN genomes.org_id            IS '所属组织 ID（NULL 表示公开）';
COMMENT ON COLUMN genomes.visibility        IS '可见性（public / org_private）';

CREATE INDEX       IF NOT EXISTS ix_genomes_deleted_at       ON genomes (deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genomes_slug_org_active ON genomes (slug, org_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- instance_genes 实例已安装基因
-- ============================================================
CREATE TABLE IF NOT EXISTS instance_genes (
    id                VARCHAR(36)  PRIMARY KEY,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ  DEFAULT NULL,
    instance_id       VARCHAR(36)  NOT NULL REFERENCES instances(id),
    gene_id           VARCHAR(36)  NOT NULL REFERENCES genes(id),
    genome_id         VARCHAR(36)  REFERENCES genomes(id),
    status            VARCHAR(20)  NOT NULL DEFAULT 'installing',
    installed_version VARCHAR(16),
    learning_output   TEXT,
    config_snapshot   TEXT,
    agent_self_eval   FLOAT,
    usage_count       INTEGER      NOT NULL DEFAULT 0,
    variant_published BOOLEAN      NOT NULL DEFAULT FALSE,
    installed_at      TIMESTAMPTZ
);

COMMENT ON TABLE  instance_genes                  IS '实例已安装/学习的基因';
COMMENT ON COLUMN instance_genes.id               IS '主键 UUID';
COMMENT ON COLUMN instance_genes.created_at       IS '创建时间';
COMMENT ON COLUMN instance_genes.updated_at       IS '更新时间';
COMMENT ON COLUMN instance_genes.deleted_at       IS '软删除时间';
COMMENT ON COLUMN instance_genes.instance_id      IS '实例 ID';
COMMENT ON COLUMN instance_genes.gene_id          IS '基因 ID';
COMMENT ON COLUMN instance_genes.genome_id        IS '来源基因组 ID（可为空）';
COMMENT ON COLUMN instance_genes.status           IS '学习状态（installing / learning / installed / failed 等）';
COMMENT ON COLUMN instance_genes.installed_version IS '已安装的基因版本';
COMMENT ON COLUMN instance_genes.learning_output  IS 'Agent 学习输出内容';
COMMENT ON COLUMN instance_genes.config_snapshot  IS '安装时配置快照';
COMMENT ON COLUMN instance_genes.agent_self_eval  IS 'Agent 自我评估分数';
COMMENT ON COLUMN instance_genes.usage_count      IS '使用次数统计';
COMMENT ON COLUMN instance_genes.variant_published IS '是否已将学习变体发布为新基因';
COMMENT ON COLUMN instance_genes.installed_at     IS '完成安装时间';

CREATE INDEX       IF NOT EXISTS ix_instance_genes_deleted_at   ON instance_genes (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_instance_genes_instance_id  ON instance_genes (instance_id);
CREATE INDEX       IF NOT EXISTS ix_instance_genes_gene_id      ON instance_genes (gene_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_gene_active       ON instance_genes (instance_id, gene_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- gene_effect_logs 基因效果日志
-- ============================================================
CREATE TABLE IF NOT EXISTS gene_effect_logs (
    id          VARCHAR(36) PRIMARY KEY,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ DEFAULT NULL,
    instance_id VARCHAR(36) NOT NULL REFERENCES instances(id),
    gene_id     VARCHAR(36) NOT NULL REFERENCES genes(id),
    metric_type VARCHAR(20) NOT NULL,
    value       FLOAT       NOT NULL DEFAULT 0.0,
    context     TEXT
);

COMMENT ON TABLE  gene_effect_logs             IS '基因效果度量日志';
COMMENT ON COLUMN gene_effect_logs.id          IS '主键 UUID';
COMMENT ON COLUMN gene_effect_logs.created_at  IS '创建时间';
COMMENT ON COLUMN gene_effect_logs.updated_at  IS '更新时间';
COMMENT ON COLUMN gene_effect_logs.deleted_at  IS '软删除时间';
COMMENT ON COLUMN gene_effect_logs.instance_id IS '实例 ID';
COMMENT ON COLUMN gene_effect_logs.gene_id     IS '基因 ID';
COMMENT ON COLUMN gene_effect_logs.metric_type IS '度量类型（user_positive / user_negative / task_success / agent_self_eval）';
COMMENT ON COLUMN gene_effect_logs.value       IS '度量值';
COMMENT ON COLUMN gene_effect_logs.context     IS '上下文说明';

CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_deleted_at   ON gene_effect_logs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_instance_id  ON gene_effect_logs (instance_id);
CREATE INDEX IF NOT EXISTS ix_gene_effect_logs_gene_id      ON gene_effect_logs (gene_id);

-- ============================================================
-- gene_ratings 基因评分
-- ============================================================
CREATE TABLE IF NOT EXISTS gene_ratings (
    id         VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    gene_id    VARCHAR(36) NOT NULL REFERENCES genes(id),
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
    rating     INTEGER     NOT NULL,
    comment    TEXT
);

COMMENT ON TABLE  gene_ratings            IS '用户对基因的评分';
COMMENT ON COLUMN gene_ratings.id         IS '主键 UUID';
COMMENT ON COLUMN gene_ratings.created_at IS '创建时间';
COMMENT ON COLUMN gene_ratings.updated_at IS '更新时间';
COMMENT ON COLUMN gene_ratings.deleted_at IS '软删除时间';
COMMENT ON COLUMN gene_ratings.gene_id    IS '基因 ID';
COMMENT ON COLUMN gene_ratings.user_id    IS '评分用户 ID';
COMMENT ON COLUMN gene_ratings.rating     IS '评分（1-5）';
COMMENT ON COLUMN gene_ratings.comment    IS '评价内容';

CREATE INDEX       IF NOT EXISTS ix_gene_ratings_deleted_at ON gene_ratings (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_gene_ratings_gene_id    ON gene_ratings (gene_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gene_rating_user       ON gene_ratings (gene_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- genome_ratings 基因组评分
-- ============================================================
CREATE TABLE IF NOT EXISTS genome_ratings (
    id         VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    genome_id  VARCHAR(36) NOT NULL REFERENCES genomes(id),
    user_id    VARCHAR(36) NOT NULL REFERENCES users(id),
    rating     INTEGER     NOT NULL,
    comment    TEXT
);

COMMENT ON TABLE  genome_ratings              IS '用户对基因组的评分';
COMMENT ON COLUMN genome_ratings.id           IS '主键 UUID';
COMMENT ON COLUMN genome_ratings.created_at   IS '创建时间';
COMMENT ON COLUMN genome_ratings.updated_at   IS '更新时间';
COMMENT ON COLUMN genome_ratings.deleted_at   IS '软删除时间';
COMMENT ON COLUMN genome_ratings.genome_id    IS '基因组 ID';
COMMENT ON COLUMN genome_ratings.user_id      IS '评分用户 ID';
COMMENT ON COLUMN genome_ratings.rating       IS '评分（1-5）';
COMMENT ON COLUMN genome_ratings.comment      IS '评价内容';

CREATE INDEX       IF NOT EXISTS ix_genome_ratings_deleted_at ON genome_ratings (deleted_at);
CREATE INDEX       IF NOT EXISTS ix_genome_ratings_genome_id  ON genome_ratings (genome_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_genome_rating_user       ON genome_ratings (genome_id, user_id)
    WHERE deleted_at IS NULL;

-- ============================================================
-- evolution_events 基因进化事件
-- ============================================================
CREATE TABLE IF NOT EXISTS evolution_events (
    id          VARCHAR(36)  PRIMARY KEY,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ  DEFAULT NULL,
    instance_id VARCHAR(36)  NOT NULL REFERENCES instances(id),
    gene_id     VARCHAR(36),
    genome_id   VARCHAR(36),
    event_type  VARCHAR(32)  NOT NULL,
    gene_name   VARCHAR(128) NOT NULL,
    gene_slug   VARCHAR(128),
    details     TEXT
);

COMMENT ON TABLE  evolution_events             IS '猫咪基因进化事件记录';
COMMENT ON COLUMN evolution_events.id          IS '主键 UUID';
COMMENT ON COLUMN evolution_events.created_at  IS '创建时间';
COMMENT ON COLUMN evolution_events.updated_at  IS '更新时间';
COMMENT ON COLUMN evolution_events.deleted_at  IS '软删除时间';
COMMENT ON COLUMN evolution_events.instance_id IS '实例 ID';
COMMENT ON COLUMN evolution_events.gene_id     IS '相关基因 ID';
COMMENT ON COLUMN evolution_events.genome_id   IS '相关基因组 ID';
COMMENT ON COLUMN evolution_events.event_type  IS '事件类型（learned / forgotten / simplified / variant_published 等）';
COMMENT ON COLUMN evolution_events.gene_name   IS '基因名称快照';
COMMENT ON COLUMN evolution_events.gene_slug   IS '基因 slug 快照';
COMMENT ON COLUMN evolution_events.details     IS '事件详情';

CREATE INDEX IF NOT EXISTS ix_evolution_events_deleted_at   ON evolution_events (deleted_at);
CREATE INDEX IF NOT EXISTS ix_evolution_events_instance_id  ON evolution_events (instance_id);
CREATE INDEX IF NOT EXISTS ix_evolution_events_gene_id      ON evolution_events (gene_id);
CREATE INDEX IF NOT EXISTS ix_evolution_events_event_type   ON evolution_events (event_type);

-- ============================================================
-- org_llm_keys 组织 LLM API Key
-- ============================================================
CREATE TABLE IF NOT EXISTS org_llm_keys (
    id                 VARCHAR(36)  PRIMARY KEY,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at         TIMESTAMPTZ  DEFAULT NULL,
    org_id             VARCHAR(36)  NOT NULL,
    provider           VARCHAR(32)  NOT NULL,
    display_name       VARCHAR(128) NOT NULL DEFAULT '',
    api_key            TEXT         NOT NULL,
    base_url           VARCHAR(512),
    org_token_limit    BIGINT,
    system_token_limit BIGINT,
    is_active          BOOLEAN      NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE  org_llm_keys                    IS '组织 LLM 模型 API Key 配置';
COMMENT ON COLUMN org_llm_keys.id                 IS '主键 UUID';
COMMENT ON COLUMN org_llm_keys.created_at         IS '创建时间';
COMMENT ON COLUMN org_llm_keys.updated_at         IS '更新时间';
COMMENT ON COLUMN org_llm_keys.deleted_at         IS '软删除时间';
COMMENT ON COLUMN org_llm_keys.org_id             IS '所属组织 ID';
COMMENT ON COLUMN org_llm_keys.provider           IS 'LLM 提供商（openai / anthropic / zhipu 等）';
COMMENT ON COLUMN org_llm_keys.display_name       IS '显示名称';
COMMENT ON COLUMN org_llm_keys.api_key            IS 'API Key（加密存储）';
COMMENT ON COLUMN org_llm_keys.base_url           IS '自定义 API Base URL';
COMMENT ON COLUMN org_llm_keys.org_token_limit    IS '组织总 Token 用量上限';
COMMENT ON COLUMN org_llm_keys.system_token_limit IS '系统级 Token 用量上限';
COMMENT ON COLUMN org_llm_keys.is_active          IS '是否启用';

CREATE INDEX IF NOT EXISTS ix_org_llm_keys_deleted_at ON org_llm_keys (deleted_at);
CREATE INDEX IF NOT EXISTS ix_org_llm_keys_org_id     ON org_llm_keys (org_id);

-- ============================================================
-- user_llm_keys 用户个人 LLM API Key
-- ============================================================
CREATE TABLE IF NOT EXISTS user_llm_keys (
    id         VARCHAR(36)  PRIMARY KEY,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ  DEFAULT NULL,
    user_id    VARCHAR(36)  NOT NULL,
    provider   VARCHAR(32)  NOT NULL,
    api_key    TEXT         NOT NULL,
    base_url   VARCHAR(512)
);

COMMENT ON TABLE  user_llm_keys            IS '用户个人 LLM API Key';
COMMENT ON COLUMN user_llm_keys.id         IS '主键 UUID';
COMMENT ON COLUMN user_llm_keys.created_at IS '创建时间';
COMMENT ON COLUMN user_llm_keys.updated_at IS '更新时间';
COMMENT ON COLUMN user_llm_keys.deleted_at IS '软删除时间';
COMMENT ON COLUMN user_llm_keys.user_id    IS '用户 ID';
COMMENT ON COLUMN user_llm_keys.provider   IS 'LLM 提供商';
COMMENT ON COLUMN user_llm_keys.api_key    IS 'API Key（加密存储）';
COMMENT ON COLUMN user_llm_keys.base_url   IS '自定义 API Base URL';

CREATE INDEX IF NOT EXISTS ix_user_llm_keys_deleted_at ON user_llm_keys (deleted_at);
CREATE INDEX IF NOT EXISTS ix_user_llm_keys_user_id    ON user_llm_keys (user_id);

-- ============================================================
-- user_llm_configs 用户 LLM 使用配置
-- ============================================================
CREATE TABLE IF NOT EXISTS user_llm_configs (
    id         VARCHAR(36) PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    user_id    VARCHAR(36) NOT NULL,
    org_id     VARCHAR(36) NOT NULL,
    provider   VARCHAR(32) NOT NULL,
    key_source VARCHAR(16) NOT NULL DEFAULT 'personal'
);

COMMENT ON TABLE  user_llm_configs            IS '用户 LLM 使用偏好配置';
COMMENT ON COLUMN user_llm_configs.id         IS '主键 UUID';
COMMENT ON COLUMN user_llm_configs.created_at IS '创建时间';
COMMENT ON COLUMN user_llm_configs.updated_at IS '更新时间';
COMMENT ON COLUMN user_llm_configs.deleted_at IS '软删除时间';
COMMENT ON COLUMN user_llm_configs.user_id    IS '用户 ID';
COMMENT ON COLUMN user_llm_configs.org_id     IS '所属组织 ID';
COMMENT ON COLUMN user_llm_configs.provider   IS 'LLM 提供商';
COMMENT ON COLUMN user_llm_configs.key_source IS 'Key 来源（personal / org）';

CREATE INDEX IF NOT EXISTS ix_user_llm_configs_deleted_at ON user_llm_configs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_user_llm_configs_user_id    ON user_llm_configs (user_id);

-- ============================================================
-- llm_usage_logs LLM 调用日志
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id                VARCHAR(36)  PRIMARY KEY,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ  DEFAULT NULL,
    org_llm_key_id    VARCHAR(36),
    user_id           VARCHAR(36),
    instance_id       VARCHAR(36),
    org_id            VARCHAR(36),
    provider          VARCHAR(32),
    model             VARCHAR(128),
    prompt_tokens     INTEGER      NOT NULL DEFAULT 0,
    completion_tokens INTEGER      NOT NULL DEFAULT 0,
    total_tokens      INTEGER      NOT NULL DEFAULT 0,
    key_source        VARCHAR(16),
    request_path      VARCHAR(256),
    is_stream         BOOLEAN      NOT NULL DEFAULT FALSE,
    status_code       INTEGER,
    latency_ms        INTEGER,
    error_message     VARCHAR(512),
    request_body      TEXT,
    response_body     TEXT
);

COMMENT ON TABLE  llm_usage_logs                   IS 'LLM API 调用明细日志';
COMMENT ON COLUMN llm_usage_logs.id                IS '主键 UUID';
COMMENT ON COLUMN llm_usage_logs.created_at        IS '创建时间';
COMMENT ON COLUMN llm_usage_logs.updated_at        IS '更新时间';
COMMENT ON COLUMN llm_usage_logs.deleted_at        IS '软删除时间';
COMMENT ON COLUMN llm_usage_logs.org_llm_key_id    IS '使用的组织 Key ID';
COMMENT ON COLUMN llm_usage_logs.user_id           IS '发起调用的用户 ID';
COMMENT ON COLUMN llm_usage_logs.instance_id       IS '发起调用的实例 ID';
COMMENT ON COLUMN llm_usage_logs.org_id            IS '所属组织 ID';
COMMENT ON COLUMN llm_usage_logs.provider          IS 'LLM 提供商';
COMMENT ON COLUMN llm_usage_logs.model             IS '使用的模型名称';
COMMENT ON COLUMN llm_usage_logs.prompt_tokens     IS 'Prompt Token 数';
COMMENT ON COLUMN llm_usage_logs.completion_tokens  IS 'Completion Token 数';
COMMENT ON COLUMN llm_usage_logs.total_tokens      IS '总 Token 数';
COMMENT ON COLUMN llm_usage_logs.key_source        IS 'Key 来源（personal / org）';
COMMENT ON COLUMN llm_usage_logs.request_path      IS '请求路径';
COMMENT ON COLUMN llm_usage_logs.is_stream         IS '是否流式请求';
COMMENT ON COLUMN llm_usage_logs.status_code       IS 'HTTP 响应状态码';
COMMENT ON COLUMN llm_usage_logs.latency_ms        IS '请求耗时（毫秒）';
COMMENT ON COLUMN llm_usage_logs.error_message     IS '错误信息';
COMMENT ON COLUMN llm_usage_logs.request_body      IS '请求体（可选记录）';
COMMENT ON COLUMN llm_usage_logs.response_body     IS '响应体（可选记录）';

CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_deleted_at   ON llm_usage_logs (deleted_at);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_user_id      ON llm_usage_logs (user_id);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_instance_id  ON llm_usage_logs (instance_id);
CREATE INDEX IF NOT EXISTS ix_llm_usage_logs_org_id       ON llm_usage_logs (org_id);

-- ============================================================
-- 初始超级管理员账号
--
-- 用户名：admin
-- 密码：Admin@nekoclaw1（首次登录后请立即修改）
-- 加密算法：PBKDF2-HMAC-SHA256，10 万次迭代，格式：{salt}${hex(dk)}
-- ============================================================
INSERT INTO users (
    id,
    created_at,
    updated_at,
    name,
    username,
    password_hash,
    role,
    is_super_admin,
    must_change_password,
    is_active
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    NOW(),
    NOW(),
    'admin',
    'admin',
    'nekoclaw_admin_salt_fixed$3abc49c68de0d026cf62436349bb016daa74bd3d08584c0f4bbeb7b56e07314f',
    'admin',
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT DO NOTHING;
