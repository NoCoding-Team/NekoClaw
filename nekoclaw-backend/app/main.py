import asyncio
import logging
import os
import sys
from contextlib import asynccontextmanager
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import admin_router, api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers

_LOG_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(_LOG_DIR, exist_ok=True)

_log_formatter = logging.Formatter(
    "%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


class _ColorFormatter(logging.Formatter):
    _COLORS = {
        logging.DEBUG: "\033[37m",
        logging.INFO: "\033[32m",
        logging.WARNING: "\033[33m",
        logging.ERROR: "\033[31m",
        logging.CRITICAL: "\033[1;31m",
    }
    _RESET = "\033[0m"

    def __init__(self):
        super().__init__(
            "%(asctime)s %(colored_level)s [%(name)s] %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )

    def format(self, record):
        color = self._COLORS.get(record.levelno, "")
        record.colored_level = f"{color}%(levelname)-5s{self._RESET}" % {"levelname": record.levelname}
        return super().format(record)


_file_handler = RotatingFileHandler(
    os.path.join(_LOG_DIR, "nekoclaw.log"),
    maxBytes=10 * 1024 * 1024,
    backupCount=5,
    encoding="utf-8",
)
_file_handler.setFormatter(_log_formatter)
_file_handler.setLevel(logging.INFO)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_ColorFormatter())
_console_handler.setLevel(logging.INFO)

_root_logger = logging.getLogger()
_root_logger.setLevel(logging.INFO)
_root_logger.addHandler(_file_handler)
_root_logger.addHandler(_console_handler)

logging.getLogger("sqlalchemy.engine").setLevel(
    logging.INFO if settings.LOG_SQL else logging.WARNING
)


class _PoolDisconnectFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if record.exc_info and record.exc_info[1]:
            if isinstance(record.exc_info[1], asyncio.CancelledError):
                record.levelno = logging.WARNING
                record.levelname = "WARNING"
                record.msg = "Client disconnect interrupted connection cleanup (CancelledError)"
                record.args = None
                record.exc_info = None
                record.exc_text = None
                return True
        msg = record.getMessage()
        if "garbage collector" in msg and record.levelno >= logging.ERROR:
            record.levelno = logging.WARNING
            record.levelname = "WARNING"
            return True
        return True


logging.getLogger("sqlalchemy.pool").addFilter(_PoolDisconnectFilter())

import warnings  # noqa: E402
from sqlalchemy.exc import SAWarning  # noqa: E402

warnings.filterwarnings(
    "ignore",
    message=r".*garbage collector.*non-checked-in connection.*",
    category=SAWarning,
)

for _uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    _uv_logger = logging.getLogger(_uv_name)
    _uv_logger.handlers.clear()
    _uv_logger.propagate = True


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging

    from app.core.deps import async_session_factory, engine
    from app.core.feature_gate import feature_gate as _fg

    logger = logging.getLogger(__name__)

    if _fg.is_ee:
        _proj_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
        if _proj_root not in sys.path:
            sys.path.insert(0, _proj_root)
        try:
            import ee.backend.models  # noqa: F401
            logger.info("EE Models 已注册")
        except ImportError:
            pass

    if settings.DATABASE_NAME_SUFFIX:
        import asyncpg
        from urllib.parse import urlparse, urlunparse

        parsed = urlparse(settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1))
        target_db = parsed.path.lstrip("/")
        admin_url = urlunparse(parsed._replace(path="/postgres"))
        _auto_conn = await asyncpg.connect(admin_url)
        try:
            exists = await _auto_conn.fetchval(
                "SELECT 1 FROM pg_database WHERE datname = $1", target_db
            )
            if not exists:
                await _auto_conn.execute(f'CREATE DATABASE "{target_db}"')
                logger.info("自动创建开发数据库: %s", target_db)
            else:
                logger.info("开发数据库已存在: %s", target_db)
        finally:
            await _auto_conn.close()

        _target_url = urlunparse(parsed._replace(path=f"/{target_db}"))
        _target_conn = await asyncpg.connect(_target_url)
        try:
            await _target_conn.execute(
                "CREATE SCHEMA IF NOT EXISTS nekoclaw AUTHORIZATION current_user"
            )
            await _target_conn.execute(
                f'ALTER DATABASE "{target_db}" SET search_path TO nekoclaw, public'
            )
            await _target_conn.execute("SET search_path TO nekoclaw, public")
            logger.info("开发数据库 schema 已就绪: nekoclaw")
        finally:
            await _target_conn.close()

    async def _auto_migrate():
        import sys
        import concurrent.futures

        backend_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

        def _run_in_new_loop():
            import asyncio as _asyncio
            from alembic.config import Config
            from alembic import command

            cfg = Config(os.path.join(backend_root, "alembic.ini"))
            cfg.set_main_option("script_location", os.path.join(backend_root, "alembic"))

            loop = _asyncio.new_event_loop()
            _asyncio.set_event_loop(loop)
            try:
                command.upgrade(cfg, "head")
            finally:
                loop.close()

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            await asyncio.get_event_loop().run_in_executor(pool, _run_in_new_loop)

    if os.environ.get("SKIP_AUTO_MIGRATE") == "1":
        logger.info("SKIP_AUTO_MIGRATE=1，跳过自动迁移")
    else:
        try:
            logger.info("正在执行数据库迁移 (alembic upgrade head) ...")
            await _auto_migrate()
            logger.info("数据库迁移完成")
        except Exception:
            logger.exception("数据库迁移失败，应用无法启动")
            import traceback
            print("=== 数据库迁移失败 ===", flush=True)
            traceback.print_exc()
            raise

    from app.core.deps import async_session_factory as _sf
    from app.startup.seed import seed_admin
    async with _sf() as _seed_db:
        await seed_admin(_seed_db)

    logger.info(
        "NekoClaw 后端已启动 (edition=%s, version=%s)",
        _fg.edition,
        settings.APP_VERSION,
    )

    yield

    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1/admin")
