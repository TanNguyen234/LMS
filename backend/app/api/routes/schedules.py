"""Timetable / CourseSessions REST routes with conflict prevention and quick batch generation."""
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from backend.app.core.dependencies import (
    get_current_user,
    require_admin_or_lecturer,
    verify_course_read_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import Course, CourseSession, Enrollment, User
from backend.app.schemas.common import MessageResponse, UtcDateTime
from backend.app.schemas.schemas import (
    ConflictCheckRequest,
    ConflictCheckResponse,
    ConflictCheckSlot,
    CourseSessionCreate,
    CourseSessionResponse,
    CourseSessionUpdate,
    QuickScheduleGenerateRequest,
    QuickScheduleGenerateResponse,
    SlotConflictDetail,
)
from backend.app.services.schedule_conflicts import _naive_utc, check_slots_conflicts

router = APIRouter(prefix="/schedules", tags=["Timetable & Schedules"])


def _format_session(session: CourseSession, lecturer_map: Optional[Dict[uuid.UUID, str]] = None) -> CourseSessionResponse:
    course = session.course
    lecturer_id = course.LecturerId if course else session.CreatedBy
    lecturer_name = None
    if course and lecturer_map is not None:
        lecturer_name = lecturer_map.get(course.LecturerId)
    elif course and course.lecturer:
        lecturer_name = course.lecturer.FullName

    return CourseSessionResponse(
        sessionId=session.SessionId,
        courseId=session.CourseId,
        courseCode=course.CourseCode if course else "N/A",
        sectionCode=(course.SectionCode or "") if course else "",
        courseTitle=course.Title if course else "",
        lecturerId=lecturer_id,
        lecturerName=lecturer_name,
        title=session.Title,
        sessionType=session.SessionType,
        deliveryMode=session.DeliveryMode,
        room=session.Room,
        startAt=session.StartAt,
        endAt=session.EndAt,
        status=session.Status,
        notes=session.Notes,
        createdAt=session.CreatedAt,
    )


def _authorize_course_schedule_write(course_id: uuid.UUID, current_user: User, db: Session) -> Course:
    course = db.query(Course).filter(Course.CourseId == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin or the assigned lecturer can manage this course's schedule",
        )
    if course.Status == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xếp thêm lịch cho lớp đã lưu trữ",
        )
    return course


def _is_blocking_conflict(conflict: SlotConflictDetail, allow_student_conflicts: bool) -> bool:
    if conflict.lecturerConflict or conflict.roomConflict:
        return True
    if not allow_student_conflicts and conflict.studentConflictCount > 0:
        return True
    return False


@router.get("", response_model=List[CourseSessionResponse])
def list_schedules(
    course_id: Optional[uuid.UUID] = Query(None, alias="courseId"),
    lecturer_id: Optional[uuid.UUID] = Query(None, alias="lecturerId"),
    semester_id: Optional[uuid.UUID] = Query(None, alias="semesterId"),
    from_dt: Optional[UtcDateTime] = Query(None, alias="from"),
    to_dt: Optional[UtcDateTime] = Query(None, alias="to"),
    include_cancelled: bool = Query(False, alias="includeCancelled"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List scheduled timetable sessions scoped by user role and optional filters."""
    query = (
        db.query(CourseSession)
        .options(joinedload(CourseSession.course).joinedload(Course.lecturer))
        .join(Course, Course.CourseId == CourseSession.CourseId)
    )

    if course_id is not None:
        verify_course_read_access(course_id, current_user, db)
        query = query.filter(CourseSession.CourseId == course_id)
    elif current_user.Role == "ADMIN":
        if lecturer_id is not None:
            query = query.filter(Course.LecturerId == lecturer_id)
        if semester_id is not None:
            query = query.filter(Course.SemesterId == semester_id)
    elif current_user.Role == "LECTURER":
        query = query.filter(Course.LecturerId == current_user.UserId)
        if semester_id is not None:
            query = query.filter(Course.SemesterId == semester_id)
    elif current_user.Role == "STUDENT":
        enrolled_cids = (
            db.query(Enrollment.CourseId)
            .filter(
                Enrollment.StudentId == current_user.UserId,
                Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
            )
        )
        query = query.filter(CourseSession.CourseId.in_(enrolled_cids))
        if semester_id is not None:
            query = query.filter(Course.SemesterId == semester_id)
    else:
        return []

    if not include_cancelled:
        query = query.filter(CourseSession.Status != "CANCELLED")
    if from_dt is not None:
        query = query.filter(CourseSession.EndAt >= _naive_utc(from_dt))
    if to_dt is not None:
        query = query.filter(CourseSession.StartAt <= _naive_utc(to_dt))

    sessions = query.order_by(CourseSession.StartAt.asc()).limit(500).all()
    return [_format_session(s) for s in sessions]


@router.post("/check-conflicts", response_model=ConflictCheckResponse)
def preview_schedule_conflicts(
    payload: ConflictCheckRequest,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db),
):
    """Preview lecturer, enrolled student, and room conflicts for candidate time slots."""
    course = _authorize_course_schedule_write(payload.courseId, current_user, db)
    for slot in payload.slots:
        if _naive_utc(slot.endAt) <= _naive_utc(slot.startAt):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="EndAt must be strictly after StartAt",
            )

    conflicts = check_slots_conflicts(
        db,
        course,
        payload.slots,
        exclude_session_id=payload.excludeSessionId,
        timezone_offset_minutes=payload.timezoneOffsetMinutes,
    )
    return ConflictCheckResponse(hasConflicts=len(conflicts) > 0, conflicts=conflicts)


@router.post("/quick-generate", response_model=QuickScheduleGenerateResponse)
def quick_generate_schedules(
    payload: QuickScheduleGenerateRequest,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db),
):
    """Quickly generate recurring timetable sessions across a date range with smart conflict detection."""
    course = _authorize_course_schedule_write(payload.courseId, current_user, db)

    start_d = datetime.strptime(payload.startDate, "%Y-%m-%d").date()
    end_d = datetime.strptime(payload.endDate, "%Y-%m-%d").date()
    if end_d < start_d:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endDate must be >= startDate")
    if (end_d - start_d).days > 366:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date range cannot exceed 366 days")

    sh, sm = map(int, payload.startTime.split(":"))
    eh, em = map(int, payload.endTime.split(":"))
    start_minutes = sh * 60 + sm
    end_minutes = eh * 60 + em
    if end_minutes <= start_minutes:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endTime must be after startTime")

    weekday_set = {w for w in payload.weekdays if 0 <= w <= 6}
    if not weekday_set:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Select at least one valid weekday (0..6)")

    offset = timedelta(minutes=payload.timezoneOffsetMinutes)
    candidate_slots: List[ConflictCheckSlot] = []
    cur = start_d
    while cur <= end_d:
        if cur.weekday() in weekday_set:
            local_start = datetime(cur.year, cur.month, cur.day, sh, sm)
            local_end = datetime(cur.year, cur.month, cur.day, eh, em)
            candidate_slots.append(
                ConflictCheckSlot(
                    startAt=local_start - offset,
                    endAt=local_end - offset,
                    deliveryMode=payload.deliveryMode,
                    room=payload.room,
                )
            )
        cur += timedelta(days=1)

    if not candidate_slots:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không có ngày nào khớp với thứ đã chọn trong khoảng thời gian.")

    conflicts = check_slots_conflicts(
        db,
        course,
        candidate_slots,
        timezone_offset_minutes=payload.timezoneOffsetMinutes,
    )
    blocking_by_start: Dict[datetime, SlotConflictDetail] = {
        _naive_utc(c.startAt): c
        for c in conflicts
        if _is_blocking_conflict(c, payload.allowStudentConflicts)
    }

    if blocking_by_start and not payload.skipConflicts:
        first_conflict = next(iter(blocking_by_start.values()))
        summary = "; ".join(first_conflict.reasons)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Phát hiện {len(blocking_by_start)} buổi bị trùng lịch: {summary}",
        )

    created_sessions: List[CourseSession] = []
    skipped = 0
    for idx, slot in enumerate(candidate_slots, start=1):
        s_dt = _naive_utc(slot.startAt)
        e_dt = _naive_utc(slot.endAt)
        if s_dt in blocking_by_start:
            skipped += 1
            continue

        sess = CourseSession(
            SessionId=uuid.uuid4(),
            CourseId=course.CourseId,
            Title=f"{payload.titlePrefix.strip()} #{idx - skipped}",
            SessionType=payload.sessionType,
            DeliveryMode=payload.deliveryMode,
            Room=payload.room.strip() if payload.room and payload.room.strip() else None,
            StartAt=s_dt,
            EndAt=e_dt,
            Status="SCHEDULED",
            Notes=payload.notes.strip() if payload.notes and payload.notes.strip() else None,
            CreatedBy=current_user.UserId,
        )
        db.add(sess)
        created_sessions.append(sess)

    if created_sessions:
        db.commit()
        for s in created_sessions:
            db.refresh(s)

    lecturer = db.query(User.UserId, User.FullName).filter(User.UserId == course.LecturerId).first()
    lec_map = {lecturer[0]: lecturer[1]} if lecturer else {}
    return QuickScheduleGenerateResponse(
        createdCount=len(created_sessions),
        skippedCount=skipped,
        sessions=[_format_session(s, lecturer_map=lec_map) for s in created_sessions],
        conflicts=conflicts,
    )


@router.post("", response_model=CourseSessionResponse, status_code=status.HTTP_201_CREATED)
def create_schedule_session(
    payload: CourseSessionCreate,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db),
):
    """Create a single timetable session with lecturer, student, and room conflict checks."""
    course = _authorize_course_schedule_write(payload.courseId, current_user, db)
    s_dt = _naive_utc(payload.startAt)
    e_dt = _naive_utc(payload.endAt)
    if e_dt <= s_dt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EndAt must be strictly after StartAt")

    conflicts = check_slots_conflicts(
        db,
        course,
        [
            ConflictCheckSlot(
                startAt=s_dt,
                endAt=e_dt,
                deliveryMode=payload.deliveryMode,
                room=payload.room,
            )
        ],
    )
    blocking = [c for c in conflicts if _is_blocking_conflict(c, payload.allowStudentConflicts)]
    if blocking:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="; ".join(blocking[0].reasons),
        )

    sess = CourseSession(
        SessionId=uuid.uuid4(),
        CourseId=course.CourseId,
        Title=payload.title.strip(),
        SessionType=payload.sessionType,
        DeliveryMode=payload.deliveryMode,
        Room=payload.room.strip() if payload.room and payload.room.strip() else None,
        StartAt=s_dt,
        EndAt=e_dt,
        Status="SCHEDULED",
        Notes=payload.notes.strip() if payload.notes and payload.notes.strip() else None,
        CreatedBy=current_user.UserId,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return _format_session(sess)


@router.put("/{session_id}", response_model=CourseSessionResponse)
def update_schedule_session(
    session_id: uuid.UUID,
    payload: CourseSessionUpdate,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db),
):
    """Update a timetable session while preserving conflict invariants."""
    sess = (
        db.query(CourseSession)
        .options(joinedload(CourseSession.course).joinedload(Course.lecturer))
        .filter(CourseSession.SessionId == session_id)
        .first()
    )
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule session not found")

    course = _authorize_course_schedule_write(sess.CourseId, current_user, db)
    next_start = _naive_utc(payload.startAt) if payload.startAt is not None else _naive_utc(sess.StartAt)
    next_end = _naive_utc(payload.endAt) if payload.endAt is not None else _naive_utc(sess.EndAt)
    if next_end <= next_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EndAt must be strictly after StartAt")

    next_mode = payload.deliveryMode or sess.DeliveryMode
    next_room = payload.room if "room" in payload.model_fields_set else sess.Room
    next_status = payload.status or sess.Status

    if next_status != "CANCELLED":
        conflicts = check_slots_conflicts(
            db,
            course,
            [
                ConflictCheckSlot(
                    startAt=next_start,
                    endAt=next_end,
                    deliveryMode=next_mode,
                    room=next_room,
                )
            ],
            exclude_session_id=session_id,
        )
        blocking = [c for c in conflicts if _is_blocking_conflict(c, payload.allowStudentConflicts)]
        if blocking:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="; ".join(blocking[0].reasons),
            )

    if payload.title is not None:
        sess.Title = payload.title.strip()
    if payload.sessionType is not None:
        sess.SessionType = payload.sessionType
    sess.DeliveryMode = next_mode
    sess.Room = next_room.strip() if next_room and next_room.strip() else None
    sess.StartAt = next_start
    sess.EndAt = next_end
    sess.Status = next_status
    if "notes" in payload.model_fields_set:
        sess.Notes = payload.notes.strip() if payload.notes and payload.notes.strip() else None

    db.commit()
    db.refresh(sess)
    return _format_session(sess)


@router.delete("/{session_id}", response_model=MessageResponse)
def delete_schedule_session(
    session_id: uuid.UUID,
    current_user: User = Depends(require_admin_or_lecturer),
    db: Session = Depends(get_db),
):
    """Delete a scheduled session (Admin or assigned lecturer)."""
    sess = db.query(CourseSession).filter(CourseSession.SessionId == session_id).first()
    if not sess:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Schedule session not found")

    _authorize_course_schedule_write(sess.CourseId, current_user, db)
    db.delete(sess)
    db.commit()
    return MessageResponse(message="Đã xóa buổi học khỏi lịch")
