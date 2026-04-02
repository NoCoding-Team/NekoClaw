from fastapi import APIRouter, WebSocket

from app.services.tunnel.adapter import tunnel_adapter

router = APIRouter(tags=["tunnel"])


@router.websocket("/tunnel/ws")
async def tunnel_websocket(ws: WebSocket):
    await tunnel_adapter.handle_websocket(ws)


@router.get("/tunnel/stats")
async def tunnel_stats():
    return {"code": 0, "data": tunnel_adapter.get_stats()}
