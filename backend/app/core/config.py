from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    LLM_API_KEY_ENCRYPTION_KEY: str
    TAVILY_API_KEY: str = ""
    MEMORY_FILES_DIR: str = "./data/memory"
    SKILLS_FILES_DIR: str = "./data/skills"
    # Embedding 默认配置（可通过 .env 覆盖）
    EMBEDDING_BASE_URL: str = ""
    EMBEDDING_MODEL: str = ""
    EMBEDDING_API_KEY: str = ""
    # Milvus 向量数据库
    MILVUS_URI: str = ""
    MILVUS_COLLECTION: str = "memory_vectors"
    # 初始管理员账号（首次启动时自动创建，已存在则跳过）
    ADMIN_USERNAME: str = ""
    ADMIN_PASSWORD: str = ""
    # 每日配额重置配置
    QUOTA_TIMEZONE: str = "Asia/Shanghai"
    DAILY_MESSAGE_RESET_LIMIT: int = 100
    DAILY_CREATION_RESET_LIMIT: int = 50
    # 桌面 Electron 应用从 file:// 加载时 Origin 为 null，使用 * 放行所有来源
    # 生产环境可在 .env 中设置为具体域名，如 https://yourdomain.com
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        raw = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return raw if raw else ["*"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
