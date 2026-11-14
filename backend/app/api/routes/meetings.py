"""Virtual Classroom & Live Meetings REST routes with server-side counts and privacy guards."""
from datetime import datetime, timezone
from typing import List
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case
from sqlalchemy.orm import Session, joinedload, selectinload

from backend.app.core.dependencies import (
    get_current_user,
    require_admin_or_lecturer,
    verify_course_read_access,
    verify_course_write_access,
)
from backend.app.db.session import get_db
from backend.app.models.models import Course, Enrollment, Meeting, MeetingLog, Notification, User
from backend.app.realtime import realtime_hub
from backend.app.schemas.common import as_utc_datetime, to_utc_iso
from backend.app.schemas.schemas import MeetingCreate, MeetingLogCreate, MeetingLogResponse, MeetingResponse
from backend.app.services.notification_push import push_notification

router = APIRouter(prefix="/meetings", tags=["Meetings"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _meeting_query_with_relations(db: Session):
    return db.query(Meeting).options(
        joinedload(Meeting.course),
        joinedload(Meeting.host),
        selectinload(Meeting.logs).joinedload(MeetingLog.user),
    )


def _to_meeting_log_response(log: MeetingLog) -> MeetingLogResponse:
    user = log.user
    return MeetingLogResponse(
        logId=log.LogId,
        meetingId=log.MeetingId,
        userId=log.UserId,
        userName=user.FullName if user else "Unknown",
        userEmail=user.Email if user else "",
        userRole=user.Role if user else "STUDENT",
        studentCode=user.StudentCode if user else None,
        joinedAt=log.JoinedAt,
        leftAt=log.LeftAt,
        durationSeconds=log.DurationSeconds,
        chatCount=log.ChatCount,
        handRaisesCount=log.HandRaisesCount,
        activitySummary=log.ActivitySummary,
    )


def format_meeting_response(meeting: Meeting, viewer_role: str) -> MeetingResponse:
    course = meeting.course
    host = meeting.host
    open_logs = [log for log in (meeting.logs or []) if log.LeftAt is None]
    ws_presence_count = len(realtime_hub.get_meeting_presence(meeting.MeetingId))
    participant_count = max(len(open_logs), ws_presence_count)

    # Students must NEVER receive detailed activeLogs PII of other participants
    active_logs = (
        []
        if viewer_role == "STUDENT"
        else [_to_meeting_log_response(log) for log in open_logs]
    )

    return MeetingResponse(
        meetingId=meeting.MeetingId,
        courseId=meeting.CourseId,
        courseTitle=course.Title if course else "Unknown Course",
        courseCode=course.CourseCode if course else "N/A",
        hostId=meeting.HostId,
        hostName=host.FullName if host else "Lecturer",
        title=meeting.Title,
        roomCode=meeting.RoomCode,
        status=meeting.Status,
        startedAt=meeting.StartedAt,
        endedAt=meeting.EndedAt,
        createdAt=meeting.CreatedAt,
        participantCount=participant_count,
        activeLogs=active_logs,
    )


def _close_open_logs_for_meeting(meeting_id: uuid.UUID, db: Session, now: datetime) -> None:
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


@router.post("", response_model=MeetingResponse)
def create_or_start_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_lecturer),
):
    """Khởi tạo phòng học trực tuyến mới; từ chối 409 nếu đang có phòng LIVE trừ khi replaceActive=true."""
    course = db.query(Course).filter(Course.CourseId == payload.courseId).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(status_code=403, detail="Forbidden: Only the assigned lecturer can start a meeting")

    if course.Status != "ACTIVE":
        raise HTTPException(status_code=409, detail="Không thể mở lớp học trực tuyến cho môn học đã lưu trữ hoặc ngừng hoạt động.")

    now = _utcnow()
    active_meetings = (
        db.query(Meeting)
        .filter(Meeting.CourseId == payload.courseId, Meeting.Status == "LIVE")
        .all()
    )
    if active_meetings:
        if not payload.replaceActive:
            raise HTTPException(
                status_code=409,
                detail="Lớp học này đang có phòng trực tuyến hoạt động. Chọn replaceActive=true để thay thế phòng cũ.",
            )
        for old_meeting in active_meetings:
            old_meeting.Status = "ENDED"
            old_meeting.EndedAt = now
            _close_open_logs_for_meeting(old_meeting.MeetingId, db, now)
            realtime_hub.broadcast_meeting_sync(
                old_meeting.MeetingId,
                {
                    "type": "meeting.ended",
                    "meetingId": str(old_meeting.MeetingId),
                    "courseId": str(course.CourseId),
                    "reason": "replaced",
                },
            )

    room_code = payload.roomCode or f"UnivLMS-{course.CourseCode}-{uuid.uuid4().hex[:6].upper()}"
    new_meeting = Meeting(
        CourseId=payload.courseId,
        HostId=current_user.UserId,
        Title=payload.title,
        RoomCode=room_code,
        Status="LIVE",
        StartedAt=now,
        CreatedAt=now,
    )
    db.add(new_meeting)
    db.flush()

    host_log = MeetingLog(
        MeetingId=new_meeting.MeetingId,
        UserId=current_user.UserId,
        JoinedAt=now,
    )
    db.add(host_log)

    enrolled = (
        db.query(Enrollment)
        .filter(Enrollment.CourseId == course.CourseId, Enrollment.Status == "ACTIVE")
        .all()
    )
    notif_title = f"Lớp học trực tuyến ({course.CourseCode}): {payload.title}"[:200]
    notif_message = f"Giảng viên {current_user.FullName} vừa mở phòng học: {payload.title}"
    related_url = f"/classroom?courseId={course.CourseId}&meetingId={new_meeting.MeetingId}"

    created_notifications: List[Notification] = []
    for enr in enrolled:
        notif = Notification(
            UserId=enr.StudentId,
            Title=notif_title,
            Message=notif_message,
            Type="COURSE",
            RelatedUrl=related_url,
            CreatedAt=now,
        )
        db.add(notif)
        created_notifications.append(notif)

    db.commit()

    # Push live notifications after commit so clients reading REST right away see consistent DB rows
    for notif in created_notifications:
        push_notification(
            notif.UserId,
            {
                "type": "notification.created",
                "notificationId": str(notif.NotificationId),
                "notificationType": notif.Type,
                "title": notif.Title,
                "message": notif.Message,
                "relatedUrl": notif.RelatedUrl,
                "isRead": False,
                "createdAt": to_utc_iso(notif.CreatedAt),
            },
        )

    realtime_hub.broadcast_course_sync(
        course.CourseId,
        {
            "type": "meeting.started",
            "meetingId": str(new_meeting.MeetingId),
            "courseId": str(course.CourseId),
            "title": new_meeting.Title,
            "hostName": current_user.FullName,
        },
    )

    loaded = (
        _meeting_query_with_relations(db)
        .filter(Meeting.MeetingId == new_meeting.MeetingId)
        .first()
    )
    return format_meeting_response(loaded, current_user.Role)


@router.get("/active", response_model=List[MeetingResponse])
def get_active_meetings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy danh sách các buổi học đang phát sóng (LIVE) theo quyền người dùng."""
    query = _meeting_query_with_relations(db).filter(Meeting.Status == "LIVE")

    if current_user.Role == "LECTURER":
        query = query.filter(Meeting.Course.has(Course.LecturerId == current_user.UserId))
    elif current_user.Role == "STUDENT":
        enrolled_course_ids = (
            db.query(Enrollment.CourseId)
            .filter(
                Enrollment.StudentId == current_user.UserId,
                Enrollment.Status == "ACTIVE",
            )
        )
        query = query.filter(Meeting.CourseId.in_(enrolled_course_ids))

    meetings = query.order_by(Meeting.StartedAt.desc()).all()
    return [format_meeting_response(m, current_user.Role) for m in meetings]


@router.get("/course/{course_id}", response_model=List[MeetingResponse])
def get_course_meetings(
    course_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lịch sử các phòng học trực tuyến của một lớp học."""
    verify_course_read_access(course_id, current_user, db)
    meetings = (
        _meeting_query_with_relations(db)
        .filter(Meeting.CourseId == course_id)
        .order_by(Meeting.CreatedAt.desc())
        .all()
    )
    return [format_meeting_response(m, current_user.Role) for m in meetings]


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting_detail(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lấy thông tin chi tiết một phiên họp/lớp học trực tuyến."""
    meeting = (
        _meeting_query_with_relations(db)
        .filter(Meeting.MeetingId == meeting_id)
        .first()
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    verify_course_read_access(meeting.CourseId, current_user, db)
    return format_meeting_response(meeting, current_user.Role)


@router.post("/{meeting_id}/join")
def join_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Ghi nhận người dùng vào phòng học trực tuyến LIVE và trả về logId."""
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    verify_course_write_access(meeting.CourseId, current_user, db)
    if meeting.Status != "LIVE":
        raise HTTPException(status_code=409, detail="Phòng học trực tuyến đã kết thúc, không thể tham gia.")

    existing_open = (
        db.query(MeetingLog)
        .filter(
            MeetingLog.MeetingId == meeting_id,
            MeetingLog.UserId == current_user.UserId,
            MeetingLog.LeftAt.is_(None),
        )
        .first()
    )
    if existing_open:
        return {"status": "joined", "logId": str(existing_open.LogId)}

    new_log = MeetingLog(
        MeetingId=meeting_id,
        UserId=current_user.UserId,
        JoinedAt=_utcnow(),
    )
    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return {"status": "joined", "logId": str(new_log.LogId)}


@router.post("/{meeting_id}/leave")
def leave_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rời khỏi phòng học LIVE: chỉ ghi activitySummary, không nhận chatCount/handRaisesCount từ client."""
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    verify_course_write_access(meeting.CourseId, current_user, db)
    if meeting.Status != "LIVE":
        raise HTTPException(status_code=409, detail="Phòng học trực tuyến đã kết thúc.")

    open_log = (
        db.query(MeetingLog)
        .filter(
            MeetingLog.MeetingId == meeting_id,
            MeetingLog.UserId == current_user.UserId,
            MeetingLog.LeftAt.is_(None),
        )
        .order_by(MeetingLog.JoinedAt.desc(), MeetingLog.LogId.desc())
        .first()
    )
    if not open_log:
        return {"status": "left", "detail": "No active session found"}

    now = _utcnow()
    open_log.LeftAt = now
    joined_utc = as_utc_datetime(open_log.JoinedAt)
    now_utc = as_utc_datetime(now)
    if joined_utc and now_utc:
        open_log.DurationSeconds = max(0, int((now_utc - joined_utc).total_seconds()))

    # Server manages chatCount and handRaisesCount authoritatively; ignore client-supplied counters
    if payload.activitySummary:
        open_log.ActivitySummary = payload.activitySummary

    db.commit()
    return {"status": "left", "durationSeconds": open_log.DurationSeconds}


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
def end_meeting(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_lecturer),
):
    """Kết thúc buổi học (Admin, Host hoặc Giảng viên chủ nhiệm lớp học)."""
    meeting = (
        _meeting_query_with_relations(db)
        .filter(Meeting.MeetingId == meeting_id)
        .first()
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    course = meeting.course
    is_course_lecturer = bool(course and course.LecturerId == current_user.UserId)
    if current_user.Role != "ADMIN" and meeting.HostId != current_user.UserId and not is_course_lecturer:
        raise HTTPException(status_code=403, detail="Only Admin, meeting host, or course lecturer can end this meeting")

    now = _utcnow()
    meeting.Status = "ENDED"
    meeting.EndedAt = now
    _close_open_logs_for_meeting(meeting.MeetingId, db, now)
    db.commit()

    realtime_hub.broadcast_meeting_sync(
        meeting.MeetingId,
        {
            "type": "meeting.ended",
            "meetingId": str(meeting.MeetingId),
            "courseId": str(meeting.CourseId),
            "endedBy": str(current_user.UserId),
        },
    )
    realtime_hub.broadcast_course_sync(
        meeting.CourseId,
        {
            "type": "meeting.ended",
            "meetingId": str(meeting.MeetingId),
            "courseId": str(meeting.CourseId),
            "endedBy": str(current_user.UserId),
        },
    )

    refreshed = (
        _meeting_query_with_relations(db)
        .filter(Meeting.MeetingId == meeting.MeetingId)
        .first()
    )
    return format_meeting_response(refreshed, current_user.Role)


@router.get("/{meeting_id}/logs", response_model=List[MeetingLogResponse])
def get_meeting_audit_logs(
    meeting_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_lecturer),
):
    """Xuất toàn bộ nhật ký điểm danh & tương tác của sinh viên trong buổi học."""
    meeting = (
        db.query(Meeting)
        .options(joinedload(Meeting.course))
        .filter(Meeting.MeetingId == meeting_id)
        .first()
    )
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")

    if current_user.Role == "LECTURER" and meeting.course and meeting.course.LecturerId != current_user.UserId:
        raise HTTPException(status_code=403, detail="Forbidden: Not the lecturer of this course")

    logs = (
        db.query(MeetingLog)
        .options(joinedload(MeetingLog.user))
        .filter(MeetingLog.MeetingId == meeting_id)
        .order_by(
            MeetingLog.JoinedAt.asc(),
            case((MeetingLog.LeftAt.is_(None), 1), else_=0).asc(),
            MeetingLog.LeftAt.asc(),
            MeetingLog.LogId.asc(),
        )
        .all()
    )
    return [_to_meeting_log_response(log) for log in logs]
