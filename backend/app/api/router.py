from fastapi import APIRouter

from app.api import auth, sessions, ws, llm_configs, memory, scheduled_tasks, knowledge, skills

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(sessions.router)
api_router.include_router(ws.router)
api_router.include_router(llm_configs.router)
api_router.include_router(memory.router)
api_router.include_router(scheduled_tasks.router)
api_router.include_router(knowledge.router)
api_router.include_router(skills.router)
