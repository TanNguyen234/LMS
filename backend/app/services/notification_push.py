"""Best-effort realtime notification push (Wave 1 owner: realtime-classroom-dev).

Stable contract consumed by other routes (assignments, quizzes, meetings):
    push_notification(user_id, payload) -> None

It must never raise and must be a no-op when no socket is connected, so
callers can invoke it right after committing a Notification row.
"""
import logging
from typing import Any, Dict
import uuid

from backend.app.realtime.manager import realtime_hub

logger = logging.getLogger(__name__)


def push_notification(user_id: uuid.UUID, payload: Dict[str, Any]) -> None:
    """Deliver a notification payload to the user's live sockets, if any."""
    try:
        target_id = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
        message = dict(payload) if isinstance(payload, dict) else {"data": payload}
        message.setdefault("type", "notification.created")
        realtime_hub.push_to_user_sync(target_id, message)
    except Exception as exc:
        logger.debug("Best-effort notification push skipped: %s", exc)
