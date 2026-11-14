from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import time
import uuid

from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
import pytest

from backend.app.core.config import resolve_database_url, validate_jwt_secret
from backend.app.core.dependencies import (
    verify_course_read_access,
    verify_course_write_access,
)
from backend.app.core.security import (
    consume_ws_ticket,
    create_ws_ticket,
    get_password_hash,
    validate_password_bytes,
    verify_password,
)
from backend.app.db.seed_demo import ensure_sample_vault_files
from backend.app.models.models import Course, Enrollment
from backend.app.schemas.common import UtcDateTime
from backend.app.schemas.schemas import (
    CourseUpdate,
    ManualGradeCreate,
    SubmissionCreate,
    SubmissionGradeResponse,
    UserCreate,
    UserUpdate,
)


class _UtcSample(BaseModel):
    ts: UtcDateTime


class _FakeQuery:
    def __init__(self, rows: list):
        self._rows = list(rows)

    @staticmethod
    def _matches(row, expr) -> bool:
        clauses = getattr(expr, "clauses", None)
        if clauses is not None:
            return all(_FakeQuery._matches(row, sub) for sub in clauses)
        op_name = getattr(getattr(expr, "operator", None), "__name__", "")
        left_key = getattr(getattr(expr, "left", None), "key", None)
        right_val = getattr(getattr(expr, "right", None), "value", None)
        if left_key is None:
            return True
        actual = getattr(row, left_key, None)
        if op_name == "eq":
            return actual == right_val
        if op_name == "in_op":
            return actual in (right_val or ())
        if op_name == "ne":
            return actual != right_val
        return True

    def filter(self, *criteria):
        self._rows = [
            row for row in self._rows if all(self._matches(row, expr) for expr in criteria)
        ]
        return self

    def first(self):
        return self._rows[0] if self._rows else None


class _FakeSession:
    def __init__(self, rows_by_model: dict):
        self._rows_by_model = rows_by_model

    def query(self, model):
        rows = self._rows_by_model.get(model, [])
        if not isinstance(rows, list):
            rows = [rows]
        return _FakeQuery(rows)


def test_resolve_database_url_selects_installed_odbc_driver():
    base_url = (
        "mssql+pyodbc://sa:secret@localhost\\SQLEXPRESS/UniversityLms"
        "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
    )
    unchanged = resolve_database_url(base_url, available_drivers=["ODBC Driver 18 for SQL Server"])
    assert "driver=ODBC+Driver+18+for+SQL+Server" in unchanged

    fallback = resolve_database_url(
        base_url,
        available_drivers=["SQL Server Native Client RDA 11.0", "SQL Server"],
    )
    assert "driver=SQL+Server" in fallback
    assert "TrustServerCertificate=yes" in fallback

    sqlite_url = "sqlite:///./test.db"
    assert resolve_database_url(sqlite_url, available_drivers=["SQL Server"]) == sqlite_url


def test_validate_jwt_secret_blocks_placeholders_outside_dev():
    validate_jwt_secret("development", "change-this-dev-secret-at-least-32-chars")
    with pytest.raises(RuntimeError):
        validate_jwt_secret("production", "change-this-dev-secret-at-least-32-chars")
    with pytest.raises(RuntimeError):
        validate_jwt_secret("staging", "short-secret")


def test_password_byte_limits_and_bcrypt_roundtrip():
    assert validate_password_bytes("secret12") == "secret12"
    max_utf8 = "a" * 72
    assert validate_password_bytes(max_utf8) == max_utf8

    # 36 x 2-byte UTF-8 chars == 72 bytes (valid); 37 == 74 bytes (rejected).
    assert validate_password_bytes("\u00e1" * 36) == "\u00e1" * 36
    with pytest.raises(ValueError):
        validate_password_bytes("\u00e1" * 37)
    with pytest.raises(ValueError):
        validate_password_bytes("short")

    hashed = get_password_hash("Student@2026")
    assert verify_password("Student@2026", hashed) is True
    assert verify_password("a" * 80, hashed) is False


def test_ws_ticket_is_single_use_and_respects_ttl():
    uid = uuid.uuid4()
    ticket = create_ws_ticket(uid, ttl_seconds=5)
    assert consume_ws_ticket(ticket) == uid
    assert consume_ws_ticket(ticket) is None
    assert consume_ws_ticket("non-existent-ticket") is None

    with pytest.raises(ValueError):
        create_ws_ticket(uid, ttl_seconds=0)

    expired = create_ws_ticket(uid, ttl_seconds=1)
    time.sleep(1.1)
    assert consume_ws_ticket(expired) is None


def test_utc_datetime_serializes_with_z_suffix():
    naive_payload = _UtcSample(ts=datetime(2026, 11, 13, 8, 30, 0)).model_dump_json()
    assert '"2026-11-13T08:30:00Z"' in naive_payload

    plus7 = timezone(timedelta(hours=7))
    offset_payload = _UtcSample(ts=datetime(2026, 11, 13, 15, 30, 0, tzinfo=plus7)).model_dump_json()
    assert '"2026-11-13T08:30:00Z"' in offset_payload


def test_foundation_schemas_enforce_constraints_and_contracts():
    valid_user = UserCreate.model_validate({
        "email": "sv01@university.edu.vn",
        "fullName": "Sinh Vien Test",
        "role": "STUDENT",
        "password": "Password123!",
    })
    assert valid_user.role == "STUDENT"

    with pytest.raises(ValidationError):
        UserCreate.model_validate({
            "email": "sv01@university.edu.vn",
            "fullName": "Sinh Vien Test",
            "role": "STUDENT",
            "password": "\u00e1" * 37,
        })

    with pytest.raises(ValidationError):
        UserUpdate.model_validate({"password": "123"})

    with pytest.raises(ValidationError):
        CourseUpdate.model_validate({"credits": 0})

    with pytest.raises(ValidationError):
        CourseUpdate.model_validate({"status": "PUBLISHED"})

    assert CourseUpdate.model_validate({"status": "ARCHIVED", "credits": 4, "maxStudents": 60})

    with pytest.raises(ValidationError):
        ManualGradeCreate.model_validate({
            "studentId": str(uuid.uuid4()),
            "itemTitle": "Midterm Exam",
            "sourceType": "MIDTERM",
            "score": 11,
            "maxScore": 10,
            "weightPercent": 30,
        })

    sub = SubmissionCreate.model_validate({
        "contentText": "Solution attached",
        "fileId": str(uuid.uuid4()),
        "rubricScoresJson": '{"clarity": 4}',
    })
    assert sub.fileId is not None

    grade_resp = SubmissionGradeResponse.model_validate({
        "submissionId": uuid.uuid4(),
        "assignmentId": uuid.uuid4(),
        "studentId": uuid.uuid4(),
        "submittedAt": datetime(2026, 11, 13, 8, 0, tzinfo=timezone.utc),
        "status": "GRADED",
        "score": 8.5,
        "updatedAt": datetime(2026, 11, 13, 9, 0, tzinfo=timezone.utc),
        "studentName": "Nguyen Van An",
        "gradeId": uuid.uuid4(),
        "weightPercent": 20.0,
    })
    assert grade_resp.weightPercent == 20.0


def test_course_read_and_write_access_policies():
    course_id = uuid.uuid4()
    lecturer_id = uuid.uuid4()
    student_id = uuid.uuid4()

    student = SimpleNamespace(UserId=student_id, Role="STUDENT")
    lecturer = SimpleNamespace(UserId=lecturer_id, Role="LECTURER")
    other_lecturer = SimpleNamespace(UserId=uuid.uuid4(), Role="LECTURER")
    admin = SimpleNamespace(UserId=uuid.uuid4(), Role="ADMIN")

    archived_course = SimpleNamespace(CourseId=course_id, LecturerId=lecturer_id, Status="ARCHIVED")
    draft_course = SimpleNamespace(CourseId=course_id, LecturerId=lecturer_id, Status="DRAFT")
    active_course = SimpleNamespace(CourseId=course_id, LecturerId=lecturer_id, Status="ACTIVE")

    completed_enrollment = SimpleNamespace(CourseId=course_id, StudentId=student_id, Status="COMPLETED")
    dropped_enrollment = SimpleNamespace(CourseId=course_id, StudentId=student_id, Status="DROPPED")
    active_enrollment = SimpleNamespace(CourseId=course_id, StudentId=student_id, Status="ACTIVE")

    db_completed_archived = _FakeSession({Course: [archived_course], Enrollment: [completed_enrollment]})
    assert verify_course_read_access(course_id, student, db_completed_archived) is archived_course
    with pytest.raises(HTTPException) as err:
        verify_course_write_access(course_id, student, db_completed_archived)
    assert err.value.status_code == 403

    db_completed_active = _FakeSession({Course: [active_course], Enrollment: [completed_enrollment]})
    assert verify_course_read_access(course_id, student, db_completed_active) is active_course
    with pytest.raises(HTTPException) as err:
        verify_course_write_access(course_id, student, db_completed_active)
    assert err.value.status_code == 403

    db_dropped = _FakeSession({Course: [active_course], Enrollment: [dropped_enrollment]})
    with pytest.raises(HTTPException) as err:
        verify_course_read_access(course_id, student, db_dropped)
    assert err.value.status_code == 403

    db_draft_student = _FakeSession({Course: [draft_course], Enrollment: [active_enrollment]})
    with pytest.raises(HTTPException) as err:
        verify_course_read_access(course_id, student, db_draft_student)
    assert err.value.status_code == 403

    db_active_student = _FakeSession({Course: [active_course], Enrollment: [active_enrollment]})
    assert verify_course_write_access(course_id, student, db_active_student) is active_course

    db_lecturer_draft = _FakeSession({Course: [draft_course]})
    assert verify_course_read_access(course_id, lecturer, db_lecturer_draft) is draft_course
    assert verify_course_write_access(course_id, lecturer, db_lecturer_draft) is draft_course

    db_other_lecturer = _FakeSession({Course: [active_course]})
    with pytest.raises(HTTPException) as err:
        verify_course_read_access(course_id, other_lecturer, db_other_lecturer)
    assert err.value.status_code == 403

    assert verify_course_write_access(course_id, admin, db_other_lecturer) is active_course


def test_ensure_sample_vault_files_extracts_real_pdf_and_md_text(tmp_path: Path):
    meta = ensure_sample_vault_files(vault_dir=str(tmp_path))
    pdf_path = tmp_path / meta["pdf"]["storedPath"]
    md_path = tmp_path / meta["md"]["storedPath"]

    assert pdf_path.is_file()
    assert md_path.is_file()
    assert meta["pdf"]["sizeBytes"] > 500
    assert "CS101" in meta["pdf"]["extractedText"]
    assert "CS101" in meta["md"]["extractedText"]
