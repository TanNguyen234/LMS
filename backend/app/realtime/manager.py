"""In-process thread-safe ASGI WebSocket connection hub for notifications, courses, and meetings."""
import asyncio
from dataclasses import dataclass, field
import logging
import threading
from typing import Any, Dict, Iterable, List, Optional
import uuid

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ConnectionInfo:
    connection_id: str
    websocket: WebSocket
    user_id: uuid.UUID
    user_name: str
    user_role: str
    channel_type: str  # "user" | "course" | "meeting"
    channel_id: uuid.UUID
    hand_raised: bool = False
    media_state: Dict[str, bool] = field(
        default_factory=lambda: {"audio": False, "video": False, "screen": False}
    )


class RealtimeHub:
    """Manages active WebSocket channels and safe sync/async broadcasts."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._user_channels: Dict[uuid.UUID, Dict[str, ConnectionInfo]] = {}
        self._course_channels: Dict[uuid.UUID, Dict[str, ConnectionInfo]] = {}
        self._meeting_channels: Dict[uuid.UUID, Dict[str, ConnectionInfo]] = {}

    def bind_loop(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        try:
            active_loop = loop or asyncio.get_running_loop()
        except RuntimeError:
            return
        with self._lock:
            self._loop = active_loop

    def _channel_map(self, channel_type: str) -> Dict[uuid.UUID, Dict[str, ConnectionInfo]]:
        if channel_type == "user":
            return self._user_channels
        if channel_type == "course":
            return self._course_channels
        if channel_type == "meeting":
            return self._meeting_channels
        raise ValueError(f"Unsupported channel_type: {channel_type}")

    def register(self, conn: ConnectionInfo) -> ConnectionInfo:
        self.bind_loop()
        with self._lock:
            channel_map = self._channel_map(conn.channel_type)
            bucket = channel_map.setdefault(conn.channel_id, {})
            bucket[conn.connection_id] = conn
        return conn

    def unregister(self, conn: ConnectionInfo) -> int:
        """Remove a connection and return remaining connections for the same user in this channel."""
        remaining_for_user = 0
        with self._lock:
            channel_map = self._channel_map(conn.channel_type)
            bucket = channel_map.get(conn.channel_id)
            if bucket is not None:
                bucket.pop(conn.connection_id, None)
                if not bucket:
                    channel_map.pop(conn.channel_id, None)
                else:
                    remaining_for_user = sum(
                        1 for item in bucket.values() if item.user_id == conn.user_id
                    )
        return remaining_for_user

    def _snapshot(
        self,
        channel_type: str,
        channel_id: uuid.UUID,
        *,
        exclude_connection_id: Optional[str] = None,
    ) -> List[ConnectionInfo]:
        with self._lock:
            bucket = self._channel_map(channel_type).get(channel_id)
            if not bucket:
                return []
            return [
                conn
                for conn_id, conn in bucket.items()
                if exclude_connection_id is None or conn_id != exclude_connection_id
            ]

    def get_meeting_presence(self, meeting_id: uuid.UUID) -> List[Dict[str, Any]]:
        """Return sanitized live participant state (no email/PII leak)."""
        conns = self._snapshot("meeting", meeting_id)
        return [
            {
                "peerId": c.connection_id,
                "userId": str(c.user_id),
                "userName": c.user_name,
                "userRole": c.user_role,
                "handRaised": c.hand_raised,
                "mediaState": dict(c.media_state),
            }
            for c in conns
        ]

    def find_meeting_targets(
        self,
        meeting_id: uuid.UUID,
        *,
        sender_connection_id: str,
        target_peer_id: Optional[str] = None,
        target_user_id: Optional[str] = None,
    ) -> List[ConnectionInfo]:
        conns = self._snapshot("meeting", meeting_id, exclude_connection_id=sender_connection_id)
        if target_peer_id:
            return [c for c in conns if c.connection_id == target_peer_id]
        if target_user_id:
            return [c for c in conns if str(c.user_id) == str(target_user_id)]
        return conns

    async def _send_batch(self, targets: Iterable[ConnectionInfo], payload: Dict[str, Any]) -> None:
        dead: List[ConnectionInfo] = []
        for conn in targets:
            try:
                await conn.websocket.send_json(payload)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.unregister(conn)

    async def send_to_connection(self, conn: ConnectionInfo, payload: Dict[str, Any]) -> bool:
        try:
            await conn.websocket.send_json(payload)
            return True
        except Exception:
            self.unregister(conn)
            return False

    async def send_to_user(self, user_id: uuid.UUID, payload: Dict[str, Any]) -> None:
        targets = self._snapshot("user", user_id)
        if targets:
            await self._send_batch(targets, payload)

    async def broadcast_course(
        self,
        course_id: uuid.UUID,
        payload: Dict[str, Any],
        *,
        exclude_connection_id: Optional[str] = None,
    ) -> None:
        targets = self._snapshot("course", course_id, exclude_connection_id=exclude_connection_id)
        if targets:
            await self._send_batch(targets, payload)

    async def broadcast_meeting(
        self,
        meeting_id: uuid.UUID,
        payload: Dict[str, Any],
        *,
        exclude_connection_id: Optional[str] = None,
    ) -> None:
        targets = self._snapshot("meeting", meeting_id, exclude_connection_id=exclude_connection_id)
        if targets:
            await self._send_batch(targets, payload)

    async def broadcast_meeting_presence(self, meeting_id: uuid.UUID) -> None:
        conns = self._snapshot("meeting", meeting_id)
        if not conns:
            return
        participants = self.get_meeting_presence(meeting_id)
        dead: List[ConnectionInfo] = []
        for conn in conns:
            try:
                await conn.websocket.send_json(
                    {
                        "type": "presence.state",
                        "meetingId": str(meeting_id),
                        "selfPeerId": conn.connection_id,
                        "participants": participants,
                    }
                )
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.unregister(conn)

    def _schedule_coro(self, coro_factory) -> None:
        with self._lock:
            loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None

        try:
            if running is loop:
                task = loop.create_task(coro_factory())
                task.add_done_callback(self._consume_future_error)
            else:
                fut = asyncio.run_coroutine_threadsafe(coro_factory(), loop)
                fut.add_done_callback(self._consume_future_error)
        except Exception as exc:
            logger.debug("RealtimeHub failed to schedule async broadcast: %s", exc)

    @staticmethod
    def _consume_future_error(fut) -> None:
        try:
            exc = fut.exception()
            if exc is not None:
                logger.debug("RealtimeHub background broadcast error: %s", exc)
        except Exception:
            pass

    def push_to_user_sync(self, user_id: uuid.UUID, payload: Dict[str, Any]) -> None:
        if not self._snapshot("user", user_id):
            return
        self._schedule_coro(lambda: self.send_to_user(user_id, payload))

    def broadcast_course_sync(self, course_id: uuid.UUID, payload: Dict[str, Any]) -> None:
        if not self._snapshot("course", course_id):
            return
        self._schedule_coro(lambda: self.broadcast_course(course_id, payload))

    def broadcast_meeting_sync(self, meeting_id: uuid.UUID, payload: Dict[str, Any]) -> None:
        if not self._snapshot("meeting", meeting_id):
            return
        self._schedule_coro(lambda: self.broadcast_meeting(meeting_id, payload))


realtime_hub = RealtimeHub()
