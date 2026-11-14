import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    require_student,
    verify_course_read_access,
    verify_course_write_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment,
    Course,
    Enrollment,
    Grade,
    Notification,
    StoredFile,
    Submission,
    User,
    utcnow,
)
from backend.app.schemas.schemas import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentUpdate,
    SubmissionCreate,
    SubmissionGrade,
    SubmissionGradeResponse,
    SubmissionResponse,
)
from backend.app.services.grading import sync_enrollment_final_score
from backend.app.services.notification_push import push_notification

router = APIRouter(tags=["Assignments & Submissions"])

ASSIGNMENT_STATUSES = {"DRAFT", "PUBLISHED", "CLOSED"}


def normalize_assignment_status(value: str) -> str:
    normalized = value.strip().upper() if isinstance(value, str) else ""
    if normalized not in ASSIGNMENT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Status must be one of: DRAFT, PUBLISHED, CLOSED",
        )
    return normalized


def to_utc_datetime(value: datetime | str) -> datetime:
    """Store SQL Server DATETIME2 values as naive UTC and return aware UTC values."""
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def assignment_response_datetime(value: datetime | str) -> datetime:
    return to_utc_datetime(value)


def parse_datetime(dt) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _validate_safe_url(url: Optional[str]) -> Optional[str]:
    if url is None:
        return None
    cleaned = url.strip()
    if not cleaned:
        return None
    lowered = cleaned.lower()
    if lowered.startswith(("javascript:", "data:", "vbscript:")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsafe URL scheme is not allowed",
        )
    if not (lowered.startswith("https://") or lowered.startswith("http://") or cleaned.startswith("/")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attachment URL must start with http://, https://, or /",
        )
    return cleaned


def _validate_json_string(raw: Optional[str], field_name: str) -> Optional[str]:
    if raw is None:
        return None
    cleaned = raw.strip()
    if not cleaned:
        return None
    try:
        parsed = json.loads(cleaned)
    except (TypeError, json.JSONDecodeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be valid JSON",
        )
    if not isinstance(parsed, (list, dict)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} must be a JSON object or array",
        )
    return json.dumps(parsed, ensure_ascii=False)


def _validate_attachment_file(
    file_id: Optional[uuid.UUID],
    course_id: uuid.UUID,
    db: Session,
) -> Optional[StoredFile]:
    if file_id is None:
        return None
    sf = db.query(StoredFile).filter(StoredFile.FileId == file_id).first()
    if not sf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found")
    if sf.CourseId is not None and sf.CourseId != course_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Attachment file belongs to another course")
    if sf.Scope not in {"ASSIGNMENT", "LESSON", "SEED"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid attachment file scope")
    return sf


def _format_assignment(a: Assignment) -> AssignmentResponse:
    return AssignmentResponse(
        assignmentId=a.AssignmentId,
        courseId=a.CourseId,
        title=a.Title,
        description=a.Description,
        dueAt=assignment_response_datetime(a.DueAt),
        maxScore=float(a.MaxScore),
        allowLate=bool(a.AllowLate),
        attachmentUrl=a.AttachmentUrl,
        attachmentFileId=a.AttachmentFileId,
        weightPercent=float(a.WeightPercent) if a.WeightPercent is not None else None,
        rubricJson=a.RubricJson,
        status=a.Status,
        createdAt=a.CreatedAt,
    )


def _format_submission(sub: Submission, student: Optional[User]) -> SubmissionResponse:
    return SubmissionResponse(
        submissionId=sub.SubmissionId,
        assignmentId=sub.AssignmentId,
        studentId=sub.StudentId,
        submittedAt=sub.SubmittedAt,
        contentText=sub.ContentText,
        fileUrl=sub.FileUrl,
        fileId=sub.FileId,
        rubricScoresJson=sub.RubricScoresJson,
        status=sub.Status,
        score=float(sub.Score) if sub.Score is not None else None,
        feedback=sub.Feedback,
        updatedAt=sub.UpdatedAt,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None,
    )


def _notify_course_students_published(a: Assignment, db: Session) -> List[tuple[uuid.UUID, dict]]:
    student_ids = [
        row[0]
        for row in (
            db.query(Enrollment.StudentId)
            .filter(Enrollment.CourseId == a.CourseId, Enrollment.Status == "ACTIVE")
            .all()
        )
    ]
    if not student_ids:
        return []
    related_url = f"/courses/{a.CourseId}/assignments/{a.AssignmentId}"
    title = f"Bai tap moi: '{a.Title}'"
    message = f"Bai tap '{a.Title}' da duoc cong bo. Han nop: {parse_datetime(a.DueAt).strftime('%d/%m/%Y %H:%M UTC')}."
    push_items: List[tuple[uuid.UUID, dict]] = []
    for sid in student_ids:
        notif_id = uuid.uuid4()
        db.add(
            Notification(
                NotificationId=notif_id,
                UserId=sid,
                Title=title,
                Message=message,
                Type="ASSIGNMENT",
                IsRead=False,
                RelatedUrl=related_url,
            )
        )
        push_items.append(
            (
                sid,
                {
                    "type": "notification.created",
                    "notificationId": str(notif_id),
                    "notificationType": "ASSIGNMENT",
                    "title": title,
                    "message": message,
                    "relatedUrl": related_url,
                },
            )
        )
    return push_items


def get_assignment_or_404(assignment_id: uuid.UUID, db: Session) -> Assignment:
    a = db.query(Assignment).filter(Assignment.AssignmentId == assignment_id).first()
    if not a:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")
    return a


# ==========================================
# ASSIGNMENTS
# ==========================================


@router.get("/courses/{course_id}/assignments", response_model=List[AssignmentResponse])
def get_course_assignments(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_read_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List assignments for course."""
    query = db.query(Assignment).filter(Assignment.CourseId == course_id)
    if current_user.Role == "STUDENT":
        query = query.filter(Assignment.Status.in_(["PUBLISHED", "CLOSED"]))
    assignments = query.order_by(Assignment.DueAt.asc()).all()
    return [_format_assignment(a) for a in assignments]


@router.post("/courses/{course_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    course_id: uuid.UUID,
    a_in: AssignmentCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Create a new assignment (own Lecturer or Admin)."""
    if a_in.maxScore <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MaxScore must be greater than 0")
    assignment_status = normalize_assignment_status(a_in.status)
    if assignment_status == "PUBLISHED" and course.Status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish an assignment in an inactive course",
        )

    safe_url = _validate_safe_url(a_in.attachmentUrl)
    sf = _validate_attachment_file(a_in.attachmentFileId, course_id, db)
    if sf is not None and not safe_url:
        safe_url = f"/api/files/{sf.FileId}/content"
    rubric_json = _validate_json_string(a_in.rubricJson, "rubricJson")

    new_a = Assignment(
        AssignmentId=uuid.uuid4(),
        CourseId=course_id,
        Title=a_in.title.strip(),
        Description=a_in.description.strip() if a_in.description else None,
        DueAt=to_utc_datetime(a_in.dueAt).replace(tzinfo=None),
        MaxScore=a_in.maxScore,
        AllowLate=a_in.allowLate,
        AttachmentUrl=safe_url,
        AttachmentFileId=a_in.attachmentFileId,
        WeightPercent=a_in.weightPercent,
        RubricJson=rubric_json,
        Status=assignment_status,
    )
    db.add(new_a)
    db.flush()

    push_items: List[tuple[uuid.UUID, dict]] = []
    if assignment_status == "PUBLISHED":
        push_items = _notify_course_students_published(new_a, db)

    db.commit()
    db.refresh(new_a)

    for sid, payload in push_items:
        push_notification(sid, payload)

    return _format_assignment(new_a)


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
def get_assignment_detail(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single assignment detail."""
    a = get_assignment_or_404(assignment_id, db)
    verify_course_read_access(a.CourseId, current_user, db)
    if current_user.Role == "STUDENT" and a.Status == "DRAFT":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found or not published")
    return _format_assignment(a)


@router.put("/assignments/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: uuid.UUID,
    a_in: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update assignment parameters (own Lecturer or Admin)."""
    a = get_assignment_or_404(assignment_id, db)
    course = verify_lecturer_course_owner(a.CourseId, current_user, db)
    fields = a_in.model_fields_set
    previous_status = normalize_assignment_status(a.Status)

    if a_in.title is not None:
        a.Title = a_in.title.strip()
    if "description" in fields:
        a.Description = a_in.description.strip() if a_in.description else None
    if a_in.dueAt is not None:
        a.DueAt = to_utc_datetime(a_in.dueAt).replace(tzinfo=None)
    if a_in.maxScore is not None:
        if a_in.maxScore <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MaxScore must be > 0")
        graded_submission = (
            db.query(Submission.SubmissionId)
            .filter(Submission.AssignmentId == assignment_id, Submission.Status == "GRADED")
            .first()
        )
        if graded_submission and float(a_in.maxScore) != float(a.MaxScore):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="MaxScore cannot change after grading has started",
            )
        a.MaxScore = a_in.maxScore
    if a_in.allowLate is not None:
        a.AllowLate = a_in.allowLate
    if "attachmentFileId" in fields:
        sf = _validate_attachment_file(a_in.attachmentFileId, a.CourseId, db)
        a.AttachmentFileId = a_in.attachmentFileId
        if sf is not None and "attachmentUrl" not in fields:
            a.AttachmentUrl = f"/api/files/{sf.FileId}/content"
    if "attachmentUrl" in fields:
        a.AttachmentUrl = _validate_safe_url(a_in.attachmentUrl)
    weight_changed = False
    if "weightPercent" in fields:
        if a.WeightPercent != a_in.weightPercent:
            weight_changed = True
        a.WeightPercent = a_in.weightPercent
    if "rubricJson" in fields:
        a.RubricJson = _validate_json_string(a_in.rubricJson, "rubricJson")

    became_published = False
    if a_in.status is not None:
        new_status = normalize_assignment_status(a_in.status)
        if new_status == "PUBLISHED" and course.Status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish an assignment in an inactive course",
            )
        if new_status == "DRAFT" and previous_status != "DRAFT":
            has_subs = (
                db.query(Submission.SubmissionId)
                .filter(Submission.AssignmentId == assignment_id)
                .first()
                is not None
            )
            if has_subs:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot revert assignment to DRAFT after submissions exist",
                )
        if previous_status == "DRAFT" and new_status == "PUBLISHED":
            became_published = True
        a.Status = new_status

    if weight_changed:
        existing_grades = (
            db.query(Grade)
            .filter(
                Grade.CourseId == a.CourseId,
                Grade.SourceType == "ASSIGNMENT",
                Grade.SourceId == a.AssignmentId,
            )
            .all()
        )
        affected_students = set()
        for g in existing_grades:
            g.WeightPercent = a.WeightPercent
            affected_students.add(g.StudentId)
        db.flush()
        for sid in affected_students:
            sync_enrollment_final_score(db, a.CourseId, sid)

    push_items: List[tuple[uuid.UUID, dict]] = []
    if became_published:
        push_items = _notify_course_students_published(a, db)

    db.commit()
    db.refresh(a)

    for sid, payload in push_items:
        push_notification(sid, payload)

    return _format_assignment(a)


# ==========================================
# SUBMISSIONS
# ==========================================


@router.put("/assignments/{assignment_id}/submission", response_model=SubmissionResponse)
def submit_assignment(
    assignment_id: uuid.UUID,
    sub_in: SubmissionCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Submit or update assignment solution (Text and/or verified StoredFile)."""
    a = get_assignment_or_404(assignment_id, db)

    assignment_status = normalize_assignment_status(a.Status)
    if assignment_status in ["DRAFT", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit to an assignment with status '{a.Status}'",
        )

    verify_course_write_access(a.CourseId, current_user, db)

    if sub_in.fileId is not None:
        sf = db.query(StoredFile).filter(StoredFile.FileId == sub_in.fileId).first()
        if not sf:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submitted file not found")
        if sf.OwnerId != current_user.UserId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot attach a file owned by another user",
            )
        if sf.Scope != "SUBMISSION":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attached file must belong to SUBMISSION scope",
            )
        if sf.CourseId is not None and sf.CourseId != a.CourseId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Attached file belongs to a different course",
            )

    rubric_scores_json = _validate_json_string(sub_in.rubricScoresJson, "rubricScoresJson")

    existing_sub = (
        db.query(Submission)
        .filter(
            Submission.AssignmentId == assignment_id,
            Submission.StudentId == current_user.UserId,
        )
        .first()
    )

    effective_text = sub_in.contentText if sub_in.contentText else None
    effective_file_id = (
        sub_in.fileId
        if sub_in.fileId is not None
        else (existing_sub.FileId if existing_sub else None)
    )
    if not effective_text and effective_file_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission requires text content or an uploaded file",
        )

    now_utc = utcnow()
    now_aware = parse_datetime(now_utc)
    due_at = parse_datetime(a.DueAt)
    is_late = now_aware > due_at

    if is_late and not a.AllowLate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment deadline has passed and late submissions are not allowed",
        )

    sub_status = "LATE" if is_late else "SUBMITTED"

    if existing_sub:
        if existing_sub.Status == "GRADED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify a submission that has already been graded",
            )
        existing_sub.ContentText = effective_text
        if sub_in.fileId is not None:
            existing_sub.FileId = sub_in.fileId
            existing_sub.FileUrl = f"/api/files/{sub_in.fileId}/content"
        elif "fileId" in sub_in.model_fields_set:
            existing_sub.FileId = None
            existing_sub.FileUrl = None
        if rubric_scores_json is not None:
            existing_sub.RubricScoresJson = rubric_scores_json
        existing_sub.Status = sub_status
        existing_sub.SubmittedAt = now_utc
        existing_sub.UpdatedAt = now_utc
        db.commit()
        db.refresh(existing_sub)
        sub = existing_sub
    else:
        new_sub = Submission(
            SubmissionId=uuid.uuid4(),
            AssignmentId=assignment_id,
            StudentId=current_user.UserId,
            SubmittedAt=now_utc,
            ContentText=effective_text,
            FileId=sub_in.fileId,
            FileUrl=f"/api/files/{sub_in.fileId}/content" if sub_in.fileId is not None else None,
            RubricScoresJson=rubric_scores_json,
            Status=sub_status,
        )
        db.add(new_sub)
        db.commit()
        db.refresh(new_sub)
        sub = new_sub

    return _format_submission(sub, current_user)


@router.get("/assignments/{assignment_id}/my-submission", response_model=Optional[SubmissionResponse])
def get_my_submission(
    assignment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Get student's own submission for assignment (enforces 404 & course read access)."""
    a = get_assignment_or_404(assignment_id, db)
    verify_course_read_access(a.CourseId, current_user, db)
    if a.Status == "DRAFT":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    sub = (
        db.query(Submission)
        .filter(
            Submission.AssignmentId == assignment_id,
            Submission.StudentId == current_user.UserId,
        )
        .first()
    )
    if not sub:
        return None
    return _format_submission(sub, current_user)


@router.get("/assignments/{assignment_id}/submissions", response_model=List[SubmissionResponse])
def get_assignment_submissions(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all submissions for assignment (own Lecturer or Admin)."""
    a = get_assignment_or_404(assignment_id, db)
    verify_lecturer_course_owner(a.CourseId, current_user, db)

    subs = db.query(Submission).filter(Submission.AssignmentId == assignment_id).all()
    if not subs:
        return []
    student_ids = {s.StudentId for s in subs}
    students = db.query(User).filter(User.UserId.in_(student_ids)).all()
    student_map: Dict[uuid.UUID, User] = {u.UserId: u for u in students}
    return [_format_submission(s, student_map.get(s.StudentId)) for s in subs]


@router.put("/submissions/{submission_id}/grade", response_model=SubmissionGradeResponse)
def grade_submission(
    submission_id: uuid.UUID,
    grade_in: SubmissionGrade,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Grade a submission, upsert Grade with assignment weight & ItemTitle,
    synchronize Enrollment.FinalScore, and return SubmissionGradeResponse.
    """
    sub = (
        db.query(Submission)
        .filter(Submission.SubmissionId == submission_id)
        .with_hint(Submission, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    a = get_assignment_or_404(sub.AssignmentId, db)
    verify_lecturer_course_owner(a.CourseId, current_user, db)

    if grade_in.score < 0 or grade_in.score > float(a.MaxScore):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Score must be between 0 and {float(a.MaxScore)}",
        )

    normalized_feedback = grade_in.feedback.strip() if grade_in.feedback else None
    fields = grade_in.model_fields_set
    normalized_rubric = (
        _validate_json_string(grade_in.rubricScoresJson, "rubricScoresJson")
        if "rubricScoresJson" in fields
        else sub.RubricScoresJson
    )

    existing_grade = (
        db.query(Grade)
        .filter(
            Grade.CourseId == a.CourseId,
            Grade.StudentId == sub.StudentId,
            Grade.SourceType == "ASSIGNMENT",
            Grade.SourceId == a.AssignmentId,
        )
        .first()
    )

    if (
        sub.Status == "GRADED"
        and sub.Score is not None
        and float(sub.Score) == float(grade_in.score)
        and sub.Feedback == normalized_feedback
        and sub.RubricScoresJson == normalized_rubric
        and existing_grade is not None
    ):
        student = db.query(User).filter(User.UserId == sub.StudentId).first()
        base = _format_submission(sub, student)
        return SubmissionGradeResponse(
            **base.model_dump(),
            gradeId=existing_grade.GradeId,
            weightPercent=float(existing_grade.WeightPercent) if existing_grade.WeightPercent is not None else None,
        )

    now_utc = utcnow()
    sub.Score = grade_in.score
    sub.Feedback = normalized_feedback
    if "rubricScoresJson" in fields:
        sub.RubricScoresJson = normalized_rubric
    sub.Status = "GRADED"
    sub.UpdatedAt = now_utc

    if existing_grade:
        existing_grade.ItemTitle = a.Title
        existing_grade.Score = grade_in.score
        existing_grade.MaxScore = a.MaxScore
        existing_grade.WeightPercent = a.WeightPercent
        existing_grade.Feedback = sub.Feedback
        existing_grade.GradedBy = current_user.UserId
        existing_grade.GradedAt = now_utc
        target_grade = existing_grade
    else:
        target_grade = Grade(
            GradeId=uuid.uuid4(),
            CourseId=a.CourseId,
            StudentId=sub.StudentId,
            SourceType="ASSIGNMENT",
            SourceId=a.AssignmentId,
            ItemTitle=a.Title,
            Score=grade_in.score,
            MaxScore=a.MaxScore,
            WeightPercent=a.WeightPercent,
            Feedback=sub.Feedback,
            GradedBy=current_user.UserId,
            GradedAt=now_utc,
        )
        db.add(target_grade)

    db.flush()
    sync_enrollment_final_score(db, a.CourseId, sub.StudentId)

    notif_id = uuid.uuid4()
    related_url = f"/courses/{a.CourseId}/assignments/{a.AssignmentId}"
    notif_title = f"Bai tap '{a.Title}' da duoc cham diem"
    notif_msg = f"Diem so cua ban: {grade_in.score}/{float(a.MaxScore)}. Nhan xet: {normalized_feedback or 'Khong co'}"
    db.add(
        Notification(
            NotificationId=notif_id,
            UserId=sub.StudentId,
            Title=notif_title,
            Message=notif_msg,
            Type="GRADE",
            IsRead=False,
            RelatedUrl=related_url,
        )
    )

    db.commit()
    db.refresh(sub)
    db.refresh(target_grade)

    push_notification(
        sub.StudentId,
        {
            "type": "notification.created",
            "notificationId": str(notif_id),
            "notificationType": "GRADE",
            "title": notif_title,
            "message": notif_msg,
            "relatedUrl": related_url,
        },
    )

    student = db.query(User).filter(User.UserId == sub.StudentId).first()
    base = _format_submission(sub, student)
    return SubmissionGradeResponse(
        **base.model_dump(),
        gradeId=target_grade.GradeId,
        weightPercent=float(target_grade.WeightPercent) if target_grade.WeightPercent is not None else None,
    )
