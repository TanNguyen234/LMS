"""Timetable conflict detection across lecturers, enrolled students, and rooms."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple
import uuid

from sqlalchemy.orm import Session, joinedload

from backend.app.models.models import Course, CourseSession, Enrollment, User
from backend.app.schemas.schemas import (
    ConflictCheckSlot,
    SlotConflictDetail,
    StudentConflictSample,
)


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _format_window(start_at: datetime, end_at: datetime, offset_minutes: int = 0) -> str:
    delta = timedelta(minutes=offset_minutes)
    s_local = start_at + delta
    e_local = end_at + delta
    return f"{s_local.strftime('%d/%m %H:%M')}-{e_local.strftime('%H:%M')}"


def check_slots_conflicts(
    db: Session,
    course: Course,
    slots: Sequence[ConflictCheckSlot],
    *,
    exclude_session_id: Optional[uuid.UUID] = None,
    timezone_offset_minutes: int = 0,
) -> List[SlotConflictDetail]:
    """
    Evaluate candidate schedule slots for a course against:
    1) Lecturer's other scheduled sessions (across all active/draft courses they teach).
    2) Enrolled students' scheduled sessions in other active courses.
    3) Physical room double-booking (when deliveryMode == 'IN_PERSON' and room is set).
    """
    if not slots:
        return []

    normalized_slots: List[Tuple[datetime, datetime, str, str]] = []
    min_start: Optional[datetime] = None
    max_end: Optional[datetime] = None
    for slot in slots:
        s_dt = _naive_utc(slot.startAt)
        e_dt = _naive_utc(slot.endAt)
        mode = (slot.deliveryMode or "IN_PERSON").upper()
        room = (slot.room or "").strip()
        normalized_slots.append((s_dt, e_dt, mode, room))
        min_start = s_dt if min_start is None or s_dt < min_start else min_start
        max_end = e_dt if max_end is None or e_dt > max_end else max_end

    # Preload enrolled active students of the target course
    enrolled_rows = (
        db.query(User.UserId, User.FullName, User.StudentCode)
        .join(Enrollment, Enrollment.StudentId == User.UserId)
        .filter(
            Enrollment.CourseId == course.CourseId,
            Enrollment.Status == "ACTIVE",
            User.IsActive == True,  # noqa: E712
        )
        .all()
    )
    course_students: Dict[uuid.UUID, Tuple[str, Optional[str]]] = {
        uid: (name, code) for uid, name, code in enrolled_rows
    }
    student_ids = list(course_students.keys())

    # Preload overlapping non-cancelled sessions across non-archived courses within [min_start, max_end]
    candidate_query = (
        db.query(CourseSession)
        .options(joinedload(CourseSession.course))
        .join(Course, Course.CourseId == CourseSession.CourseId)
        .filter(
            CourseSession.Status != "CANCELLED",
            Course.Status != "ARCHIVED",
            CourseSession.StartAt < max_end,
            CourseSession.EndAt > min_start,
        )
    )
    if exclude_session_id is not None:
        candidate_query = candidate_query.filter(CourseSession.SessionId != exclude_session_id)
    overlapping_pool = candidate_query.all()

    # Map other courses' active enrolled students for fast overlap lookup
    other_course_ids = {
        s.CourseId for s in overlapping_pool if s.CourseId != course.CourseId
    }
    students_in_other_courses: Dict[uuid.UUID, List[uuid.UUID]] = {}
    if student_ids and other_course_ids:
        enr_other = (
            db.query(Enrollment.CourseId, Enrollment.StudentId)
            .filter(
                Enrollment.CourseId.in_(other_course_ids),
                Enrollment.StudentId.in_(student_ids),
                Enrollment.Status == "ACTIVE",
            )
            .all()
        )
        for cid, sid in enr_other:
            students_in_other_courses.setdefault(cid, []).append(sid)

    conflicts: List[SlotConflictDetail] = []
    for s_dt, e_dt, mode, room in normalized_slots:
        lecturer_conflict = False
        lecturer_detail: Optional[str] = None
        room_conflict = False
        room_detail: Optional[str] = None
        student_samples: List[StudentConflictSample] = []
        seen_student_pairs: set[Tuple[uuid.UUID, uuid.UUID]] = set()
        reasons: List[str] = []

        for existing in overlapping_pool:
            ex_start = _naive_utc(existing.StartAt)
            ex_end = _naive_utc(existing.EndAt)
            if not (ex_start < e_dt and ex_end > s_dt):
                continue

            ex_course = existing.course
            ex_code = ex_course.CourseCode if ex_course else "N/A"
            if ex_course and ex_course.SectionCode:
                ex_code = f"{ex_code} ({ex_course.SectionCode})"

            # 1. Lecturer conflict (includes same lecturer teaching any course at overlapping window)
            if ex_course and ex_course.LecturerId == course.LecturerId and not lecturer_conflict:
                lecturer_conflict = True
                lecturer_detail = (
                    f"Giảng viên trùng lịch với lớp {ex_code}: "
                    f"{existing.Title} ({_format_window(ex_start, ex_end, timezone_offset_minutes)})"
                )
                reasons.append(lecturer_detail)

            # 2. Room conflict (IN_PERSON only with non-empty room)
            if (
                mode == "IN_PERSON"
                and room
                and (existing.DeliveryMode or "").upper() == "IN_PERSON"
                and (existing.Room or "").strip().lower() == room.lower()
                and not room_conflict
            ):
                room_conflict = True
                room_detail = (
                    f"Phòng '{room}' đã được lớp {ex_code} sử dụng "
                    f"({_format_window(ex_start, ex_end, timezone_offset_minutes)})"
                )
                reasons.append(room_detail)

            # 3. Student conflicts (other courses sharing active students)
            if existing.CourseId != course.CourseId:
                shared_sids = students_in_other_courses.get(existing.CourseId, [])
                for sid in shared_sids:
                    pair = (sid, existing.SessionId)
                    if pair in seen_student_pairs:
                        continue
                    seen_student_pairs.add(pair)
                    st_name, st_code = course_students[sid]
                    student_samples.append(
                        StudentConflictSample(
                            studentId=sid,
                            studentName=st_name,
                            studentCode=st_code,
                            conflictingCourseCode=ex_code,
                            conflictingTitle=existing.Title,
                            conflictingStartAt=ex_start,
                            conflictingEndAt=ex_end,
                        )
                    )

        distinct_student_ids = {s.studentId for s in student_samples}
        if distinct_student_ids:
            preview = ", ".join(
                f"{s.studentCode + ' - ' if s.studentCode else ''}{s.studentName} ({s.conflictingCourseCode})"
                for s in student_samples[:3]
            )
            extra = f" và {len(distinct_student_ids) - 3} sinh viên khác" if len(distinct_student_ids) > 3 else ""
            reasons.append(f"Trùng lịch của {len(distinct_student_ids)} sinh viên: {preview}{extra}")

        if lecturer_conflict or room_conflict or distinct_student_ids:
            conflicts.append(
                SlotConflictDetail(
                    startAt=s_dt,
                    endAt=e_dt,
                    lecturerConflict=lecturer_conflict,
                    lecturerConflictDetail=lecturer_detail,
                    roomConflict=room_conflict,
                    roomConflictDetail=room_detail,
                    studentConflictCount=len(distinct_student_ids),
                    studentConflicts=student_samples[:10],
                    reasons=reasons,
                )
            )

    return conflicts


def find_student_enrollment_schedule_conflicts(
    db: Session,
    student_id: uuid.UUID,
    target_course_id: uuid.UUID,
) -> Optional[str]:
    """
    Check whether target_course_id's scheduled sessions collide with any session
    of the student's existing ACTIVE enrolled courses. Returns a clear detail string or None.
    """
    target_sessions = (
        db.query(CourseSession)
        .filter(
            CourseSession.CourseId == target_course_id,
            CourseSession.Status != "CANCELLED",
        )
        .all()
    )
    if not target_sessions:
        return None

    min_start = min(_naive_utc(s.StartAt) for s in target_sessions)
    max_end = max(_naive_utc(s.EndAt) for s in target_sessions)

    existing_sessions = (
        db.query(CourseSession)
        .options(joinedload(CourseSession.course))
        .join(Course, Course.CourseId == CourseSession.CourseId)
        .join(Enrollment, Enrollment.CourseId == Course.CourseId)
        .filter(
            Enrollment.StudentId == student_id,
            Enrollment.Status == "ACTIVE",
            Course.Status == "ACTIVE",
            Course.CourseId != target_course_id,
            CourseSession.Status != "CANCELLED",
            CourseSession.StartAt < max_end,
            CourseSession.EndAt > min_start,
        )
        .all()
    )
    if not existing_sessions:
        return None

    for ts in target_sessions:
        t_start = _naive_utc(ts.StartAt)
        t_end = _naive_utc(ts.EndAt)
        for ex in existing_sessions:
            e_start = _naive_utc(ex.StartAt)
            e_end = _naive_utc(ex.EndAt)
            if t_start < e_end and t_end > e_start:
                ex_code = ex.course.CourseCode if ex.course else "lớp khác"
                return (
                    f"Trùng thời khóa biểu với lớp {ex_code} "
                    f"({ex.Title}, {_format_window(e_start, e_end)})"
                )
    return None
