from fastapi import APIRouter

from app.api import auth, sessions, ws, llm_configs, skills, memory

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(ws.router)
api_router.include_router(llm_configs.admin_router)
api_router.include_router(llm_configs.public_router)
api_router.include_router(skills.router)
api_router.include_router(memory.router)
