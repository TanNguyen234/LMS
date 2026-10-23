"""Student workload feed, scoped to active enrollments; no fake progress values.

Dates from SQL Server are UTC-naive. Convert at the API boundary to explicit UTC.
No schema migrations or background jobs are necessary.
"""
from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.app.core.dependencies import require_student
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment, Course, Enrollment, Quiz, QuizAttempt, Submission, User,
)

router = APIRouter(prefix="/dashboard/student", tags=["Dashboard"])


class WorkloadItem(BaseModel):
    kind: Literal["ASSIGNMENT", "QUIZ"]
    id: uuid.UUID
    courseId: uuid.UUID
    courseCode: str
    courseTitle: str
    title: str
    dueAt: datetime
    status: str
    startAt: Optional[datetime] = None
    allowLate: Optional[bool] = None
    submittedAt: Optional[datetime] = None
    submissionStatus: Optional[str] = None
    attemptsUsed: Optional[int] = None
    maxAttempts: Optional[int] = None


class StudentWorkloadResponse(BaseModel):
    generatedAt: datetime
    items: list[WorkloadItem]


def utc_datetime(value: Optional[datetime]) -> Optional[datetime]:
    """SQL Server stores UTC in a naive datetime column."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.get("/workload", response_model=StudentWorkloadResponse)
def get_student_workload(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Published work only, never expose another student's submissions/attempts."""
    courses = (
        db.query(Course)
        .join(Enrollment, Enrollment.CourseId == Course.CourseId)
        .filter(
            Enrollment.StudentId == student.UserId,
            Enrollment.Status == "ACTIVE",
            Course.Status == "ACTIVE",
        )
        .all()
    )
    if not courses:
        return StudentWorkloadResponse(generatedAt=datetime.now(timezone.utc), items=[])

    course_by_id = {course.CourseId: course for course in courses}
    course_ids = list(course_by_id)
    items: list[WorkloadItem] = []

    # Single left join: no per-assignment HTTP calls, and submission is bound to this student.
    assignments = (
        db.query(Assignment, Submission)
        .outerjoin(
            Submission,
            and_(
                Submission.AssignmentId == Assignment.AssignmentId,
                Submission.StudentId == student.UserId,
            ),
        )
        .filter(
            Assignment.CourseId.in_(course_ids),
            Assignment.Status.in_(["PUBLISHED", "CLOSED"]),
        )
        .all()
    )
    for assignment, submission in assignments:
        course = course_by_id[assignment.CourseId]
        items.append(WorkloadItem(
            kind="ASSIGNMENT",
            id=assignment.AssignmentId,
            courseId=course.CourseId,
            courseCode=course.CourseCode,
            courseTitle=course.Title,
            title=assignment.Title,
            dueAt=utc_datetime(assignment.DueAt),
            status=assignment.Status,
            allowLate=assignment.AllowLate,
            submittedAt=utc_datetime(submission.SubmittedAt) if submission else None,
            submissionStatus=submission.Status if submission else None,
        ))

    quizzes = (
        db.query(Quiz)
        .filter(Quiz.CourseId.in_(course_ids), Quiz.IsPublished.is_(True))
        .all()
    )
    quiz_ids = [quiz.QuizId for quiz in quizzes]
    attempts_by_quiz: dict[uuid.UUID, int] = {}
    if quiz_ids:
        # Include expired attempts: they can consume an attempt according to quiz rules.
        for attempt in db.query(QuizAttempt).filter(
            QuizAttempt.StudentId == student.UserId,
            QuizAttempt.QuizId.in_(quiz_ids),
        ).all():
            attempts_by_quiz[attempt.QuizId] = attempts_by_quiz.get(attempt.QuizId, 0) + 1

    for quiz in quizzes:
        course = course_by_id[quiz.CourseId]
        items.append(WorkloadItem(
            kind="QUIZ",
            id=quiz.QuizId,
            courseId=course.CourseId,
            courseCode=course.CourseCode,
            courseTitle=course.Title,
            title=quiz.Title,
            dueAt=utc_datetime(quiz.EndAt),
            startAt=utc_datetime(quiz.StartAt),
            status="PUBLISHED",
            attemptsUsed=attempts_by_quiz.get(quiz.QuizId, 0),
            maxAttempts=quiz.MaxAttempts,
        ))

    items.sort(key=lambda item: (item.dueAt, item.kind, str(item.id)))
    return StudentWorkloadResponse(
        generatedAt=datetime.now(timezone.utc), items=items
    )
