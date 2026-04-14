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
    # 桌面 Electron 应用从 file:// 加载时 Origin 为 null，使用 * 放行所有来源
    # 生产环境可在 .env 中设置为具体域名，如 https://yourdomain.com
    CORS_ORIGINS: str = "*"

    @property
    def cors_origins_list(self) -> List[str]:
        raw = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        return raw if raw else ["*"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
