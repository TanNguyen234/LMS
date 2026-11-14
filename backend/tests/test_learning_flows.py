from datetime import datetime, timedelta, timezone
import json
import uuid

import pytest
from fastapi import HTTPException

from backend.app.core.security import get_password_hash
from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    Assignment,
    Course,
    Enrollment,
    Grade,
    Lesson,
    LessonProgress,
    Module,
    Notification,
    Quiz,
    QuizAttempt,
    QuizQuestion,
    StoredFile,
    Submission,
    User,
)


CS101_ID = "10000000-0000-0000-0000-000000000001"
LECTURER1_ID = uuid.UUID("11111111-1111-1111-1111-111111111102")
STUDENT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000004")
STUDENT2_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")


@pytest.fixture(scope="module", autouse=True)
def _ensure_isolated_lecturer(client):
    with SessionLocal() as db:
        existing = db.query(User).filter(User.UserId == LECTURER1_ID).first()
        if not existing:
            db.add(
                User(
                    UserId=LECTURER1_ID,
                    Email="lf_lecturer@university.edu.vn",
                    PasswordHash=get_password_hash("Demo@123"),
                    FullName="Isolated Learning Flows Lecturer",
                    Role="LECTURER",
                    IsActive=True,
                )
            )
            db.commit()


@pytest.fixture(scope="module")
def lecturer1_token(client, _ensure_isolated_lecturer):
    return _login(client, "lf_lecturer@university.edu.vn")


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _login(client, email: str, password: str = "Demo@123") -> str:
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


def _create_isolated_student(suffix: str, is_active: bool = True) -> uuid.UUID:
    uid = uuid.uuid4()
    with SessionLocal() as db:
        db.add(
            User(
                UserId=uid,
                Email=f"lf_{suffix}@university.edu.vn",
                PasswordHash=get_password_hash("Demo@123"),
                FullName=f"Student {suffix}",
                Role="STUDENT",
                StudentCode=f"SV{suffix[:10]}",
                IsActive=is_active,
            )
        )
        db.commit()
    return uid


def _create_course(
    client,
    admin_token: str,
    suffix: str,
    *,
    status: str = "ACTIVE",
    credits: int = 3,
    allow_self_enroll: bool = False,
    join_code: str | None = None,
    max_students: int | None = None,
    category: str | None = None,
) -> dict:
    resp = client.post(
        "/api/courses",
        json={
            "courseCode": f"LF{suffix[:12]}",
            "title": f"Learning Flow {suffix}",
            "description": "Isolated course for Wave 1 tests",
            "lecturerId": str(LECTURER1_ID),
            "semester": "HK1",
            "academicYear": "2026-2027",
            "credits": credits,
            "status": status,
            "allowSelfEnroll": allow_self_enroll,
            "joinCode": join_code,
            "maxStudents": max_students,
            "category": category,
        },
        headers=_auth(admin_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


# ==========================================
# COURSES & SELF-ENROLLMENT
# ==========================================


def test_admin_enroll_blocks_inactive_student_and_archived_course_and_resets_reenroll(client, admin_token):
    suffix = uuid.uuid4().hex[:8]
    inactive_sid = _create_isolated_student(f"inact_{suffix}", is_active=False)
    active_sid = _create_isolated_student(f"act_{suffix}", is_active=True)

    active_course = _create_course(client, admin_token, f"act_{suffix}", status="ACTIVE")
    archived_course = _create_course(client, admin_token, f"arch_{suffix}", status="ARCHIVED")

    r_inact = client.post(
        f"/api/courses/{active_course['courseId']}/enrollments",
        json={"studentId": str(inactive_sid)},
        headers=_auth(admin_token),
    )
    assert r_inact.status_code == 400

    r_arch = client.post(
        f"/api/courses/{archived_course['courseId']}/enrollments",
        json={"studentId": str(active_sid)},
        headers=_auth(admin_token),
    )
    assert r_arch.status_code == 400

    # Enroll active student, set DROPPED + old EnrolledAt/FinalScore, then re-enroll
    r_enr = client.post(
        f"/api/courses/{active_course['courseId']}/enrollments",
        json={"studentId": str(active_sid)},
        headers=_auth(admin_token),
    )
    assert r_enr.status_code == 201
    old_enrolled_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=60)
    with SessionLocal() as db:
        row = (
            db.query(Enrollment)
            .filter(
                Enrollment.CourseId == uuid.UUID(active_course["courseId"]),
                Enrollment.StudentId == active_sid,
            )
            .one()
        )
        row.Status = "DROPPED"
        row.EnrolledAt = old_enrolled_at
        row.FinalScore = 4.5
        db.commit()

    r_reenr = client.post(
        f"/api/courses/{active_course['courseId']}/enrollments",
        json={"studentId": str(active_sid)},
        headers=_auth(admin_token),
    )
    assert r_reenr.status_code == 201
    data = r_reenr.json()
    assert data["status"] == "ACTIVE"
    assert data["finalScore"] is None
    with SessionLocal() as db:
        refreshed = (
            db.query(Enrollment)
            .filter(
                Enrollment.CourseId == uuid.UUID(active_course["courseId"]),
                Enrollment.StudentId == active_sid,
            )
            .one()
        )
        assert refreshed.EnrolledAt > old_enrolled_at + timedelta(days=30)
        assert refreshed.FinalScore is None


def test_self_enroll_capacity_409_join_by_code_and_drop_guards(client, admin_token, lecturer1_token):
    suffix = uuid.uuid4().hex[:8].upper()
    s1_id = _create_isolated_student(f"se1_{suffix}")
    s2_id = _create_isolated_student(f"se2_{suffix}")
    s1_token = _login(client, f"lf_se1_{suffix}@university.edu.vn")
    s2_token = _login(client, f"lf_se2_{suffix}@university.edu.vn")

    course = _create_course(
        client,
        admin_token,
        f"CAT_{suffix}",
        status="ACTIVE",
        allow_self_enroll=False,
        max_students=None,
    )
    course_id = course["courseId"]

    # Self-enroll blocked when allowSelfEnroll=False
    r_closed = client.post(f"/api/courses/{course_id}/self-enroll", headers=_auth(s1_token))
    assert r_closed.status_code == 400

    # Lecturer enables self-enroll with maxStudents=1 and joinCode
    join_code = f"J{suffix[:6]}"
    r_settings = client.patch(
        f"/api/courses/{course_id}/enrollment-settings",
        json={
            "allowSelfEnroll": True,
            "joinCode": join_code.lower(),
            "maxStudents": 1,
            "category": "Cong nghe phan mem",
        },
        headers=_auth(lecturer1_token),
    )
    assert r_settings.status_code == 200, r_settings.text
    assert r_settings.json()["joinCode"] == join_code
    assert r_settings.json()["maxStudents"] == 1

    # Catalog hides joinCode from student, reveals to lecturer
    r_cat_stu = client.get("/api/courses/catalog", headers=_auth(s1_token))
    assert r_cat_stu.status_code == 200
    stu_item = next(c for c in r_cat_stu.json() if c["courseId"] == course_id)
    assert stu_item["joinCode"] is None
    assert stu_item["allowSelfEnroll"] is True
    assert stu_item["category"] == "Cong nghe phan mem"
    assert stu_item["isEnrolled"] is False

    r_cat_lec = client.get("/api/courses/catalog", headers=_auth(lecturer1_token))
    assert r_cat_lec.status_code == 200
    lec_item = next(c for c in r_cat_lec.json() if c["courseId"] == course_id)
    assert lec_item["joinCode"] == join_code

    # Student 1 self-enrolls (fills capacity 1/1)
    r_e1 = client.post(f"/api/courses/{course_id}/self-enroll", headers=_auth(s1_token))
    assert r_e1.status_code == 201, r_e1.text
    assert r_e1.json()["studentId"] == str(s1_id)

    # Student 2 rejected with 409 because MaxStudents=1 is full
    r_e2_full = client.post(f"/api/courses/{course_id}/self-enroll", headers=_auth(s2_token))
    assert r_e2_full.status_code == 409

    # Lecturer raises maxStudents to 2; setting maxStudents=0 or below active count fails
    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(s2_id)},
        headers=_auth(admin_token),
    ) if False else None
    r_raise = client.patch(
        f"/api/courses/{course_id}/enrollment-settings",
        json={
            "allowSelfEnroll": True,
            "joinCode": join_code,
            "maxStudents": 2,
            "category": "Cong nghe phan mem",
        },
        headers=_auth(lecturer1_token),
    )
    assert r_raise.status_code == 200

    # Student 2 joins via joinCode
    r_bad_code = client.post(
        "/api/courses/join-by-code",
        json={"joinCode": "WRONG999"},
        headers=_auth(s2_token),
    )
    assert r_bad_code.status_code in (400, 404)

    r_join = client.post(
        "/api/courses/join-by-code",
        json={"joinCode": join_code.lower()},
        headers=_auth(s2_token),
    )
    assert r_join.status_code in (200, 201), r_join.text
    assert r_join.json()["courseId"] == course_id

    # Safe capacity check blocks reducing maxStudents below current active (2)
    r_shrink = client.patch(
        f"/api/courses/{course_id}/enrollment-settings",
        json={"allowSelfEnroll": True, "joinCode": join_code, "maxStudents": 1},
        headers=_auth(lecturer1_token),
    )
    assert r_shrink.status_code in (400, 409)

    # Student 2 has no submissions/attempts/grades -> can self-drop cleanly
    r_drop2 = client.delete(f"/api/courses/{course_id}/self-enroll", headers=_auth(s2_token))
    assert r_drop2.status_code == 200

    # Give Student 1 a grade, then verify self-drop is blocked with 400
    r_grade = client.post(
        f"/api/courses/{course_id}/grades/manual",
        json={
            "studentId": str(s1_id),
            "itemTitle": "Participation",
            "sourceType": "MANUAL",
            "score": 9.0,
            "maxScore": 10.0,
            "weightPercent": 100.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_grade.status_code == 201, r_grade.text

    r_drop1_blocked = client.delete(f"/api/courses/{course_id}/self-enroll", headers=_auth(s1_token))
    assert r_drop1_blocked.status_code == 400


def test_completed_enrollment_and_archived_course_read_vs_write_access(client, admin_token, lecturer1_token):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"comp_{suffix}")
    st_token = _login(client, f"lf_comp_{suffix}@university.edu.vn")
    course = _create_course(client, admin_token, f"COMP_{suffix}", status="ACTIVE")
    course_id = course["courseId"]

    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    due = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    assign = client.post(
        f"/api/courses/{course_id}/assignments",
        json={"title": "HW Read Check", "dueAt": due, "maxScore": 10.0, "status": "PUBLISHED"},
        headers=_auth(lecturer1_token),
    ).json()

    # Lecturer marks enrollment COMPLETED
    r_comp = client.patch(
        f"/api/courses/{course_id}/enrollments/{sid}/complete",
        headers=_auth(lecturer1_token),
    )
    assert r_comp.status_code == 200, r_comp.text
    assert r_comp.json()["status"] == "COMPLETED"

    # COMPLETED student still appears in course enrollment list
    r_list = client.get(f"/api/courses/{course_id}/enrollments", headers=_auth(lecturer1_token))
    assert r_list.status_code == 200
    assert any(row["studentId"] == str(sid) and row["status"] == "COMPLETED" for row in r_list.json())

    # Admin archives the course; COMPLETED student retains READ access in course list, detail, and my-grades
    r_arch = client.patch(
        f"/api/courses/{course_id}/status",
        json={"status": "ARCHIVED"},
        headers=_auth(admin_token),
    )
    assert r_arch.status_code == 200

    r_courses = client.get("/api/courses", headers=_auth(st_token))
    assert r_courses.status_code == 200
    assert any(c["courseId"] == course_id for c in r_courses.json())

    r_detail = client.get(f"/api/courses/{course_id}", headers=_auth(st_token))
    assert r_detail.status_code == 200

    r_grades = client.get(f"/api/courses/{course_id}/my-grades", headers=_auth(st_token))
    assert r_grades.status_code == 200

    # Write access (submitting assignment) is blocked for COMPLETED / ARCHIVED
    r_submit = client.put(
        f"/api/assignments/{assign['assignmentId']}/submission",
        json={"contentText": "Too late after completion"},
        headers=_auth(st_token),
    )
    assert r_submit.status_code == 403


# ==========================================
# LESSON PROGRESS
# ==========================================


def test_lesson_progress_tracking_and_lecturer_matrix(client, admin_token, lecturer1_token):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"prog_{suffix}")
    st_token = _login(client, f"lf_prog_{suffix}@university.edu.vn")
    course = _create_course(client, admin_token, f"PRG_{suffix}")
    course_id = course["courseId"]

    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    mod_id = uuid.uuid4()
    pub_lesson_id = uuid.uuid4()
    draft_lesson_id = uuid.uuid4()
    with SessionLocal() as db:
        db.add(
            Module(
                ModuleId=mod_id,
                CourseId=uuid.UUID(course_id),
                Title="Module 1",
                SortOrder=1,
                IsPublished=True,
            )
        )
        db.flush()
        db.add(
            Lesson(
                LessonId=pub_lesson_id,
                ModuleId=mod_id,
                Title="Lesson Published",
                SortOrder=1,
                IsPublished=True,
            )
        )
        db.add(
            Lesson(
                LessonId=draft_lesson_id,
                ModuleId=mod_id,
                Title="Lesson Draft",
                SortOrder=2,
                IsPublished=False,
            )
        )
        db.commit()

    # Unpublished lesson cannot be tracked by student
    r_draft = client.post(
        f"/api/lessons/{draft_lesson_id}/progress",
        json={"isCompleted": True, "timeSpentDeltaSeconds": 30},
        headers=_auth(st_token),
    )
    assert r_draft.status_code in (403, 404)

    r_p1 = client.post(
        f"/api/lessons/{pub_lesson_id}/progress",
        json={"isCompleted": True, "timeSpentDeltaSeconds": 120},
        headers=_auth(st_token),
    )
    assert r_p1.status_code == 200, r_p1.text
    assert r_p1.json()["isCompleted"] is True
    assert r_p1.json()["timeSpentSeconds"] == 120

    r_p2 = client.post(
        f"/api/lessons/{pub_lesson_id}/progress",
        json={"timeSpentDeltaSeconds": 45},
        headers=_auth(st_token),
    )
    assert r_p2.status_code == 200
    assert r_p2.json()["timeSpentSeconds"] == 165
    assert r_p2.json()["isCompleted"] is True

    r_stu_sum = client.get(f"/api/courses/{course_id}/progress", headers=_auth(st_token))
    assert r_stu_sum.status_code == 200
    sum_data = r_stu_sum.json()
    assert sum_data["totalLessons"] == 1
    assert sum_data["completedLessons"] == 1
    assert sum_data["completionPercent"] == 100.0

    r_lec_mat = client.get(f"/api/courses/{course_id}/progress", headers=_auth(lecturer1_token))
    assert r_lec_mat.status_code == 200
    mat_data = r_lec_mat.json()
    assert mat_data["totalLessons"] == 1
    assert any(
        s["studentId"] == str(sid) and s["completedLessons"] == 1 and s["completionPercent"] == 100.0
        for s in mat_data["students"]
    )


# ==========================================
# ASSIGNMENTS & RUBRICS
# ==========================================


def test_assignment_file_id_ownership_resubmit_and_grade_response_contract(
    client, admin_token, lecturer1_token
):
    suffix = uuid.uuid4().hex[:8]
    s1_id = _create_isolated_student(f"as1_{suffix}")
    s2_id = _create_isolated_student(f"as2_{suffix}")
    s1_token = _login(client, f"lf_as1_{suffix}@university.edu.vn")
    s2_token = _login(client, f"lf_as2_{suffix}@university.edu.vn")

    course = _create_course(client, admin_token, f"ASG_{suffix}")
    course_id = course["courseId"]
    for sid in (s1_id, s2_id):
        client.post(
            f"/api/courses/{course_id}/enrollments",
            json={"studentId": str(sid)},
            headers=_auth(admin_token),
        )

    due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    rubric = json.dumps([{"criterion": "Code quality", "maxPoints": 50}, {"criterion": "Tests", "maxPoints": 50}])
    r_create = client.post(
        f"/api/courses/{course_id}/assignments",
        json={
            "title": f"Weighted Assignment {suffix}",
            "description": "Upload and answer",
            "dueAt": due,
            "maxScore": 100.0,
            "weightPercent": 40.0,
            "rubricJson": rubric,
            "status": "PUBLISHED",
        },
        headers=_auth(lecturer1_token),
    )
    assert r_create.status_code == 201, r_create.text
    assign_id = r_create.json()["assignmentId"]
    assert r_create.json()["weightPercent"] == 40.0

    # Notification pushed in DB upon publish
    with SessionLocal() as db:
        notif_count = (
            db.query(Notification)
            .filter(
                Notification.UserId == s1_id,
                Notification.Type == "ASSIGNMENT",
                Notification.RelatedUrl == f"/courses/{course_id}/assignments/{assign_id}",
            )
            .count()
        )
        assert notif_count >= 1

        s1_file_id = uuid.uuid4()
        db.add(
            StoredFile(
                FileId=s1_file_id,
                OwnerId=s1_id,
                CourseId=uuid.UUID(course_id),
                Scope="SUBMISSION",
                OriginalName="answer.pdf",
                StoredPath=f"SUBMISSION/{course_id}/{s1_file_id}.pdf",
                MimeType="application/pdf",
                SizeBytes=1024,
                Sha256="a" * 64,
            )
        )
        db.commit()

    # Student 2 cannot attach Student 1's StoredFile
    r_steal = client.put(
        f"/api/assignments/{assign_id}/submission",
        json={"contentText": "Stolen file", "fileId": str(s1_file_id)},
        headers=_auth(s2_token),
    )
    assert r_steal.status_code == 403

    # Student 1 submits with fileId + rubricScoresJson (or text)
    r_sub1 = client.put(
        f"/api/assignments/{assign_id}/submission",
        json={"contentText": "First attempt", "fileId": str(s1_file_id)},
        headers=_auth(s1_token),
    )
    assert r_sub1.status_code == 200, r_sub1.text
    sub_id = r_sub1.json()["submissionId"]
    assert r_sub1.json()["fileId"] == str(s1_file_id)

    # Lecturer cannot revert assignment back to DRAFT once a submission exists
    r_revert = client.put(
        f"/api/assignments/{assign_id}",
        json={"status": "DRAFT"},
        headers=_auth(lecturer1_token),
    )
    assert r_revert.status_code == 400

    # Student 1 resubmits omitting fileId -> preserves fileId & updates submittedAt
    r_sub2 = client.put(
        f"/api/assignments/{assign_id}/submission",
        json={"contentText": "Updated text"},
        headers=_auth(s1_token),
    )
    assert r_sub2.status_code == 200, r_sub2.text
    assert r_sub2.json()["fileId"] == str(s1_file_id)
    assert r_sub2.json()["contentText"] == "Updated text"

    # Guard on get_my_submission
    r_missing = client.get(f"/api/assignments/{uuid.uuid4()}/my-submission", headers=_auth(s1_token))
    assert r_missing.status_code == 404

    # Grade above maxScore rejected
    r_over = client.put(
        f"/api/submissions/{sub_id}/grade",
        json={"score": 105.0, "feedback": "Invalid"},
        headers=_auth(lecturer1_token),
    )
    assert r_over.status_code == 400

    # Grade within 0..100 returns SubmissionGradeResponse preserving status='GRADED'
    r_grade = client.put(
        f"/api/submissions/{sub_id}/grade",
        json={
            "score": 85.0,
            "feedback": "Well structured",
            "rubricScoresJson": json.dumps({"Code quality": 45, "Tests": 40}),
        },
        headers=_auth(lecturer1_token),
    )
    assert r_grade.status_code == 200, r_grade.text
    g_data = r_grade.json()
    assert g_data["status"] == "GRADED"
    assert g_data["score"] == 85.0
    assert g_data["gradeId"] is not None
    assert g_data["weightPercent"] == 40.0

    with SessionLocal() as db:
        enr = (
            db.query(Enrollment)
            .filter(Enrollment.CourseId == uuid.UUID(course_id), Enrollment.StudentId == s1_id)
            .one()
        )
        assert float(enr.FinalScore) == pytest.approx(8.5, abs=0.01)


# ==========================================
# QUIZZES: VALIDATION, DRAFT, EXPIRY, SHORT_TEXT, VISIBILITY
# ==========================================


def test_validate_question_contract_short_text_value_key_and_true_false_metadata():
    from backend.app.api.routes.quizzes import validate_question_contract

    # SHORT_TEXT now allowed
    validate_question_contract("SHORT_TEXT", None, "Polymorphism enables dynamic dispatch.")
    # "value" key supported cleanly
    validate_question_contract(
        "SINGLE_CHOICE",
        json.dumps([{"value": "V1", "text": "Option 1"}]),
        "V1",
    )
    # TRUE_FALSE with embedded answer metadata MUST still fail
    with pytest.raises(HTTPException) as err:
        validate_question_contract(
            "TRUE_FALSE",
            json.dumps([{"key": "true", "text": "True", "isCorrect": True}]),
            "true",
        )
    assert err.value.status_code == 400


def test_quiz_draft_save_and_expiry_scores_from_server_draft_ignoring_late_payload(
    client, admin_token, lecturer1_token
):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"qd_{suffix}")
    st_token = _login(client, f"lf_qd_{suffix}@university.edu.vn")
    course = _create_course(client, admin_token, f"QD_{suffix}")
    course_id = course["courseId"]
    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    now = datetime.now(timezone.utc)
    quiz = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Draft Expiry Quiz {suffix}",
            "startAt": (now - timedelta(minutes=10)).isoformat(),
            "endAt": (now + timedelta(hours=2)).isoformat(),
            "timeLimitMinutes": 1,
            "maxAttempts": 2,
            "passingScore": 5.0,
            "weightPercent": 50.0,
            "isPublished": True,
        },
        headers=_auth(lecturer1_token),
    ).json()
    quiz_id = quiz["quizId"]

    q1 = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "Q1",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "Correct"}, {"key": "B", "text": "Wrong"}]),
            "correctAnswer": "A",
            "score": 4.0,
            "sortOrder": 1,
        },
        headers=_auth(lecturer1_token),
    ).json()
    q2 = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "Q2",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "Correct"}, {"key": "B", "text": "Wrong"}]),
            "correctAnswer": "A",
            "score": 6.0,
            "sortOrder": 2,
        },
        headers=_auth(lecturer1_token),
    ).json()

    start_resp = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token))
    assert start_resp.status_code == 200, start_resp.text
    attempt_id = start_resp.json()["attemptId"]
    assert start_resp.json()["deadlineAt"] is not None

    # Save ONLY Q1 in server draft before deadline expires
    r_draft = client.put(
        f"/api/quiz-attempts/{attempt_id}/draft",
        json={"answers": {q1["questionId"]: "A"}},
        headers=_auth(st_token),
    )
    assert r_draft.status_code == 200, r_draft.text

    # Resume reflects savedAnswers
    resume_resp = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token))
    assert resume_resp.status_code == 200
    assert resume_resp.json()["savedAnswers"] == {q1["questionId"]: "A"}

    # Force expiry past deadline + 15s grace
    with SessionLocal() as db:
        attempt = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == attempt_id).one()
        attempt.StartedAt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=3)
        db.commit()

    # Late submit tries to pass Q2='A' too -> ignored; server scores from saved draft (4.0) -> 200 EXPIRED
    r_late = client.post(
        f"/api/quiz-attempts/{attempt_id}/submit",
        json={"answers": {q1["questionId"]: "A", q2["questionId"]: "A"}},
        headers=_auth(st_token),
    )
    assert r_late.status_code == 200, r_late.text
    late_data = r_late.json()
    assert late_data["status"] == "EXPIRED"
    assert late_data["score"] == 4.0

    # Re-submitting an already finalized EXPIRED attempt returns 400
    r_repeat = client.post(
        f"/api/quiz-attempts/{attempt_id}/submit",
        json={"answers": {q1["questionId"]: "A"}},
        headers=_auth(st_token),
    )
    assert r_repeat.status_code == 400

    # Grade synchronized from draft auto-grading
    with SessionLocal() as db:
        g = (
            db.query(Grade)
            .filter(Grade.SourceType == "QUIZ", Grade.SourceId == uuid.UUID(quiz_id), Grade.StudentId == sid)
            .one()
        )
        assert float(g.Score) == 4.0
        assert float(g.WeightPercent) == 50.0


def test_abandoned_expired_attempt_auto_finalizes_on_start_and_my_attempts(
    client, admin_token, lecturer1_token
):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"qa_{suffix}")
    st_token = _login(client, f"lf_qa_{suffix}@university.edu.vn")
    course = _create_course(client, admin_token, f"QA_{suffix}")
    course_id = course["courseId"]
    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    now = datetime.now(timezone.utc)
    quiz = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Abandoned Attempt Quiz {suffix}",
            "startAt": (now - timedelta(minutes=10)).isoformat(),
            "endAt": (now + timedelta(hours=2)).isoformat(),
            "timeLimitMinutes": 1,
            "maxAttempts": 2,
            "passingScore": 5.0,
            "isPublished": True,
        },
        headers=_auth(lecturer1_token),
    ).json()
    quiz_id = quiz["quizId"]
    q1 = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "Abandoned Q1",
            "questionType": "TRUE_FALSE",
            "correctAnswer": "true",
            "score": 10.0,
            "sortOrder": 1,
        },
        headers=_auth(lecturer1_token),
    ).json()

    att1 = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token)).json()
    client.put(
        f"/api/quiz-attempts/{att1['attemptId']}/draft",
        json={"answers": {q1["questionId"]: "true"}},
        headers=_auth(st_token),
    )
    with SessionLocal() as db:
        row = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == att1["attemptId"]).one()
        row.StartedAt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=4)
        db.commit()

    # Checking my-attempts auto-finalizes the abandoned expired attempt
    r_my = client.get(f"/api/quizzes/{quiz_id}/my-attempts", headers=_auth(st_token))
    assert r_my.status_code == 200, r_my.text
    assert len(r_my.json()) == 1
    assert r_my.json()[0]["status"] == "EXPIRED"
    assert r_my.json()[0]["score"] == 10.0

    # Calling /start launches attempt #2, expire it too, then next /start finalizes #2 & returns 400 max attempts
    att2 = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token))
    assert att2.status_code == 200
    assert att2.json()["attemptNo"] == 2
    with SessionLocal() as db:
        row2 = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == att2.json()["attemptId"]).one()
        row2.StartedAt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=4)
        db.commit()

    att3 = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token))
    assert att3.status_code == 400
    with SessionLocal() as db:
        final2 = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == att2.json()["attemptId"]).one()
        assert final2.Status == "EXPIRED"


def test_short_text_pending_review_manual_grade_visibility_and_analytics(
    client, admin_token, lecturer1_token
):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"qs_{suffix}")
    st_token = _login(client, f"lf_qs_{suffix}@university.edu.vn")
    course = _create_course(client, admin_token, f"QS_{suffix}")
    course_id = course["courseId"]
    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    now = datetime.now(timezone.utc)
    secret_auto = f"SECRET_MC_{suffix}"
    secret_short = f"SECRET_SHORT_{suffix}"
    quiz = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"ShortText Quiz {suffix}",
            "startAt": (now - timedelta(minutes=10)).isoformat(),
            "endAt": (now + timedelta(hours=3)).isoformat(),
            "timeLimitMinutes": 30,
            "maxAttempts": 1,
            "passingScore": 5.0,
            "weightPercent": 100.0,
            "scoreVisibility": "AFTER_CLOSE",
            "isPublished": True,
        },
        headers=_auth(lecturer1_token),
    ).json()
    quiz_id = quiz["quizId"]

    q_mc = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "MC Q",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "OptA"}, {"key": "B", "text": "OptB"}]),
            "correctAnswer": "A",
            "score": 4.0,
            "sortOrder": 1,
        },
        headers=_auth(lecturer1_token),
    ).json()
    q_short = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": f"Explain {secret_auto}",
            "questionType": "SHORT_TEXT",
            "correctAnswer": secret_short,
            "score": 6.0,
            "sortOrder": 2,
        },
        headers=_auth(lecturer1_token),
    ).json()

    att = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=_auth(st_token)).json()
    attempt_id = att["attemptId"]

    # Unpublishing while attempt is IN_PROGRESS is blocked with 400
    r_unpub = client.patch(
        f"/api/quizzes/{quiz_id}/publish",
        json={"isPublished": False},
        headers=_auth(lecturer1_token),
    )
    assert r_unpub.status_code == 400

    # Student submits free-text answer distinct from model answer (BR-08 forbids auto-scoring SHORT_TEXT)
    r_sub = client.post(
        f"/api/quiz-attempts/{attempt_id}/submit",
        json={"answers": {q_mc["questionId"]: "A", q_short["questionId"]: "My essay explanation"}},
        headers=_auth(st_token),
    )
    assert r_sub.status_code == 200, r_sub.text
    sub_data = r_sub.json()
    assert sub_data["status"] == "PENDING_REVIEW"

    # Before close (scoreVisibility=AFTER_CLOSE), my-attempts MUST NOT expose correctAnswer
    r_my_before = client.get(f"/api/quizzes/{quiz_id}/my-attempts", headers=_auth(st_token))
    assert r_my_before.status_code == 200
    assert secret_short not in r_my_before.text

    # Out-of-bounds manual score (> 6.0) rejected
    r_bad_grade = client.put(
        f"/api/quiz-attempts/{attempt_id}/manual-grade",
        json={"questionScores": {q_short["questionId"]: 7.5}},
        headers=_auth(lecturer1_token),
    )
    assert r_bad_grade.status_code == 400

    # Manual grade finalizes SUBMITTED + upserts Grade + updates Enrollment.FinalScore
    r_mg = client.put(
        f"/api/quiz-attempts/{attempt_id}/manual-grade",
        json={"questionScores": {q_short["questionId"]: 5.0}, "feedback": "Clear explanation"},
        headers=_auth(lecturer1_token),
    )
    assert r_mg.status_code == 200, r_mg.text
    mg_data = r_mg.json()
    assert mg_data["status"] == "SUBMITTED"
    assert mg_data["score"] == 9.0

    with SessionLocal() as db:
        g = (
            db.query(Grade)
            .filter(Grade.SourceType == "QUIZ", Grade.SourceId == uuid.UUID(quiz_id), Grade.StudentId == sid)
            .one()
        )
        assert float(g.Score) == 9.0
        enr = (
            db.query(Enrollment)
            .filter(Enrollment.CourseId == uuid.UUID(course_id), Enrollment.StudentId == sid)
            .one()
        )
        assert float(enr.FinalScore) == pytest.approx(9.0, abs=0.01)

    # Switch visibility to AFTER_ATTEMPT -> correctAnswer can now be seen in my-attempts;
    # Switch to SCORE_ONLY -> never leaked
    client.put(
        f"/api/quizzes/{quiz_id}",
        json={"scoreVisibility": "AFTER_ATTEMPT"},
        headers=_auth(lecturer1_token),
    )
    r_after = client.get(f"/api/quizzes/{quiz_id}/my-attempts", headers=_auth(st_token))
    assert r_after.status_code == 200
    assert secret_short in r_after.text

    client.put(
        f"/api/quizzes/{quiz_id}",
        json={"scoreVisibility": "SCORE_ONLY"},
        headers=_auth(lecturer1_token),
    )
    r_score_only = client.get(f"/api/quizzes/{quiz_id}/my-attempts", headers=_auth(st_token))
    assert r_score_only.status_code == 200
    assert secret_short not in r_score_only.text

    # Quiz analytics for lecturer
    r_analytics = client.get(f"/api/quizzes/{quiz_id}/analytics", headers=_auth(lecturer1_token))
    assert r_analytics.status_code == 200, r_analytics.text
    an_data = r_analytics.json()
    assert an_data["totalAttempts"] >= 1
    assert an_data["submittedCount"] >= 1


# ==========================================
# GRADES, FINALSCORE, TRANSCRIPT & GPA 4.0
# ==========================================


def test_grading_service_final_score_and_gpa_conversion_thresholds():
    from backend.app.services.grading import calculate_course_score10, convert_score10_to_gpa4

    # Exact GPA 4.0 scale boundaries from super_plan.md
    assert convert_score10_to_gpa4(8.5) == (4.0, "A")
    assert convert_score10_to_gpa4(8.0) == (3.5, "B+")
    assert convert_score10_to_gpa4(7.0) == (3.0, "B")
    assert convert_score10_to_gpa4(6.5) == (2.5, "C+")
    assert convert_score10_to_gpa4(5.5) == (2.0, "C")
    assert convert_score10_to_gpa4(5.0) == (1.5, "D+")
    assert convert_score10_to_gpa4(4.0) == (1.0, "D")
    assert convert_score10_to_gpa4(3.99) == (0.0, "F")

    # Weighted 30/70
    g_30 = Grade(Score=8.0, MaxScore=10.0, WeightPercent=30.0)
    g_70 = Grade(Score=90.0, MaxScore=100.0, WeightPercent=70.0)
    assert calculate_course_score10([g_30, g_70]) == pytest.approx(8.7, abs=0.01)

    # All NULL weights -> simple mean normalized to scale 10
    g_null_1 = Grade(Score=80.0, MaxScore=100.0, WeightPercent=None)
    g_null_2 = Grade(Score=6.0, MaxScore=10.0, WeightPercent=None)
    assert calculate_course_score10([g_null_1, g_null_2]) == pytest.approx(7.0, abs=0.01)

    # No grades -> None
    assert calculate_course_score10([]) is None


def test_transcript_provisional_vs_official_gpa_and_manual_grade_crud(
    client, admin_token, lecturer1_token
):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"gpa_{suffix}")
    st_token = _login(client, f"lf_gpa_{suffix}@university.edu.vn")

    c_done = _create_course(client, admin_token, f"GPA_D_{suffix}", credits=3)
    c_act = _create_course(client, admin_token, f"GPA_A_{suffix}", credits=2)
    c_ungraded = _create_course(client, admin_token, f"GPA_U_{suffix}", credits=4)

    for c in (c_done, c_act, c_ungraded):
        r_enr = client.post(
            f"/api/courses/{c['courseId']}/enrollments",
            json={"studentId": str(sid)},
            headers=_auth(admin_token),
        )
        assert r_enr.status_code == 201

    # Seed stale FinalScore=0.0 on c_ungraded to verify zero-grade row is NOT treated as 0.0 GPA
    with SessionLocal() as db:
        ungraded_enr = (
            db.query(Enrollment)
            .filter(Enrollment.CourseId == uuid.UUID(c_ungraded["courseId"]), Enrollment.StudentId == sid)
            .one()
        )
        ungraded_enr.FinalScore = 0.0
        db.commit()

    # Course A (3 cr): Midterm 8.0 (30%) + Final 9.4285... or let's use 8.0 (30%) + 9.0 (70%) -> 8.7 -> 4.0/A
    r_m1 = client.post(
        f"/api/courses/{c_done['courseId']}/grades/manual",
        json={
            "studentId": str(sid),
            "itemTitle": "Midterm Exam",
            "sourceType": "MIDTERM",
            "score": 8.0,
            "maxScore": 10.0,
            "weightPercent": 30.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_m1.status_code == 201, r_m1.text
    r_f1 = client.post(
        f"/api/courses/{c_done['courseId']}/grades/manual",
        json={
            "studentId": str(sid),
            "itemTitle": "Final Exam",
            "sourceType": "FINAL",
            "score": 9.0,
            "maxScore": 10.0,
            "weightPercent": 70.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_f1.status_code == 201, r_f1.text

    # Cumulative weight > 100 rejected
    r_over_w = client.post(
        f"/api/courses/{c_done['courseId']}/grades/manual",
        json={
            "studentId": str(sid),
            "itemTitle": "Extra",
            "sourceType": "MANUAL",
            "score": 10.0,
            "maxScore": 10.0,
            "weightPercent": 10.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_over_w.status_code == 400

    # Mark Course A COMPLETED
    r_comp = client.patch(
        f"/api/courses/{c_done['courseId']}/enrollments/{sid}/complete",
        headers=_auth(lecturer1_token),
    )
    assert r_comp.status_code == 200

    # Course B (2 cr, ACTIVE): NULL weights 8.0 and 6.0 -> 7.0 -> 3.0/B
    r_b1 = client.post(
        f"/api/courses/{c_act['courseId']}/grades/manual",
        json={
            "studentId": str(sid),
            "itemTitle": "Lab 1",
            "sourceType": "MANUAL",
            "score": 8.0,
            "maxScore": 10.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_b1.status_code == 201
    r_b2 = client.post(
        f"/api/courses/{c_act['courseId']}/grades/manual",
        json={
            "studentId": str(sid),
            "itemTitle": "Lab 2",
            "sourceType": "MANUAL",
            "score": 6.0,
            "maxScore": 10.0,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_b2.status_code == 201

    r_tr = client.get("/api/grades/transcript", headers=_auth(st_token))
    assert r_tr.status_code == 200, r_tr.text
    tr = r_tr.json()
    # Official GPA: only Course A (COMPLETED) = 4.0
    assert tr["officialGpaScale4"] == pytest.approx(4.0, abs=0.01)
    assert tr["completedCredits"] == 3
    # Provisional GPA: (4.0*3 + 3.0*2) / (3 + 2) = 3.6; c_ungraded ignored because 0 grade rows
    assert tr["provisionalGpaScale4"] == pytest.approx(3.6, abs=0.01)

    # Manual grade update & delete resyncs FinalScore
    b2_id = r_b2.json()["gradeId"]
    r_upd = client.put(
        f"/api/grades/{b2_id}",
        json={"score": 10.0, "feedback": "Revised"},
        headers=_auth(lecturer1_token),
    )
    assert r_upd.status_code == 200
    assert r_upd.json()["score"] == 10.0

    with SessionLocal() as db:
        enr_b = (
            db.query(Enrollment)
            .filter(Enrollment.CourseId == uuid.UUID(c_act["courseId"]), Enrollment.StudentId == sid)
            .one()
        )
        assert float(enr_b.FinalScore) == pytest.approx(9.0, abs=0.01)

    r_del = client.delete(f"/api/grades/{b2_id}", headers=_auth(lecturer1_token))
    assert r_del.status_code == 200
    with SessionLocal() as db:
        enr_b2 = (
            db.query(Enrollment)
            .filter(Enrollment.CourseId == uuid.UUID(c_act["courseId"]), Enrollment.StudentId == sid)
            .one()
        )
        assert float(enr_b2.FinalScore) == pytest.approx(8.0, abs=0.01)


# ==========================================
# DASHBOARD NAIVE UTC, REAL KPIs & CALENDAR
# ==========================================


def test_dashboard_naive_utc_kpis_and_unified_calendar(
    client, admin_token, lecturer1_token, student1_token
):
    suffix = uuid.uuid4().hex[:8]
    sid = _create_isolated_student(f"dash_{suffix}")
    st_token = _login(client, f"lf_dash_{suffix}@university.edu.vn")
    c_act = _create_course(client, admin_token, f"DSH_{suffix}", status="ACTIVE")
    course_id = c_act["courseId"]

    client.post(
        f"/api/courses/{course_id}/enrollments",
        json={"studentId": str(sid)},
        headers=_auth(admin_token),
    )

    now = datetime.now(timezone.utc)
    r_asg = client.post(
        f"/api/courses/{course_id}/assignments",
        json={
            "title": f"Calendar HW {suffix}",
            "dueAt": (now + timedelta(days=2)).isoformat(),
            "maxScore": 10.0,
            "status": "PUBLISHED",
        },
        headers=_auth(lecturer1_token),
    )
    assert r_asg.status_code == 201

    r_q = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Calendar Quiz {suffix}",
            "startAt": (now - timedelta(hours=1)).isoformat(),
            "endAt": (now + timedelta(days=3)).isoformat(),
            "timeLimitMinutes": 20,
            "maxAttempts": 1,
            "passingScore": 5.0,
            "isPublished": True,
        },
        headers=_auth(lecturer1_token),
    )
    assert r_q.status_code == 201

    # Hit all 3 dashboards without timezone / type errors
    r_adm = client.get("/api/dashboard/admin", headers=_auth(admin_token))
    assert r_adm.status_code == 200, r_adm.text
    assert "activeCourses" in r_adm.json()

    r_lec = client.get("/api/dashboard/lecturer", headers=_auth(lecturer1_token))
    assert r_lec.status_code == 200, r_lec.text
    assert r_lec.json()["totalQuizzes"] >= 1

    r_stu = client.get("/api/dashboard/student", headers=_auth(st_token))
    assert r_stu.status_code == 200, r_stu.text
    stu_dash = r_stu.json()
    assert stu_dash["upcomingAssignments"] >= 1
    assert stu_dash["availableQuizzes"] >= 1
    assert stu_dash["gpa"] is None

    # Calendar endpoint merges assignments and quizzes
    r_cal = client.get("/api/dashboard/calendar", headers=_auth(st_token))
    assert r_cal.status_code == 200, r_cal.text
    titles = {item["title"] for item in r_cal.json()}
    assert f"Calendar HW {suffix}" in titles
    assert f"Calendar Quiz {suffix}" in titles
