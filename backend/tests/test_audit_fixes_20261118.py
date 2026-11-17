import asyncio
from datetime import datetime, timedelta, timezone
import io
import json
from pathlib import Path
import re
import uuid

from fastapi import HTTPException
from pydantic import ValidationError
import pytest

from backend.app.api.routes.assignments import _validate_safe_url
from backend.app.core.config import Settings, apply_test_database_override
from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    AcademicSemester,
    AiInteractionLog,
    Course,
    CourseMessage,
    CourseSession,
    Enrollment,
    Grade,
    Lesson,
    Meeting,
    MeetingLog,
    Module,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    StoredFile,
    User,
    UtcDateTimeColumn,
    WhiteboardSnapshot,
    utcnow,
)
from backend.app.realtime.manager import ConnectionInfo, RealtimeHub
from backend.app.realtime.meeting_lifecycle import (
    _pending_cleanups,
    cancel_empty_meeting_cleanup,
    schedule_empty_meeting_cleanup,
)
from backend.app.schemas.schemas import QuickScheduleGenerateRequest
from backend.app.services.file_storage import _extract_xml_paragraphs, delete_vault_file_quietly


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cleanup_audit_test_entities(
    course_ids: list[str] | None = None,
    semester_ids: list[str] | None = None,
    file_ids: list[str] | None = None,
) -> None:
    db = SessionLocal()
    try:
        cids = [uuid.UUID(cid) for cid in (course_ids or []) if cid]
        sids = [uuid.UUID(sid) for sid in (semester_ids or []) if sid]
        fids = [uuid.UUID(fid) for fid in (file_ids or []) if fid]

        if sids:
            for (cid,) in db.query(Course.CourseId).filter(Course.SemesterId.in_(sids)).all():
                if cid not in cids:
                    cids.append(cid)

        stored_paths: list[str] = []
        if cids:
            db.query(CourseSession).filter(CourseSession.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(CourseMessage).filter(CourseMessage.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(WhiteboardSnapshot).filter(WhiteboardSnapshot.CourseId.in_(cids)).delete(synchronize_session=False)
            mids = [mid for (mid,) in db.query(Meeting.MeetingId).filter(Meeting.CourseId.in_(cids)).all()]
            if mids:
                db.query(MeetingLog).filter(MeetingLog.MeetingId.in_(mids)).delete(synchronize_session=False)
                db.query(Meeting).filter(Meeting.MeetingId.in_(mids)).delete(synchronize_session=False)
            db.query(AiInteractionLog).filter(AiInteractionLog.CourseId.in_(cids)).delete(synchronize_session=False)

            mod_ids = [mid for (mid,) in db.query(Module.ModuleId).filter(Module.CourseId.in_(cids)).all()]
            if mod_ids:
                db.query(Lesson).filter(Lesson.ModuleId.in_(mod_ids)).update(
                    {Lesson.AttachmentFileId: None}, synchronize_session=False
                )

            course_files = db.query(StoredFile).filter(StoredFile.CourseId.in_(cids)).all()
            for sf in course_files:
                if sf.Scope != "SEED" and sf.StoredPath:
                    stored_paths.append(sf.StoredPath)
            db.query(StoredFile).filter(StoredFile.CourseId.in_(cids)).delete(synchronize_session=False)

            for course in db.query(Course).filter(Course.CourseId.in_(cids)).all():
                db.delete(course)
            db.flush()

        if fids:
            extra_files = db.query(StoredFile).filter(StoredFile.FileId.in_(fids)).all()
            for sf in extra_files:
                if sf.Scope != "SEED" and sf.StoredPath:
                    stored_paths.append(sf.StoredPath)
                db.delete(sf)
            db.flush()

        if sids:
            db.query(AcademicSemester).filter(AcademicSemester.SemesterId.in_(sids)).delete(synchronize_session=False)

        db.commit()

        for sp in set(stored_paths):
            still_used = db.query(StoredFile.FileId).filter(StoredFile.StoredPath == sp).first() is not None
            if not still_used:
                delete_vault_file_quietly(sp)
    finally:
        db.close()


# ==========================================
# PURE UNIT & STATIC CONTRACT TESTS
# ==========================================


def test_config_test_database_override_and_cors_defaults():
    raw_url = (
        "mssql+pyodbc://sa:MyS3cret!@localhost\\SQLEXPRESS/UniversityLms"
        "?driver=ODBC+Driver+18+for+SQL+Server&TrustServerCertificate=yes"
    )
    from sqlalchemy.engine import make_url

    overridden = apply_test_database_override(raw_url, "UniversityLms_Test_Run99")
    assert "/UniversityLms_Test_Run99?" in overridden
    assert "***" not in overridden
    assert make_url(overridden).password == "MyS3cret!"
    assert make_url(overridden).database == "UniversityLms_Test_Run99"

    # Non-test DB names in LMS_E2E_TEST_DATABASE must never override production/dev DB
    assert apply_test_database_override(raw_url, "UniversityLms_Prod") == raw_url
    assert apply_test_database_override(raw_url, "") == raw_url

    # Explicit UniversityLms_Test_* URL is preserved as-is
    explicit_test = raw_url.replace("/UniversityLms?", "/UniversityLms_Test_Explicit?")
    assert apply_test_database_override(explicit_test, "UniversityLms_Test_Other") == explicit_test

    cfg = Settings(_env_file=None)
    assert "http://127.0.0.1:8000" in cfg.CORS_ORIGINS
    assert "http://localhost:8000" in cfg.CORS_ORIGINS


def test_quick_schedule_request_rejects_invalid_dates_and_times():
    base = {
        "courseId": str(uuid.uuid4()),
        "titlePrefix": "Buoi hoc",
        "weekdays": [0, 2],
        "startTime": "08:00",
        "endTime": "10:00",
        "startDate": "2026-11-16",
        "endDate": "2026-11-30",
    }
    valid = QuickScheduleGenerateRequest.model_validate(base)
    assert valid.startTime == "08:00"

    for bad_date in ("2026-02-30", "2026-13-01", "2026-00-10"):
        with pytest.raises(ValidationError):
            QuickScheduleGenerateRequest.model_validate({**base, "startDate": bad_date})

    for bad_time in ("24:00", "25:99", "08:60"):
        with pytest.raises(ValidationError):
            QuickScheduleGenerateRequest.model_validate({**base, "endTime": bad_time})


def test_models_utcnow_and_column_strip_microseconds():
    assert utcnow().microsecond == 0
    col = UtcDateTimeColumn()
    bound_aware = col.process_bind_param(
        datetime(2026, 11, 18, 10, 20, 30, 654321, tzinfo=timezone.utc),
        None,
    )
    assert bound_aware == datetime(2026, 11, 18, 10, 20, 30)
    assert bound_aware.tzinfo is None
    assert bound_aware.microsecond == 0

    bound_str = col.process_bind_param("2026-11-18T10:20:30.999999Z", None)
    assert bound_str == datetime(2026, 11, 18, 10, 20, 30)


def test_ooxml_entity_expansion_and_protocol_relative_urls_blocked():
    xml_bomb = (
        b'<?xml version="1.0"?>'
        b'<!DOCTYPE lolz [<!ENTITY lol "lol">]>'
        b"<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
        b"<w:p><w:t>&lol;</w:t></w:p></w:document>"
    )
    with pytest.raises(HTTPException) as xml_err:
        _extract_xml_paragraphs(xml_bomb, "p", "t")
    assert xml_err.value.status_code == 400

    utf16_xml_bomb = (
        '<?xml version="1.0" encoding="UTF-16"?>'
        '<!DOCTYPE lolz [<!ENTITY lol "AAAAA">]>'
        "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'>"
        "<w:p><w:t>&lol;</w:t></w:p></w:document>"
    ).encode("utf-16")
    with pytest.raises(HTTPException) as utf16_err:
        _extract_xml_paragraphs(utf16_xml_bomb, "p", "t")
    assert utf16_err.value.status_code == 400

    with pytest.raises(HTTPException) as url_err:
        _validate_safe_url("//attacker.example/payload.pdf")
    assert url_err.value.status_code == 400
    assert _validate_safe_url("/api/files/f0000000-0000-0000-0000-000000000001/content") is not None


def test_empty_meeting_cleanup_reschedule_preserves_new_timer_handle():
    mid = uuid.uuid4()

    async def _exercise():
        schedule_empty_meeting_cleanup(mid, delay_seconds=30.0)
        first_handle = _pending_cleanups.get(mid)
        assert first_handle is not None

        # Immediately reschedule; cancelled first task's finally must NOT pop second_handle
        schedule_empty_meeting_cleanup(mid, delay_seconds=30.0)
        second_handle = _pending_cleanups.get(mid)
        assert second_handle is not None and second_handle is not first_handle

        await asyncio.sleep(0)
        await asyncio.sleep(0)
        assert _pending_cleanups.get(mid) is second_handle

        cancel_empty_meeting_cleanup(mid)
        await asyncio.sleep(0)
        assert mid not in _pending_cleanups

    asyncio.run(_exercise())


def test_realtime_hub_close_meeting_room_evicts_polls_and_isolates_bad_socket():
    class _HealthySocket:
        def __init__(self):
            self.sent = []
            self.closed = False

        async def send_json(self, payload):
            self.sent.append(payload)

        async def close(self):
            self.closed = True

    class _DeadSocket:
        async def send_json(self, payload):
            raise RuntimeError("socket broken")

        async def close(self):
            raise RuntimeError("already closed")

    hub = RealtimeHub()
    mid = uuid.uuid4()
    good_ws = _HealthySocket()
    bad_ws = _DeadSocket()

    async def _exercise():
        hub.bind_loop(asyncio.get_running_loop())
        c_good = ConnectionInfo("peer-good", good_ws, uuid.uuid4(), "Good", "STUDENT", "meeting", mid)
        c_bad = ConnectionInfo("peer-bad", bad_ws, uuid.uuid4(), "Bad", "STUDENT", "meeting", mid)
        hub.register(c_good)
        hub.register(c_bad)
        hub.create_meeting_poll(mid, question="Ready?", options=["Yes", "No"], created_by_name="Host")

        await hub.broadcast_meeting(mid, {"type": "ping-test"})
        assert len(good_ws.sent) == 1
        # Dead socket was isolated and unregistered cleanly
        assert len(hub.get_meeting_presence(mid)) == 1

        hub.close_meeting_room_sync(mid, {"type": "meeting.ended", "meetingId": str(mid)})
        assert hub.get_meeting_presence(mid) == []
        assert hub.get_meeting_poll(mid) is None

        await asyncio.sleep(0.05)
        assert any(msg.get("type") == "meeting.ended" for msg in good_ws.sent)
        assert good_ws.closed is True

    asyncio.run(_exercise())


def test_alembic_sql_bom_and_zero_emoji_static_contracts():
    repo_root = Path(__file__).resolve().parents[2]

    mig_13 = (repo_root / "backend/alembic/versions/20261113_01_unified_upgrade_schema.py").read_text(encoding="utf-8")
    assert '("Courses", "SectionCode")' not in mig_13
    assert "sys.key_constraints" in mig_13

    schema_sql = (repo_root / "database/01_schema.sql").read_text(encoding="utf-8")
    assert "IX_Courses_SemesterId" in schema_sql
    assert "IX_Courses_CourseCode" in schema_sql

    seed_sql = (repo_root / "database/02_seed.sql").read_text(encoding="utf-8")
    assert "INSERT INTO dbo.AcademicSemesters" in seed_sql
    assert "INSERT INTO dbo.CourseSessions" in seed_sql

    val_sql = (repo_root / "database/04_seed_validation.sql").read_text(encoding="utf-8")
    assert "IF @Count <> 21" in val_sql
    assert "'AcademicSemesters'" in val_sql
    assert "'CourseSessions'" in val_sql

    # Zero UTF-8 BOMs across backend/*.py and zero prohibited emojis in backend/ & database/
    emoji_re = re.compile(r"[\U0001F300-\U0001FAFF\u2600-\u27BF\u2705\u274C\u26A0\u2728]")
    skip_parts = {"venv", ".venv", "__pycache__", ".pytest_cache", "uploads", "vault"}
    for sub in ("backend", "database"):
        for path in (repo_root / sub).rglob("*"):
            rel_parts = path.relative_to(repo_root).parts
            if not path.is_file() or path.name == ".env" or any(p in skip_parts for p in rel_parts):
                continue
            if path.suffix == ".py":
                assert not path.read_bytes().startswith(b"\xef\xbb\xbf"), f"UTF-8 BOM found in {path}"
            text = path.read_text(encoding="utf-8", errors="ignore")
            assert not emoji_re.search(text), f"Prohibited emoji found in {path}"


# ==========================================
# LIVE INTEGRATION REGRESSION TESTS
# ==========================================


def test_cloned_course_lesson_attachment_accessible_and_editable(
    client, admin_token, lecturer1_token, lecturer2_token, student2_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_ids: list[str] = []
    course_ids: list[str] = []
    file_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    lec2 = db.query(User).filter(User.Email == "lecturer2@university.edu.vn").first()
    stu2 = db.query(User).filter(User.Email == "student2@university.edu.vn").first()
    db.close()

    try:
        s1 = client.post(
            "/api/semesters",
            json={
                "code": f"CLN1-{suffix}",
                "name": f"Clone Source {suffix}",
                "semester": f"HK1-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=15)).isoformat(),
                "endDate": (now + timedelta(days=75)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_ids.append(s1["semesterId"])

        s2 = client.post(
            "/api/semesters",
            json={
                "code": f"CLN2-{suffix}",
                "name": f"Clone Target {suffix}",
                "semester": f"HK2-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=5)).isoformat(),
                "endDate": (now + timedelta(days=95)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_ids.append(s2["semesterId"])

        src_course = client.post(
            "/api/courses",
            json={
                "courseCode": f"CLF{suffix}",
                "sectionCode": "N01",
                "title": "Course With File",
                "lecturerId": str(lec1.UserId),
                "semesterId": s1["semesterId"],
                "semester": s1["semester"],
                "academicYear": s1["academicYear"],
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        course_ids.append(src_course["courseId"])

        up_resp = client.post(
            "/api/files/upload",
            files={"file": ("syllabus_notes.md", io.BytesIO(b"# Clone Syllabus Notes\nKey algorithms."), "text/markdown")},
            data={"scope": "LESSON", "courseId": src_course["courseId"]},
            headers=_auth(lecturer1_token),
        )
        assert up_resp.status_code == 201, up_resp.text
        src_file_id = up_resp.json()["fileId"]
        file_ids.append(src_file_id)

        mod = client.post(
            f"/api/courses/{src_course['courseId']}/modules",
            json={"title": "Week 1", "sortOrder": 1, "isPublished": True},
            headers=_auth(lecturer1_token),
        ).json()

        les = client.post(
            f"/api/modules/{mod['moduleId']}/lessons",
            json={
                "title": "Lesson With Vault File",
                "contentType": "TEXT",
                "contentHtml": f'<p>Read <a href="/api/files/{src_file_id}/content">notes</a></p>',
                "attachmentFileId": src_file_id,
                "sortOrder": 1,
                "isPublished": True,
            },
            headers=_auth(lecturer1_token),
        )
        assert les.status_code == 201, les.text

        clone_resp = client.post(
            "/api/courses/clone-to-semester",
            json={
                "sourceCourseIds": [src_course["courseId"]],
                "targetSemesterId": s2["semesterId"],
                "copyModulesAndLessons": True,
                "defaultStatus": "ACTIVE",
            },
            headers=_auth(admin_token),
        )
        assert clone_resp.status_code == 200, clone_resp.text
        dst_course_id = clone_resp.json()["createdCourses"][0]["courseId"]
        course_ids.append(dst_course_id)

        # Reassign cloned course to lecturer2 and enroll student2 ONLY in cloned course
        upd_c = client.put(
            f"/api/courses/{dst_course_id}",
            json={"lecturerId": str(lec2.UserId)},
            headers=_auth(admin_token),
        )
        assert upd_c.status_code == 200, upd_c.text

        enr = client.post(
            f"/api/courses/{dst_course_id}/enrollments",
            json={"studentId": str(stu2.UserId)},
            headers=_auth(admin_token),
        )
        assert enr.status_code == 201, enr.text

        dst_mods = client.get(f"/api/courses/{dst_course_id}/modules", headers=_auth(student2_token)).json()
        dst_les = dst_mods[0]["lessons"][0]
        cloned_file_id = dst_les["attachmentFileId"]
        assert cloned_file_id is not None and cloned_file_id != src_file_id
        assert f"/api/files/{cloned_file_id}/content" in (dst_les["contentHtml"] or "")
        file_ids.append(cloned_file_id)

        stream_resp = client.get(f"/api/files/{cloned_file_id}/content", headers=_auth(student2_token))
        assert stream_resp.status_code == 200
        assert b"Clone Syllabus Notes" in stream_resp.content

        edit_les = client.put(
            f"/api/lessons/{dst_les['lessonId']}",
            json={"title": "Updated Cloned Lesson", "attachmentFileId": cloned_file_id},
            headers=_auth(lecturer2_token),
        )
        assert edit_les.status_code == 200, edit_les.text
    finally:
        _cleanup_audit_test_entities(course_ids, sem_ids, file_ids)


def test_archived_semester_guards_and_student_archived_self_drop_blocked(
    client, admin_token, lecturer1_token, student1_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_ids: list[str] = []
    course_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    stu1 = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
    db.close()

    try:
        sem = client.post(
            "/api/semesters",
            json={
                "code": f"ARC-{suffix}",
                "name": f"Archive Guard {suffix}",
                "semester": f"HK3-{suffix}",
                "academicYear": "2025-2026",
                "startDate": (now - timedelta(days=100)).isoformat(),
                "endDate": (now - timedelta(days=10)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_id = sem["semesterId"]
        sem_ids.append(sem_id)

        c_active = client.post(
            "/api/courses",
            json={
                "courseCode": f"ARA{suffix}",
                "sectionCode": "N01",
                "title": "Active Before Archive",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem_id,
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        course_ids.append(c_active["courseId"])

        c_draft = client.post(
            "/api/courses",
            json={
                "courseCode": f"ARD{suffix}",
                "sectionCode": "N01",
                "title": "Draft Before Archive",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem_id,
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "DRAFT",
            },
            headers=_auth(admin_token),
        ).json()
        course_ids.append(c_draft["courseId"])

        client.post(
            f"/api/courses/{c_active['courseId']}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )

        # Schedule a session before archiving so calendar query can verify archived semester visibility
        client.post(
            "/api/schedules",
            json={
                "courseId": c_active["courseId"],
                "title": "Historical Lecture",
                "startAt": (now - timedelta(days=20, hours=2)).isoformat(),
                "endAt": (now - timedelta(days=20)).isoformat(),
                "deliveryMode": "ONLINE",
            },
            headers=_auth(admin_token),
        )

        arch_resp = client.post(f"/api/semesters/{sem_id}/archive", headers=_auth(admin_token))
        assert arch_resp.status_code == 200, arch_resp.text

        # Both ACTIVE and DRAFT courses moved to ARCHIVED
        assert client.get(f"/api/courses/{c_active['courseId']}", headers=_auth(admin_token)).json()["status"] == "ARCHIVED"
        assert client.get(f"/api/courses/{c_draft['courseId']}", headers=_auth(admin_token)).json()["status"] == "ARCHIVED"

        # Creating or re-activating an ACTIVE course in an ARCHIVED semester is blocked (409)
        r_new_in_arch = client.post(
            "/api/courses",
            json={
                "courseCode": f"ARN{suffix}",
                "sectionCode": "N01",
                "title": "Blocked New Active",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem_id,
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        )
        assert r_new_in_arch.status_code == 409

        r_reactivate = client.patch(
            f"/api/courses/{c_active['courseId']}/status",
            json={"status": "ACTIVE"},
            headers=_auth(admin_token),
        )
        assert r_reactivate.status_code == 409

        # Student cannot self-drop from an ARCHIVED course even with zero submissions/grades
        r_drop_arch = client.delete(
            f"/api/courses/{c_active['courseId']}/self-enroll",
            headers=_auth(student1_token),
        )
        assert r_drop_arch.status_code == 409

        # Lecturer calendar filtered by archived semesterId returns archived course events
        cal_lec = client.get(
            f"/api/dashboard/calendar?semesterId={sem_id}",
            headers=_auth(lecturer1_token),
        )
        assert cal_lec.status_code == 200
        assert any(ev["courseId"] == c_active["courseId"] for ev in cal_lec.json())
    finally:
        _cleanup_audit_test_entities(course_ids, sem_ids)


def test_quiz_unchanged_edit_prestart_guard_and_multi_attempt_manual_grade(
    client, admin_token, lecturer1_token, student1_token
):
    now = datetime.now(timezone.utc).replace(microsecond=0)
    suffix = uuid.uuid4().hex[:6].upper()
    course_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    stu1 = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
    db.close()

    try:
        course = client.post(
            "/api/courses",
            json={
                "courseCode": f"QFX{suffix}",
                "sectionCode": "N01",
                "title": f"Quiz Fix Course {suffix}",
                "lecturerId": str(lec1.UserId),
                "semester": "HK1",
                "academicYear": "2026-2027",
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        course_id = course["courseId"]
        course_ids.append(course_id)

        client.post(
            f"/api/courses/{course_id}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )

        start_iso = (now - timedelta(minutes=15)).isoformat()
        end_iso = (now + timedelta(hours=2)).isoformat()
        quiz = client.post(
            "/api/courses/{}/quizzes".format(course_id),
            json={
                "title": f"Multi Attempt Essay {suffix}",
                "startAt": start_iso,
                "endAt": end_iso,
                "timeLimitMinutes": 20,
                "maxAttempts": 2,
                "passingScore": 5.0,
                "weightPercent": 100.0,
                "scoreVisibility": "SCORE_ONLY",
                "isPublished": True,
            },
            headers=_auth(lecturer1_token),
        ).json()
        quiz_id = quiz["quizId"]

        q_mc = client.post(
            f"/api/quizzes/{quiz_id}/questions",
            json={
                "questionText": "2 + 2 = ?",
                "questionType": "SINGLE_CHOICE",
                "optionsJson": json.dumps({"A": "4", "B": "5"}),
                "correctAnswer": "A",
                "score": 4.0,
                "sortOrder": 1,
            },
            headers=_auth(lecturer1_token),
        ).json()
        q_st = client.post(
            f"/api/quizzes/{quiz_id}/questions",
            json={
                "questionText": "Explain Big-O",
                "questionType": "SHORT_TEXT",
                "correctAnswer": "Asymptotic upper bound",
                "score": 6.0,
                "sortOrder": 2,
            },
            headers=_auth(lecturer1_token),
        ).json()

        # Before starting an attempt, student quiz detail hides question stems/options while keeping maxScore
        pre_detail = client.get(f"/api/quizzes/{quiz_id}", headers=_auth(student1_token))
        assert pre_detail.status_code == 200
        assert pre_detail.json()["maxScore"] == 10.0
        assert pre_detail.json()["questions"] == []

        # Attempt 1: high score 9.0 (4.0 MC + 5.0 manual essay)
        att1 = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(student1_token)).json()
        assert len(att1["questions"]) == 2
        during_detail = client.get(f"/api/quizzes/{quiz_id}", headers=_auth(student1_token)).json()
        assert len(during_detail["questions"]) == 2

        client.post(
            f"/api/quiz-attempts/{att1['attemptId']}/submit",
            json={"answers": {q_mc["questionId"]: "A", q_st["questionId"]: "Strong answer"}},
            headers=_auth(student1_token),
        )
        mg1 = client.put(
            f"/api/quiz-attempts/{att1['attemptId']}/manual-grade",
            json={"questionScores": {q_st["questionId"]: 5.0}},
            headers=_auth(lecturer1_token),
        )
        assert mg1.status_code == 200
        assert mg1.json()["score"] == 9.0

        # Editing quiz metadata while resending UNCHANGED schedule/limit fields succeeds (200)
        upd_ok = client.put(
            f"/api/quizzes/{quiz_id}",
            json={
                "title": f"Multi Attempt Essay Updated {suffix}",
                "startAt": quiz["startAt"],
                "endAt": quiz["endAt"],
                "timeLimitMinutes": 20,
                "maxAttempts": 2,
                "scoreVisibility": "AFTER_ATTEMPT",
            },
            headers=_auth(lecturer1_token),
        )
        assert upd_ok.status_code == 200, upd_ok.text

        # Actually mutating timeLimitMinutes after attempts exist still returns 409
        upd_conflict = client.put(
            f"/api/quizzes/{quiz_id}",
            json={"timeLimitMinutes": 45},
            headers=_auth(lecturer1_token),
        )
        assert upd_conflict.status_code == 409

        # Attempt 2: lower score 1.0 (0.0 MC + 1.0 manual essay) must NOT downgrade best Grade (9.0)
        att2 = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(student1_token)).json()
        client.post(
            f"/api/quiz-attempts/{att2['attemptId']}/submit",
            json={"answers": {q_mc["questionId"]: "B", q_st["questionId"]: "Weak retry"}},
            headers=_auth(student1_token),
        )
        mg2 = client.put(
            f"/api/quiz-attempts/{att2['attemptId']}/manual-grade",
            json={"questionScores": {q_st["questionId"]: 1.0}},
            headers=_auth(lecturer1_token),
        )
        assert mg2.status_code == 200
        assert mg2.json()["score"] == 1.0

        with SessionLocal() as check_db:
            g = (
                check_db.query(Grade)
                .filter(
                    Grade.CourseId == uuid.UUID(course_id),
                    Grade.StudentId == stu1.UserId,
                    Grade.SourceType == "QUIZ",
                    Grade.SourceId == uuid.UUID(quiz_id),
                )
                .one()
            )
            assert float(g.Score) == 9.0
    finally:
        _cleanup_audit_test_entities(course_ids)


def test_past_sessions_do_not_block_self_enroll_and_draft_sessions_hidden(
    client, admin_token, student1_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    course_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    lec2 = db.query(User).filter(User.Email == "lecturer2@university.edu.vn").first()
    stu1 = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
    db.close()

    try:
        c1 = client.post(
            "/api/courses",
            json={
                "courseCode": f"PST1{suffix}",
                "sectionCode": "N01",
                "title": "Past Session Course 1",
                "lecturerId": str(lec1.UserId),
                "semester": "HK1",
                "academicYear": "2026-2027",
                "credits": 3,
                "status": "ACTIVE",
                "allowSelfEnroll": True,
            },
            headers=_auth(admin_token),
        ).json()
        c2 = client.post(
            "/api/courses",
            json={
                "courseCode": f"PST2{suffix}",
                "sectionCode": "N01",
                "title": "Past Session Course 2",
                "lecturerId": str(lec2.UserId),
                "semester": "HK1",
                "academicYear": "2026-2027",
                "credits": 3,
                "status": "ACTIVE",
                "allowSelfEnroll": True,
            },
            headers=_auth(admin_token),
        ).json()
        c_draft = client.post(
            "/api/courses",
            json={
                "courseCode": f"DRFS{suffix}",
                "sectionCode": "N01",
                "title": "Draft Schedule Course",
                "lecturerId": str(lec1.UserId),
                "semester": "HK1",
                "academicYear": "2026-2027",
                "credits": 3,
                "status": "DRAFT",
            },
            headers=_auth(admin_token),
        ).json()
        course_ids.extend([c1["courseId"], c2["courseId"], c_draft["courseId"]])

        client.post(
            f"/api/courses/{c1['courseId']}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )
        client.post(
            f"/api/courses/{c_draft['courseId']}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )

        # Overlapping historical sessions in the past on c1 and c2 + future session on DRAFT course
        past_start = (now - timedelta(days=10, hours=3)).isoformat()
        past_end = (now - timedelta(days=10, hours=1)).isoformat()
        for cid in (c1["courseId"], c2["courseId"]):
            r_s = client.post(
                "/api/schedules",
                json={
                    "courseId": cid,
                    "title": "Past Week 1 Lecture",
                    "startAt": past_start,
                    "endAt": past_end,
                    "deliveryMode": "ONLINE",
                },
                headers=_auth(admin_token),
            )
            assert r_s.status_code == 201, r_s.text

        draft_sess = client.post(
            "/api/schedules",
            json={
                "courseId": c_draft["courseId"],
                "title": f"Hidden Draft Session {suffix}",
                "startAt": (now + timedelta(days=30, hours=1)).isoformat(),
                "endAt": (now + timedelta(days=30, hours=3)).isoformat(),
                "deliveryMode": "ONLINE",
            },
            headers=_auth(admin_token),
        )
        assert draft_sess.status_code == 201, draft_sess.text

        # Self-enrollment into c2 succeeds because the overlapping session is already in the past
        enr_c2 = client.post(f"/api/courses/{c2['courseId']}/self-enroll", headers=_auth(student1_token))
        assert enr_c2.status_code == 201, enr_c2.text

        # Student schedule feed must not leak sessions from DRAFT courses
        stu_sched = client.get("/api/schedules", headers=_auth(student1_token))
        assert stu_sched.status_code == 200
        assert all(item["courseId"] != c_draft["courseId"] for item in stu_sched.json())
    finally:
        _cleanup_audit_test_entities(course_ids)
