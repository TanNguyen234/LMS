import uuid
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.app.api.routes.courses import format_course_response
from backend.app.core.dependencies import (
    get_current_user,
    require_admin,
    require_lecturer,
    require_student,
    verify_course_read_access,
)
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment,
    Course,
    Enrollment,
    Lesson,
    LessonProgress,
    Meeting,
    Module,
    Notification,
    Quiz,
    QuizAttempt,
    Submission,
    User,
    utcnow,
)
from backend.app.schemas.common import UtcDateTime
from backend.app.schemas.schemas import (
    AdminDashboardResponse,
    CalendarEventItem,
    LecturerDashboardResponse,
    StudentDashboardResponse,
)
from backend.app.services.grading import build_student_transcript

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _to_naive_utc(dt: datetime | str) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _load_lecturer_names(courses: List[Course], db: Session) -> Dict[uuid.UUID, str]:
    lecturer_ids = {c.LecturerId for c in courses if c.LecturerId is not None}
    if not lecturer_ids:
        return {}
    return {
        uid: name
        for uid, name in db.query(User.UserId, User.FullName).filter(User.UserId.in_(lecturer_ids)).all()
    }


@router.get("/admin", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin dashboard high-level metric counts excluding inactive users cleanly."""
    total_users = db.query(User).filter(User.IsActive == True).count()
    total_students = db.query(User).filter(User.Role == "STUDENT", User.IsActive == True).count()
    total_lecturers = db.query(User).filter(User.Role == "LECTURER", User.IsActive == True).count()

    active_courses = db.query(Course).filter(Course.Status == "ACTIVE").count()
    draft_courses = db.query(Course).filter(Course.Status == "DRAFT").count()
    archived_courses = db.query(Course).filter(Course.Status == "ARCHIVED").count()
    total_courses = active_courses + draft_courses + archived_courses

    total_enrollments = (
        db.query(Enrollment)
        .join(Course, Course.CourseId == Enrollment.CourseId)
        .join(User, User.UserId == Enrollment.StudentId)
        .filter(
            Enrollment.Status == "ACTIVE",
            Course.Status == "ACTIVE",
            User.IsActive == True,
        )
        .count()
    )
    active_meetings = (
        db.query(Meeting)
        .join(Course, Course.CourseId == Meeting.CourseId)
        .filter(Meeting.Status == "LIVE", Course.Status == "ACTIVE")
        .count()
    )

    return AdminDashboardResponse(
        totalUsers=total_users,
        totalCourses=total_courses,
        totalStudents=total_students,
        totalLecturers=total_lecturers,
        totalEnrollments=total_enrollments,
        activeCourses=active_courses,
        draftCourses=draft_courses,
        archivedCourses=archived_courses,
        activeMeetings=active_meetings,
    )


@router.get("/lecturer", response_model=LecturerDashboardResponse)
def get_lecturer_dashboard(
    lecturer: User = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    """Lecturer dashboard statistics across active courses (excluding DRAFT/ARCHIVED and inactive students)."""
    active_courses = (
        db.query(Course)
        .filter(Course.LecturerId == lecturer.UserId, Course.Status == "ACTIVE")
        .order_by(Course.CreatedAt.desc())
        .all()
    )
    active_course_ids = [c.CourseId for c in active_courses]

    total_students = (
        db.query(func.count(func.distinct(Enrollment.StudentId)))
        .join(User, User.UserId == Enrollment.StudentId)
        .filter(
            Enrollment.CourseId.in_(active_course_ids),
            Enrollment.Status == "ACTIVE",
            User.IsActive == True,
        )
        .scalar()
        if active_course_ids
        else 0
    )

    pending_subs = (
        db.query(Submission)
        .join(Assignment, Assignment.AssignmentId == Submission.AssignmentId)
        .filter(
            Assignment.CourseId.in_(active_course_ids),
            Assignment.Status != "DRAFT",
            Submission.Status.in_(["SUBMITTED", "LATE"]),
        )
        .count()
        if active_course_ids
        else 0
    )

    total_quizzes = (
        db.query(Quiz)
        .filter(Quiz.CourseId.in_(active_course_ids))
        .count()
        if active_course_ids
        else 0
    )

    active_meetings = (
        db.query(Meeting)
        .filter(Meeting.CourseId.in_(active_course_ids), Meeting.Status == "LIVE")
        .count()
        if active_course_ids
        else 0
    )

    recent_slice = active_courses[:5]
    lecturer_map = _load_lecturer_names(recent_slice, db)
    recent_courses = [format_course_response(c, db, lecturer_map=lecturer_map) for c in recent_slice]

    return LecturerDashboardResponse(
        totalCourses=len(active_courses),
        totalStudents=int(total_students or 0),
        totalPendingSubmissions=pending_subs,
        totalQuizzes=total_quizzes,
        activeMeetings=active_meetings,
        recentCourses=recent_courses,
    )


@router.get("/student", response_model=StudentDashboardResponse)
def get_student_dashboard(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Student dashboard KPIs using naive UTC SQL Server comparisons, 7-day deadlines, progress & real GPA."""
    now_utc = utcnow()
    horizon_utc = now_utc + timedelta(days=7)

    enrolled_courses = (
        db.query(Course)
        .join(Enrollment, Enrollment.CourseId == Course.CourseId)
        .filter(
            Enrollment.StudentId == student.UserId,
            Enrollment.Status == "ACTIVE",
            Course.Status == "ACTIVE",
        )
        .order_by(Course.CreatedAt.desc())
        .all()
    )
    course_ids = [c.CourseId for c in enrolled_courses]

    submitted_assignment_ids = [
        s.AssignmentId
        for s in db.query(Submission.AssignmentId).filter(Submission.StudentId == student.UserId).all()
    ]

    upcoming_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.CourseId.in_(course_ids),
            Assignment.Status == "PUBLISHED",
            Assignment.DueAt > now_utc,
            Assignment.DueAt <= horizon_utc,
            ~Assignment.AssignmentId.in_(submitted_assignment_ids) if submitted_assignment_ids else True,
        )
        .count()
        if course_ids
        else 0
    )

    candidate_quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.CourseId.in_(course_ids),
            Quiz.IsPublished == True,
            Quiz.EndAt >= now_utc,
            Quiz.StartAt <= horizon_utc,
        )
        .all()
        if course_ids
        else []
    )
    available_quizzes = 0
    if candidate_quizzes:
        quiz_ids = [q.QuizId for q in candidate_quizzes]
        attempt_rows = (
            db.query(QuizAttempt.QuizId, func.count(QuizAttempt.AttemptId))
            .filter(
                QuizAttempt.QuizId.in_(quiz_ids),
                QuizAttempt.StudentId == student.UserId,
                QuizAttempt.Status != "IN_PROGRESS",
            )
            .group_by(QuizAttempt.QuizId)
            .all()
        )
        attempt_counts = {qid: int(cnt or 0) for qid, cnt in attempt_rows}
        for q in candidate_quizzes:
            if attempt_counts.get(q.QuizId, 0) < int(q.MaxAttempts or 1):
                available_quizzes += 1

    unread_notifs = (
        db.query(Notification)
        .filter(Notification.UserId == student.UserId, Notification.IsRead == False)
        .count()
    )

    published_lesson_ids = (
        [
            lid
            for (lid,) in (
                db.query(Lesson.LessonId)
                .join(Module, Module.ModuleId == Lesson.ModuleId)
                .filter(
                    Module.CourseId.in_(course_ids),
                    Module.IsPublished == True,
                    Lesson.IsPublished == True,
                )
                .all()
            )
        ]
        if course_ids
        else []
    )
    total_lessons = len(published_lesson_ids)
    completed_lessons = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.StudentId == student.UserId,
            LessonProgress.LessonId.in_(published_lesson_ids),
            LessonProgress.IsCompleted == True,
        )
        .count()
        if published_lesson_ids
        else 0
    )

    transcript = build_student_transcript(db, student.UserId)
    lecturer_map = _load_lecturer_names(enrolled_courses, db)

    return StudentDashboardResponse(
        totalEnrolledCourses=len(enrolled_courses),
        upcomingAssignments=upcoming_assignments,
        availableQuizzes=available_quizzes,
        unreadNotifications=unread_notifs,
        gpa=transcript["provisionalGpaScale10"],
        gpaScale4=transcript["provisionalGpaScale4"],
        completedLessons=completed_lessons,
        totalLessons=total_lessons,
        enrolledCourses=[
            format_course_response(c, db, lecturer_map=lecturer_map, mask_join_code=True)
            for c in enrolled_courses
        ],
    )


@router.get("/calendar", response_model=List[CalendarEventItem])
def get_dashboard_calendar(
    from_dt: Optional[UtcDateTime] = Query(None, alias="from"),
    to_dt: Optional[UtcDateTime] = Query(None, alias="to"),
    course_id: Optional[uuid.UUID] = Query(None, alias="courseId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Unified calendar feed merging Assignment deadlines, Quiz windows, and Classroom Meetings."""
    if course_id is not None:
        course = verify_course_read_access(course_id, current_user, db)
        courses = [course]
    elif current_user.Role == "ADMIN":
        courses = db.query(Course).filter(Course.Status == "ACTIVE").all()
    elif current_user.Role == "LECTURER":
        courses = (
            db.query(Course)
            .filter(Course.LecturerId == current_user.UserId, Course.Status == "ACTIVE")
            .all()
        )
    elif current_user.Role == "STUDENT":
        courses = (
            db.query(Course)
            .join(Enrollment, Enrollment.CourseId == Course.CourseId)
            .filter(
                Enrollment.StudentId == current_user.UserId,
                Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
                Course.Status.in_(["ACTIVE", "ARCHIVED"]),
            )
            .all()
        )
    else:
        return []

    if not courses:
        return []

    course_map = {c.CourseId: c for c in courses}
    course_ids = list(course_map.keys())
    from_naive = _to_naive_utc(from_dt) if from_dt is not None else None
    to_naive = _to_naive_utc(to_dt) if to_dt is not None else None

    events: List[CalendarEventItem] = []

    a_query = db.query(Assignment).filter(Assignment.CourseId.in_(course_ids))
    if current_user.Role == "STUDENT":
        a_query = a_query.filter(Assignment.Status.in_(["PUBLISHED", "CLOSED"]))
    if from_naive is not None:
        a_query = a_query.filter(Assignment.DueAt >= from_naive)
    if to_naive is not None:
        a_query = a_query.filter(Assignment.DueAt <= to_naive)
    for a in a_query.all():
        c = course_map[a.CourseId]
        events.append(
            CalendarEventItem(
                id=a.AssignmentId,
                courseId=c.CourseId,
                courseCode=c.CourseCode,
                courseTitle=c.Title,
                kind="ASSIGNMENT",
                title=a.Title,
                startAt=None,
                endAt=a.DueAt,
                status=a.Status,
                relatedUrl=f"/courses/{c.CourseId}/assignments/{a.AssignmentId}",
            )
        )

    q_query = db.query(Quiz).filter(Quiz.CourseId.in_(course_ids))
    if current_user.Role == "STUDENT":
        q_query = q_query.filter(Quiz.IsPublished == True)
    if from_naive is not None:
        q_query = q_query.filter(Quiz.EndAt >= from_naive)
    if to_naive is not None:
        q_query = q_query.filter(Quiz.StartAt <= to_naive)
    for q in q_query.all():
        c = course_map[q.CourseId]
        events.append(
            CalendarEventItem(
                id=q.QuizId,
                courseId=c.CourseId,
                courseCode=c.CourseCode,
                courseTitle=c.Title,
                kind="QUIZ",
                title=q.Title,
                startAt=q.StartAt,
                endAt=q.EndAt,
                status="PUBLISHED" if q.IsPublished else "DRAFT",
                relatedUrl=f"/courses/{c.CourseId}/quizzes/{q.QuizId}",
            )
        )

    m_query = db.query(Meeting).filter(Meeting.CourseId.in_(course_ids))
    if from_naive is not None:
        m_query = m_query.filter(Meeting.StartedAt >= from_naive - timedelta(days=1))
    if to_naive is not None:
        m_query = m_query.filter(Meeting.StartedAt <= to_naive)
    for m in m_query.all():
        c = course_map[m.CourseId]
        m_end = m.EndedAt or (_to_naive_utc(m.StartedAt) + timedelta(hours=1))
        events.append(
            CalendarEventItem(
                id=m.MeetingId,
                courseId=c.CourseId,
                courseCode=c.CourseCode,
                courseTitle=c.Title,
                kind="MEETING",
                title=m.Title,
                startAt=m.StartedAt,
                endAt=m_end,
                status=m.Status,
                relatedUrl=f"/courses/{c.CourseId}/classroom",
            )
        )

    events.sort(key=lambda ev: _to_naive_utc(ev.endAt))
    return events
