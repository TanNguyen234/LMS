import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import (
    Quiz, QuizQuestion, QuizAttempt, Course, User, Enrollment, Grade, Notification
)
from backend.app.schemas.schemas import (
    QuizCreate, QuizUpdate, QuizPublish, QuizResponse, QuizStudentResponse,
    QuizQuestionCreate, QuizQuestionUpdate, QuizQuestionResponse, QuizQuestionStudentResponse,
    QuizAttemptStartResponse, QuizAttemptSubmit, QuizAttemptResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, verify_course_access, verify_lecturer_course_owner,
    require_student, get_course_or_404
)

router = APIRouter(tags=["Quizzes & Attempts"])


def get_quiz_or_404(quiz_id: uuid.UUID, db: Session) -> Quiz:
    q = db.query(Quiz).filter(Quiz.QuizId == quiz_id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    return q


# ==========================================
# QUIZZES
# ==========================================

@router.get("/courses/{course_id}/quizzes")
def get_course_quizzes(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List quizzes for course.
    - Students only see published quizzes.
    - Lecturers & Admins see all quizzes (including drafts).
    """
    query = db.query(Quiz).filter(Quiz.CourseId == course_id)
    if current_user.Role == "STUDENT":
        query = query.filter(Quiz.IsPublished == True)
    quizzes = query.order_by(Quiz.StartAt.asc()).all()

    if current_user.Role == "STUDENT":
        return [
            QuizStudentResponse(
                quizId=q.QuizId,
                courseId=q.CourseId,
                title=q.Title,
                description=q.Description,
                startAt=q.StartAt,
                endAt=q.EndAt,
                timeLimitMinutes=q.TimeLimitMinutes,
                maxAttempts=q.MaxAttempts,
                passingScore=float(q.PassingScore),
                isPublished=q.IsPublished,
                createdAt=q.CreatedAt,
                questions=[]  # list summary
            )
            for q in quizzes
        ]

    # Lecturer / Admin response
    return [
        QuizResponse(
            quizId=q.QuizId,
            courseId=q.CourseId,
            title=q.Title,
            description=q.Description,
            startAt=q.StartAt,
            endAt=q.EndAt,
            timeLimitMinutes=q.TimeLimitMinutes,
            maxAttempts=q.MaxAttempts,
            passingScore=float(q.PassingScore),
            isPublished=q.IsPublished,
            createdAt=q.CreatedAt,
            questions=[]
        )
        for q in quizzes
    ]


@router.post("/courses/{course_id}/quizzes", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
def create_quiz(
    course_id: uuid.UUID,
    quiz_in: QuizCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db)
):
    """Create a new quiz (own Lecturer or Admin)."""
    if quiz_in.endAt <= quiz_in.startAt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EndAt must be after StartAt")

    new_q = Quiz(
        QuizId=uuid.uuid4(),
        CourseId=course_id,
        Title=quiz_in.title.strip(),
        Description=quiz_in.description.strip() if quiz_in.description else None,
        StartAt=quiz_in.startAt,
        EndAt=quiz_in.endAt,
        TimeLimitMinutes=quiz_in.timeLimitMinutes,
        MaxAttempts=quiz_in.maxAttempts,
        PassingScore=quiz_in.passingScore,
        IsPublished=quiz_in.isPublished
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)

    return QuizResponse(
        quizId=new_q.QuizId,
        courseId=new_q.CourseId,
        title=new_q.Title,
        description=new_q.Description,
        startAt=new_q.StartAt,
        endAt=new_q.EndAt,
        timeLimitMinutes=new_q.TimeLimitMinutes,
        maxAttempts=new_q.MaxAttempts,
        passingScore=float(new_q.PassingScore),
        isPublished=new_q.IsPublished,
        createdAt=new_q.CreatedAt,
        questions=[]
    )


@router.get("/quizzes/{quiz_id}")
def get_quiz_detail(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get quiz detail with questions.
    SECURITY (AC-09): Student DTO NEVER contains 'correctAnswer'.
    """
    q = get_quiz_or_404(quiz_id, db)
    verify_course_access(q.CourseId, current_user, db)

    questions = db.query(QuizQuestion).filter(QuizQuestion.QuizId == quiz_id).order_by(QuizQuestion.SortOrder.asc()).all()

    if current_user.Role == "STUDENT":
        if not q.IsPublished:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz is unpublished")
        # Strip CorrectAnswer completely
        return QuizStudentResponse(
            quizId=q.QuizId,
            courseId=q.CourseId,
            title=q.Title,
            description=q.Description,
            startAt=q.StartAt,
            endAt=q.EndAt,
            timeLimitMinutes=q.TimeLimitMinutes,
            maxAttempts=q.MaxAttempts,
            passingScore=float(q.PassingScore),
            isPublished=q.IsPublished,
            createdAt=q.CreatedAt,
            questions=[
                QuizQuestionStudentResponse(
                    questionId=qn.QuestionId,
                    quizId=qn.QuizId,
                    questionText=qn.QuestionText,
                    questionType=qn.QuestionType,
                    optionsJson=qn.OptionsJson,
                    score=float(qn.Score),
                    sortOrder=qn.SortOrder
                )
                for qn in questions
            ]
        )

    # Lecturer / Admin
    return QuizResponse(
        quizId=q.QuizId,
        courseId=q.CourseId,
        title=q.Title,
        description=q.Description,
        startAt=q.StartAt,
        endAt=q.EndAt,
        timeLimitMinutes=q.TimeLimitMinutes,
        maxAttempts=q.MaxAttempts,
        passingScore=float(q.PassingScore),
        isPublished=q.IsPublished,
        createdAt=q.CreatedAt,
        questions=[
            QuizQuestionResponse(
                questionId=qn.QuestionId,
                quizId=qn.QuizId,
                questionText=qn.QuestionText,
                questionType=qn.QuestionType,
                optionsJson=qn.OptionsJson,
                correctAnswer=qn.CorrectAnswer,
                score=float(qn.Score),
                sortOrder=qn.SortOrder
            )
            for qn in questions
        ]
    )


@router.put("/quizzes/{quiz_id}", response_model=QuizResponse)
def update_quiz(
    quiz_id: uuid.UUID,
    quiz_in: QuizUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update quiz parameters (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    if quiz_in.title is not None:
        q.Title = quiz_in.title.strip()
    if quiz_in.description is not None:
        q.Description = quiz_in.description.strip() if quiz_in.description else None
    if quiz_in.startAt is not None:
        q.StartAt = quiz_in.startAt
    if quiz_in.endAt is not None:
        q.EndAt = quiz_in.endAt
    if quiz_in.timeLimitMinutes is not None:
        q.TimeLimitMinutes = quiz_in.timeLimitMinutes
    if quiz_in.maxAttempts is not None:
        q.MaxAttempts = quiz_in.maxAttempts
    if quiz_in.passingScore is not None:
        q.PassingScore = quiz_in.passingScore
    if quiz_in.isPublished is not None:
        q.IsPublished = quiz_in.isPublished

    db.commit()
    db.refresh(q)
    return get_quiz_detail(quiz_id, current_user, db)


@router.patch("/quizzes/{quiz_id}/publish", response_model=MessageResponse)
def toggle_quiz_publish(
    quiz_id: uuid.UUID,
    pub_in: QuizPublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle publish status of quiz."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)
    q.IsPublished = pub_in.isPublished
    db.commit()
    st = "published" if pub_in.isPublished else "unpublished"
    return MessageResponse(message=f"Quiz '{q.Title}' successfully {st}")


# ==========================================
# QUIZ QUESTIONS
# ==========================================

@router.post("/quizzes/{quiz_id}/questions", response_model=QuizQuestionResponse, status_code=status.HTTP_201_CREATED)
def add_quiz_question(
    quiz_id: uuid.UUID,
    qn_in: QuizQuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a question to quiz (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    if qn_in.questionType not in ["SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid questionType")

    new_qn = QuizQuestion(
        QuestionId=uuid.uuid4(),
        QuizId=quiz_id,
        QuestionText=qn_in.questionText.strip(),
        QuestionType=qn_in.questionType.upper(),
        OptionsJson=qn_in.optionsJson,
        CorrectAnswer=qn_in.correctAnswer.strip(),
        Score=qn_in.score,
        SortOrder=qn_in.sortOrder
    )
    db.add(new_qn)
    db.commit()
    db.refresh(new_qn)

    return QuizQuestionResponse(
        questionId=new_qn.QuestionId,
        quizId=new_qn.QuizId,
        questionText=new_qn.QuestionText,
        questionType=new_qn.QuestionType,
        optionsJson=new_qn.OptionsJson,
        correctAnswer=new_qn.CorrectAnswer,
        score=float(new_qn.Score),
        sortOrder=new_qn.SortOrder
    )


@router.put("/questions/{question_id}", response_model=QuizQuestionResponse)
def update_quiz_question(
    question_id: uuid.UUID,
    qn_in: QuizQuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update question (own Lecturer or Admin)."""
    qn = db.query(QuizQuestion).filter(QuizQuestion.QuestionId == question_id).first()
    if not qn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    q = get_quiz_or_404(qn.QuizId, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    if qn_in.questionText is not None:
        qn.QuestionText = qn_in.questionText.strip()
    if qn_in.questionType is not None:
        qn.QuestionType = qn_in.questionType.upper()
    if qn_in.optionsJson is not None:
        qn.OptionsJson = qn_in.optionsJson
    if qn_in.correctAnswer is not None:
        qn.CorrectAnswer = qn_in.correctAnswer.strip()
    if qn_in.score is not None:
        qn.Score = qn_in.score
    if qn_in.sortOrder is not None:
        qn.SortOrder = qn_in.sortOrder

    db.commit()
    db.refresh(qn)

    return QuizQuestionResponse(
        questionId=qn.QuestionId,
        quizId=qn.QuizId,
        questionText=qn.QuestionText,
        questionType=qn.QuestionType,
        optionsJson=qn.OptionsJson,
        correctAnswer=qn.CorrectAnswer,
        score=float(qn.Score),
        sortOrder=qn.SortOrder
    )


# ==========================================
# QUIZ ATTEMPTS & AUTO-SCORING
# ==========================================

def parse_datetime(dt) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.post("/quizzes/{quiz_id}/attempts/start", response_model=QuizAttemptStartResponse)
def start_quiz_attempt(
    quiz_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """
    Start a quiz attempt (BR-07, BR-09, AC-08, AC-09).
    Checks:
    1. IsPublished == 1
    2. Active enrollment
    3. StartAt <= now <= EndAt
    4. Attempt count < MaxAttempts
    Returns questions WITHOUT CorrectAnswer.
    """
    q = get_quiz_or_404(quiz_id, db)
    if not q.IsPublished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz is not published")

    # Verify active enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == q.CourseId,
        Enrollment.StudentId == current_user.UserId,
        Enrollment.Status == "ACTIVE"
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Student is not actively enrolled")

    now = datetime.now(timezone.utc)
    start_at = parse_datetime(q.StartAt)
    end_at = parse_datetime(q.EndAt)

    if now < start_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has not started yet")
    if now > end_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz availability window has ended")

    # Count prior attempts
    prior_attempts = db.query(QuizAttempt).filter(
        QuizAttempt.QuizId == quiz_id,
        QuizAttempt.StudentId == current_user.UserId
    ).count()

    if prior_attempts >= q.MaxAttempts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum attempts ({q.MaxAttempts}) reached for this quiz"
        )

    attempt_no = prior_attempts + 1
    new_attempt = QuizAttempt(
        AttemptId=uuid.uuid4(),
        QuizId=quiz_id,
        StudentId=current_user.UserId,
        StartedAt=now,
        AttemptNo=attempt_no,
        Status="IN_PROGRESS"
    )
    db.add(new_attempt)
    db.commit()
    db.refresh(new_attempt)

    # Questions without answers
    questions = db.query(QuizQuestion).filter(QuizQuestion.QuizId == quiz_id).order_by(QuizQuestion.SortOrder.asc()).all()

    return QuizAttemptStartResponse(
        attemptId=new_attempt.AttemptId,
        quizId=new_attempt.QuizId,
        attemptNo=new_attempt.AttemptNo,
        startedAt=new_attempt.StartedAt,
        timeLimitMinutes=q.TimeLimitMinutes,
        questions=[
            QuizQuestionStudentResponse(
                questionId=qn.QuestionId,
                quizId=qn.QuizId,
                questionText=qn.QuestionText,
                questionType=qn.QuestionType,
                optionsJson=qn.OptionsJson,
                score=float(qn.Score),
                sortOrder=qn.SortOrder
            )
            for qn in questions
        ]
    )


@router.post("/quiz-attempts/{attempt_id}/submit", response_model=QuizAttemptResponse)
def submit_quiz_attempt(
    attempt_id: uuid.UUID,
    submit_in: QuizAttemptSubmit,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """
    Submit quiz attempt and auto-score (BR-08, BR-09).
    Auto-scores SINGLE_CHOICE and TRUE_FALSE questions.
    Upserts into Grades table and sends notification.
    """
    attempt = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == attempt_id).first()
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found")
    if attempt.StudentId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your quiz attempt")
    if attempt.Status != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attempt cannot be submitted because status is '{attempt.Status}'"
        )

    q = get_quiz_or_404(attempt.QuizId, db)

    now = datetime.now(timezone.utc)
    end_at = parse_datetime(q.EndAt)
    started_at = parse_datetime(attempt.StartedAt)

    # Check quiz availability window
    if now > end_at:
        attempt.Status = "EXPIRED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz availability window has ended. Attempt marked as EXPIRED."
        )

    # Check time limit with a 60-second grace period for network latency
    allowed_duration = timedelta(minutes=q.TimeLimitMinutes, seconds=60)
    if now > started_at + allowed_duration:
        attempt.Status = "EXPIRED"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz time limit exceeded. Attempt marked as EXPIRED."
        )

    questions = db.query(QuizQuestion).filter(QuizQuestion.QuizId == q.QuizId).all()

    total_score = 0.0
    max_possible_score = sum(float(qn.Score) for qn in questions)

    # Calculate score based on answers map {"<questionId>": "<answer>"}
    user_answers = submit_in.answers or {}

    for qn in questions:
        qid_str = str(qn.QuestionId)
        user_ans = user_answers.get(qid_str)
        if user_ans is None:
            continue

        correct_ans = qn.CorrectAnswer.strip()
        user_ans_str = str(user_ans).strip()

        if qn.QuestionType == "SINGLE_CHOICE":
            if user_ans_str.upper() == correct_ans.upper():
                total_score += float(qn.Score)
        elif qn.QuestionType == "TRUE_FALSE":
            if user_ans_str.lower() == correct_ans.lower():
                total_score += float(qn.Score)
        elif qn.QuestionType == "SHORT_TEXT":
            if user_ans_str.lower() == correct_ans.lower():
                total_score += float(qn.Score)

    attempt.AnswersJson = json.dumps(user_answers)
    attempt.Score = total_score
    attempt.Status = "SUBMITTED"
    attempt.SubmittedAt = now

    # Upsert into Grades table
    existing_grade = db.query(Grade).filter(
        Grade.CourseId == q.CourseId,
        Grade.StudentId == current_user.UserId,
        Grade.SourceType == "QUIZ",
        Grade.SourceId == q.QuizId
    ).first()

    lecturer = db.query(User).filter(User.UserId == q.course.LecturerId).first()
    grader_id = lecturer.UserId if lecturer else current_user.UserId

    if existing_grade:
        # Keep highest score or latest attempt score
        if total_score >= float(existing_grade.Score):
            existing_grade.Score = total_score
            existing_grade.MaxScore = max_possible_score
            existing_grade.GradedAt = now
    else:
        new_grade = Grade(
            GradeId=uuid.uuid4(),
            CourseId=q.CourseId,
            StudentId=current_user.UserId,
            SourceType="QUIZ",
            SourceId=q.QuizId,
            Score=total_score,
            MaxScore=max_possible_score,
            WeightPercent=None,
            Feedback=f"Tự động chấm: {total_score}/{max_possible_score}",
            GradedBy=grader_id,
            GradedAt=now
        )
        db.add(new_grade)

    # Synchronous notification
    notif = Notification(
        NotificationId=uuid.uuid4(),
        UserId=current_user.UserId,
        Title=f"Đã hoàn thành bài kiểm tra '{q.Title}'",
        Message=f"Điểm số bài làm của bạn: {total_score}/{max_possible_score} (Lần làm: {attempt.AttemptNo}).",
        Type="QUIZ",
        IsRead=False,
        RelatedUrl=f"/courses/{q.CourseId}/quizzes/{q.QuizId}"
    )
    db.add(notif)

    db.commit()
    db.refresh(attempt)

    return QuizAttemptResponse(
        attemptId=attempt.AttemptId,
        quizId=attempt.QuizId,
        studentId=attempt.StudentId,
        attemptNo=attempt.AttemptNo,
        startedAt=attempt.StartedAt,
        submittedAt=attempt.SubmittedAt,
        score=float(attempt.Score) if attempt.Score is not None else None,
        status=attempt.Status,
        answersJson=attempt.AnswersJson,
        studentName=current_user.FullName,
        studentCode=current_user.StudentCode
    )


@router.get("/quizzes/{quiz_id}/attempts", response_model=List[QuizAttemptResponse])
def get_quiz_attempts(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List all student attempts for quiz (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    attempts = db.query(QuizAttempt).filter(QuizAttempt.QuizId == quiz_id).order_by(QuizAttempt.StartedAt.desc()).all()
    results = []
    for at in attempts:
        student = db.query(User).filter(User.UserId == at.StudentId).first()
        results.append(QuizAttemptResponse(
            attemptId=at.AttemptId,
            quizId=at.QuizId,
            studentId=at.StudentId,
            attemptNo=at.AttemptNo,
            startedAt=at.StartedAt,
            submittedAt=at.SubmittedAt,
            score=float(at.Score) if at.Score is not None else None,
            status=at.Status,
            answersJson=at.AnswersJson,
            studentName=student.FullName if student else "Unknown",
            studentCode=student.StudentCode if student else None
        ))
    return results
