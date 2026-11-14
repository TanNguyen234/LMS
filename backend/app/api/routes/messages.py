"""Course & meeting channel messages REST endpoints with eager loading and WS broadcast."""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from backend.app.core.dependencies import (
    get_current_user,
    verify_course_read_access,
    verify_course_write_access,
)
from backend.app.db.session import get_db
from backend.app.models.models import CourseMessage, Meeting, MeetingLog, StoredFile, User
from backend.app.realtime import realtime_hub
from backend.app.schemas.common import to_utc_iso
from backend.app.schemas.schemas import CourseMessageCreate, CourseMessageResponse

router = APIRouter(tags=["Messages"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _to_message_response(msg: CourseMessage, sender: Optional[User]) -> CourseMessageResponse:
    return CourseMessageResponse(
        messageId=msg.MessageId,
        courseId=msg.CourseId,
        meetingId=msg.MeetingId,
        senderId=msg.SenderId,
        senderName=sender.FullName if sender else "Unknown",
        senderRole=sender.Role if sender else "STUDENT",
        senderEmail=sender.Email if sender else "",
        messageType=msg.MessageType,
        content=msg.Content,
        attachmentUrl=msg.AttachmentUrl,
        attachmentFileId=msg.AttachmentFileId,
        createdAt=msg.CreatedAt,
    )


def _serialize_ws_message(resp: CourseMessageResponse) -> dict:
    return {
        "messageId": str(resp.messageId),
        "courseId": str(resp.courseId),
        "meetingId": str(resp.meetingId) if resp.meetingId else None,
        "senderId": str(resp.senderId),
        "senderName": resp.senderName,
        "senderRole": resp.senderRole,
        "senderEmail": resp.senderEmail,
        "messageType": resp.messageType,
        "content": resp.content,
        "attachmentUrl": resp.attachmentUrl,
        "attachmentFileId": str(resp.attachmentFileId) if resp.attachmentFileId else None,
        "createdAt": to_utc_iso(resp.createdAt),
    }


@router.get("/courses/{course_id}/messages", response_model=List[CourseMessageResponse])
def get_course_messages(
    course_id: uuid.UUID,
    meeting_id: Optional[uuid.UUID] = Query(None, alias="meetingId"),
    limit: int = Query(100, ge=1, le=250),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách tin nhắn kênh lớp học (hoặc lọc theo phòng họp)."""
    course = verify_course_read_access(course_id, current_user, db)
    query = (
        db.query(CourseMessage)
        .options(joinedload(CourseMessage.sender))
        .filter(CourseMessage.CourseId == course.CourseId)
    )
    if meeting_id is not None:
        query = query.filter(CourseMessage.MeetingId == meeting_id)

    msgs = query.order_by(CourseMessage.CreatedAt.asc()).limit(limit).all()
    return [_to_message_response(m, m.sender) for m in msgs]


@router.post("/courses/{course_id}/messages", response_model=CourseMessageResponse)
def post_course_message(
    course_id: uuid.UUID,
    payload: CourseMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Gửi tin nhắn vào kênh lớp học hoặc phòng học trực tuyến và phát qua WebSocket."""
    course = verify_course_write_access(course_id, current_user, db)

    if payload.messageType == "SYSTEM" and current_user.Role == "STUDENT":
        raise HTTPException(status_code=403, detail="Sinh viên không có quyền gửi thông báo hệ thống.")

    if payload.meetingId is not None:
        meeting = db.query(Meeting).filter(Meeting.MeetingId == payload.meetingId).first()
        if not meeting or meeting.CourseId != course.CourseId:
            raise HTTPException(status_code=400, detail="Phiên học trực tuyến không thuộc lớp học này.")

    attachment_url = payload.attachmentUrl.strip() if payload.attachmentUrl else None
    if attachment_url and not (
        attachment_url.startswith("/")
        or attachment_url.startswith("https://")
        or attachment_url.startswith("http://")
    ):
        raise HTTPException(status_code=400, detail="URL tệp đính kèm không hợp lệ.")

    message_type = payload.messageType
    if payload.attachmentFileId is not None:
        stored_file = (
            db.query(StoredFile)
            .filter(StoredFile.FileId == payload.attachmentFileId)
            .first()
        )
        if (
            not stored_file
            or (stored_file.CourseId is not None and stored_file.CourseId != course.CourseId)
            or (stored_file.Scope != "CHAT" and stored_file.OwnerId != current_user.UserId)
        ):
            raise HTTPException(status_code=400, detail="Tệp đính kèm không tồn tại hoặc không thuộc lớp học này.")
        if not attachment_url:
            attachment_url = f"/api/files/{stored_file.FileId}/content"
        if message_type == "TEXT":
            message_type = "FILE"

    content = (payload.content or "").strip()
    if not content:
        if payload.attachmentFileId is not None or attachment_url:
            content = "Đã chia sẻ tệp đính kèm"
        else:
            raise HTTPException(status_code=422, detail="Nội dung tin nhắn không được để trống.")

    new_msg = CourseMessage(
        CourseId=course.CourseId,
        MeetingId=payload.meetingId,
        SenderId=current_user.UserId,
        MessageType=message_type,
        Content=content,
        AttachmentUrl=attachment_url,
        AttachmentFileId=payload.attachmentFileId,
        CreatedAt=_utcnow(),
    )
    db.add(new_msg)

    if payload.meetingId is not None:
        open_log = (
            db.query(MeetingLog)
            .filter(
                MeetingLog.MeetingId == payload.meetingId,
                MeetingLog.UserId == current_user.UserId,
                MeetingLog.LeftAt.is_(None),
            )
            .order_by(MeetingLog.JoinedAt.desc())
            .first()
        )
        if open_log:
            open_log.ChatCount = (open_log.ChatCount or 0) + 1

    db.commit()
    db.refresh(new_msg)

    response = _to_message_response(new_msg, current_user)
    ws_event = {
        "type": "chat.message",
        "courseId": str(course.CourseId),
        "meetingId": str(payload.meetingId) if payload.meetingId else None,
        "message": _serialize_ws_message(response),
    }
    realtime_hub.broadcast_course_sync(course.CourseId, ws_event)
    if payload.meetingId:
        realtime_hub.broadcast_meeting_sync(payload.meetingId, ws_event)

    return response
