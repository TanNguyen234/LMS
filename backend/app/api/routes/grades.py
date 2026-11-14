import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    require_student,
    verify_course_read_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import Course, Enrollment, Grade, Notification, User, utcnow
from backend.app.schemas.common import MessageResponse, UtcDateTime
from backend.app.schemas.schemas import GradeResponse, ManualGradeCreate, ManualGradeUpdate
from backend.app.services.grading import (
    build_student_transcript,
    grade_item_title,
    resolve_grade_source_titles,
    sync_enrollment_final_score,
    validate_course_weights,
)
from backend.app.services.notification_push import push_notification

router = APIRouter(tags=["Grades & Gradebook"])

MANUAL_SOURCE_TYPES = {"MANUAL", "MIDTERM", "FINAL"}


class TranscriptGradeEntry(BaseModel):
    gradeId: uuid.UUID
    courseId: uuid.UUID
    studentId: uuid.UUID
    sourceType: str
    sourceId: Optional[uuid.UUID] = None
    itemTitle: str
    score: float
    maxScore: float
    weightPercent: Optional[float] = None
    feedback: Optional[str] = None
    gradedBy: uuid.UUID
    gradedAt: UtcDateTime


class TranscriptCourseEntry(BaseModel):
    courseId: uuid.UUID
    courseCode: str
    title: str
    semester: str
    academicYear: str
    credits: int
    courseStatus: str
    enrollmentStatus: str
    finalScore10: Optional[float] = None
    gpa4: Optional[float] = None
    letterGrade: Optional[str] = None
    passed: Optional[bool] = None
    totalWeightPercent: float = 0.0
    gradesCount: int = 0
    grades: List[TranscriptGradeEntry] = []


class StudentTranscriptResponse(BaseModel):
    studentId: uuid.UUID
    officialGpaScale4: Optional[float] = None
    officialGpaScale10: Optional[float] = None
    provisionalGpaScale4: Optional[float] = None
    provisionalGpaScale10: Optional[float] = None
    completedCredits: int = 0
    attemptedCredits: int = 0
    totalCredits: int = 0
    courses: List[TranscriptCourseEntry] = []


def _format_grade_list(grades: List[Grade], db: Session) -> List[GradeResponse]:
    if not grades:
        return []
    student_ids = {g.StudentId for g in grades}
    students = db.query(User).filter(User.UserId.in_(student_ids)).all()
    student_map: Dict[uuid.UUID, User] = {u.UserId: u for u in students}
    title_lookup = resolve_grade_source_titles(db, grades)

    results: List[GradeResponse] = []
    for grade in grades:
        student = student_map.get(grade.StudentId)
        results.append(
            GradeResponse(
                gradeId=grade.GradeId,
                courseId=grade.CourseId,
                studentId=grade.StudentId,
                sourceType=grade.SourceType,
                sourceId=grade.SourceId,
                itemTitle=grade_item_title(grade, title_lookup),
                score=float(grade.Score),
                maxScore=float(grade.MaxScore),
                weightPercent=float(grade.WeightPercent) if grade.WeightPercent is not None else None,
                feedback=grade.Feedback,
                gradedBy=grade.GradedBy,
                gradedAt=grade.GradedAt,
                studentName=student.FullName if student else "Unknown",
                studentCode=student.StudentCode if student else None,
            )
        )
    return results


@router.get("/courses/{course_id}/gradebook", response_model=List[GradeResponse])
def get_course_gradebook(
    course_id: uuid.UUID,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get complete gradebook of a course (own Lecturer or Admin)."""
    grades = (
        db.query(Grade)
        .filter(Grade.CourseId == course_id)
        .order_by(Grade.GradedAt.desc())
        .all()
    )
    return _format_grade_list(grades, db)


@router.get("/courses/{course_id}/my-grades", response_model=List[GradeResponse])
def get_my_course_grades(
    course_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Get student's personal grades in an ACTIVE or COMPLETED course (blocks DROPPED/DRAFT)."""
    verify_course_read_access(course_id, current_user, db)

    grades = (
        db.query(Grade)
        .filter(Grade.CourseId == course_id, Grade.StudentId == current_user.UserId)
        .order_by(Grade.GradedAt.desc())
        .all()
    )
    return _format_grade_list(grades, db)


@router.get("/grades/transcript", response_model=StudentTranscriptResponse)
def get_student_transcript(
    student_id: Optional[uuid.UUID] = Query(None, alias="studentId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get multi-course transcript with Vietnamese 4.0 GPA scale and credit weighting.
    Students read their own transcript; Admins can specify studentId.
    """
    target_student_id: uuid.UUID
    if current_user.Role == "STUDENT":
        if student_id is not None and student_id != current_user.UserId:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot view another student's transcript")
        target_student_id = current_user.UserId
    elif current_user.Role == "ADMIN":
        target_student_id = student_id or current_user.UserId
    else:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Transcript endpoint is available for students and admins",
        )

    data = build_student_transcript(db, target_student_id)
    return StudentTranscriptResponse.model_validate(data)


@router.post("/courses/{course_id}/grades/manual", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
def create_manual_grade(
    course_id: uuid.UUID,
    g_in: ManualGradeCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Add a manual/midterm/final grade entry and resync FinalScore."""
    student = db.query(User).filter(User.UserId == g_in.studentId).first()
    if not student or student.Role != "STUDENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student target")

    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == g_in.studentId,
            Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student is not enrolled in this course",
        )

    if g_in.score < 0 or g_in.score > g_in.maxScore:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score must be between 0 and maxScore",
        )

    validate_course_weights(db, course_id, g_in.studentId, g_in.weightPercent)

    now_utc = utcnow()
    new_grade = Grade(
        GradeId=uuid.uuid4(),
        CourseId=course_id,
        StudentId=g_in.studentId,
        SourceType=g_in.sourceType,
        SourceId=None,
        ItemTitle=g_in.itemTitle.strip(),
        Score=g_in.score,
        MaxScore=g_in.maxScore,
        WeightPercent=g_in.weightPercent,
        Feedback=g_in.feedback.strip() if g_in.feedback and g_in.feedback.strip() else None,
        GradedBy=current_user.UserId,
        GradedAt=now_utc,
    )
    db.add(new_grade)
    db.flush()
    sync_enrollment_final_score(db, course_id, g_in.studentId)

    notif_id = uuid.uuid4()
    related_url = f"/courses/{course_id}/grades"
    notif_title = f"Cap nhat diem: '{new_grade.ItemTitle}'"
    notif_msg = f"Ban nhan duoc {g_in.score}/{g_in.maxScore} diem cho muc '{new_grade.ItemTitle}'."
    db.add(
        Notification(
            NotificationId=notif_id,
            UserId=g_in.studentId,
            Title=notif_title,
            Message=notif_msg,
            Type="GRADE",
            IsRead=False,
            RelatedUrl=related_url,
        )
    )

    db.commit()
    db.refresh(new_grade)

    push_notification(
        g_in.studentId,
        {
            "type": "notification.created",
            "notificationId": str(notif_id),
            "notificationType": "GRADE",
            "title": notif_title,
            "message": notif_msg,
            "relatedUrl": related_url,
        },
    )

    return _format_grade_list([new_grade], db)[0]


@router.put("/grades/{grade_id}", response_model=GradeResponse)
def update_manual_grade(
    grade_id: uuid.UUID,
    g_in: ManualGradeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a MANUAL/MIDTERM/FINAL grade row and resync FinalScore."""
    grade = db.query(Grade).filter(Grade.GradeId == grade_id).first()
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade entry not found")

    verify_lecturer_course_owner(grade.CourseId, current_user, db)
    if grade.SourceType not in MANUAL_SOURCE_TYPES or grade.SourceId is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only manual, midterm, or final grade entries can be edited here",
        )

    fields = g_in.model_fields_set
    new_score = g_in.score if g_in.score is not None else float(grade.Score)
    new_max = g_in.maxScore if g_in.maxScore is not None else float(grade.MaxScore)
    if new_score < 0 or new_score > new_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score must be between 0 and maxScore",
        )

    if "weightPercent" in fields:
        validate_course_weights(
            db,
            grade.CourseId,
            grade.StudentId,
            g_in.weightPercent,
            exclude_grade_id=grade.GradeId,
        )
        grade.WeightPercent = g_in.weightPercent

    if g_in.itemTitle is not None:
        grade.ItemTitle = g_in.itemTitle.strip()
    if g_in.sourceType is not None:
        grade.SourceType = g_in.sourceType
    if g_in.score is not None:
        grade.Score = g_in.score
    if g_in.maxScore is not None:
        grade.MaxScore = g_in.maxScore
    if "feedback" in fields:
        grade.Feedback = g_in.feedback.strip() if g_in.feedback and g_in.feedback.strip() else None

    grade.GradedBy = current_user.UserId
    grade.GradedAt = utcnow()
    db.flush()
    sync_enrollment_final_score(db, grade.CourseId, grade.StudentId)

    db.commit()
    db.refresh(grade)
    return _format_grade_list([grade], db)[0]


@router.delete("/grades/{grade_id}", response_model=MessageResponse)
def delete_manual_grade(
    grade_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a MANUAL/MIDTERM/FINAL grade entry and resync FinalScore."""
    grade = db.query(Grade).filter(Grade.GradeId == grade_id).first()
    if not grade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Grade entry not found")

    verify_lecturer_course_owner(grade.CourseId, current_user, db)
    if grade.SourceType not in MANUAL_SOURCE_TYPES or grade.SourceId is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only manual, midterm, or final grade entries can be deleted here",
        )

    course_id = grade.CourseId
    student_id = grade.StudentId
    db.delete(grade)
    db.flush()
    sync_enrollment_final_score(db, course_id, student_id)
    db.commit()
    return MessageResponse(message="Grade entry deleted")
