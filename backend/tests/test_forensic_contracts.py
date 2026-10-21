from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
from types import SimpleNamespace
import uuid

import pytest
from pydantic import ValidationError
from fastapi import HTTPException

from backend.app.api.routes.assignments import assignment_response_datetime, normalize_assignment_status
from backend.app.api.routes.quizzes import effective_attempt_deadline, quiz_question_payload, sum_question_scores, validate_question_contract
from backend.app.core.config import validate_jwt_secret
from backend.app.main import resolve_spa_file
from backend.app.schemas.schemas import AssignmentCreate, QuizCreate, QuizQuestionCreate, QuizUpdate, SubmissionCreate


def test_assignment_status_rejects_database_invalid_active_value():
    with pytest.raises(ValidationError):
        AssignmentCreate.model_validate({
            "title": "Forensic assignment",
            "dueAt": "2026-11-01T00:00:00Z",
            "status": "ACTIVE",
        })


def test_quiz_question_contract_rejects_unsupported_short_text_and_zero_score():
    base = {
        "questionText": "Question",
        "questionType": "SINGLE_CHOICE",
        "correctAnswer": "A",
    }
    with pytest.raises(HTTPException) as error:
        validate_question_contract("SHORT_TEXT", None, "answer")
    assert error.value.status_code == 400
    with pytest.raises(ValidationError):
        QuizQuestionCreate.model_validate({**base, "score": 0})


def test_quiz_window_validates_naive_and_aware_datetimes_and_limits():
    valid = {
        "title": "Forensic quiz",
        "startAt": "2026-10-21T09:00:00",
        "endAt": "2026-10-21T18:00:00+07:00",
    }
    assert QuizCreate.model_validate(valid)
    with pytest.raises(ValidationError):
        QuizCreate.model_validate({**valid, "startAt": "2026-10-21T11:00:00Z"})
    with pytest.raises(ValidationError):
        QuizUpdate.model_validate({"timeLimitMinutes": 0})


def test_submission_contract_rejects_fake_filename_and_empty_text():
    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate({"contentText": "Answer", "fileUrl": "report.pdf"})
    with pytest.raises(ValidationError):
        SubmissionCreate.model_validate({"contentText": "  "})


def test_assignment_service_rejects_any_status_outside_database_check_constraint():
    assert normalize_assignment_status(" published ") == "PUBLISHED"
    with pytest.raises(HTTPException) as error:
        normalize_assignment_status("ACTIVE")
    assert error.value.status_code == 400


def test_assignment_response_deadline_is_always_utc_aware():
    naive_sql_datetime = datetime(2026, 10, 21, 9, 30)
    offset_datetime = datetime(2026, 10, 21, 16, 30, tzinfo=timezone(timedelta(hours=7)))
    expected = datetime(2026, 10, 21, 9, 30, tzinfo=timezone.utc)
    assert assignment_response_datetime(naive_sql_datetime) == expected
    assert assignment_response_datetime(offset_datetime) == expected


def test_assignment_response_deadline_parses_sql_server_datetime_strings():
    sql_datetime_string = "2026-10-21 16:30:00.0000000"
    expected = datetime(2026, 10, 21, 16, 30, tzinfo=timezone.utc)
    assert assignment_response_datetime(sql_datetime_string) == expected


def test_quiz_option_contract_uses_actual_key_and_rejects_wrong_key():
    validate_question_contract("SINGLE_CHOICE", '[{"key":"K9","text":"Answer"}]', "K9")
    with pytest.raises(HTTPException) as error:
        validate_question_contract("SINGLE_CHOICE", '[{"key":"K9","text":"Answer"}]', "A")
    assert error.value.status_code == 400


def test_quiz_question_contract_rejects_answer_metadata_in_option_objects():
    options = json.dumps([{"key": "A", "text": "First", "isCorrect": True}])
    with pytest.raises(HTTPException) as error:
        validate_question_contract("SINGLE_CHOICE", options, "A")
    assert error.value.status_code == 400


def test_student_question_payload_strips_legacy_answer_metadata():
    question = SimpleNamespace(
        QuestionId=uuid.uuid4(),
        QuizId=uuid.uuid4(),
        QuestionText="Question",
        QuestionType="SINGLE_CHOICE",
        OptionsJson=json.dumps([
            {"key": "A", "text": "First", "isCorrect": True, "explanation": "Secret"},
            {"id": "B", "label": "Second", "correctAnswer": "B"},
        ]),
        Score=Decimal("2"),
        SortOrder=1,
    )
    payload = quiz_question_payload([question])[0]
    assert json.loads(payload.optionsJson) == [
        {"key": "A", "text": "First"},
        {"id": "B", "label": "Second"},
    ]
    assert not hasattr(payload, "correctAnswer")


def test_student_question_payload_strips_answer_aliases_from_legacy_choice_maps():
    question = SimpleNamespace(
        QuestionId=uuid.uuid4(),
        QuizId=uuid.uuid4(),
        QuestionText="Question",
        QuestionType="SINGLE_CHOICE",
        OptionsJson=json.dumps({
            "A": "No",
            "B": "Yes",
            "expectedAnswer": "B",
            "answerText": "Yes",
        }),
        Score=Decimal("1"),
        SortOrder=1,
    )
    payload = quiz_question_payload([question])[0]
    assert json.loads(payload.optionsJson) == {"A": "No", "B": "Yes"}
    with pytest.raises(HTTPException) as error:
        validate_question_contract("SINGLE_CHOICE", question.OptionsJson, "B")
    assert error.value.status_code == 400


def test_quiz_deadline_is_earlier_of_window_and_time_limit_plus_grace():
    started = datetime(2026, 10, 21, 0, 0, tzinfo=timezone.utc)
    assert effective_attempt_deadline(started, 30, started + timedelta(hours=1)) == started + timedelta(minutes=31)
    assert effective_attempt_deadline(started, 30, started + timedelta(minutes=20)) == started + timedelta(minutes=20)


def test_quiz_max_score_is_sum_of_question_scores():
    questions = [type("Question", (), {"Score": Decimal("2.5")})(), type("Question", (), {"Score": Decimal("3")})()]
    assert sum_question_scores(questions) == 5.5


def test_non_development_rejects_the_demo_jwt_secret():
    validate_jwt_secret("development", "university-lms-super-secret-jwt-key-2026-pm-academic")
    with pytest.raises(RuntimeError):
        validate_jwt_secret("production", "university-lms-super-secret-jwt-key-2026-pm-academic")


def test_spa_file_resolution_rejects_traversal(tmp_path: Path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("safe", encoding="utf-8")
    (tmp_path / "private.txt").write_text("private", encoding="utf-8")
    assert resolve_spa_file(dist, "index.html") == dist / "index.html"
    assert resolve_spa_file(dist, "../private.txt") is None
