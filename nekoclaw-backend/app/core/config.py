import logging
import re
import socket

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "NekoClaw"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    LOG_SQL: bool = False

    DATABASE_URL: str = ""
    DATABASE_NAME_SUFFIX: str = ""

    @model_validator(mode="after")
    def _resolve_database_url(self) -> "Settings":
        if not self.DATABASE_NAME_SUFFIX:
            return self
        suffix = self.DATABASE_NAME_SUFFIX
        if suffix == "auto":
            raw = socket.gethostname()
            suffix = re.sub(r"[^a-z0-9]", "_", raw.lower()).strip("_")
            suffix = re.sub(r"_local$", "", suffix)
            suffix = re.sub(r"_+", "_", suffix)
            suffix = suffix[:40]
        base_url, sep, db_name = self.DATABASE_URL.rpartition("/")
        if sep:
            self.DATABASE_URL = f"{base_url}/{db_name}_{suffix}"
        return self

    _INSECURE_DEFAULTS = frozenset({
        "change-me-in-production",
        "change-me-32-bytes-base64-key__=",
    })

    @model_validator(mode="after")
    def _check_insecure_defaults(self) -> "Settings":
        if self.DEBUG:
            return self
        issues: list[str] = []
        if self.JWT_SECRET in self._INSECURE_DEFAULTS:
            issues.append("JWT_SECRET")
        if self.ENCRYPTION_KEY in self._INSECURE_DEFAULTS:
            issues.append("ENCRYPTION_KEY")
        if issues:
            msg = (
                f"{', '.join(issues)} 仍为默认值，生产环境存在严重安全风险。"
                " 请在 .env 中设置安全的随机值。"
            )
            raise ValueError(msg)
        return self

    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 24

    LOGIN_EMAIL_WHITELIST: str = ""

    INIT_ADMIN_ACCOUNT: str = "admin"
    RESET_ADMIN_PASSWORD: bool = False

    INIT_EE_ADMIN_ACCOUNT: str = "nekoclaw-admin"
    RESET_EE_ADMIN_PASSWORD: bool = False

    ENCRYPTION_KEY: str = "change-me-32-bytes-base64-key__="

    FEISHU_APP_ID: str = ""
    FEISHU_APP_SECRET: str = ""
    FEISHU_REDIRECT_URI: str = ""

    FEISHU_APP_ID_PORTAL: str = ""
    FEISHU_APP_SECRET_PORTAL: str = ""

    PORTAL_BASE_URL: str = ""

    LLM_PROXY_URL: str = ""
    LLM_PROXY_INTERNAL_URL: str = ""

    AGENT_API_BASE_URL: str = "http://localhost:8000/api/v1"

    TUNNEL_BASE_URL: str = ""

    HTTPS_PROXY: str = ""

    EGRESS_DENY_CIDRS: str = "10.0.0.0/8,172.16.0.0/12,192.168.0.0/16"
    EGRESS_ALLOW_PORTS: str = "80,443"

    CORS_ORIGINS: list[str] = ["http://localhost:4517", "http://localhost:4518"]


settings = Settings()
