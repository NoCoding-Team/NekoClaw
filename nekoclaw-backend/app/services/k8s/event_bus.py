import asyncio
import logging
from collections import defaultdict
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class SSEEvent:
    event: str
    data: dict

    def format(self) -> str:
        import json
        lines = [f"event: {self.event}", f"data: {json.dumps(self.data, ensure_ascii=False)}", ""]
        return "\n".join(lines) + "\n"


class EventBus:
    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

    async def publish(self, event_type: str, data: dict) -> None:
        queues = self._subscribers.get(event_type, [])
        event = SSEEvent(event=event_type, data=data)
        for q in queues:
            if q.qsize() < 100:
                await q.put(event)

    async def subscribe(self, *event_types: str):
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue(maxsize=100)
        for et in event_types:
            self._subscribers[et].append(queue)
        try:
            while True:
                event = await queue.get()
                yield event
        finally:
            for et in event_types:
                try:
                    self._subscribers[et].remove(queue)
                except ValueError:
                    pass


event_bus = EventBus()
