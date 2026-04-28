from contextlib import asynccontextmanager
import logging
import os
import time
import collections
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app.core.config import settings
from app.api.router import api_router
from app.startup import on_startup

# Configure root logger so module-level logger.info() calls are visible
# force=True ensures this works even after uvicorn has configured logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s - %(message)s", force=True)
# Also ensure our app loggers are at INFO level
logging.getLogger("app").setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await on_startup()
    yield


app = FastAPI(title="NekoClaw", version="0.1.0", lifespan=lifespan)

# Simple in-memory rate limiter: max 60 requests/minute per IP
_rate_buckets: dict[str, collections.deque] = {}
_RATE_LIMIT = 60
_RATE_WINDOW = 60.0


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    bucket = _rate_buckets.setdefault(ip, collections.deque())
    while bucket and now - bucket[0] > _RATE_WINDOW:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT:
        return JSONResponse(status_code=429, content={"detail": "Too Many Requests"})
    bucket.append(now)
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=False,   # 使用 JWT Bearer Token，不依赖 Cookie，无需 credentials
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")

# Mount admin SPA (built output from admin/dist/)
_admin_dir = os.path.join(os.path.dirname(__file__), "..", "static", "admin")
_admin_index = os.path.join(_admin_dir, "index.html")


@app.get("/admin", include_in_schema=False)
@app.get("/admin/{full_path:path}", include_in_schema=False)
async def admin_spa_fallback(full_path: str = ""):
    """Serve admin SPA: return actual static file if exists, otherwise return index.html."""
    if not os.path.isfile(_admin_index):
        return JSONResponse(status_code=503, content={"detail": "Admin panel not deployed. Please build admin/dist first."})
    # Try to serve a real static asset (js/css/images etc.)
    if full_path:
        file_path = os.path.join(_admin_dir, full_path)
        # Prevent path traversal
        real_file = os.path.realpath(file_path)
        real_admin = os.path.realpath(_admin_dir)
        if real_file.startswith(real_admin) and os.path.isfile(real_file):
            return FileResponse(real_file)
    # All other paths → SPA entry point
    return FileResponse(_admin_index)


@app.get("/", include_in_schema=False)
async def health():
    return {"status": "ok"}
