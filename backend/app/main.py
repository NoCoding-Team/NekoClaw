from contextlib import asynccontextmanager
import logging
import time
import collections
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.router import api_router
from app.startup import on_startup

# Configure root logger so module-level logger.info() calls are visible
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(name)s - %(message)s")


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


@app.get("/", include_in_schema=False)
async def health():
    return {"status": "ok"}
