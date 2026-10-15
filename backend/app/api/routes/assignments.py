import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment, Submission, Course, User, Enrollment, Grade, Notification
)
from backend.app.schemas.schemas import (
    AssignmentCreate, AssignmentUpdate, AssignmentResponse,
    SubmissionCreate, SubmissionGrade, SubmissionResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, verify_course_access, verify_lecturer_course_owner,
    require_student, get_course_or_404
)

router = APIRouter(tags=["Assignments & Submissions"])


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
    course: Course = Depends(verify_course_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List assignments for course."""
    query = db.query(Assignment).filter(Assignment.CourseId == course_id)
    if current_user.Role == "STUDENT":
        # Students only see published or closed assignments, not drafts
        query = query.filter(Assignment.Status.in_(["PUBLISHED", "CLOSED"]))
    assignments = query.order_by(Assignment.DueAt.asc()).all()

    return [
        AssignmentResponse(
            assignmentId=a.AssignmentId,
            courseId=a.CourseId,
            title=a.Title,
            description=a.Description,
            dueAt=a.DueAt,
            maxScore=float(a.MaxScore),
            allowLate=a.AllowLate,
            attachmentUrl=a.AttachmentUrl,
            status=a.Status,
            createdAt=a.CreatedAt
        )
        for a in assignments
    ]


@router.post("/courses/{course_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    course_id: uuid.UUID,
    a_in: AssignmentCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db)
):
    """Create a new assignment (own Lecturer or Admin)."""
    if a_in.maxScore <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MaxScore must be greater than 0")

    new_a = Assignment(
        AssignmentId=uuid.uuid4(),
        CourseId=course_id,
        Title=a_in.title.strip(),
        Description=a_in.description.strip() if a_in.description else None,
        DueAt=a_in.dueAt,
        MaxScore=a_in.maxScore,
        AllowLate=a_in.allowLate,
        AttachmentUrl=a_in.attachmentUrl,
        Status=a_in.status.upper()
    )
    db.add(new_a)
    db.commit()
    db.refresh(new_a)

    return AssignmentResponse(
        assignmentId=new_a.AssignmentId,
        courseId=new_a.CourseId,
        title=new_a.Title,
        description=new_a.Description,
        dueAt=new_a.DueAt,
        maxScore=float(new_a.MaxScore),
        allowLate=new_a.AllowLate,
        attachmentUrl=new_a.AttachmentUrl,
        status=new_a.Status,
        createdAt=new_a.CreatedAt
    )


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
def get_assignment_detail(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single assignment detail."""
    a = get_assignment_or_404(assignment_id, db)
    verify_course_access(a.CourseId, current_user, db)
    if current_user.Role == "STUDENT" and a.Status == "DRAFT":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found or not published")
    return AssignmentResponse(
        assignmentId=a.AssignmentId,
        courseId=a.CourseId,
        title=a.Title,
        description=a.Description,
        dueAt=a.DueAt,
        maxScore=float(a.MaxScore),
        allowLate=a.AllowLate,
        attachmentUrl=a.AttachmentUrl,
        status=a.Status,
        createdAt=a.CreatedAt
    )


@router.put("/assignments/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: uuid.UUID,
    a_in: AssignmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update assignment parameters (own Lecturer or Admin)."""
    a = get_assignment_or_404(assignment_id, db)
    verify_lecturer_course_owner(a.CourseId, current_user, db)

    if a_in.title is not None:
        a.Title = a_in.title.strip()
    if a_in.description is not None:
        a.Description = a_in.description.strip() if a_in.description else None
    if a_in.dueAt is not None:
        a.DueAt = a_in.dueAt
    if a_in.maxScore is not None:
        if a_in.maxScore <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="MaxScore must be > 0")
        a.MaxScore = a_in.maxScore
    if a_in.allowLate is not None:
        a.AllowLate = a_in.allowLate
    if a_in.attachmentUrl is not None:
        a.AttachmentUrl = a_in.attachmentUrl
    if a_in.status is not None:
        a.Status = a_in.status.upper()

    db.commit()
    db.refresh(a)
    return AssignmentResponse(
        assignmentId=a.AssignmentId,
        courseId=a.CourseId,
        title=a.Title,
        description=a.Description,
        dueAt=a.DueAt,
        maxScore=float(a.MaxScore),
        allowLate=a.AllowLate,
        attachmentUrl=a.AttachmentUrl,
        status=a.Status,
        createdAt=a.CreatedAt
    )


def parse_datetime(dt) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ==========================================
# SUBMISSIONS
# ==========================================

@router.put("/assignments/{assignment_id}/submission", response_model=SubmissionResponse)
def submit_assignment(
    assignment_id: uuid.UUID,
    sub_in: SubmissionCreate,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """
    Submit or update assignment solution (Enrolled Student).
    Enforces deadline policy (BR-05, AC-06).
    """
    a = get_assignment_or_404(assignment_id, db)

    # Check assignment status (reject DRAFT or CLOSED)
    if a.Status in ["DRAFT", "CLOSED"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot submit to an assignment with status '{a.Status}'"
        )

    # Verify active enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == a.CourseId,
        Enrollment.StudentId == current_user.UserId,
        Enrollment.Status == "ACTIVE"
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not actively enrolled in this course"
        )

    # Validate non-empty content
    if not (sub_in.contentText and sub_in.contentText.strip()) and not (sub_in.fileUrl and sub_in.fileUrl.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Submission must include text content or file URL"
        )

    now = datetime.now(timezone.utc)
    due_at = parse_datetime(a.DueAt)

    is_late = now > due_at

    if is_late and not a.AllowLate:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignment deadline has passed and late submissions are not allowed"
        )

    sub_status = "LATE" if is_late else "SUBMITTED"

    # Upsert single submission per student/assignment
    existing_sub = db.query(Submission).filter(
        Submission.AssignmentId == assignment_id,
        Submission.StudentId == current_user.UserId
    ).first()

    if existing_sub:
        if existing_sub.Status == "GRADED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify a submission that has already been graded"
            )
        existing_sub.ContentText = sub_in.contentText
        existing_sub.FileUrl = sub_in.fileUrl
        existing_sub.Status = sub_status
        existing_sub.UpdatedAt = now
        db.commit()
        db.refresh(existing_sub)
        sub = existing_sub
    else:
        new_sub = Submission(
            SubmissionId=uuid.uuid4(),
            AssignmentId=assignment_id,
            StudentId=current_user.UserId,
            SubmittedAt=now,
            ContentText=sub_in.contentText,
            FileUrl=sub_in.fileUrl,
            Status=sub_status
        )
        db.add(new_sub)
        db.commit()
        db.refresh(new_sub)
        sub = new_sub

    return SubmissionResponse(
        submissionId=sub.SubmissionId,
        assignmentId=sub.AssignmentId,
        studentId=sub.StudentId,
        submittedAt=sub.SubmittedAt,
        contentText=sub.ContentText,
        fileUrl=sub.FileUrl,
        status=sub.Status,
        score=float(sub.Score) if sub.Score is not None else None,
        feedback=sub.Feedback,
        updatedAt=sub.UpdatedAt,
        studentName=current_user.FullName,
        studentCode=current_user.StudentCode
    )


@router.get("/assignments/{assignment_id}/my-submission", response_model=Optional[SubmissionResponse])
def get_my_submission(
    assignment_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """Get student's own submission for assignment."""
    sub = db.query(Submission).filter(
        Submission.AssignmentId == assignment_id,
        Submission.StudentId == current_user.UserId
    ).first()
    if not sub:
        return None

    return SubmissionResponse(
        submissionId=sub.SubmissionId,
        assignmentId=sub.AssignmentId,
        studentId=sub.StudentId,
        submittedAt=sub.SubmittedAt,
        contentText=sub.ContentText,
        fileUrl=sub.FileUrl,
        status=sub.Status,
        score=float(sub.Score) if sub.Score is not None else None,
        feedback=sub.Feedback,
        updatedAt=sub.UpdatedAt,
        studentName=current_user.FullName,
        studentCode=current_user.StudentCode
    )


@router.get("/assignments/{assignment_id}/submissions", response_model=List[SubmissionResponse])
def get_assignment_submissions(
    assignment_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all submissions for assignment (own Lecturer or Admin)."""
    a = get_assignment_or_404(assignment_id, db)
    verify_lecturer_course_owner(a.CourseId, current_user, db)

    subs = db.query(Submission).filter(Submission.AssignmentId == assignment_id).all()
    results = []
    for s in subs:
        student = db.query(User).filter(User.UserId == s.StudentId).first()
        results.append(SubmissionResponse(
            submissionId=s.SubmissionId,
            assignmentId=s.AssignmentId,
            studentId=s.StudentId,
            submittedAt=s.SubmittedAt,
            contentText=s.ContentText,
            fileUrl=s.FileUrl,
            status=s.Status,
            score=float(s.Score) if s.Score is not None else None,
            feedback=s.Feedback,
            updatedAt=s.UpdatedAt,
            studentName=student.FullName if student else "Unknown",
            studentCode=student.StudentCode if student else None
        ))
    return results


@router.put("/submissions/{submission_id}/grade", response_model=SubmissionResponse)
def grade_submission(
    submission_id: uuid.UUID,
    grade_in: SubmissionGrade,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Grade a submission and upsert grade to Grades table (BR-06, AC-07).
    """
    sub = db.query(Submission).filter(Submission.SubmissionId == submission_id).first()
    if not sub:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    a = get_assignment_or_404(sub.AssignmentId, db)
    verify_lecturer_course_owner(a.CourseId, current_user, db)

    if grade_in.score < 0 or grade_in.score > float(a.MaxScore):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Score must be between 0 and {float(a.MaxScore)}"
        )

    now = datetime.now(timezone.utc)
    sub.Score = grade_in.score
    sub.Feedback = grade_in.feedback.strip() if grade_in.feedback else None
    sub.Status = "GRADED"
    sub.UpdatedAt = now

    # Upsert to Grades table
    existing_grade = db.query(Grade).filter(
        Grade.CourseId == a.CourseId,
        Grade.StudentId == sub.StudentId,
        Grade.SourceType == "ASSIGNMENT",
        Grade.SourceId == a.AssignmentId
    ).first()

    if existing_grade:
        existing_grade.Score = grade_in.score
        existing_grade.MaxScore = a.MaxScore
        existing_grade.Feedback = sub.Feedback
        existing_grade.GradedBy = current_user.UserId
        existing_grade.GradedAt = now
    else:
        new_grade = Grade(
            GradeId=uuid.uuid4(),
            CourseId=a.CourseId,
            StudentId=sub.StudentId,
            SourceType="ASSIGNMENT",
            SourceId=a.AssignmentId,
            Score=grade_in.score,
            MaxScore=a.MaxScore,
            WeightPercent=None,
            Feedback=sub.Feedback,
            GradedBy=current_user.UserId,
            GradedAt=now
        )
        db.add(new_grade)

    # Create synchronous notification for student
    notif = Notification(
        NotificationId=uuid.uuid4(),
        UserId=sub.StudentId,
        Title=f"Bài tập '{a.Title}' đã được chấm điểm",
        Message=f"Điểm số của bạn: {grade_in.score}/{float(a.MaxScore)}. Phản hồi: {grade_in.feedback or 'Không có'}",
        Type="GRADE",
        IsRead=False,
        RelatedUrl=f"/courses/{a.CourseId}/assignments/{a.AssignmentId}"
    )
    db.add(notif)

    db.commit()
    db.refresh(sub)

    student = db.query(User).filter(User.UserId == sub.StudentId).first()
    return SubmissionResponse(
        submissionId=sub.SubmissionId,
        assignmentId=sub.AssignmentId,
        studentId=sub.StudentId,
        submittedAt=sub.SubmittedAt,
        contentText=sub.ContentText,
        fileUrl=sub.FileUrl,
        status=sub.Status,
        score=float(sub.Score) if sub.Score is not None else None,
        feedback=sub.Feedback,
        updatedAt=sub.UpdatedAt,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None
    )
