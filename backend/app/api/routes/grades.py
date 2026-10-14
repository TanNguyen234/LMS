import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Grade, Course, User, Enrollment
from backend.app.schemas.schemas import GradeResponse, ManualGradeCreate
from backend.app.core.dependencies import (
    get_current_user, require_student, verify_course_access,
    verify_lecturer_course_owner, get_course_or_404
)

router = APIRouter(tags=["Grades & Gradebook"])


def format_grade_response(grade: Grade, db: Session) -> GradeResponse:
    student = db.query(User).filter(User.UserId == grade.StudentId).first()
    title = grade.Feedback or f"{grade.SourceType} Item"
    return GradeResponse(
        gradeId=grade.GradeId,
        courseId=grade.CourseId,
        studentId=grade.StudentId,
        sourceType=grade.SourceType,
        sourceId=grade.SourceId,
        itemTitle=title,
        score=float(grade.Score),
        maxScore=float(grade.MaxScore),
        weightPercent=float(grade.WeightPercent) if grade.WeightPercent is not None else None,
        feedback=grade.Feedback,
        gradedBy=grade.GradedBy,
        gradedAt=grade.GradedAt,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None
    )


@router.get("/courses/{course_id}/gradebook", response_model=List[GradeResponse])
def get_course_gradebook(
    course_id: uuid.UUID,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get complete gradebook of a course (own Lecturer or Admin)."""
    grades = db.query(Grade).filter(Grade.CourseId == course_id).order_by(Grade.GradedAt.desc()).all()
    return [format_grade_response(g, db) for g in grades]


@router.get("/courses/{course_id}/my-grades", response_model=List[GradeResponse])
def get_my_course_grades(
    course_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """Get current student's personal grades in the course (BR-10, AC-07)."""
    # Verify enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.StudentId == current_user.UserId,
        Enrollment.Status == "ACTIVE"
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not enrolled in this course"
        )

    grades = db.query(Grade).filter(
        Grade.CourseId == course_id,
        Grade.StudentId == current_user.UserId
    ).order_by(Grade.GradedAt.desc()).all()

    return [format_grade_response(g, db) for g in grades]


@router.post("/courses/{course_id}/grades/manual", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
def create_manual_grade(
    course_id: uuid.UUID,
    g_in: ManualGradeCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a manual grade column/entry (own Lecturer or Admin)."""
    student = db.query(User).filter(User.UserId == g_in.studentId).first()
    if not student or student.Role != "STUDENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student target")

    if g_in.score < 0 or g_in.score > g_in.maxScore:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Score must be between 0 and maxScore")

    now = datetime.now(timezone.utc)
    new_grade = Grade(
        GradeId=uuid.uuid4(),
        CourseId=course_id,
        StudentId=g_in.studentId,
        SourceType="MANUAL",
        SourceId=None,
        Score=g_in.score,
        MaxScore=g_in.maxScore,
        WeightPercent=g_in.weightPercent,
        Feedback=f"{g_in.itemTitle}: {g_in.feedback}" if g_in.feedback else g_in.itemTitle,
        GradedBy=current_user.UserId,
        GradedAt=now
    )
    db.add(new_grade)
    db.commit()
    db.refresh(new_grade)

    return format_grade_response(new_grade, db)
