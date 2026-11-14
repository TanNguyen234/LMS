"""Lesson progress routes (Wave 1 owner: learning-flows-dev)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    require_student,
    verify_course_read_access,
    verify_course_write_access,
)
from backend.app.db.session import get_db
from backend.app.models.models import Course, Enrollment, Lesson, LessonProgress, Module, User, utcnow
from backend.app.schemas.common import UtcDateTime
from backend.app.schemas.schemas import (
    CourseProgressSummaryResponse,
    LessonProgressItemResponse,
    LessonProgressUpdate,
)

router = APIRouter(tags=["Learning Progress"])


class StudentCourseProgressRow(BaseModel):
    studentId: uuid.UUID
    studentName: str
    studentCode: Optional[str] = None
    studentEmail: Optional[str] = None
    enrollmentStatus: str
    completedLessons: int
    totalLessons: int
    completionPercent: float
    totalTimeSpentSeconds: int
    lastActivityAt: Optional[UtcDateTime] = None
    completedLessonIds: List[uuid.UUID] = []


class CourseClassProgressResponse(BaseModel):
    courseId: uuid.UUID
    totalLessons: int
    students: List[StudentCourseProgressRow] = []


def _format_progress_item(progress: LessonProgress) -> LessonProgressItemResponse:
    return LessonProgressItemResponse(
        lessonId=progress.LessonId,
        isCompleted=bool(progress.IsCompleted),
        completedAt=progress.CompletedAt,
        lastViewedAt=progress.LastViewedAt,
        timeSpentSeconds=int(progress.TimeSpentSeconds or 0),
    )


@router.post("/lessons/{lesson_id}/progress", response_model=LessonProgressItemResponse)
def update_lesson_progress(
    lesson_id: uuid.UUID,
    body: LessonProgressUpdate,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Record lesson view/completion progress for an actively enrolled student."""
    row = (
        db.query(Lesson, Module)
        .join(Module, Module.ModuleId == Lesson.ModuleId)
        .filter(Lesson.LessonId == lesson_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    lesson, module = row
    verify_course_write_access(module.CourseId, student, db)
    if not module.IsPublished or not lesson.IsPublished:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    now = utcnow()

    def _apply(target: LessonProgress) -> LessonProgress:
        target.LastViewedAt = now
        target.TimeSpentSeconds = max(0, int(target.TimeSpentSeconds or 0) + int(body.timeSpentDeltaSeconds or 0))
        if body.isCompleted is True:
            target.IsCompleted = True
            if target.CompletedAt is None:
                target.CompletedAt = now
        elif body.isCompleted is False:
            target.IsCompleted = False
            target.CompletedAt = None
        return target

    progress = (
        db.query(LessonProgress)
        .filter(LessonProgress.LessonId == lesson_id, LessonProgress.StudentId == student.UserId)
        .first()
    )
    try:
        if progress is None:
            progress = LessonProgress(
                ProgressId=uuid.uuid4(),
                LessonId=lesson_id,
                StudentId=student.UserId,
                IsCompleted=False,
                LastViewedAt=now,
                TimeSpentSeconds=0,
            )
            _apply(progress)
            db.add(progress)
        else:
            _apply(progress)
        db.commit()
        db.refresh(progress)
    except IntegrityError:
        db.rollback()
        progress = (
            db.query(LessonProgress)
            .filter(LessonProgress.LessonId == lesson_id, LessonProgress.StudentId == student.UserId)
            .first()
        )
        if not progress:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Progress update conflict")
        _apply(progress)
        db.commit()
        db.refresh(progress)

    return _format_progress_item(progress)


@router.get(
    "/courses/{course_id}/progress",
    response_model=Union[CourseProgressSummaryResponse, CourseClassProgressResponse],
)
def get_course_progress(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_read_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get course learning progress:
    - Student: own lesson progress summary across published lessons
    - Lecturer/Admin: whole-class progress matrix (ACTIVE & COMPLETED enrollments)
    """
    published_lessons = (
        db.query(Lesson.LessonId)
        .join(Module, Module.ModuleId == Lesson.ModuleId)
        .filter(
            Module.CourseId == course_id,
            Module.IsPublished == True,
            Lesson.IsPublished == True,
        )
        .order_by(Module.SortOrder.asc(), Lesson.SortOrder.asc())
        .all()
    )
    lesson_ids = [lid for (lid,) in published_lessons]
    total_lessons = len(lesson_ids)

    if current_user.Role == "STUDENT":
        entries = (
            db.query(LessonProgress)
            .filter(
                LessonProgress.StudentId == current_user.UserId,
                LessonProgress.LessonId.in_(lesson_ids),
            )
            .all()
            if lesson_ids
            else []
        )
        completed_count = sum(1 for e in entries if e.IsCompleted)
        pct = round((completed_count / total_lessons) * 100.0, 2) if total_lessons > 0 else 0.0
        return CourseProgressSummaryResponse(
            courseId=course_id,
            totalLessons=total_lessons,
            completedLessons=completed_count,
            completionPercent=pct,
            items=[_format_progress_item(e) for e in entries],
        )

    enrollments = (
        db.query(Enrollment, User)
        .join(User, User.UserId == Enrollment.StudentId)
        .filter(
            Enrollment.CourseId == course_id,
            Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
        )
        .order_by(User.FullName.asc())
        .all()
    )
    if not enrollments:
        return CourseClassProgressResponse(courseId=course_id, totalLessons=total_lessons, students=[])

    student_ids = [enr.StudentId for enr, _ in enrollments]
    progress_rows = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.LessonId.in_(lesson_ids),
            LessonProgress.StudentId.in_(student_ids),
        )
        .all()
        if lesson_ids and student_ids
        else []
    )
    by_student: Dict[uuid.UUID, List[LessonProgress]] = {}
    for row in progress_rows:
        by_student.setdefault(row.StudentId, []).append(row)

    student_rows: List[StudentCourseProgressRow] = []
    for enr, user in enrollments:
        items = by_student.get(enr.StudentId, [])
        completed_ids = [p.LessonId for p in items if p.IsCompleted]
        completed_count = len(completed_ids)
        pct = round((completed_count / total_lessons) * 100.0, 2) if total_lessons > 0 else 0.0
        total_time = sum(int(p.TimeSpentSeconds or 0) for p in items)
        last_times: List[datetime] = [p.LastViewedAt for p in items if p.LastViewedAt is not None]
        student_rows.append(
            StudentCourseProgressRow(
                studentId=enr.StudentId,
                studentName=user.FullName,
                studentCode=user.StudentCode,
                studentEmail=user.Email,
                enrollmentStatus=enr.Status,
                completedLessons=completed_count,
                totalLessons=total_lessons,
                completionPercent=pct,
                totalTimeSpentSeconds=total_time,
                lastActivityAt=max(last_times) if last_times else None,
                completedLessonIds=completed_ids,
            )
        )

    return CourseClassProgressResponse(
        courseId=course_id,
        totalLessons=total_lessons,
        students=student_rows,
    )
