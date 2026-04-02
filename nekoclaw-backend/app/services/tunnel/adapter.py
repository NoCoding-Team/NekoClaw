import asyncio
import logging
import time
import uuid
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from app.services.tunnel.protocol import TunnelMessage, TunnelMessageType

logger = logging.getLogger(__name__)

AUTH_TIMEOUT_S = 10
PING_INTERVAL_S = 30
PING_TIMEOUT_S = 45


class _InstanceConnection:
    __slots__ = (
        "ws", "instance_id", "connected_at", "last_pong",
        "msg_count_in", "msg_count_out",
        "_pending_responses", "_stream_queues",
    )

    def __init__(self, ws: WebSocket, instance_id: str) -> None:
        self.ws = ws
        self.instance_id = instance_id
        self.connected_at = time.monotonic()
        self.last_pong = time.monotonic()
        self.msg_count_in = 0
        self.msg_count_out = 0
        self._pending_responses: dict[str, asyncio.Future[TunnelMessage]] = {}
        self._stream_queues: dict[str, asyncio.Queue[TunnelMessage]] = {}

    def create_response_future(self, request_id: str) -> asyncio.Future[TunnelMessage]:
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[TunnelMessage] = loop.create_future()
        self._pending_responses[request_id] = fut
        return fut

    def register_stream(self, request_id: str) -> asyncio.Queue[TunnelMessage]:
        q: asyncio.Queue[TunnelMessage] = asyncio.Queue()
        self._stream_queues[request_id] = q
        return q

    def resolve_response(self, reply_to: str, msg: TunnelMessage) -> None:
        fut = self._pending_responses.pop(reply_to, None)
        if fut and not fut.done():
            fut.set_result(msg)
            return
        q = self._stream_queues.get(reply_to)
        if q:
            q.put_nowait(msg)
            if msg.type in (TunnelMessageType.CHAT_RESPONSE_DONE, TunnelMessageType.CHAT_RESPONSE_ERROR):
                self._stream_queues.pop(reply_to, None)

    def cancel_all(self) -> None:
        for fut in self._pending_responses.values():
            if not fut.done():
                fut.cancel()
        self._pending_responses.clear()
        self._stream_queues.clear()


class TunnelAdapter:
    def __init__(self) -> None:
        self._connections: dict[str, _InstanceConnection] = {}
        self._ping_tasks: dict[str, asyncio.Task] = {}
        self._stats = {"total_connections": 0, "total_messages_in": 0, "total_messages_out": 0}

    @property
    def connected_instances(self) -> set[str]:
        return set(self._connections.keys())

    async def handle_websocket(self, ws: WebSocket) -> None:
        await ws.accept()
        try:
            raw = await asyncio.wait_for(ws.receive_json(), timeout=AUTH_TIMEOUT_S)
        except (asyncio.TimeoutError, WebSocketDisconnect, Exception):
            try:
                await ws.close(code=4001, reason="auth_timeout")
            except Exception:
                pass
            return

        auth_msg = TunnelMessage.from_dict(raw)
        if auth_msg.type != TunnelMessageType.AUTH:
            await self._send(ws, TunnelMessage(type=TunnelMessageType.AUTH_ERROR, payload={"reason": "expected_auth_message"}))
            await ws.close(code=4002, reason="expected_auth")
            return

        instance_id = auth_msg.payload.get("instance_id", "")
        token = auth_msg.payload.get("token", "")
        if not instance_id or not token:
            await self._send(ws, TunnelMessage(type=TunnelMessageType.AUTH_ERROR, payload={"reason": "missing_credentials"}))
            await ws.close(code=4003, reason="missing_credentials")
            return

        if not await self._verify_token(instance_id, token):
            await self._send(ws, TunnelMessage(type=TunnelMessageType.AUTH_ERROR, payload={"reason": "invalid_token"}))
            await ws.close(code=4004, reason="invalid_token")
            return

        old_conn = self._connections.get(instance_id)
        if old_conn:
            old_conn.cancel_all()
            try:
                await old_conn.ws.close(code=4010, reason="replaced")
            except Exception:
                pass
            self._cleanup_instance(instance_id)

        conn = _InstanceConnection(ws, instance_id)
        self._connections[instance_id] = conn
        self._stats["total_connections"] += 1

        await self._send(ws, TunnelMessage(type=TunnelMessageType.AUTH_OK))
        logger.info("Tunnel: instance %s connected", instance_id)

        ping_task = asyncio.create_task(self._ping_loop(instance_id))
        self._ping_tasks[instance_id] = ping_task

        try:
            await self._message_loop(conn)
        except WebSocketDisconnect:
            logger.info("Tunnel: instance %s disconnected", instance_id)
        except Exception as e:
            logger.error("Tunnel: error in message loop for %s: %s", instance_id, e)
        finally:
            self._cleanup_instance(instance_id)

    async def _verify_token(self, instance_id: str, token: str) -> bool:
        from app.core.deps import async_session_factory
        from app.models.instance import Instance
        from app.models.base import not_deleted
        from sqlalchemy import select

        async with async_session_factory() as db:
            inst = (await db.execute(
                select(Instance).where(
                    Instance.id == instance_id,
                    Instance.proxy_token == token,
                    not_deleted(Instance),
                )
            )).scalar_one_or_none()
            return inst is not None

    async def _message_loop(self, conn: _InstanceConnection) -> None:
        while True:
            raw = await conn.ws.receive_json()
            msg = TunnelMessage.from_dict(raw)
            conn.msg_count_in += 1
            self._stats["total_messages_in"] += 1

            if msg.type == TunnelMessageType.PONG:
                conn.last_pong = time.monotonic()
            elif msg.type == TunnelMessageType.COLLABORATION_MESSAGE:
                asyncio.create_task(self._on_collaboration_message(conn.instance_id, msg))
            elif msg.type in (
                TunnelMessageType.CHAT_RESPONSE_CHUNK,
                TunnelMessageType.CHAT_RESPONSE_DONE,
                TunnelMessageType.CHAT_RESPONSE_ERROR,
            ):
                if msg.reply_to:
                    conn.resolve_response(msg.reply_to, msg)
            elif msg.type == TunnelMessageType.STATUS_REPORT:
                logger.info("Tunnel: status from %s: %s", conn.instance_id, msg.payload)

    async def _on_collaboration_message(self, instance_id: str, msg: TunnelMessage) -> None:
        logger.debug("Collaboration message from %s: %s", instance_id, msg.payload)

    async def _ping_loop(self, instance_id: str) -> None:
        conn = self._connections.get(instance_id)
        if not conn:
            return
        while instance_id in self._connections:
            await asyncio.sleep(PING_INTERVAL_S)
            conn = self._connections.get(instance_id)
            if not conn:
                return
            if time.monotonic() - conn.last_pong > PING_TIMEOUT_S:
                logger.warning("Tunnel: ping timeout for %s", instance_id)
                try:
                    await conn.ws.close(code=4005, reason="ping_timeout")
                except Exception:
                    pass
                return
            try:
                await self._send(conn.ws, TunnelMessage(type=TunnelMessageType.PING))
            except Exception:
                return

    async def _send(self, ws: WebSocket, msg: TunnelMessage) -> None:
        await ws.send_json(msg.to_dict())
        self._stats["total_messages_out"] += 1

    def _cleanup_instance(self, instance_id: str) -> None:
        conn = self._connections.pop(instance_id, None)
        if conn:
            conn.cancel_all()
        task = self._ping_tasks.pop(instance_id, None)
        if task and not task.done():
            task.cancel()

    async def send_chat_request(
        self, instance_id: str, messages: list[dict], *,
        workspace_id: str = "", trace_id: str = "", stream: bool = True,
    ) -> asyncio.Queue[TunnelMessage]:
        conn = self._connections.get(instance_id)
        if not conn:
            raise ConnectionError(f"Instance {instance_id} not connected")

        request_id = str(uuid.uuid4())
        payload: dict[str, Any] = {
            "messages": messages, "stream": stream, "workspace_id": workspace_id,
        }
        msg = TunnelMessage(
            id=request_id, type=TunnelMessageType.CHAT_REQUEST,
            trace_id=trace_id, payload=payload,
        )
        await self._send(conn.ws, msg)
        return conn.register_stream(request_id)

    async def send_learning_task(
        self, instance_id: str, task_id: str, gene_slug: str, mode: str = "learn",
    ) -> None:
        conn = self._connections.get(instance_id)
        if not conn:
            raise ConnectionError(f"Instance {instance_id} not connected")

        msg = TunnelMessage(
            type=TunnelMessageType.LEARNING_TASK,
            payload={"task_id": task_id, "gene_slug": gene_slug, "mode": mode},
        )
        await self._send(conn.ws, msg)

    def get_stats(self) -> dict:
        return {
            **self._stats,
            "active_connections": len(self._connections),
            "connected_instances": list(self._connections.keys()),
        }


tunnel_adapter = TunnelAdapter()
