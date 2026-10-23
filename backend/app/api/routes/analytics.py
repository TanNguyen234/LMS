"""Role-aware LMS analytics and lecturer grading workbench.

All metrics are derived from persisted SQL Server rows. This module does not
compute an official GPA, infer attendance, or modify grades.
"""
from collections import defaultdict
from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from backend.app.core.dependencies import require_admin, require_student, require_lecturer
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment, Course, Enrollment, Grade, Lesson, Module, Quiz,
    Submission, User,
)
from backend.app.api.routes.workload import utc_datetime

router = APIRouter(prefix="/analytics", tags=["Analytics"])


class TeachingCourse(BaseModel):
    courseId: uuid.UUID
    courseCode: str
    title: str
    activeStudents: int
    publishedLessons: int
    publishedAssignments: int
    publishedQuizzes: int
    awaitingGrade: int
    gradedSubmissions: int


class GradingQueueItem(BaseModel):
    submissionId: uuid.UUID
    assignmentId: uuid.UUID
    courseId: uuid.UUID
    courseCode: str
    courseTitle: str
    assignmentTitle: str
    studentName: str
    studentCode: Optional[str] = None
    submittedAt: datetime
    status: Literal["SUBMITTED", "LATE"]
    maxScore: float
    contentPreview: str


class TeachingAnalytics(BaseModel):
    generatedAt: datetime
    totalPending: int
    shownPending: int
    courses: list[TeachingCourse]
    queue: list[GradingQueueItem]


class StudentCourseResults(BaseModel):
    courseId: uuid.UUID
    courseCode: str
    title: str
    gradedItems: int
    averageOutOfTen: Optional[float] = None


class StudentGradeItem(BaseModel):
    gradeId: uuid.UUID
    courseId: uuid.UUID
    courseCode: str
    itemType: str
    score: float
    maxScore: float
    normalizedOutOfTen: float
    gradedAt: datetime


class LearningAnalytics(BaseModel):
    generatedAt: datetime
    totalGradedItems: int
    averageOutOfTen: Optional[float] = None
    courses: list[StudentCourseResults]
    recentGrades: list[StudentGradeItem]


class OperationAnalytics(BaseModel):
    generatedAt: datetime
    totalUsers: int
    activeUsers: int
    inactiveUsers: int
    roles: dict[str, int]
    courseStatuses: dict[str, int]
    activeEnrollments: int
    pendingSubmissions: int
    publishedLessons: int
    publishedQuizzes: int


def grouped_counts(query) -> dict:
    return {key: int(value) for key, value in query.all()}


@router.get("/teaching", response_model=TeachingAnalytics)
def teaching_analytics(
    lecturer: User = Depends(require_lecturer),
    db: Session = Depends(get_db),
):
    """Only courses assigned to lecturer; grading queue lists their own students."""
    courses = db.query(Course).filter(
        Course.LecturerId == lecturer.UserId,
        Course.Status == "ACTIVE",
    ).order_by(Course.CourseCode).all()
    ids = [course.CourseId for course in courses]
    now = datetime.now(timezone.utc)
    if not ids:
        return TeachingAnalytics(generatedAt=now, totalPending=0, shownPending=0, courses=[], queue=[])

    students = grouped_counts(
        db.query(Enrollment.CourseId, func.count(func.distinct(Enrollment.StudentId)))
        .filter(Enrollment.CourseId.in_(ids), Enrollment.Status == "ACTIVE")
        .group_by(Enrollment.CourseId)
    )
    lessons = grouped_counts(
        db.query(Module.CourseId, func.count(Lesson.LessonId))
        .join(Lesson, Lesson.ModuleId == Module.ModuleId)
        .filter(Module.CourseId.in_(ids), Module.IsPublished == True, Lesson.IsPublished == True)
        .group_by(Module.CourseId)
    )
    assignments = grouped_counts(
        db.query(Assignment.CourseId, func.count(Assignment.AssignmentId))
        .filter(Assignment.CourseId.in_(ids), Assignment.Status.in_(["PUBLISHED", "CLOSED"]))
        .group_by(Assignment.CourseId)
    )
    quizzes = grouped_counts(
        db.query(Quiz.CourseId, func.count(Quiz.QuizId))
        .filter(Quiz.CourseId.in_(ids), Quiz.IsPublished == True)
        .group_by(Quiz.CourseId)
    )

    statuses = db.query(Assignment.CourseId, Submission.Status, func.count(Submission.SubmissionId)).join(
        Submission, Submission.AssignmentId == Assignment.AssignmentId
    ).filter(Assignment.CourseId.in_(ids)).group_by(Assignment.CourseId, Submission.Status).all()
    pending, graded = defaultdict(int), defaultdict(int)
    for course_id, state, count in statuses:
        if state in {"SUBMITTED", "LATE"}:
            pending[course_id] += int(count)
        elif state == "GRADED":
            graded[course_id] += int(count)

    course_stats = [
        TeachingCourse(
            courseId=c.CourseId,
            courseCode=c.CourseCode,
            title=c.Title,
            activeStudents=students.get(c.CourseId, 0),
            publishedLessons=lessons.get(c.CourseId, 0),
            publishedAssignments=assignments.get(c.CourseId, 0),
            publishedQuizzes=quizzes.get(c.CourseId, 0),
            awaitingGrade=pending[c.CourseId],
            gradedSubmissions=graded[c.CourseId],
        ) for c in courses
    ]
    rows = (
        db.query(Submission, Assignment, Course, User)
        .select_from(Submission)
        .join(Assignment, Submission.AssignmentId == Assignment.AssignmentId)
        .join(Course, Course.CourseId == Assignment.CourseId)
        .join(User, User.UserId == Submission.StudentId)
        .filter(
            Course.CourseId.in_(ids),
            Submission.Status.in_(["SUBMITTED", "LATE"]),
            User.Role == "STUDENT",
        )
        .order_by(Submission.SubmittedAt.asc(), Submission.SubmissionId.asc())
        .limit(60)
        .all()
    )
    queue = [
        GradingQueueItem(
            submissionId=sub.SubmissionId,
            assignmentId=assignment.AssignmentId,
            courseId=course.CourseId,
            courseCode=course.CourseCode,
            courseTitle=course.Title,
            assignmentTitle=assignment.Title,
            studentName=student.FullName,
            studentCode=student.StudentCode,
            submittedAt=utc_datetime(sub.SubmittedAt),
            status=sub.Status,
            maxScore=float(assignment.MaxScore),
            contentPreview=(sub.ContentText or "").strip()[:240],
        ) for sub, assignment, course, student in rows
    ]
    return TeachingAnalytics(
        generatedAt=now,
        totalPending=sum(pending.values()),
        shownPending=len(queue),
        courses=course_stats,
        queue=queue,
    )


@router.get("/learning", response_model=LearningAnalytics)
def learning_analytics(
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Unweighted descriptive averages of *recorded* items, never official GPA."""
    courses = (
        db.query(Course)
        .join(Enrollment, Enrollment.CourseId == Course.CourseId)
        .filter(
            Enrollment.StudentId == student.UserId,
            Enrollment.Status == "ACTIVE",
            Course.Status == "ACTIVE",
        )
        .order_by(Course.CourseCode)
        .all()
    )
    course_by_id = {course.CourseId: course for course in courses}
    ids = list(course_by_id)
    if not ids:
        return LearningAnalytics(generatedAt=datetime.now(timezone.utc), totalGradedItems=0, courses=[], recentGrades=[])
    grades = db.query(Grade).filter(
        Grade.StudentId == student.UserId,
        Grade.CourseId.in_(ids),
        Grade.MaxScore > 0,
    ).order_by(Grade.GradedAt.desc(), Grade.GradeId.desc()).all()

    normalized: dict[uuid.UUID, list[float]] = defaultdict(list)
    recent: list[StudentGradeItem] = []
    for grade in grades:
        ratio = float(grade.Score) / float(grade.MaxScore) * 10
        normalized[grade.CourseId].append(ratio)
        if len(recent) < 20:
            recent.append(StudentGradeItem(
                gradeId=grade.GradeId,
                courseId=grade.CourseId,
                courseCode=course_by_id[grade.CourseId].CourseCode,
                itemType=grade.SourceType,
                score=float(grade.Score),
                maxScore=float(grade.MaxScore),
                normalizedOutOfTen=round(ratio, 2),
                gradedAt=utc_datetime(grade.GradedAt),
            ))
    course_results = [
        StudentCourseResults(
            courseId=course.CourseId,
            courseCode=course.CourseCode,
            title=course.Title,
            gradedItems=len(normalized[course.CourseId]),
            averageOutOfTen=round(sum(normalized[course.CourseId]) / len(normalized[course.CourseId]), 2)
            if normalized[course.CourseId] else None,
        ) for course in courses
    ]
    scores = [score for group in normalized.values() for score in group]
    return LearningAnalytics(
        generatedAt=datetime.now(timezone.utc),
        totalGradedItems=len(scores),
        averageOutOfTen=round(sum(scores) / len(scores), 2) if scores else None,
        courses=course_results,
        recentGrades=recent,
    )


@router.get("/operations", response_model=OperationAnalytics)
def operation_analytics(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    roles = grouped_counts(db.query(User.Role, func.count(User.UserId)).group_by(User.Role))
    states = grouped_counts(db.query(Course.Status, func.count(Course.CourseId)).group_by(Course.Status))
    active_users = db.query(User).filter(User.IsActive == True).count()
    total_users = sum(roles.values())
    pending = (
        db.query(Submission)
        .join(Assignment, Assignment.AssignmentId == Submission.AssignmentId)
        .join(Course, Course.CourseId == Assignment.CourseId)
        .filter(
            Course.Status == "ACTIVE",
            Submission.Status.in_(["SUBMITTED", "LATE"]),
        )
        .count()
    )
    lesson_count = (
        db.query(Lesson)
        .join(Module, Module.ModuleId == Lesson.ModuleId)
        .join(Course, Course.CourseId == Module.CourseId)
        .filter(
            Course.Status == "ACTIVE",
            Module.IsPublished == True,
            Lesson.IsPublished == True,
        )
        .count()
    )
    quiz_count = db.query(Quiz).join(Course, Course.CourseId == Quiz.CourseId).filter(
        Course.Status == "ACTIVE", Quiz.IsPublished == True
    ).count()
    return OperationAnalytics(
        generatedAt=datetime.now(timezone.utc),
        totalUsers=total_users,
        activeUsers=active_users,
        inactiveUsers=total_users - active_users,
        roles=roles,
        courseStatuses=states,
        activeEnrollments=db.query(Enrollment).join(
            Course, Course.CourseId == Enrollment.CourseId
        ).filter(Enrollment.Status == "ACTIVE", Course.Status == "ACTIVE").count(),
        pendingSubmissions=pending,
        publishedLessons=lesson_count,
        publishedQuizzes=quiz_count,
    )
