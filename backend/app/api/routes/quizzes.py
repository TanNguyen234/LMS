import json
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
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
    Course,
    Enrollment,
    Grade,
    Notification,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    User,
    utcnow,
)
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.schemas import (
    QuizAttemptManualGrade,
    QuizAttemptResponse,
    QuizAttemptStartResponse,
    QuizAttemptSubmit,
    QuizCreate,
    QuizDraftSave,
    QuizPublish,
    QuizQuestionCreate,
    QuizQuestionResponse,
    QuizQuestionStudentResponse,
    QuizQuestionUpdate,
    QuizResponse,
    QuizStudentResponse,
    QuizUpdate,
)
from backend.app.services.grading import sync_enrollment_final_score
from backend.app.services.notification_push import push_notification

router = APIRouter(tags=["Quizzes & Attempts"])

ATTEMPT_GRACE_SECONDS = 60
SUBMIT_GRACE_SECONDS = 15
STUDENT_OPTION_FIELDS = {"key", "id", "value", "text", "label"}
ANSWER_METADATA_FIELDS = {
    "answer",
    "answerkey",
    "answeriscorrect",
    "correct",
    "correctanswer",
    "correctkey",
    "correctoption",
    "explanation",
    "iscorrect",
    "iscorrectanswer",
    "isright",
    "rightanswer",
    "solution",
}


class QuestionAnalyticsItem(BaseModel):
    questionId: uuid.UUID
    questionText: str
    questionType: str
    maxScore: float
    answeredCount: int
    correctCount: int
    accuracyPercent: float
    averageAwardedScore: float


class QuizAnalyticsResponse(BaseModel):
    quizId: uuid.UUID
    title: str
    maxScore: float
    passingScore: float
    totalAttempts: int
    submittedCount: int
    pendingReviewCount: int
    expiredCount: int
    inProgressCount: int
    averageScore: Optional[float] = None
    highestScore: Optional[float] = None
    lowestScore: Optional[float] = None
    passRatePercent: float = 0.0
    questions: List[QuestionAnalyticsItem] = []


def parse_datetime(dt) -> datetime:
    if isinstance(dt, str):
        dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def normalized_option_field(value: str) -> str:
    return "".join(character for character in value.casefold() if character.isalnum())


def option_field_contains_answer_metadata(value: str) -> bool:
    normalized = normalized_option_field(value)
    return (
        normalized in ANSWER_METADATA_FIELDS
        or "answer" in normalized
        or "correct" in normalized
        or "solution" in normalized
        or "explanation" in normalized
    )


def validate_options_have_no_answer_metadata(value: Any) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if option_field_contains_answer_metadata(str(key)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Options must not contain answer or correctness metadata",
                )
            validate_options_have_no_answer_metadata(child)
    elif isinstance(value, list):
        for child in value:
            validate_options_have_no_answer_metadata(child)


def student_safe_options_json(options_json: Optional[str]) -> Optional[str]:
    """Return choice labels/keys only, stripping any legacy answer metadata."""
    if options_json is None:
        return None
    try:
        raw = json.loads(options_json) if isinstance(options_json, str) else options_json
    except (TypeError, json.JSONDecodeError):
        return None

    def safe_value(value):
        if isinstance(value, dict):
            if any(normalized_option_field(str(key)) in STUDENT_OPTION_FIELDS for key in value):
                return {
                    key: safe_value(child)
                    for key, child in value.items()
                    if normalized_option_field(str(key)) in STUDENT_OPTION_FIELDS
                }
            return {
                key: safe_value(child)
                for key, child in value.items()
                if not option_field_contains_answer_metadata(str(key))
            }
        if isinstance(value, list):
            return [safe_value(child) for child in value]
        return value

    return json.dumps(safe_value(raw), ensure_ascii=False)


def sum_question_scores(questions) -> float:
    return float(sum((Decimal(str(question.Score)) for question in questions), Decimal("0")))


def effective_attempt_deadline(started_at: datetime, time_limit_minutes: int, quiz_end_at: datetime) -> datetime:
    started = parse_datetime(started_at)
    quiz_end = parse_datetime(quiz_end_at)
    attempt_end = started + timedelta(minutes=time_limit_minutes, seconds=ATTEMPT_GRACE_SECONDS)
    return min(quiz_end, attempt_end)


def scheduled_attempt_deadline(started_at: datetime, time_limit_minutes: int, quiz_end_at: datetime) -> datetime:
    started = parse_datetime(started_at)
    quiz_end = parse_datetime(quiz_end_at)
    return min(quiz_end, started + timedelta(minutes=time_limit_minutes))


def submission_grace_deadline(started_at: datetime, time_limit_minutes: int, quiz_end_at: datetime) -> datetime:
    return scheduled_attempt_deadline(started_at, time_limit_minutes, quiz_end_at) + timedelta(
        seconds=SUBMIT_GRACE_SECONDS
    )


def validate_question_contract(question_type: str, options_json: Optional[str], correct_answer: str) -> None:
    normalized_type = question_type.strip().upper()
    answer = correct_answer.strip()
    if normalized_type not in {"SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid questionType")

    raw: Any = None
    if options_json is not None and options_json.strip():
        try:
            raw = json.loads(options_json) if isinstance(options_json, str) else options_json
        except (TypeError, json.JSONDecodeError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Options must be valid JSON")
        validate_options_have_no_answer_metadata(raw)

    if normalized_type == "TRUE_FALSE":
        if answer.lower() not in {"true", "false"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="TRUE_FALSE answer must be true or false",
            )
        return

    if normalized_type == "SHORT_TEXT":
        if not answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="SHORT_TEXT question requires a reference answer",
            )
        return

    if raw is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Options must be valid JSON")
    if isinstance(raw, dict):
        keys = [str(key) for key in raw]
    elif isinstance(raw, list):
        keys = [
            str(item.get("key", item.get("id", item.get("value", chr(65 + index)))))
            if isinstance(item, dict)
            else chr(65 + index)
            for index, item in enumerate(raw)
        ]
    else:
        keys = []
    if not keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SINGLE_CHOICE questions require answer options",
        )
    if answer.casefold() not in {key.casefold() for key in keys}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CorrectAnswer must match an option key")


def ensure_quiz_unattempted(quiz_id: uuid.UUID, db: Session) -> None:
    has_attempt = db.query(QuizAttempt.AttemptId).filter(QuizAttempt.QuizId == quiz_id).first()
    if has_attempt:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Quiz questions and scoring cannot change after an attempt has started",
        )


def quiz_question_payload(questions) -> List[QuizQuestionStudentResponse]:
    return [
        QuizQuestionStudentResponse(
            questionId=qn.QuestionId,
            quizId=qn.QuizId,
            questionText=qn.QuestionText,
            questionType=qn.QuestionType,
            optionsJson=student_safe_options_json(qn.OptionsJson),
            score=float(qn.Score),
            sortOrder=qn.SortOrder,
        )
        for qn in questions
    ]


def get_quiz_or_404(quiz_id: uuid.UUID, db: Session) -> Quiz:
    q = db.query(Quiz).filter(Quiz.QuizId == quiz_id).first()
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    return q


def _parse_answers_json(raw_json: Optional[str]) -> Dict[str, Any]:
    if not raw_json:
        return {}
    try:
        parsed = json.loads(raw_json)
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, json.JSONDecodeError):
        return {}


def _can_student_see_answers(quiz: Quiz, attempt_status: str, now_aware: datetime) -> bool:
    if attempt_status == "IN_PROGRESS":
        return False
    vis = (quiz.ScoreVisibility or "AFTER_CLOSE").upper()
    if vis == "SCORE_ONLY":
        return False
    if vis in {"AFTER_ATTEMPT", "IMMEDIATE"}:
        return True
    if vis == "AFTER_CLOSE":
        return now_aware >= parse_datetime(quiz.EndAt)
    return False


def _sanitize_question_results_json(
    raw_json: Optional[str],
    *,
    include_correct: bool,
    attempt_status: str,
) -> Optional[str]:
    if attempt_status == "IN_PROGRESS" or not raw_json:
        return None
    try:
        parsed = json.loads(raw_json)
    except (TypeError, json.JSONDecodeError):
        return None
    if not isinstance(parsed, list):
        return raw_json if include_correct else None
    if include_correct:
        return json.dumps(parsed, ensure_ascii=False)
    sanitized = []
    for item in parsed:
        if isinstance(item, dict):
            clean = {k: v for k, v in item.items() if k != "correctAnswer"}
            sanitized.append(clean)
    return json.dumps(sanitized, ensure_ascii=False)


def _format_attempt_response(
    attempt: QuizAttempt,
    student: Optional[User],
    *,
    for_student: bool = False,
    quiz: Optional[Quiz] = None,
    now_aware: Optional[datetime] = None,
) -> QuizAttemptResponse:
    if for_student and quiz is not None:
        ref_now = now_aware or datetime.now(timezone.utc)
        include_correct = _can_student_see_answers(quiz, attempt.Status, ref_now)
        results_json = _sanitize_question_results_json(
            attempt.QuestionResultsJson,
            include_correct=include_correct,
            attempt_status=attempt.Status,
        )
    else:
        results_json = attempt.QuestionResultsJson

    return QuizAttemptResponse(
        attemptId=attempt.AttemptId,
        quizId=attempt.QuizId,
        studentId=attempt.StudentId,
        attemptNo=attempt.AttemptNo,
        startedAt=parse_datetime(attempt.StartedAt),
        submittedAt=parse_datetime(attempt.SubmittedAt) if attempt.SubmittedAt else None,
        score=float(attempt.Score) if attempt.Score is not None else None,
        status=attempt.Status,
        answersJson=attempt.AnswersJson,
        questionResultsJson=results_json,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None,
    )


def _upsert_quiz_grade_best_or_override(
    db: Session,
    quiz: Quiz,
    student_id: uuid.UUID,
    attempt_score: float,
    max_possible_score: float,
    feedback: str,
    grader_id: uuid.UUID,
    now_utc: datetime,
    *,
    allow_lower_override: bool = False,
) -> None:
    existing_grade = (
        db.query(Grade)
        .filter(
            Grade.CourseId == quiz.CourseId,
            Grade.StudentId == student_id,
            Grade.SourceType == "QUIZ",
            Grade.SourceId == quiz.QuizId,
        )
        .first()
    )
    if existing_grade:
        if allow_lower_override or attempt_score >= float(existing_grade.Score):
            existing_grade.ItemTitle = quiz.Title
            existing_grade.Score = attempt_score
            existing_grade.MaxScore = max_possible_score
            existing_grade.WeightPercent = quiz.WeightPercent
            existing_grade.Feedback = feedback
            existing_grade.GradedBy = grader_id
            existing_grade.GradedAt = now_utc
    else:
        db.add(
            Grade(
                GradeId=uuid.uuid4(),
                CourseId=quiz.CourseId,
                StudentId=student_id,
                SourceType="QUIZ",
                SourceId=quiz.QuizId,
                ItemTitle=quiz.Title,
                Score=attempt_score,
                MaxScore=max_possible_score,
                WeightPercent=quiz.WeightPercent,
                Feedback=feedback,
                GradedBy=grader_id,
                GradedAt=now_utc,
            )
        )
    db.flush()
    sync_enrollment_final_score(db, quiz.CourseId, student_id)


def _score_and_finalize_attempt(
    db: Session,
    q: Quiz,
    attempt: QuizAttempt,
    questions: List[QuizQuestion],
    raw_answers: Dict[str, Any],
    *,
    is_expired: bool,
    now_utc: Optional[datetime] = None,
) -> Optional[tuple[uuid.UUID, dict]]:
    """
    Score SINGLE_CHOICE and TRUE_FALSE deterministically while preserving SHORT_TEXT
    for manual lecturer review (BR-08). Used for normal submit, expired submit, and
    abandoned expired attempt auto-finalization.
    """
    ref_utc = now_utc or utcnow()
    quiz_end_naive = parse_datetime(q.EndAt).replace(tzinfo=None)
    effective_submitted_at = min(ref_utc, quiz_end_naive) if is_expired else ref_utc

    auto_score = 0.0
    max_possible_score = sum_question_scores(questions)
    has_short_text = any(qn.QuestionType == "SHORT_TEXT" for qn in questions)
    results_list: List[Dict[str, Any]] = []

    for qn in questions:
        validate_question_contract(qn.QuestionType, qn.OptionsJson, qn.CorrectAnswer)
        qid_str = str(qn.QuestionId)
        user_ans = raw_answers.get(qid_str)
        correct_ans = qn.CorrectAnswer.strip()

        if qn.QuestionType == "SHORT_TEXT":
            results_list.append(
                {
                    "questionId": qid_str,
                    "questionType": qn.QuestionType,
                    "studentAnswer": user_ans,
                    "correctAnswer": correct_ans,
                    "maxScore": float(qn.Score),
                    "awardedScore": None,
                    "isCorrect": None,
                    "needsManualReview": True,
                }
            )
            continue

        user_ans_str = str(user_ans).strip() if user_ans is not None else ""
        if qn.QuestionType == "SINGLE_CHOICE":
            is_correct = user_ans is not None and user_ans_str.upper() == correct_ans.upper()
        else:
            is_correct = user_ans is not None and user_ans_str.lower() == correct_ans.lower()

        awarded = float(qn.Score) if is_correct else 0.0
        auto_score += awarded
        results_list.append(
            {
                "questionId": qid_str,
                "questionType": qn.QuestionType,
                "studentAnswer": user_ans,
                "correctAnswer": correct_ans,
                "maxScore": float(qn.Score),
                "awardedScore": awarded,
                "isCorrect": is_correct,
                "needsManualReview": False,
            }
        )

    if is_expired:
        target_status = "EXPIRED"
    elif has_short_text:
        target_status = "PENDING_REVIEW"
    else:
        target_status = "SUBMITTED"

    formatted_answers = json.dumps(raw_answers, ensure_ascii=False)
    formatted_results = json.dumps(results_list, ensure_ascii=False)

    updated = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.AttemptId == attempt.AttemptId, QuizAttempt.Status == "IN_PROGRESS")
        .update(
            {
                QuizAttempt.AnswersJson: formatted_answers,
                QuizAttempt.QuestionResultsJson: formatted_results,
                QuizAttempt.Score: auto_score,
                QuizAttempt.Status: target_status,
                QuizAttempt.SubmittedAt: effective_submitted_at,
            },
            synchronize_session=False,
        )
    )
    if updated != 1:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Attempt was already submitted or expired",
        )

    attempt.AnswersJson = formatted_answers
    attempt.QuestionResultsJson = formatted_results
    attempt.Score = auto_score
    attempt.Status = target_status
    attempt.SubmittedAt = effective_submitted_at

    # Sync Grade and Notification immediately when no SHORT_TEXT awaits manual grading.
    if not has_short_text:
        course = db.query(Course).filter(Course.CourseId == q.CourseId).first()
        grader_id = course.LecturerId if course else attempt.StudentId
        prefix = "Tu dong thu bai het gio" if is_expired else "Tu dong cham"
        _upsert_quiz_grade_best_or_override(
            db,
            q,
            attempt.StudentId,
            auto_score,
            max_possible_score,
            f"{prefix}: {auto_score}/{max_possible_score}",
            grader_id,
            ref_utc,
            allow_lower_override=False,
        )
        notif_id = uuid.uuid4()
        related_url = f"/courses/{q.CourseId}/quizzes/{q.QuizId}"
        notif_title = f"Da hoan thanh bai kiem tra '{q.Title}'"
        notif_msg = f"Diem so bai lam cua ban: {auto_score}/{max_possible_score} (Lan lam: {attempt.AttemptNo})."
        db.add(
            Notification(
                NotificationId=notif_id,
                UserId=attempt.StudentId,
                Title=notif_title,
                Message=notif_msg,
                Type="QUIZ",
                IsRead=False,
                RelatedUrl=related_url,
            )
        )
        return (
            attempt.StudentId,
            {
                "type": "notification.created",
                "notificationId": str(notif_id),
                "notificationType": "QUIZ",
                "title": notif_title,
                "message": notif_msg,
                "relatedUrl": related_url,
            },
        )
    return None


def _finalize_abandoned_attempts(
    db: Session,
    q: Quiz,
    student_id: uuid.UUID,
    questions: List[QuizQuestion],
    now_aware: datetime,
) -> tuple[int, List[tuple[uuid.UUID, dict]]]:
    pending = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.QuizId == q.QuizId,
            QuizAttempt.StudentId == student_id,
            QuizAttempt.Status == "IN_PROGRESS",
        )
        .order_by(QuizAttempt.AttemptNo.asc())
        .all()
    )
    finalized_count = 0
    notifications: List[tuple[uuid.UUID, dict]] = []
    for att in pending:
        if now_aware > submission_grace_deadline(att.StartedAt, q.TimeLimitMinutes, q.EndAt):
            draft_answers = _parse_answers_json(att.AnswersJson)
            push_item = _score_and_finalize_attempt(
                db,
                q,
                att,
                questions,
                draft_answers,
                is_expired=True,
                now_utc=utcnow(),
            )
            finalized_count += 1
            if push_item:
                notifications.append(push_item)
    return finalized_count, notifications


def _format_quiz_response(q: Quiz, max_score: float, questions: List[QuizQuestionResponse]) -> QuizResponse:
    return QuizResponse(
        quizId=q.QuizId,
        courseId=q.CourseId,
        title=q.Title,
        description=q.Description,
        startAt=parse_datetime(q.StartAt),
        endAt=parse_datetime(q.EndAt),
        timeLimitMinutes=q.TimeLimitMinutes,
        maxAttempts=q.MaxAttempts,
        passingScore=float(q.PassingScore),
        weightPercent=float(q.WeightPercent) if q.WeightPercent is not None else None,
        scoreVisibility=q.ScoreVisibility or "AFTER_CLOSE",
        maxScore=max_score,
        isPublished=q.IsPublished,
        createdAt=q.CreatedAt,
        questions=questions,
    )


def _format_quiz_student_response(
    q: Quiz,
    max_score: float,
    questions: List[QuizQuestionStudentResponse],
) -> QuizStudentResponse:
    return QuizStudentResponse(
        quizId=q.QuizId,
        courseId=q.CourseId,
        title=q.Title,
        description=q.Description,
        startAt=parse_datetime(q.StartAt),
        endAt=parse_datetime(q.EndAt),
        timeLimitMinutes=q.TimeLimitMinutes,
        maxAttempts=q.MaxAttempts,
        passingScore=float(q.PassingScore),
        weightPercent=float(q.WeightPercent) if q.WeightPercent is not None else None,
        scoreVisibility=q.ScoreVisibility or "AFTER_CLOSE",
        maxScore=max_score,
        isPublished=q.IsPublished,
        createdAt=q.CreatedAt,
        questions=questions,
    )


# ==========================================
# QUIZZES
# ==========================================


@router.get("/courses/{course_id}/quizzes")
def get_course_quizzes(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_read_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List quizzes for course."""
    query = db.query(Quiz).filter(Quiz.CourseId == course_id)
    if current_user.Role == "STUDENT":
        query = query.filter(Quiz.IsPublished == True)
    quizzes = query.order_by(Quiz.StartAt.asc()).all()
    max_scores: Dict[uuid.UUID, float] = {}
    if quizzes:
        rows = (
            db.query(QuizQuestion.QuizId, func.sum(QuizQuestion.Score))
            .filter(QuizQuestion.QuizId.in_([q.QuizId for q in quizzes]))
            .group_by(QuizQuestion.QuizId)
            .all()
        )
        max_scores = {quiz_id: float(score or 0) for quiz_id, score in rows}

    if current_user.Role == "STUDENT":
        return [_format_quiz_student_response(q, max_scores.get(q.QuizId, 0.0), []) for q in quizzes]

    return [_format_quiz_response(q, max_scores.get(q.QuizId, 0.0), []) for q in quizzes]


@router.post("/courses/{course_id}/quizzes", response_model=QuizResponse, status_code=status.HTTP_201_CREATED)
def create_quiz(
    course_id: uuid.UUID,
    quiz_in: QuizCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Create a new quiz (own Lecturer or Admin)."""
    if quiz_in.endAt <= quiz_in.startAt:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EndAt must be after StartAt")
    if quiz_in.isPublished and course.Status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish quiz in a non-ACTIVE course",
        )

    new_q = Quiz(
        QuizId=uuid.uuid4(),
        CourseId=course_id,
        Title=quiz_in.title.strip(),
        Description=quiz_in.description.strip() if quiz_in.description else None,
        StartAt=parse_datetime(quiz_in.startAt).replace(tzinfo=None),
        EndAt=parse_datetime(quiz_in.endAt).replace(tzinfo=None),
        TimeLimitMinutes=quiz_in.timeLimitMinutes,
        MaxAttempts=quiz_in.maxAttempts,
        PassingScore=quiz_in.passingScore,
        WeightPercent=quiz_in.weightPercent,
        ScoreVisibility=quiz_in.scoreVisibility,
        IsPublished=quiz_in.isPublished,
    )
    db.add(new_q)
    db.commit()
    db.refresh(new_q)

    return _format_quiz_response(new_q, 0.0, [])


@router.get("/quizzes/{quiz_id}")
def get_quiz_detail(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get quiz detail; Student DTO NEVER leaks CorrectAnswer."""
    q = get_quiz_or_404(quiz_id, db)
    verify_course_read_access(q.CourseId, current_user, db)

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == quiz_id)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )

    if current_user.Role == "STUDENT":
        if not q.IsPublished:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz is unpublished")
        return _format_quiz_student_response(
            q,
            sum_question_scores(questions),
            quiz_question_payload(questions),
        )

    return _format_quiz_response(
        q,
        sum_question_scores(questions),
        [
            QuizQuestionResponse(
                questionId=qn.QuestionId,
                quizId=qn.QuizId,
                questionText=qn.QuestionText,
                questionType=qn.QuestionType,
                optionsJson=qn.OptionsJson,
                correctAnswer=qn.CorrectAnswer,
                score=float(qn.Score),
                sortOrder=qn.SortOrder,
            )
            for qn in questions
        ],
    )


@router.put("/quizzes/{quiz_id}", response_model=QuizResponse)
def update_quiz(
    quiz_id: uuid.UUID,
    quiz_in: QuizUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update quiz parameters (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    course = verify_lecturer_course_owner(q.CourseId, current_user, db)
    fields = quiz_in.model_fields_set

    if any(value is not None for value in (quiz_in.startAt, quiz_in.endAt, quiz_in.timeLimitMinutes, quiz_in.maxAttempts)):
        has_attempt = db.query(QuizAttempt.AttemptId).filter(QuizAttempt.QuizId == quiz_id).first()
        if has_attempt:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Quiz schedule and attempt limits cannot change after an attempt has started",
            )

    effective_start = parse_datetime(quiz_in.startAt) if quiz_in.startAt is not None else parse_datetime(q.StartAt)
    effective_end = parse_datetime(quiz_in.endAt) if quiz_in.endAt is not None else parse_datetime(q.EndAt)
    if effective_end <= effective_start:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="EndAt must be after StartAt")

    if quiz_in.isPublished is False and q.IsPublished:
        in_progress = (
            db.query(QuizAttempt.AttemptId)
            .filter(QuizAttempt.QuizId == quiz_id, QuizAttempt.Status == "IN_PROGRESS")
            .first()
        )
        if in_progress:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unpublish quiz while attempts are IN_PROGRESS",
            )

    weight_changed = False
    if quiz_in.title is not None:
        q.Title = quiz_in.title.strip()
    if "description" in fields:
        q.Description = quiz_in.description.strip() if quiz_in.description else None
    if quiz_in.startAt is not None:
        q.StartAt = parse_datetime(quiz_in.startAt).replace(tzinfo=None)
    if quiz_in.endAt is not None:
        q.EndAt = parse_datetime(quiz_in.endAt).replace(tzinfo=None)
    if quiz_in.timeLimitMinutes is not None:
        q.TimeLimitMinutes = quiz_in.timeLimitMinutes
    if quiz_in.maxAttempts is not None:
        q.MaxAttempts = quiz_in.maxAttempts
    if quiz_in.passingScore is not None:
        q.PassingScore = quiz_in.passingScore
    if "weightPercent" in fields:
        if q.WeightPercent != quiz_in.weightPercent:
            weight_changed = True
        q.WeightPercent = quiz_in.weightPercent
    if quiz_in.scoreVisibility is not None:
        q.ScoreVisibility = quiz_in.scoreVisibility
    if quiz_in.isPublished is not None:
        if quiz_in.isPublished and course.Status != "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot publish quiz in a non-ACTIVE course",
            )
        q.IsPublished = quiz_in.isPublished

    if weight_changed:
        existing_grades = (
            db.query(Grade)
            .filter(
                Grade.CourseId == q.CourseId,
                Grade.SourceType == "QUIZ",
                Grade.SourceId == q.QuizId,
            )
            .all()
        )
        affected_students = set()
        for g in existing_grades:
            g.WeightPercent = q.WeightPercent
            affected_students.add(g.StudentId)
        db.flush()
        for sid in affected_students:
            sync_enrollment_final_score(db, q.CourseId, sid)

    db.commit()
    db.refresh(q)

    return get_quiz_detail(quiz_id, current_user, db)


@router.patch("/quizzes/{quiz_id}/publish", response_model=MessageResponse)
def toggle_quiz_publish(
    quiz_id: uuid.UUID,
    pub_in: QuizPublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle publish status of quiz; block unpublishing while IN_PROGRESS attempts exist."""
    q = get_quiz_or_404(quiz_id, db)
    course = verify_lecturer_course_owner(q.CourseId, current_user, db)

    if not pub_in.isPublished and q.IsPublished:
        in_progress = (
            db.query(QuizAttempt.AttemptId)
            .filter(QuizAttempt.QuizId == quiz_id, QuizAttempt.Status == "IN_PROGRESS")
            .first()
        )
        if in_progress:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot unpublish quiz while attempts are IN_PROGRESS",
            )
    if pub_in.isPublished and course.Status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot publish quiz in an inactive course",
        )

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
    db: Session = Depends(get_db),
):
    """Add a question to quiz (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    ensure_quiz_unattempted(quiz_id, db)
    validate_question_contract(qn_in.questionType, qn_in.optionsJson, qn_in.correctAnswer)

    new_qn = QuizQuestion(
        QuestionId=uuid.uuid4(),
        QuizId=quiz_id,
        QuestionText=qn_in.questionText.strip(),
        QuestionType=qn_in.questionType.upper(),
        OptionsJson=qn_in.optionsJson,
        CorrectAnswer=qn_in.correctAnswer.strip(),
        Score=qn_in.score,
        SortOrder=qn_in.sortOrder,
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
        sortOrder=new_qn.SortOrder,
    )


@router.put("/questions/{question_id}", response_model=QuizQuestionResponse)
def update_quiz_question(
    question_id: uuid.UUID,
    qn_in: QuizQuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update question (own Lecturer or Admin)."""
    qn = db.query(QuizQuestion).filter(QuizQuestion.QuestionId == question_id).first()
    if not qn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    q = get_quiz_or_404(qn.QuizId, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    ensure_quiz_unattempted(q.QuizId, db)
    validate_question_contract(
        qn_in.questionType or qn.QuestionType,
        qn_in.optionsJson if qn_in.optionsJson is not None else qn.OptionsJson,
        qn_in.correctAnswer if qn_in.correctAnswer is not None else qn.CorrectAnswer,
    )

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
        sortOrder=qn.SortOrder,
    )


@router.delete("/questions/{question_id}", response_model=MessageResponse)
def delete_quiz_question(
    question_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a quiz question before any attempt starts."""
    qn = db.query(QuizQuestion).filter(QuizQuestion.QuestionId == question_id).first()
    if not qn:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    q = get_quiz_or_404(qn.QuizId, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    ensure_quiz_unattempted(q.QuizId, db)
    db.delete(qn)
    db.commit()
    return MessageResponse(message="Question deleted")


# ==========================================
# QUIZ ATTEMPTS, DRAFT, AUTO/MANUAL GRADING
# ==========================================


@router.post("/quizzes/{quiz_id}/attempts/start", response_model=QuizAttemptStartResponse)
def start_quiz_attempt(
    quiz_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Start or resume a quiz attempt.
    Auto-finalizes any abandoned expired attempt from its saved server draft.
    """
    q = (
        db.query(Quiz)
        .filter(Quiz.QuizId == quiz_id)
        .with_hint(Quiz, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")
    if not q.IsPublished:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz is not published")

    verify_course_write_access(q.CourseId, current_user, db)

    now_aware = datetime.now(timezone.utc)
    now_utc = utcnow()
    start_at = parse_datetime(q.StartAt)
    end_at = parse_datetime(q.EndAt)

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == quiz_id)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )
    if not questions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has no questions and cannot be started")
    for question in questions:
        validate_question_contract(question.QuestionType, question.OptionsJson, question.CorrectAnswer)

    push_items: List[tuple[uuid.UUID, dict]] = []
    active_attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.QuizId == quiz_id,
            QuizAttempt.StudentId == current_user.UserId,
            QuizAttempt.Status == "IN_PROGRESS",
        )
        .order_by(QuizAttempt.AttemptNo.desc())
        .first()
    )
    if active_attempt:
        if now_aware <= submission_grace_deadline(active_attempt.StartedAt, q.TimeLimitMinutes, end_at):
            return QuizAttemptStartResponse(
                attemptId=active_attempt.AttemptId,
                quizId=active_attempt.QuizId,
                attemptNo=active_attempt.AttemptNo,
                startedAt=parse_datetime(active_attempt.StartedAt),
                deadlineAt=scheduled_attempt_deadline(active_attempt.StartedAt, q.TimeLimitMinutes, end_at),
                timeLimitMinutes=q.TimeLimitMinutes,
                maxScore=sum_question_scores(questions),
                savedAnswers=_parse_answers_json(active_attempt.AnswersJson),
                questions=quiz_question_payload(questions),
            )
        _, push_items = _finalize_abandoned_attempts(db, q, current_user.UserId, questions, now_aware)

    if now_aware < start_at:
        if push_items or active_attempt:
            db.commit()
        for sid, payload in push_items:
            push_notification(sid, payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has not started yet")
    if now_aware > end_at:
        if push_items or active_attempt:
            db.commit()
        for sid, payload in push_items:
            push_notification(sid, payload)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz availability window has ended")

    prior_attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.QuizId == quiz_id, QuizAttempt.StudentId == current_user.UserId)
        .count()
    )
    if prior_attempts >= q.MaxAttempts:
        if push_items or active_attempt:
            db.commit()
        for sid, payload in push_items:
            push_notification(sid, payload)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum attempts ({q.MaxAttempts}) reached for this quiz",
        )

    attempt_no = prior_attempts + 1
    new_attempt = QuizAttempt(
        AttemptId=uuid.uuid4(),
        QuizId=quiz_id,
        StudentId=current_user.UserId,
        StartedAt=now_utc,
        AttemptNo=attempt_no,
        Status="IN_PROGRESS",
    )
    db.add(new_attempt)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raced_attempt = (
            db.query(QuizAttempt)
            .filter(
                QuizAttempt.QuizId == quiz_id,
                QuizAttempt.StudentId == current_user.UserId,
                QuizAttempt.AttemptNo == attempt_no,
            )
            .first()
        )
        if raced_attempt and raced_attempt.Status == "IN_PROGRESS" and now_aware <= submission_grace_deadline(
            raced_attempt.StartedAt, q.TimeLimitMinutes, end_at
        ):
            return QuizAttemptStartResponse(
                attemptId=raced_attempt.AttemptId,
                quizId=raced_attempt.QuizId,
                attemptNo=raced_attempt.AttemptNo,
                startedAt=parse_datetime(raced_attempt.StartedAt),
                deadlineAt=scheduled_attempt_deadline(raced_attempt.StartedAt, q.TimeLimitMinutes, end_at),
                timeLimitMinutes=q.TimeLimitMinutes,
                maxScore=sum_question_scores(questions),
                savedAnswers=_parse_answers_json(raced_attempt.AnswersJson),
                questions=quiz_question_payload(questions),
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not create a unique quiz attempt; retry the request",
        )
    db.refresh(new_attempt)

    for sid, payload in push_items:
        push_notification(sid, payload)

    return QuizAttemptStartResponse(
        attemptId=new_attempt.AttemptId,
        quizId=new_attempt.QuizId,
        attemptNo=new_attempt.AttemptNo,
        startedAt=parse_datetime(new_attempt.StartedAt),
        deadlineAt=scheduled_attempt_deadline(new_attempt.StartedAt, q.TimeLimitMinutes, end_at),
        timeLimitMinutes=q.TimeLimitMinutes,
        maxScore=sum_question_scores(questions),
        savedAnswers={},
        questions=quiz_question_payload(questions),
    )


@router.put("/quiz-attempts/{attempt_id}/draft", response_model=QuizAttemptResponse)
def save_quiz_draft(
    attempt_id: uuid.UUID,
    draft_in: QuizDraftSave,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Auto-save student's in-progress answers in server draft AnswersJson."""
    attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.AttemptId == attempt_id)
        .with_hint(QuizAttempt, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found")
    if attempt.StudentId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your quiz attempt")
    if attempt.Status != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Draft cannot be saved because attempt status is '{attempt.Status}'",
        )

    q = get_quiz_or_404(attempt.QuizId, db)
    verify_course_write_access(q.CourseId, current_user, db)

    now_aware = datetime.now(timezone.utc)
    if now_aware > submission_grace_deadline(attempt.StartedAt, q.TimeLimitMinutes, q.EndAt):
        questions = (
            db.query(QuizQuestion)
            .filter(QuizQuestion.QuizId == q.QuizId)
            .order_by(QuizQuestion.SortOrder.asc())
            .all()
        )
        draft_answers = _parse_answers_json(attempt.AnswersJson)
        push_item = _score_and_finalize_attempt(
            db,
            q,
            attempt,
            questions,
            draft_answers,
            is_expired=True,
            now_utc=utcnow(),
        )
        db.commit()
        if push_item:
            push_notification(*push_item)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quiz deadline has passed; saved draft finalized as EXPIRED",
        )

    attempt.AnswersJson = json.dumps(draft_in.answers or {}, ensure_ascii=False)
    db.commit()
    db.refresh(attempt)
    return _format_attempt_response(attempt, current_user, for_student=True, quiz=q, now_aware=now_aware)


@router.post("/quiz-attempts/{attempt_id}/submit", response_model=QuizAttemptResponse)
def submit_quiz_attempt(
    attempt_id: uuid.UUID,
    submit_in: QuizAttemptSubmit,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    Submit quiz attempt:
    - Within deadline + 15s grace: uses submitted payload -> SUBMITTED (or PENDING_REVIEW if SHORT_TEXT).
    - Past deadline + 15s grace (first time): ignores late payload, scores from server draft -> EXPIRED + Grade (200).
    - Re-submitting an already finalized attempt returns 400.
    """
    attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.AttemptId == attempt_id)
        .with_hint(QuizAttempt, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found")
    if attempt.StudentId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your quiz attempt")
    if attempt.Status != "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Attempt cannot be submitted because status is '{attempt.Status}'",
        )

    q = (
        db.query(Quiz)
        .filter(Quiz.QuizId == attempt.QuizId)
        .with_hint(Quiz, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not q:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

    now_utc = utcnow()
    now_aware = parse_datetime(now_utc)

    enrollment = (
        db.query(Enrollment.EnrollmentId)
        .filter(
            Enrollment.CourseId == q.CourseId,
            Enrollment.StudentId == current_user.UserId,
            Enrollment.Status == "ACTIVE",
        )
        .first()
    )
    if not enrollment or not q.IsPublished:
        attempt.Status = "EXPIRED"
        attempt.SubmittedAt = now_utc
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Quiz access was revoked after this attempt started; the attempt was expired",
        )

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == q.QuizId)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )
    if not questions:
        attempt.Status = "EXPIRED"
        attempt.SubmittedAt = now_utc
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quiz has no questions and cannot be submitted")

    is_expired = now_aware > submission_grace_deadline(attempt.StartedAt, q.TimeLimitMinutes, q.EndAt)
    effective_answers = _parse_answers_json(attempt.AnswersJson) if is_expired else (submit_in.answers or {})

    push_item = _score_and_finalize_attempt(
        db,
        q,
        attempt,
        questions,
        effective_answers,
        is_expired=is_expired,
        now_utc=now_utc,
    )

    db.commit()
    db.refresh(attempt)

    if push_item:
        push_notification(*push_item)

    return _format_attempt_response(attempt, current_user, for_student=True, quiz=q, now_aware=now_aware)


@router.put("/quiz-attempts/{attempt_id}/manual-grade", response_model=QuizAttemptResponse)
def manual_grade_quiz_attempt(
    attempt_id: uuid.UUID,
    grade_in: QuizAttemptManualGrade,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manually grade SHORT_TEXT / essay questions and finalize SUBMITTED + Grade."""
    attempt = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.AttemptId == attempt_id)
        .with_hint(QuizAttempt, "WITH (UPDLOCK, ROWLOCK)", dialect_name="mssql")
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz attempt not found")

    q = get_quiz_or_404(attempt.QuizId, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    if attempt.Status == "IN_PROGRESS":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot manually grade an attempt that is still IN_PROGRESS",
        )

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == q.QuizId)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )
    question_map = {str(qn.QuestionId): qn for qn in questions}
    for qid_str, q_score in grade_in.questionScores.items():
        target_qn = question_map.get(str(qid_str))
        if not target_qn:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Question {qid_str} does not belong to this quiz",
            )
        if q_score < 0 or q_score > float(target_qn.Score):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score for question {qid_str} must be between 0 and {float(target_qn.Score)}",
            )

    saved_answers = _parse_answers_json(attempt.AnswersJson)
    existing_results: Dict[str, Dict[str, Any]] = {}
    if attempt.QuestionResultsJson:
        try:
            for item in json.loads(attempt.QuestionResultsJson):
                if isinstance(item, dict) and item.get("questionId"):
                    existing_results[str(item["questionId"])] = item
        except (TypeError, json.JSONDecodeError):
            existing_results = {}

    updated_results: List[Dict[str, Any]] = []
    total_score = 0.0
    max_possible_score = sum_question_scores(questions)

    for qn in questions:
        qid_str = str(qn.QuestionId)
        prev = existing_results.get(qid_str, {})
        if qid_str in grade_in.questionScores:
            awarded = float(grade_in.questionScores[qid_str])
        elif prev.get("awardedScore") is not None:
            awarded = float(prev["awardedScore"])
        elif qn.QuestionType == "SHORT_TEXT":
            awarded = 0.0
        else:
            ans = saved_answers.get(qid_str)
            ans_str = str(ans).strip() if ans is not None else ""
            if qn.QuestionType == "SINGLE_CHOICE":
                awarded = float(qn.Score) if ans is not None and ans_str.upper() == qn.CorrectAnswer.strip().upper() else 0.0
            else:
                awarded = float(qn.Score) if ans is not None and ans_str.lower() == qn.CorrectAnswer.strip().lower() else 0.0

        total_score += awarded
        updated_results.append(
            {
                "questionId": qid_str,
                "questionType": qn.QuestionType,
                "studentAnswer": saved_answers.get(qid_str),
                "correctAnswer": qn.CorrectAnswer.strip(),
                "maxScore": float(qn.Score),
                "awardedScore": awarded,
                "isCorrect": awarded >= float(qn.Score),
                "needsManualReview": False,
            }
        )

    now_utc = utcnow()
    attempt.QuestionResultsJson = json.dumps(updated_results, ensure_ascii=False)
    attempt.Score = round(total_score, 2)
    attempt.Status = "SUBMITTED"
    if attempt.SubmittedAt is None:
        attempt.SubmittedAt = now_utc

    feedback_text = (
        grade_in.feedback.strip()
        if grade_in.feedback and grade_in.feedback.strip()
        else f"Da cham xong bai thi: {attempt.Score}/{max_possible_score}"
    )
    _upsert_quiz_grade_best_or_override(
        db,
        q,
        attempt.StudentId,
        float(attempt.Score),
        max_possible_score,
        feedback_text,
        current_user.UserId,
        now_utc,
        allow_lower_override=True,
    )

    notif_id = uuid.uuid4()
    related_url = f"/courses/{q.CourseId}/quizzes/{q.QuizId}"
    notif_title = f"Bai kiem tra '{q.Title}' da duoc cham diem"
    notif_msg = f"Tong diem cua ban: {attempt.Score}/{max_possible_score}. Nhan xet: {feedback_text}"
    db.add(
        Notification(
            NotificationId=notif_id,
            UserId=attempt.StudentId,
            Title=notif_title,
            Message=notif_msg,
            Type="GRADE",
            IsRead=False,
            RelatedUrl=related_url,
        )
    )

    db.commit()
    db.refresh(attempt)

    push_notification(
        attempt.StudentId,
        {
            "type": "notification.created",
            "notificationId": str(notif_id),
            "notificationType": "GRADE",
            "title": notif_title,
            "message": notif_msg,
            "relatedUrl": related_url,
        },
    )

    student = db.query(User).filter(User.UserId == attempt.StudentId).first()
    return _format_attempt_response(attempt, student, for_student=False)


@router.get("/quizzes/{quiz_id}/my-attempts", response_model=List[QuizAttemptResponse])
def get_my_quiz_attempts(
    quiz_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """
    List student's own attempts for a quiz.
    Auto-finalizes expired abandoned attempts and respects ScoreVisibility on CorrectAnswer.
    """
    q = get_quiz_or_404(quiz_id, db)
    verify_course_read_access(q.CourseId, current_user, db)
    if not q.IsPublished:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quiz not found")

    now_aware = datetime.now(timezone.utc)
    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == quiz_id)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )
    finalized_count, push_items = _finalize_abandoned_attempts(db, q, current_user.UserId, questions, now_aware)
    if finalized_count > 0:
        db.commit()
        for sid, payload in push_items:
            push_notification(sid, payload)

    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.QuizId == quiz_id, QuizAttempt.StudentId == current_user.UserId)
        .order_by(QuizAttempt.AttemptNo.asc())
        .all()
    )
    return [
        _format_attempt_response(att, current_user, for_student=True, quiz=q, now_aware=now_aware)
        for att in attempts
    ]


@router.get("/quizzes/{quiz_id}/analytics", response_model=QuizAnalyticsResponse)
def get_quiz_analytics(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Aggregate quiz score statistics and per-question accuracy for Lecturer/Admin."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    questions = (
        db.query(QuizQuestion)
        .filter(QuizQuestion.QuizId == quiz_id)
        .order_by(QuizQuestion.SortOrder.asc())
        .all()
    )
    attempts = db.query(QuizAttempt).filter(QuizAttempt.QuizId == quiz_id).all()
    max_score = sum_question_scores(questions)

    submitted_count = sum(1 for a in attempts if a.Status == "SUBMITTED")
    pending_count = sum(1 for a in attempts if a.Status == "PENDING_REVIEW")
    expired_count = sum(1 for a in attempts if a.Status == "EXPIRED")
    in_progress_count = sum(1 for a in attempts if a.Status == "IN_PROGRESS")

    scored = [float(a.Score) for a in attempts if a.Status in {"SUBMITTED", "EXPIRED"} and a.Score is not None]
    avg_score = round(sum(scored) / len(scored), 2) if scored else None
    high_score = max(scored) if scored else None
    low_score = min(scored) if scored else None
    passed = sum(1 for s in scored if s >= float(q.PassingScore))
    pass_rate = round((passed / len(scored)) * 100.0, 2) if scored else 0.0

    # Accumulate per-question breakdown from finalized QuestionResultsJson
    q_stats: Dict[str, Dict[str, float]] = {
        str(qn.QuestionId): {"answered": 0, "correct": 0, "awarded_sum": 0.0, "awarded_count": 0}
        for qn in questions
    }
    for att in attempts:
        if att.Status not in {"SUBMITTED", "EXPIRED", "PENDING_REVIEW"}:
            continue
        if att.QuestionResultsJson:
            try:
                parsed = json.loads(att.QuestionResultsJson)
                if isinstance(parsed, list):
                    for item in parsed:
                        if not isinstance(item, dict):
                            continue
                        qid = str(item.get("questionId", ""))
                        if qid not in q_stats:
                            continue
                        if item.get("studentAnswer") is not None and str(item.get("studentAnswer")).strip() != "":
                            q_stats[qid]["answered"] += 1
                        if item.get("awardedScore") is not None:
                            q_stats[qid]["awarded_sum"] += float(item["awardedScore"])
                            q_stats[qid]["awarded_count"] += 1
                        if item.get("isCorrect") is True:
                            q_stats[qid]["correct"] += 1
                    continue
            except (TypeError, json.JSONDecodeError):
                pass
        answers = _parse_answers_json(att.AnswersJson)
        for qn in questions:
            qid = str(qn.QuestionId)
            ans = answers.get(qid)
            if ans is not None and str(ans).strip() != "":
                q_stats[qid]["answered"] += 1

    question_items: List[QuestionAnalyticsItem] = []
    for qn in questions:
        qid = str(qn.QuestionId)
        st = q_stats[qid]
        denom = st["awarded_count"] or len(scored)
        acc_pct = round((st["correct"] / denom) * 100.0, 2) if denom > 0 else 0.0
        avg_awd = round(st["awarded_sum"] / st["awarded_count"], 2) if st["awarded_count"] > 0 else 0.0
        question_items.append(
            QuestionAnalyticsItem(
                questionId=qn.QuestionId,
                questionText=qn.QuestionText,
                questionType=qn.QuestionType,
                maxScore=float(qn.Score),
                answeredCount=int(st["answered"]),
                correctCount=int(st["correct"]),
                accuracyPercent=acc_pct,
                averageAwardedScore=avg_awd,
            )
        )

    return QuizAnalyticsResponse(
        quizId=q.QuizId,
        title=q.Title,
        maxScore=max_score,
        passingScore=float(q.PassingScore),
        totalAttempts=len(attempts),
        submittedCount=submitted_count,
        pendingReviewCount=pending_count,
        expiredCount=expired_count,
        inProgressCount=in_progress_count,
        averageScore=avg_score,
        highestScore=high_score,
        lowestScore=low_score,
        passRatePercent=pass_rate,
        questions=question_items,
    )


@router.get("/quizzes/{quiz_id}/attempts", response_model=List[QuizAttemptResponse])
def get_quiz_attempts(
    quiz_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all student attempts for quiz (own Lecturer or Admin)."""
    q = get_quiz_or_404(quiz_id, db)
    verify_lecturer_course_owner(q.CourseId, current_user, db)

    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.QuizId == quiz_id)
        .order_by(QuizAttempt.StartedAt.desc())
        .all()
    )
    if not attempts:
        return []
    student_ids = {at.StudentId for at in attempts}
    students = db.query(User).filter(User.UserId.in_(student_ids)).all()
    student_map = {u.UserId: u for u in students}
    return [_format_attempt_response(at, student_map.get(at.StudentId), for_student=False) for at in attempts]
