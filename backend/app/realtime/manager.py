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
        self._meeting_polls: Dict[uuid.UUID, Dict[str, Any]] = {}

    def bind_loop(self, loop: Optional[asyncio.AbstractEventLoop] = None) -> None:
        try:
            active_loop = loop or asyncio.get_running_loop()
        except RuntimeError:
            return
        with self._lock:
            self._loop = active_loop

    def get_loop(self) -> Optional[asyncio.AbstractEventLoop]:
        with self._lock:
            return self._loop

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
                    if conn.channel_type == "meeting":
                        self._meeting_polls.pop(conn.channel_id, None)
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

    async def _safe_send(
        self,
        conn: ConnectionInfo,
        payload: Dict[str, Any],
        timeout: float = 3.0,
    ) -> bool:
        try:
            await asyncio.wait_for(conn.websocket.send_json(payload), timeout=timeout)
            return True
        except Exception:
            self.unregister(conn)
            return False

    async def _send_batch(self, targets: Iterable[ConnectionInfo], payload: Dict[str, Any]) -> None:
        target_list = list(targets)
        if not target_list:
            return
        await asyncio.gather(
            *(self._safe_send(conn, payload) for conn in target_list),
            return_exceptions=True,
        )

    def evict_meeting_room(self, meeting_id: uuid.UUID) -> List[ConnectionInfo]:
        """Atomically clear polls and active presence for an ended meeting, returning evicted sockets."""
        with self._lock:
            self._meeting_polls.pop(meeting_id, None)
            bucket = self._meeting_channels.pop(meeting_id, None)
            return list(bucket.values()) if bucket else []

    async def _notify_and_close_sockets(
        self,
        conns: List[ConnectionInfo],
        end_payload: Optional[Dict[str, Any]],
    ) -> None:
        if end_payload is not None and conns:
            await asyncio.gather(
                *(self._safe_send(c, end_payload) for c in conns),
                return_exceptions=True,
            )
        for conn in conns:
            try:
                await asyncio.wait_for(conn.websocket.close(), timeout=1.5)
            except Exception:
                pass

    def close_meeting_room_sync(
        self,
        meeting_id: uuid.UUID,
        end_payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Evict room presence & polls immediately and schedule final meeting.ended delivery + socket close."""
        conns = self.evict_meeting_room(meeting_id)
        if not conns:
            return
        self._schedule_coro(lambda: self._notify_and_close_sockets(conns, end_payload))

    def lower_all_meeting_hands(self, meeting_id: uuid.UUID) -> int:
        with self._lock:
            bucket = self._meeting_channels.get(meeting_id)
            if not bucket:
                return 0
            changed = 0
            for conn in bucket.values():
                if conn.hand_raised:
                    conn.hand_raised = False
                    changed += 1
            return changed

    def mute_meeting_peers(
        self,
        meeting_id: uuid.UUID,
        *,
        sender_connection_id: str,
        target_peer_id: Optional[str] = None,
    ) -> List[ConnectionInfo]:
        with self._lock:
            bucket = self._meeting_channels.get(meeting_id)
            if not bucket:
                return []
            targets: List[ConnectionInfo] = []
            for conn_id, conn in bucket.items():
                if target_peer_id:
                    if conn_id == target_peer_id:
                        conn.media_state["audio"] = False
                        targets.append(conn)
                elif conn_id != sender_connection_id:
                    conn.media_state["audio"] = False
                    targets.append(conn)
            return targets

    def _serialize_poll(self, poll: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not poll:
            return None
        votes: Dict[str, int] = poll["votes"]
        options: List[str] = poll["options"]
        counts = [0] * len(options)
        for idx in votes.values():
            if 0 <= idx < len(counts):
                counts[idx] += 1
        return {
            "pollId": poll["pollId"],
            "question": poll["question"],
            "options": list(options),
            "counts": counts,
            "totalVotes": sum(counts),
            "isOpen": poll["isOpen"],
            "createdByName": poll["createdByName"],
        }

    def get_meeting_poll(self, meeting_id: uuid.UUID) -> Optional[Dict[str, Any]]:
        with self._lock:
            return self._serialize_poll(self._meeting_polls.get(meeting_id))

    def create_meeting_poll(
        self,
        meeting_id: uuid.UUID,
        *,
        question: str,
        options: List[str],
        created_by_name: str,
    ) -> Dict[str, Any]:
        poll = {
            "pollId": uuid.uuid4().hex[:12],
            "question": question,
            "options": list(options),
            "votes": {},
            "isOpen": True,
            "createdByName": created_by_name,
        }
        with self._lock:
            self._meeting_polls[meeting_id] = poll
            serialized = self._serialize_poll(poll)
            assert serialized is not None
            return serialized

    def vote_meeting_poll(
        self,
        meeting_id: uuid.UUID,
        *,
        poll_id: str,
        user_id: uuid.UUID,
        option_index: int,
    ) -> Optional[Dict[str, Any]]:
        with self._lock:
            poll = self._meeting_polls.get(meeting_id)
            if not poll or poll["pollId"] != poll_id or not poll["isOpen"]:
                return None
            if option_index < 0 or option_index >= len(poll["options"]):
                return None
            poll["votes"][str(user_id)] = option_index
            return self._serialize_poll(poll)

    def close_meeting_poll(self, meeting_id: uuid.UUID, poll_id: str) -> Optional[Dict[str, Any]]:
        with self._lock:
            poll = self._meeting_polls.get(meeting_id)
            if not poll or poll["pollId"] != poll_id:
                return None
            poll["isOpen"] = False
            return self._serialize_poll(poll)

    async def send_to_connection(self, conn: ConnectionInfo, payload: Dict[str, Any]) -> bool:
        return await self._safe_send(conn, payload)

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
        await asyncio.gather(
            *(
                self._safe_send(
                    conn,
                    {
                        "type": "presence.state",
                        "meetingId": str(meeting_id),
                        "selfPeerId": conn.connection_id,
                        "participants": participants,
                    },
                )
                for conn in conns
            ),
            return_exceptions=True,
        )

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
