from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from backend.app.db.session import get_db
from backend.app.models.models import (
    User, Course, Enrollment, Assignment, Submission, Quiz, Notification
)
from backend.app.schemas.schemas import (
    AdminDashboardResponse, LecturerDashboardResponse, StudentDashboardResponse, CourseResponse
)
from backend.app.core.dependencies import (
    require_admin, require_lecturer, require_student
)
from backend.app.api.routes.courses import format_course_response

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/admin", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin dashboard high-level metric counts."""
    total_users = db.query(User).count()
    total_courses = db.query(Course).count()
    total_students = db.query(User).filter(User.Role == "STUDENT").count()
    total_lecturers = db.query(User).filter(User.Role == "LECTURER").count()
    total_enrollments = db.query(Enrollment).filter(Enrollment.Status == "ACTIVE").count()

    return AdminDashboardResponse(
        totalUsers=total_users,
        totalCourses=total_courses,
        totalStudents=total_students,
        totalLecturers=total_lecturers,
        totalEnrollments=total_enrollments
    )


@router.get("/lecturer", response_model=LecturerDashboardResponse)
def get_lecturer_dashboard(
    lecturer: User = Depends(require_lecturer),
    db: Session = Depends(get_db)
):
    """Lecturer dashboard statistics."""
    taught_courses = db.query(Course).filter(Course.LecturerId == lecturer.UserId).all()
    course_ids = [c.CourseId for c in taught_courses]

    total_courses = len(taught_courses)

    total_students = (
        db.query(func.count(func.distinct(Enrollment.StudentId)))
        .filter(Enrollment.CourseId.in_(course_ids), Enrollment.Status == "ACTIVE")
        .scalar()
        if course_ids else 0
    )

    pending_subs = (
        db.query(Submission)
        .join(Assignment, Assignment.AssignmentId == Submission.AssignmentId)
        .filter(Assignment.CourseId.in_(course_ids), Submission.Status.in_(["SUBMITTED", "LATE"]))
        .count()
        if course_ids else 0
    )

    recent_courses = [format_course_response(c, db) for c in taught_courses[:5]]

    return LecturerDashboardResponse(
        totalCourses=total_courses,
        totalStudents=total_students or 0,
        totalPendingSubmissions=pending_subs,
        recentCourses=recent_courses
    )


@router.get("/student", response_model=StudentDashboardResponse)
def get_student_dashboard(
    student: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """Student personal dashboard statistics."""
    now = datetime.now(timezone.utc)

    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.StudentId == student.UserId, Enrollment.Status == "ACTIVE")
        .all()
    )
    course_ids = [e.CourseId for e in enrollments]

    enrolled_courses = (
        db.query(Course)
        .filter(Course.CourseId.in_(course_ids), Course.Status == "ACTIVE")
        .all()
        if course_ids else []
    )

    # Submitted assignment ids
    submitted_assignment_ids = [
        s.AssignmentId for s in db.query(Submission.AssignmentId).filter(Submission.StudentId == student.UserId).all()
    ]

    upcoming_assignments = (
        db.query(Assignment)
        .filter(
            Assignment.CourseId.in_(course_ids),
            Assignment.Status == "PUBLISHED",
            Assignment.DueAt > now,
            ~Assignment.AssignmentId.in_(submitted_assignment_ids) if submitted_assignment_ids else True
        )
        .count()
        if course_ids else 0
    )

    available_quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.CourseId.in_(course_ids),
            Quiz.IsPublished == True,
            Quiz.EndAt >= now
        )
        .count()
        if course_ids else 0
    )

    unread_notifs = db.query(Notification).filter(
        Notification.UserId == student.UserId,
        Notification.IsRead == False
    ).count()

    return StudentDashboardResponse(
        totalEnrolledCourses=len(enrolled_courses),
        upcomingAssignments=upcoming_assignments,
        availableQuizzes=available_quizzes,
        unreadNotifications=unread_notifs,
        enrolledCourses=[format_course_response(c, db) for c in enrolled_courses]
    )
