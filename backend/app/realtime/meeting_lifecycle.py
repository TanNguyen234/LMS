"""Lifecycle helpers for closing orphaned or empty LIVE virtual classroom meetings."""
import asyncio
from datetime import datetime, timezone
import logging
import threading
from typing import Any, Dict, Optional
import uuid

from sqlalchemy.orm import Session

from backend.app.db.session import SessionLocal
from backend.app.models.models import Meeting, MeetingLog
from backend.app.realtime.manager import realtime_hub
from backend.app.schemas.common import as_utc_datetime

logger = logging.getLogger(__name__)

DEFAULT_EMPTY_MEETING_GRACE_SECONDS = 120.0

_cleanup_lock = threading.Lock()
_pending_cleanups: Dict[uuid.UUID, Any] = {}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def close_open_logs_for_meeting(meeting_id: uuid.UUID, db: Session, now: datetime) -> int:
    """Close all open MeetingLog rows for a meeting and compute durationSeconds."""
    now_utc = as_utc_datetime(now)
    open_logs = (
        db.query(MeetingLog)
        .filter(MeetingLog.MeetingId == meeting_id, MeetingLog.LeftAt.is_(None))
        .all()
    )
    for log in open_logs:
        log.LeftAt = now
        joined_utc = as_utc_datetime(log.JoinedAt)
        if joined_utc and now_utc:
            log.DurationSeconds = max(0, int((now_utc - joined_utc).total_seconds()))
    return len(open_logs)


def end_meeting_if_empty(meeting_id: uuid.UUID, db: Optional[Session] = None) -> bool:
    """Transition a LIVE meeting to ENDED if no active WebSocket connections remain."""
    if len(realtime_hub.get_meeting_presence(meeting_id)) > 0:
        return False

    owns_session = db is None
    session = db or SessionLocal()
    try:
        meeting = session.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
        if not meeting or meeting.Status != "LIVE":
            return False

        now = _utcnow()
        meeting.Status = "ENDED"
        meeting.EndedAt = now
        close_open_logs_for_meeting(meeting.MeetingId, session, now)
        session.commit()

        course_id = meeting.CourseId
        realtime_hub.close_meeting_room_sync(
            meeting.MeetingId,
            {
                "type": "meeting.ended",
                "meetingId": str(meeting.MeetingId),
                "courseId": str(course_id),
                "reason": "empty_timeout",
            },
        )
        realtime_hub.broadcast_course_sync(
            course_id,
            {
                "type": "meeting.ended",
                "meetingId": str(meeting.MeetingId),
                "courseId": str(course_id),
                "reason": "empty_timeout",
            },
        )
        return True
    except Exception as exc:
        session.rollback()
        logger.warning("Failed auto-ending empty meeting %s: %s", meeting_id, exc)
        return False
    finally:
        if owns_session:
            session.close()


def cleanup_stale_live_meetings(db: Session) -> int:
    """Close orphaned LIVE meetings and stale open MeetingLogs when no WS clients are connected."""
    now = _utcnow()
    closed_count = 0
    live_meetings = db.query(Meeting).filter(Meeting.Status == "LIVE").all()
    for meeting in live_meetings:
        if len(realtime_hub.get_meeting_presence(meeting.MeetingId)) > 0:
            continue
        meeting.Status = "ENDED"
        meeting.EndedAt = now
        close_open_logs_for_meeting(meeting.MeetingId, db, now)
        closed_count += 1

    # Also ensure no ENDED meetings retain unclosed attendance logs
    ended_open_logs = (
        db.query(MeetingLog)
        .join(Meeting, Meeting.MeetingId == MeetingLog.MeetingId)
        .filter(Meeting.Status == "ENDED", MeetingLog.LeftAt.is_(None))
        .all()
    )
    now_utc = as_utc_datetime(now)
    for log in ended_open_logs:
        log.LeftAt = now
        joined_utc = as_utc_datetime(log.JoinedAt)
        if joined_utc and now_utc:
            log.DurationSeconds = max(0, int((now_utc - joined_utc).total_seconds()))

    if closed_count > 0 or ended_open_logs:
        db.commit()

    return closed_count


def cancel_empty_meeting_cleanup(meeting_id: uuid.UUID) -> None:
    """Cancel any pending auto-end timer for the given meeting."""
    with _cleanup_lock:
        handle = _pending_cleanups.pop(meeting_id, None)
    if handle is not None:
        try:
            handle.cancel()
        except Exception:
            pass


def cancel_all_pending_cleanups() -> None:
    """Cancel all pending auto-end timers (called during app shutdown)."""
    with _cleanup_lock:
        handles = list(_pending_cleanups.values())
        _pending_cleanups.clear()
    for handle in handles:
        try:
            handle.cancel()
        except Exception:
            pass


def schedule_empty_meeting_cleanup(
    meeting_id: uuid.UUID,
    delay_seconds: float = DEFAULT_EMPTY_MEETING_GRACE_SECONDS,
) -> None:
    """Schedule closing the meeting if it remains empty after delay_seconds."""
    cancel_empty_meeting_cleanup(meeting_id)
    handle_holder: list[Any] = [None]

    async def _delayed_cleanup() -> None:
        try:
            await asyncio.sleep(max(0.0, delay_seconds))
            if len(realtime_hub.get_meeting_presence(meeting_id)) == 0:
                await asyncio.to_thread(end_meeting_if_empty, meeting_id)
        except asyncio.CancelledError:
            return
        finally:
            with _cleanup_lock:
                current_handle = handle_holder[0]
                if current_handle is not None and _pending_cleanups.get(meeting_id) is current_handle:
                    _pending_cleanups.pop(meeting_id, None)

    try:
        running_loop = asyncio.get_running_loop()
    except RuntimeError:
        running_loop = None

    if running_loop is not None and not running_loop.is_closed():
        with _cleanup_lock:
            task = running_loop.create_task(_delayed_cleanup())
            handle_holder[0] = task
            _pending_cleanups[meeting_id] = task
        return

    hub_loop = realtime_hub.get_loop()
    if hub_loop is not None and not hub_loop.is_closed() and hub_loop.is_running():
        with _cleanup_lock:
            fut = asyncio.run_coroutine_threadsafe(_delayed_cleanup(), hub_loop)
            handle_holder[0] = fut
            _pending_cleanups[meeting_id] = fut
