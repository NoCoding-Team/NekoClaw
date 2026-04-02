from fastapi import APIRouter

from app.core.config import settings
from app.core.feature_gate import feature_gate

api_router = APIRouter()


@api_router.get("/health", tags=["system"])
async def health_check():
    return {"status": "ok"}


@api_router.get("/system/info", tags=["system"])
async def system_info():
    return {
        "edition": feature_gate.edition,
        "version": settings.APP_VERSION,
        "features": feature_gate.all_features(),
    }


admin_router = APIRouter()
