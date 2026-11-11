import uuid
import random
import string
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.db.session import get_db
from backend.app.models.models import Meeting, MeetingLog, Course, User, Enrollment, Notification
from backend.app.schemas.schemas import (
    MeetingCreate, MeetingResponse, MeetingLogCreate, MeetingLogResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, require_admin_or_lecturer, get_course_or_404, verify_course_access
)

router = APIRouter(prefix="/meetings", tags=["Live Meetings & MS Teams"])


def utcnow():
    return datetime.now(timezone.utc)


def generate_room_code(course_code: str) -> str:
    clean_code = "".join(c for c in course_code if c.isalnum()).upper()[:8]
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"LMS-{clean_code}-{suffix}"


def format_meeting_response(meeting: Meeting, db: Session) -> MeetingResponse:
    host = db.query(User).filter(User.UserId == meeting.HostId).first()
    course = db.query(Course).filter(Course.CourseId == meeting.CourseId).first()
    
    # Count unique participants who joined
    unique_users = db.query(MeetingLog.UserId).filter(MeetingLog.MeetingId == meeting.MeetingId).distinct().count()
    
    # Active logs
    logs = db.query(MeetingLog).filter(MeetingLog.MeetingId == meeting.MeetingId).order_by(desc(MeetingLog.JoinedAt)).all()
    formatted_logs = []
    for log in logs:
        u = db.query(User).filter(User.UserId == log.UserId).first()
        formatted_logs.append(
            MeetingLogResponse(
                logId=log.LogId,
                meetingId=log.MeetingId,
                userId=log.UserId,
                userName=u.FullName if u else "Unknown",
                userEmail=u.Email if u else "unknown@domain.com",
                userRole=u.Role if u else "STUDENT",
                studentCode=u.StudentCode if u else None,
                joinedAt=log.JoinedAt,
                leftAt=log.LeftAt,
                durationSeconds=log.DurationSeconds,
                chatCount=log.ChatCount,
                handRaisesCount=log.HandRaisesCount,
                activitySummary=log.ActivitySummary
            )
        )

    return MeetingResponse(
        meetingId=meeting.MeetingId,
        courseId=meeting.CourseId,
        courseTitle=course.Title if course else None,
        courseCode=course.CourseCode if course else None,
        hostId=meeting.HostId,
        hostName=host.FullName if host else "Unknown",
        title=meeting.Title,
        roomCode=meeting.RoomCode,
        status=meeting.Status,
        startedAt=meeting.StartedAt,
        endedAt=meeting.EndedAt,
        createdAt=meeting.CreatedAt,
        participantCount=unique_users,
        activeLogs=formatted_logs
    )


@router.post("", response_model=MeetingResponse)
def create_or_start_meeting(
    payload: MeetingCreate,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db)
):
    """
    Start a new live meeting for a course.
    Only ADMIN or course lecturer can initiate.
    Broadcasts in-app notification to all enrolled active students.
    """
    course = get_course_or_404(payload.courseId, db)
    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lecturer is not assigned to this course"
        )

    room_code = payload.roomCode.strip() if payload.roomCode else generate_room_code(course.CourseCode)
    
    meeting = Meeting(
        CourseId=course.CourseId,
        HostId=current_user.UserId,
        Title=payload.title.strip(),
        RoomCode=room_code,
        Status="LIVE",
        StartedAt=utcnow()
    )
    db.add(meeting)
    db.flush()

    # Host joins immediately
    host_log = MeetingLog(
        MeetingId=meeting.MeetingId,
        UserId=current_user.UserId,
        JoinedAt=utcnow(),
        ActivitySummary="Host started meeting"
    )
    db.add(host_log)

    # Notify all active enrolled students
    enrollments = db.query(Enrollment).filter(
        Enrollment.CourseId == course.CourseId,
        Enrollment.Status == "ACTIVE"
    ).all()

    for enr in enrollments:
        notif = Notification(
            UserId=enr.StudentId,
            Title=f"Lớp học trực tuyến: {meeting.Title}",
            Message=f"Giảng viên {current_user.FullName} đã mở lớp học trực tuyến cho môn {course.Title}. Bấm để tham gia ngay!",
            Type="COURSE",
            RelatedUrl=f"/teams?courseId={course.CourseId}&meetingId={meeting.MeetingId}"
        )
        db.add(notif)

    db.commit()
    db.refresh(meeting)
    return format_meeting_response(meeting, db)


@router.get("/active", response_model=List[MeetingResponse])
def get_active_meetings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all LIVE meetings accessible to the current user."""
    if current_user.Role == "ADMIN":
        meetings = db.query(Meeting).filter(Meeting.Status == "LIVE").order_by(desc(Meeting.StartedAt)).all()
    elif current_user.Role == "LECTURER":
        meetings = db.query(Meeting).join(Course).filter(
            Meeting.Status == "LIVE",
            Course.LecturerId == current_user.UserId
        ).order_by(desc(Meeting.StartedAt)).all()
    else:
        # Student enrolled courses
        enrolled_course_ids = [
            e.CourseId for e in db.query(Enrollment.CourseId).filter(
                Enrollment.StudentId == current_user.UserId,
                Enrollment.Status == "ACTIVE"
            ).all()
        ]
        meetings = db.query(Meeting).filter(
            Meeting.Status == "LIVE",
            Meeting.CourseId.in_(enrolled_course_ids)
        ).order_by(desc(Meeting.StartedAt)).all()

    return [format_meeting_response(m, db) for m in meetings]


@router.get("/course/{course_id}", response_model=List[MeetingResponse])
def get_course_meetings(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all meetings for a specific course (Live or ended)."""
    verify_course_access(course_id, current_user, db)
    meetings = db.query(Meeting).filter(Meeting.CourseId == course_id).order_by(desc(Meeting.StartedAt)).all()
    return [format_meeting_response(m, db) for m in meetings]


@router.get("/{meeting_id}", response_model=MeetingResponse)
def get_meeting_detail(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get meeting details by id."""
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    verify_course_access(meeting.CourseId, current_user, db)
    return format_meeting_response(meeting, db)


@router.post("/{meeting_id}/join")
def join_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record participant join event for anti-cheat and attendance tracking."""
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")
    verify_course_access(meeting.CourseId, current_user, db)

    # Check if there is already an open session
    open_log = db.query(MeetingLog).filter(
        MeetingLog.MeetingId == meeting_id,
        MeetingLog.UserId == current_user.UserId,
        MeetingLog.LeftAt == None
    ).first()

    if not open_log:
        new_log = MeetingLog(
            MeetingId=meeting_id,
            UserId=current_user.UserId,
            JoinedAt=utcnow(),
            ActivitySummary="Participant connected to live room"
        )
        db.add(new_log)
        db.commit()
        db.refresh(new_log)
        log_id = new_log.LogId
    else:
        log_id = open_log.LogId

    return {"status": "joined", "logId": log_id, "roomCode": meeting.RoomCode}


@router.post("/{meeting_id}/leave")
def leave_meeting(
    meeting_id: uuid.UUID,
    payload: MeetingLogCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Record participant leave event and calculate duration."""
    log = db.query(MeetingLog).filter(
        MeetingLog.MeetingId == meeting_id,
        MeetingLog.UserId == current_user.UserId,
        MeetingLog.LeftAt == None
    ).order_by(desc(MeetingLog.JoinedAt)).first()

    if log:
        now = utcnow()
        log.LeftAt = now
        log.DurationSeconds = max(0, int((now - log.JoinedAt.replace(tzinfo=timezone.utc)).total_seconds()))
        log.ChatCount += payload.chatCount
        log.HandRaisesCount += payload.handRaisesCount
        if payload.activitySummary:
            log.ActivitySummary = payload.activitySummary
        db.commit()
        return {"status": "left", "durationSeconds": log.DurationSeconds}

    return {"status": "left", "durationSeconds": 0}


@router.post("/{meeting_id}/end", response_model=MeetingResponse)
def end_meeting(
    meeting_id: uuid.UUID,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db)
):
    """End the meeting. Only host or ADMIN can end."""
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    if current_user.Role != "ADMIN" and meeting.HostId != current_user.UserId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only meeting host or admin can end this meeting"
        )

    now = utcnow()
    meeting.Status = "ENDED"
    meeting.EndedAt = now

    # Close any open logs
    open_logs = db.query(MeetingLog).filter(
        MeetingLog.MeetingId == meeting_id,
        MeetingLog.LeftAt == None
    ).all()
    for ol in open_logs:
        ol.LeftAt = now
        ol.DurationSeconds = max(0, int((now - ol.JoinedAt.replace(tzinfo=timezone.utc)).total_seconds()))

    db.commit()
    db.refresh(meeting)
    return format_meeting_response(meeting, db)


@router.get("/{meeting_id}/logs", response_model=List[MeetingLogResponse])
def get_meeting_audit_logs(
    meeting_id: uuid.UUID,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db)
):
    """
    Get audit and participation logs for anti-cheat verification.
    Accessible only to lecturers and admins.
    """
    meeting = db.query(Meeting).filter(Meeting.MeetingId == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meeting not found")

    course = get_course_or_404(meeting.CourseId, db)
    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    logs = db.query(MeetingLog).filter(MeetingLog.MeetingId == meeting_id).order_by(desc(MeetingLog.JoinedAt)).all()
    result = []
    for log in logs:
        u = db.query(User).filter(User.UserId == log.UserId).first()
        result.append(
            MeetingLogResponse(
                logId=log.LogId,
                meetingId=log.MeetingId,
                userId=log.UserId,
                userName=u.FullName if u else "Unknown",
                userEmail=u.Email if u else "unknown@domain.com",
                userRole=u.Role if u else "STUDENT",
                studentCode=u.StudentCode if u else None,
                joinedAt=log.JoinedAt,
                leftAt=log.LeftAt,
                durationSeconds=log.DurationSeconds,
                chatCount=log.ChatCount,
                handRaisesCount=log.HandRaisesCount,
                activitySummary=log.ActivitySummary
            )
        )
    return result
