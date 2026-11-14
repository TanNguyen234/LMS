"""Realtime WebSocket hub routes, one-time tickets, and whiteboard snapshot fallback."""
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    verify_course_read_access,
    verify_course_write_access,
)
from backend.app.core.security import consume_ws_ticket, create_ws_ticket
from backend.app.db.session import SessionLocal, get_db
from backend.app.models.models import (
    Course,
    CourseMessage,
    Enrollment,
    Meeting,
    MeetingLog,
    Notification,
    StoredFile,
    User,
    WhiteboardSnapshot,
)
from backend.app.realtime import ConnectionInfo, realtime_hub
from backend.app.schemas.common import as_utc_datetime, to_utc_iso
from backend.app.schemas.schemas import (
    WhiteboardSnapshotResponse,
    WhiteboardSnapshotUpdate,
    WsTicketResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Realtime"])

WS_TICKET_TTL_SECONDS = 30
MAX_WHITEBOARD_BYTES = 1024 * 1024
MAX_WHITEBOARD_STROKES = 3000
VALID_MESSAGE_TYPES = {"TEXT", "SYSTEM", "FILE"}


@dataclass(frozen=True)
class _WsUser:
    user_id: uuid.UUID
    full_name: str
    email: str
    role: str


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_uuid(raw: str) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(raw))
    except (TypeError, ValueError):
        return None


def _authenticate_ws_ticket(ticket: Optional[str]) -> Optional[_WsUser]:
    if not ticket:
        return None
    user_id = consume_ws_ticket(ticket)
    if user_id is None:
        return None

    db = SessionLocal()
    try:
        user = (
            db.query(User)
            .filter(User.UserId == user_id, User.IsActive == True)
            .first()
        )
        if not user:
            return None
        return _WsUser(
            user_id=user.UserId,
            full_name=user.FullName,
            email=user.Email,
            role=user.Role,
        )
    finally:
        db.close()


def _has_course_read(db: Session, course: Course, user_id: uuid.UUID, role: str) -> bool:
    if role == "ADMIN":
        return True
    if role == "LECTURER":
        return course.LecturerId == user_id
    if course.Status not in ("ACTIVE", "ARCHIVED"):
        return False
    enrollment = (
        db.query(Enrollment.EnrollmentId)
        .filter(
            Enrollment.CourseId == course.CourseId,
            Enrollment.StudentId == user_id,
            Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
        )
        .first()
    )
    return enrollment is not None


def _has_course_write(db: Session, course: Course, user_id: uuid.UUID, role: str) -> bool:
    if role == "ADMIN":
        return True
    if role == "LECTURER":
        return course.LecturerId == user_id
    if course.Status != "ACTIVE":
        return False
    enrollment = (
        db.query(Enrollment.EnrollmentId)
        .filter(
            Enrollment.CourseId == course.CourseId,
            Enrollment.StudentId == user_id,
            Enrollment.Status == "ACTIVE",
        )
        .first()
    )
    return enrollment is not None


def _parse_strokes_json(raw: str) -> List[Dict[str, Any]]:
    if len(raw.encode("utf-8")) > MAX_WHITEBOARD_BYTES:
        raise ValueError("Dữ liệu bảng vẽ vượt quá kích thước cho phép (1 MB).")
    parsed = json.loads(raw)
    if not isinstance(parsed, list):
        raise ValueError("strokesJson phải là mảng JSON hợp lệ.")
    if len(parsed) > MAX_WHITEBOARD_STROKES:
        raise ValueError("Số lượng nét vẽ vượt quá giới hạn tối đa.")
    return parsed


def _get_unread_count(user_id: uuid.UUID) -> int:
    db = SessionLocal()
    try:
        return (
            db.query(Notification)
            .filter(Notification.UserId == user_id, Notification.IsRead == False)
            .count()
        )
    finally:
        db.close()


def _check_course_read_access_ws(course_id: uuid.UUID, user: _WsUser) -> bool:
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.CourseId == course_id).first()
        if not course:
            return False
        return _has_course_read(db, course, user.user_id, user.role)
    finally:
        db.close()


def _check_meeting_access_ws(meeting_id: uuid.UUID, user: _WsUser) -> Optional[uuid.UUID]:
    db = SessionLocal()
    try:
        meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
        if not meeting or meeting.Status != "LIVE":
            return None
        course = db.query(Course).filter(Course.CourseId == meeting.CourseId).first()
        if not course or not _has_course_write(db, course, user.user_id, user.role):
            return None
        return course.CourseId
    finally:
        db.close()


def _open_meeting_session_log(meeting_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        existing_open = (
            db.query(MeetingLog)
            .filter(
                MeetingLog.MeetingId == meeting_id,
                MeetingLog.UserId == user_id,
                MeetingLog.LeftAt.is_(None),
            )
            .first()
        )
        if not existing_open:
            db.add(
                MeetingLog(
                    MeetingId=meeting_id,
                    UserId=user_id,
                    JoinedAt=_utcnow(),
                )
            )
            db.commit()
    finally:
        db.close()


def _close_meeting_session_log(meeting_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db = SessionLocal()
    try:
        now = _utcnow()
        now_utc = as_utc_datetime(now)
        open_logs = (
            db.query(MeetingLog)
            .filter(
                MeetingLog.MeetingId == meeting_id,
                MeetingLog.UserId == user_id,
                MeetingLog.LeftAt.is_(None),
            )
            .all()
        )
        for log in open_logs:
            log.LeftAt = now
            joined_utc = as_utc_datetime(log.JoinedAt)
            if joined_utc and now_utc:
                log.DurationSeconds = max(0, int((now_utc - joined_utc).total_seconds()))
        if open_logs:
            db.commit()
    finally:
        db.close()


def _increment_meeting_counts(
    meeting_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    chat_delta: int = 0,
    hand_delta: int = 0,
) -> None:
    if chat_delta <= 0 and hand_delta <= 0:
        return
    db = SessionLocal()
    try:
        open_log = (
            db.query(MeetingLog)
            .filter(
                MeetingLog.MeetingId == meeting_id,
                MeetingLog.UserId == user_id,
                MeetingLog.LeftAt.is_(None),
            )
            .order_by(MeetingLog.JoinedAt.desc(), MeetingLog.LogId.desc())
            .first()
        )
        if not open_log:
            meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
            if not meeting or meeting.Status != "LIVE":
                return
            open_log = MeetingLog(
                MeetingId=meeting_id,
                UserId=user_id,
                JoinedAt=_utcnow(),
            )
            db.add(open_log)
            db.flush()

        if chat_delta > 0:
            open_log.ChatCount = (open_log.ChatCount or 0) + chat_delta
        if hand_delta > 0:
            open_log.HandRaisesCount = (open_log.HandRaisesCount or 0) + hand_delta
        db.commit()
    finally:
        db.close()


def _persist_ws_chat_message(
    course_id: uuid.UUID,
    user: _WsUser,
    payload: Dict[str, Any],
    *,
    forced_meeting_id: Optional[uuid.UUID] = None,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    content = str(payload.get("content") or "").strip()
    message_type = str(payload.get("messageType") or "TEXT").upper()
    if message_type not in VALID_MESSAGE_TYPES:
        return None, "Loại tin nhắn không hợp lệ."
    if message_type == "SYSTEM" and user.role == "STUDENT":
        return None, "Sinh viên không có quyền gửi thông báo hệ thống."

    attachment_url_raw = payload.get("attachmentUrl")
    attachment_url = str(attachment_url_raw).strip() if attachment_url_raw else None
    if attachment_url and not (
        attachment_url.startswith("/") or attachment_url.startswith("https://") or attachment_url.startswith("http://")
    ):
        return None, "URL tệp đính kèm không hợp lệ."

    attachment_file_uuid: Optional[uuid.UUID] = None
    if payload.get("attachmentFileId"):
        attachment_file_uuid = _parse_uuid(str(payload["attachmentFileId"]))
        if attachment_file_uuid is None:
            return None, "attachmentFileId không hợp lệ."

    meeting_uuid = forced_meeting_id
    if meeting_uuid is None and payload.get("meetingId"):
        meeting_uuid = _parse_uuid(str(payload["meetingId"]))
        if meeting_uuid is None:
            return None, "meetingId không hợp lệ."

    if not content and not attachment_url and attachment_file_uuid is None:
        return None, "Nội dung tin nhắn không được để trống."

    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.CourseId == course_id).first()
        if not course or not _has_course_write(db, course, user.user_id, user.role):
            return None, "Bạn không có quyền gửi tin nhắn trong lớp học này."

        if meeting_uuid is not None:
            meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_uuid).first()
            if not meeting or meeting.CourseId != course_id:
                return None, "Phiên học trực tuyến không thuộc lớp học này."

        if attachment_file_uuid is not None:
            stored = db.query(StoredFile).filter(StoredFile.FileId == attachment_file_uuid).first()
            if (
                not stored
                or (stored.CourseId is not None and stored.CourseId != course_id)
                or (stored.Scope != "CHAT" and stored.OwnerId != user.user_id)
            ):
                return None, "Tệp đính kèm không tồn tại hoặc không thuộc lớp học này."
            if not attachment_url:
                attachment_url = f"/api/files/{stored.FileId}/content"
            if message_type == "TEXT":
                message_type = "FILE"

        if not content and attachment_file_uuid is not None:
            content = "Đã chia sẻ tệp đính kèm"

        msg = CourseMessage(
            CourseId=course_id,
            MeetingId=meeting_uuid,
            SenderId=user.user_id,
            MessageType=message_type,
            Content=content,
            AttachmentUrl=attachment_url,
            AttachmentFileId=attachment_file_uuid,
            CreatedAt=_utcnow(),
        )
        db.add(msg)

        if meeting_uuid is not None:
            open_log = (
                db.query(MeetingLog)
                .filter(
                    MeetingLog.MeetingId == meeting_uuid,
                    MeetingLog.UserId == user.user_id,
                    MeetingLog.LeftAt.is_(None),
                )
                .order_by(MeetingLog.JoinedAt.desc(), MeetingLog.LogId.desc())
                .first()
            )
            if open_log:
                open_log.ChatCount = (open_log.ChatCount or 0) + 1

        db.commit()
        db.refresh(msg)

        serialized = {
            "messageId": str(msg.MessageId),
            "courseId": str(msg.CourseId),
            "meetingId": str(msg.MeetingId) if msg.MeetingId else None,
            "senderId": str(user.user_id),
            "senderName": user.full_name,
            "senderRole": user.role,
            "senderEmail": user.email,
            "messageType": msg.MessageType,
            "content": msg.Content,
            "attachmentUrl": msg.AttachmentUrl,
            "attachmentFileId": str(msg.AttachmentFileId) if msg.AttachmentFileId else None,
            "createdAt": to_utc_iso(msg.CreatedAt),
        }
        return serialized, None
    finally:
        db.close()


def _apply_whiteboard_op_db(
    course_id: uuid.UUID,
    meeting_id: Optional[uuid.UUID],
    user: _WsUser,
    op: Dict[str, Any],
) -> Optional[str]:
    action = str(op.get("action") or "").lower()
    if action not in {"add", "remove", "delete", "undo", "clear", "replace"}:
        return "Thao tác bảng vẽ không hợp lệ."

    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.CourseId == course_id).first()
        if not course or not _has_course_write(db, course, user.user_id, user.role):
            return "Bạn không có quyền chỉnh sửa bảng vẽ."

        snapshot = (
            db.query(WhiteboardSnapshot)
            .filter(WhiteboardSnapshot.CourseId == course_id)
            .order_by(WhiteboardSnapshot.UpdatedAt.desc())
            .first()
        )
        if snapshot:
            try:
                strokes = json.loads(snapshot.StrokesJson or "[]")
                if not isinstance(strokes, list):
                    strokes = []
            except json.JSONDecodeError:
                strokes = []
        else:
            strokes = []
            snapshot = WhiteboardSnapshot(
                CourseId=course_id,
                MeetingId=meeting_id,
                StrokesJson="[]",
                UpdatedBy=user.user_id,
                UpdatedAt=_utcnow(),
            )
            db.add(snapshot)

        if action == "add":
            stroke = op.get("stroke")
            if not isinstance(stroke, dict) or not stroke.get("id"):
                return "Dữ liệu nét vẽ không hợp lệ."
            stroke_copy = dict(stroke)
            stroke_copy.setdefault("authorId", str(user.user_id))
            stroke_copy.setdefault("authorName", user.full_name)
            stroke_id = str(stroke_copy["id"])
            if not any(isinstance(s, dict) and str(s.get("id")) == stroke_id for s in strokes):
                if len(strokes) >= MAX_WHITEBOARD_STROKES:
                    strokes = strokes[-(MAX_WHITEBOARD_STROKES - 1):]
                strokes.append(stroke_copy)
        elif action in ("remove", "delete"):
            target_id = str(op.get("strokeId") or "")
            if not target_id:
                return "Thiếu strokeId để xóa."
            strokes = [s for s in strokes if not (isinstance(s, dict) and str(s.get("id")) == target_id)]
        elif action == "undo":
            target_id = str(op.get("strokeId") or "")
            if target_id:
                strokes = [
                    s
                    for s in strokes
                    if not (
                        isinstance(s, dict)
                        and str(s.get("id")) == target_id
                        and (str(s.get("authorId") or user.user_id) == str(user.user_id) or user.role in ("ADMIN", "LECTURER"))
                    )
                ]
            else:
                for idx in range(len(strokes) - 1, -1, -1):
                    item = strokes[idx]
                    if isinstance(item, dict) and str(item.get("authorId") or user.user_id) == str(user.user_id):
                        strokes.pop(idx)
                        break
        elif action == "clear":
            strokes = []
        elif action == "replace":
            replacement = op.get("strokes")
            if not isinstance(replacement, list) or len(replacement) > MAX_WHITEBOARD_STROKES:
                return "Danh sách nét vẽ không hợp lệ."
            strokes = replacement

        encoded = json.dumps(strokes)
        if len(encoded.encode("utf-8")) > MAX_WHITEBOARD_BYTES:
            return "Dữ liệu bảng vẽ vượt quá dung lượng cho phép."

        snapshot.StrokesJson = encoded
        snapshot.UpdatedBy = user.user_id
        snapshot.UpdatedAt = _utcnow()
        if meeting_id is not None:
            snapshot.MeetingId = meeting_id
        db.commit()
        return None
    finally:
        db.close()


def _snapshot_to_response(
    snapshot: Optional[WhiteboardSnapshot],
    course: Course,
    fallback_user_id: uuid.UUID,
) -> WhiteboardSnapshotResponse:
    if not snapshot:
        return WhiteboardSnapshotResponse(
            snapshotId=uuid.UUID(int=0),
            courseId=course.CourseId,
            meetingId=None,
            strokesJson="[]",
            updatedBy=course.LecturerId or fallback_user_id,
            updatedAt=_utcnow(),
        )
    return WhiteboardSnapshotResponse(
        snapshotId=snapshot.SnapshotId,
        courseId=snapshot.CourseId,
        meetingId=snapshot.MeetingId,
        strokesJson=snapshot.StrokesJson or "[]",
        updatedBy=snapshot.UpdatedBy,
        updatedAt=snapshot.UpdatedAt,
    )


@router.post("/ws/ticket", response_model=WsTicketResponse)
def issue_ws_ticket(current_user: User = Depends(get_current_user)):
    """Cấp ticket WebSocket dùng 1 lần (30s) cho người dùng đã đăng nhập."""
    ticket = create_ws_ticket(current_user.UserId, ttl_seconds=WS_TICKET_TTL_SECONDS)
    return WsTicketResponse(ticket=ticket, expiresInSeconds=WS_TICKET_TTL_SECONDS)


@router.get("/courses/{course_id}/whiteboard", response_model=WhiteboardSnapshotResponse)
def get_course_whiteboard(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy bản chụp vector hiện tại của bảng vẽ lớp học."""
    course = verify_course_read_access(course_id, current_user, db)
    snapshot = (
        db.query(WhiteboardSnapshot)
        .filter(WhiteboardSnapshot.CourseId == course.CourseId)
        .order_by(WhiteboardSnapshot.UpdatedAt.desc())
        .first()
    )
    return _snapshot_to_response(snapshot, course, current_user.UserId)


@router.put("/courses/{course_id}/whiteboard", response_model=WhiteboardSnapshotResponse)
def save_course_whiteboard(
    course_id: uuid.UUID,
    payload: WhiteboardSnapshotUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lưu bảng vẽ vector (REST fallback + đồng bộ tới các client đang kết nối)."""
    course = verify_course_write_access(course_id, current_user, db)
    try:
        _parse_strokes_json(payload.strokesJson)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if payload.meetingId is not None:
        meeting = db.query(Meeting).filter(Meeting.MeetingId == payload.meetingId).first()
        if not meeting or meeting.CourseId != course.CourseId:
            raise HTTPException(status_code=400, detail="Phiên học không thuộc lớp học này.")

    now = _utcnow()
    snapshot = (
        db.query(WhiteboardSnapshot)
        .filter(WhiteboardSnapshot.CourseId == course.CourseId)
        .order_by(WhiteboardSnapshot.UpdatedAt.desc())
        .first()
    )
    if snapshot:
        snapshot.StrokesJson = payload.strokesJson
        snapshot.UpdatedBy = current_user.UserId
        snapshot.UpdatedAt = now
        if payload.meetingId is not None:
            snapshot.MeetingId = payload.meetingId
    else:
        snapshot = WhiteboardSnapshot(
            CourseId=course.CourseId,
            MeetingId=payload.meetingId,
            StrokesJson=payload.strokesJson,
            UpdatedBy=current_user.UserId,
            UpdatedAt=now,
        )
        db.add(snapshot)

    db.commit()
    db.refresh(snapshot)

    broadcast_payload = {
        "type": "whiteboard.snapshot",
        "courseId": str(course.CourseId),
        "meetingId": str(snapshot.MeetingId) if snapshot.MeetingId else None,
        "strokesJson": snapshot.StrokesJson,
        "updatedBy": str(current_user.UserId),
        "updatedAt": to_utc_iso(snapshot.UpdatedAt),
    }
    realtime_hub.broadcast_course_sync(course.CourseId, broadcast_payload)
    if snapshot.MeetingId:
        realtime_hub.broadcast_meeting_sync(snapshot.MeetingId, broadcast_payload)

    return _snapshot_to_response(snapshot, course, current_user.UserId)


@router.websocket("/ws/notifications")
async def notifications_ws(
    websocket: WebSocket,
    ticket: Optional[str] = Query(default=None),
):
    """Kênh WebSocket đẩy thông báo theo thời gian thực cho từng người dùng."""
    ws_user = _authenticate_ws_ticket(ticket)
    if not ws_user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    conn = ConnectionInfo(
        connection_id=uuid.uuid4().hex,
        websocket=websocket,
        user_id=ws_user.user_id,
        user_name=ws_user.full_name,
        user_role=ws_user.role,
        channel_type="user",
        channel_id=ws_user.user_id,
    )
    realtime_hub.register(conn)

    try:
        unread = _get_unread_count(ws_user.user_id)
        await realtime_hub.send_to_connection(
            conn,
            {
                "type": "notifications.connected",
                "userId": str(ws_user.user_id),
                "unreadCount": unread,
            },
        )
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                continue
            if isinstance(msg, dict) and msg.get("type") == "ping":
                await realtime_hub.send_to_connection(conn, {"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        realtime_hub.unregister(conn)


@router.websocket("/ws/courses/{course_id}")
async def course_ws(
    websocket: WebSocket,
    course_id: str,
    ticket: Optional[str] = Query(default=None),
):
    """Kênh WebSocket thảo luận lớp học (chat, typing, whiteboard op)."""
    course_uuid = _parse_uuid(course_id)
    ws_user = _authenticate_ws_ticket(ticket)
    if course_uuid is None or not ws_user or not _check_course_read_access_ws(course_uuid, ws_user):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    conn = ConnectionInfo(
        connection_id=uuid.uuid4().hex,
        websocket=websocket,
        user_id=ws_user.user_id,
        user_name=ws_user.full_name,
        user_role=ws_user.role,
        channel_type="course",
        channel_id=course_uuid,
    )
    realtime_hub.register(conn)

    try:
        await realtime_hub.send_to_connection(
            conn,
            {"type": "course.connected", "courseId": str(course_uuid)},
        )
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await realtime_hub.send_to_connection(conn, {"type": "error", "detail": "JSON không hợp lệ."})
                continue

            if not isinstance(data, dict):
                continue

            msg_type = data.get("type")
            if msg_type == "ping":
                await realtime_hub.send_to_connection(conn, {"type": "pong"})
            elif msg_type == "typing":
                await realtime_hub.broadcast_course(
                    course_uuid,
                    {
                        "type": "typing",
                        "courseId": str(course_uuid),
                        "userId": str(ws_user.user_id),
                        "userName": ws_user.full_name,
                        "isTyping": bool(data.get("isTyping", True)),
                    },
                    exclude_connection_id=conn.connection_id,
                )
            elif msg_type == "chat.send":
                saved, err = _persist_ws_chat_message(course_uuid, ws_user, data)
                if err or not saved:
                    await realtime_hub.send_to_connection(
                        conn, {"type": "error", "detail": err or "Không thể gửi tin nhắn."}
                    )
                    continue
                event_payload = {
                    "type": "chat.message",
                    "courseId": str(course_uuid),
                    "meetingId": saved.get("meetingId"),
                    "message": saved,
                }
                await realtime_hub.broadcast_course(course_uuid, event_payload)
                if saved.get("meetingId"):
                    meeting_uuid = _parse_uuid(saved["meetingId"])
                    if meeting_uuid:
                        await realtime_hub.broadcast_meeting(meeting_uuid, event_payload)
            elif msg_type == "whiteboard.op":
                op = data.get("op")
                if not isinstance(op, dict):
                    continue
                err = _apply_whiteboard_op_db(course_uuid, None, ws_user, op)
                if err:
                    await realtime_hub.send_to_connection(conn, {"type": "error", "detail": err})
                    continue
                await realtime_hub.broadcast_course(
                    course_uuid,
                    {
                        "type": "whiteboard.op",
                        "courseId": str(course_uuid),
                        "fromPeerId": conn.connection_id,
                        "userId": str(ws_user.user_id),
                        "userName": ws_user.full_name,
                        "op": op,
                    },
                )
    except WebSocketDisconnect:
        pass
    finally:
        realtime_hub.unregister(conn)


@router.websocket("/ws/meetings/{meeting_id}")
async def meeting_ws(
    websocket: WebSocket,
    meeting_id: str,
    ticket: Optional[str] = Query(default=None),
):
    """Kênh WebSocket phòng học trực tuyến: điểm danh, giơ tay, chat, bảng vẽ, WebRTC signaling."""
    meeting_uuid = _parse_uuid(meeting_id)
    ws_user = _authenticate_ws_ticket(ticket)
    course_uuid = (
        _check_meeting_access_ws(meeting_uuid, ws_user)
        if meeting_uuid is not None and ws_user is not None
        else None
    )
    if meeting_uuid is None or not ws_user or course_uuid is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    conn = ConnectionInfo(
        connection_id=uuid.uuid4().hex,
        websocket=websocket,
        user_id=ws_user.user_id,
        user_name=ws_user.full_name,
        user_role=ws_user.role,
        channel_type="meeting",
        channel_id=meeting_uuid,
    )
    realtime_hub.register(conn)
    _open_meeting_session_log(meeting_uuid, ws_user.user_id)

    try:
        await realtime_hub.broadcast_meeting_presence(meeting_uuid)
        while True:
            raw = await websocket.receive_text()
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await realtime_hub.send_to_connection(conn, {"type": "error", "detail": "JSON không hợp lệ."})
                continue

            if not isinstance(data, dict):
                continue

            msg_type = data.get("type")
            if msg_type == "ping":
                await realtime_hub.send_to_connection(conn, {"type": "pong"})
            elif msg_type == "typing":
                await realtime_hub.broadcast_meeting(
                    meeting_uuid,
                    {
                        "type": "typing",
                        "meetingId": str(meeting_uuid),
                        "peerId": conn.connection_id,
                        "userId": str(ws_user.user_id),
                        "userName": ws_user.full_name,
                        "isTyping": bool(data.get("isTyping", True)),
                    },
                    exclude_connection_id=conn.connection_id,
                )
            elif msg_type in ("hand.raise", "hand.lower", "hand.state"):
                raised = True if msg_type == "hand.raise" else False if msg_type == "hand.lower" else bool(data.get("raised"))
                was_raised = conn.hand_raised
                conn.hand_raised = raised
                if raised and not was_raised:
                    _increment_meeting_counts(meeting_uuid, ws_user.user_id, hand_delta=1)
                await realtime_hub.broadcast_meeting(
                    meeting_uuid,
                    {
                        "type": "hand.state",
                        "meetingId": str(meeting_uuid),
                        "peerId": conn.connection_id,
                        "userId": str(ws_user.user_id),
                        "userName": ws_user.full_name,
                        "raised": raised,
                    },
                )
            elif msg_type == "media.state":
                conn.media_state = {
                    "audio": bool(data.get("audio", conn.media_state.get("audio", False))),
                    "video": bool(data.get("video", conn.media_state.get("video", False))),
                    "screen": bool(data.get("screen", conn.media_state.get("screen", False))),
                }
                await realtime_hub.broadcast_meeting(
                    meeting_uuid,
                    {
                        "type": "media.state",
                        "meetingId": str(meeting_uuid),
                        "peerId": conn.connection_id,
                        "userId": str(ws_user.user_id),
                        "mediaState": dict(conn.media_state),
                    },
                    exclude_connection_id=conn.connection_id,
                )
            elif msg_type == "chat.send":
                saved, err = _persist_ws_chat_message(
                    course_uuid,
                    ws_user,
                    data,
                    forced_meeting_id=meeting_uuid,
                )
                if err or not saved:
                    await realtime_hub.send_to_connection(
                        conn, {"type": "error", "detail": err or "Không thể gửi tin nhắn."}
                    )
                    continue
                event_payload = {
                    "type": "chat.message",
                    "courseId": str(course_uuid),
                    "meetingId": str(meeting_uuid),
                    "message": saved,
                }
                await realtime_hub.broadcast_meeting(meeting_uuid, event_payload)
                await realtime_hub.broadcast_course(course_uuid, event_payload)
            elif msg_type == "whiteboard.op":
                op = data.get("op")
                if not isinstance(op, dict):
                    continue
                err = _apply_whiteboard_op_db(course_uuid, meeting_uuid, ws_user, op)
                if err:
                    await realtime_hub.send_to_connection(conn, {"type": "error", "detail": err})
                    continue
                wb_event = {
                    "type": "whiteboard.op",
                    "courseId": str(course_uuid),
                    "meetingId": str(meeting_uuid),
                    "fromPeerId": conn.connection_id,
                    "userId": str(ws_user.user_id),
                    "userName": ws_user.full_name,
                    "op": op,
                }
                await realtime_hub.broadcast_meeting(meeting_uuid, wb_event)
                await realtime_hub.broadcast_course(course_uuid, wb_event)
            elif msg_type in ("rtc.offer", "rtc.answer", "rtc.ice"):
                targets = realtime_hub.find_meeting_targets(
                    meeting_uuid,
                    sender_connection_id=conn.connection_id,
                    target_peer_id=data.get("targetPeerId"),
                    target_user_id=data.get("targetUserId"),
                )
                if not targets:
                    continue
                relay: Dict[str, Any] = {
                    "type": msg_type,
                    "meetingId": str(meeting_uuid),
                    "fromPeerId": conn.connection_id,
                    "fromUserId": str(ws_user.user_id),
                    "fromUserName": ws_user.full_name,
                    "fromUserRole": ws_user.role,
                }
                if "sdp" in data:
                    relay["sdp"] = data["sdp"]
                if "candidate" in data:
                    relay["candidate"] = data["candidate"]
                if "mediaType" in data:
                    relay["mediaType"] = data["mediaType"]
                for target in targets:
                    await realtime_hub.send_to_connection(
                        target,
                        {**relay, "targetPeerId": target.connection_id},
                    )
    except WebSocketDisconnect:
        pass
    finally:
        remaining = realtime_hub.unregister(conn)
        if remaining == 0:
            _close_meeting_session_log(meeting_uuid, ws_user.user_id)
        await realtime_hub.broadcast_meeting_presence(meeting_uuid)
