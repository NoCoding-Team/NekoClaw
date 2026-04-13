from pydantic_settings import BaseSettings
from typing import list


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    LLM_API_KEY_ENCRYPTION_KEY: str
    TAVILY_API_KEY: str = ""
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
