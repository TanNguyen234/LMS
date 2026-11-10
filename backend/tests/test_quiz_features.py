import uuid
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock
from fastapi import HTTPException
from backend.app.models.models import Quiz, QuizQuestion, QuizAttempt, User, Course, Enrollment, Grade
from backend.app.api.routes.quizzes import (
    parse_bulk_questions, rebalance_quiz_scores, submit_quiz_attempt,
    BulkImportQuestionsRequest, bulk_import_quiz_questions
)
from backend.app.schemas.schemas import QuizAttemptSubmit


def test_parse_bulk_questions_vietnamese():
    raw_vn = """
    Câu 1: Thủ đô của Việt Nam là gì?
    A. TP.HCM
    B. Hà Nội
    C. Đà Nẵng
    D. Cần Thơ
    Đáp án: B

    Câu 2: HTML là viết tắt của gì?
    A. HyperText Markup Language
    B. High Tech Modern Language
    Đáp án: A
    """
    parsed = parse_bulk_questions(raw_vn)
    assert len(parsed) == 2
    assert parsed[0]["questionText"] == "Thủ đô của Việt Nam là gì?"
    assert parsed[0]["correctAnswer"] == "B"
    assert len(parsed[0]["options"]) == 4

    assert parsed[1]["questionText"] == "HTML là viết tắt của gì?"
    assert parsed[1]["correctAnswer"] == "A"
    assert len(parsed[1]["options"]) == 2


def test_parse_bulk_questions_aiken():
    raw_aiken = """
    What is the capital of France?
    A. London
    B. Berlin
    C. Paris
    D. Rome
    ANSWER: C
    """
    parsed = parse_bulk_questions(raw_aiken)
    assert len(parsed) == 1
    assert parsed[0]["questionText"] == "What is the capital of France?"
    assert parsed[0]["correctAnswer"] == "C"
    assert len(parsed[0]["options"]) == 4


def test_parse_bulk_questions_syntax_errors():
    # Missing answer line
    raw_no_ans = """
    Câu 1: Không có đáp án
    A. Lựa chọn 1
    B. Lựa chọn 2
    """
    with pytest.raises(HTTPException) as exc1:
        parse_bulk_questions(raw_no_ans)
    assert exc1.value.status_code == 400
    assert "Thiếu dòng chỉ định đáp án đúng" in exc1.value.detail

    # Correct answer not in options
    raw_mismatched = """
    Câu 1: Lựa chọn A hoặc B
    A. Lựa chọn 1
    B. Lựa chọn 2
    Đáp án: D
    """
    with pytest.raises(HTTPException) as exc2:
        parse_bulk_questions(raw_mismatched)
    assert exc2.value.status_code == 400
    assert "không khớp" in exc2.value.detail


def test_rebalance_quiz_scores():
    quiz = Quiz(QuizId=uuid.uuid4(), TotalScore=10.0)
    q1 = QuizQuestion(QuestionId=uuid.uuid4(), QuizId=quiz.QuizId, Score=1.0, SortOrder=1)
    q2 = QuizQuestion(QuestionId=uuid.uuid4(), QuizId=quiz.QuizId, Score=1.0, SortOrder=2)
    q3 = QuizQuestion(QuestionId=uuid.uuid4(), QuizId=quiz.QuizId, Score=1.0, SortOrder=3)
    q4 = QuizQuestion(QuestionId=uuid.uuid4(), QuizId=quiz.QuizId, Score=1.0, SortOrder=4)

    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [q1, q2, q3, q4]

    per_q = rebalance_quiz_scores(quiz, db)
    assert per_q == 2.5
    assert q1.Score == 2.5
    assert q2.Score == 2.5
    assert q3.Score == 2.5
    assert q4.Score == 2.5
    assert db.commit.called


def test_quiz_score_visibility_hidden():
    student_id = uuid.uuid4()
    student = User(UserId=student_id, Role="STUDENT", FullName="Student User", StudentCode="SV001")
    course_id = uuid.uuid4()
    course = Course(CourseId=course_id, LecturerId=uuid.uuid4())

    quiz = Quiz(
        QuizId=uuid.uuid4(),
        CourseId=course_id,
        Title="Final Exam",
        IsPublished=True,
        TotalScore=10.0,
        ScoreVisibility="HIDDEN",
        TimeLimitMinutes=60,
        StartAt=datetime.now(timezone.utc) - timedelta(hours=1),
        EndAt=datetime.now(timezone.utc) + timedelta(hours=1),
        course=course
    )

    attempt = QuizAttempt(
        AttemptId=uuid.uuid4(),
        QuizId=quiz.QuizId,
        StudentId=student_id,
        AttemptNo=1,
        StartedAt=datetime.now(timezone.utc) - timedelta(minutes=10),
        Status="IN_PROGRESS"
    )

    qn = QuizQuestion(
        QuestionId=uuid.uuid4(),
        QuizId=quiz.QuizId,
        QuestionType="SINGLE_CHOICE",
        OptionsJson='[{"id":"A","text":"Option 1"},{"id":"B","text":"Option 2"}]',
        CorrectAnswer="A",
        Score=10.0,
        SortOrder=1
    )

    query_mock = MagicMock()
    query_mock.filter.return_value = query_mock
    query_mock.with_hint.return_value = query_mock
    query_mock.order_by.return_value = query_mock
    query_mock.all.return_value = [qn]
    query_mock.update.return_value = 1
    query_mock.first.side_effect = [
        attempt,                               # 1. get attempt
        quiz,                                  # 2. get quiz
        MagicMock(EnrollmentId=uuid.uuid4()),  # 3. get enrollment
        None,                                  # 4. get existing_grade
        MagicMock(UserId=uuid.uuid4()),        # 5. get lecturer
    ]

    db = MagicMock()
    db.query.return_value = query_mock

    submit_in = QuizAttemptSubmit(answers={str(qn.QuestionId): "A"})
    resp = submit_quiz_attempt(attempt.AttemptId, submit_in, current_user=student, db=db)

    # In HIDDEN mode, the returned score to the student must be None!
    assert resp.score is None
    # But internal attempt score is preserved
    assert attempt.Score == 10.0
