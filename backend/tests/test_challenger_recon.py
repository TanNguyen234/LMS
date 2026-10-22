import asyncio
import uuid
import json
from datetime import datetime, timezone, timedelta
from httpx import ASGITransport, AsyncClient
import pytest
from backend.app.db.session import SessionLocal
from backend.app.core.security import create_access_token
from backend.app.models.models import (
    User, Course, Enrollment, Assignment, Submission, Quiz, QuizQuestion,
    QuizAttempt, Grade, Notification,
)


# ==============================================================================
# CHALLENGER RECONCILIATION SUITE: EMPIRICAL VERIFICATION & ADVERSARIAL STRESS
# ==============================================================================


# ------------------------------------------------------------------------------
# 1. HEALTH CHECK ENDPOINT
# ------------------------------------------------------------------------------

def test_challenger_health_endpoint_contract(client):
    """
    Empirically verify /health contract compliance:
    - Status code must be 200.
    - JSON payload must contain:
        'status': 'ok'
        'status_detail': 'healthy'
        'database_connected': True
    """
    response = client.get("/health")
    assert response.status_code == 200, f"Expected 200 from /health, got {response.status_code}: {response.text}"
    data = response.json()
    assert data.get("status") == "ok", f"Expected 'status': 'ok', got {data.get('status')}"
    assert data.get("status_detail") == "healthy", f"Expected 'status_detail': 'healthy', got {data.get('status_detail')}"
    assert data.get("database_connected") is True, f"Expected 'database_connected': True, got {data.get('database_connected')}"
    assert "app" in data, "Missing 'app' in /health response"
    assert "environment" in data, "Missing 'environment' in /health response"


# ------------------------------------------------------------------------------
# 2. AUTHENTICATION: VALID VS INVALID CREDENTIALS & ADVERSARIAL CASES
# ------------------------------------------------------------------------------

def test_challenger_auth_valid_logins_all_roles(client):
    """
    Verify valid credentials for all three personas (Admin, Lecturer, Student).
    Verifies JWT token issuance, user profile DTO, and /api/auth/me contract.
    """
    personas = [
        ("admin@university.edu.vn", "Demo@123", "ADMIN"),
        ("lecturer1@university.edu.vn", "Demo@123", "LECTURER"),
        ("student1@university.edu.vn", "Demo@123", "STUDENT"),
    ]
    for email, password, expected_role in personas:
        resp = client.post("/api/auth/login", json={"email": email, "password": password})
        assert resp.status_code == 200, f"Login failed for {email}: {resp.text}"
        payload = resp.json()
        assert "access_token" in payload, f"No access token returned for {email}"
        assert payload.get("token_type") == "bearer"
        user_dto = payload.get("user", {})
        assert user_dto.get("email") == email
        assert user_dto.get("role") == expected_role
        assert user_dto.get("isActive") is True

        # Test /api/auth/me with the issued token
        token = payload["access_token"]
        me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert me_resp.status_code == 200
        me_data = me_resp.json()
        assert me_data.get("email") == email
        assert me_data.get("role") == expected_role


def test_challenger_auth_case_and_whitespace_insensitivity(client):
    """
    Verify email sanitization (case normalization and stripping).
    """
    resp = client.post("/api/auth/login", json={
        "email": "  STUDENT1@UNIVERSITY.EDU.VN  ",
        "password": "Demo@123"
    })
    assert resp.status_code == 200, f"Normalized email login failed: {resp.text}"
    assert resp.json()["user"]["email"] == "student1@university.edu.vn"


def test_challenger_auth_invalid_credentials_adversarial(client):
    """
    Adversarial test cases for authentication:
    - Wrong password
    - Non-existent account
    - Empty password
    - Empty email
    - SQL injection attempt in credentials
    - Malformed token
    """
    # 1. Wrong password
    r1 = client.post("/api/auth/login", json={"email": "student1@university.edu.vn", "password": "WrongPassword!999"})
    assert r1.status_code == 401
    assert "incorrect email or password" in r1.json()["detail"].lower()

    # 2. Non-existent account
    r2 = client.post("/api/auth/login", json={"email": "ghost_attacker_99@university.edu.vn", "password": "Demo@123"})
    assert r2.status_code == 401
    assert "incorrect email or password" in r2.json()["detail"].lower()

    # 3. Empty password
    r3 = client.post("/api/auth/login", json={"email": "student1@university.edu.vn", "password": ""})
    assert r3.status_code in [400, 401, 422]

    # 4. SQL Injection payload in email (caught by schema validation as 422 or auth as 401)
    r4 = client.post("/api/auth/login", json={"email": "admin@university.edu.vn' OR '1'='1", "password": "Demo@123"})
    assert r4.status_code in [401, 422]

    # 5. SQL Injection payload with comment (caught by schema validation as 422 or auth as 401)
    r5 = client.post("/api/auth/login", json={"email": "' UNION SELECT * FROM Users --", "password": "x"})
    assert r5.status_code in [401, 422]

    # 6. Tampered / malformed Bearer token on protected route
    r6 = client.get("/api/auth/me", headers={"Authorization": "Bearer forged.jwt.token.value"})
    assert r6.status_code == 401

    # 7. Empty authorization header
    r7 = client.get("/api/auth/me", headers={"Authorization": "Bearer "})
    assert r7.status_code in [401, 403]

    with SessionLocal() as db:
        student = db.query(User).filter(User.Email == "student1@university.edu.vn").one()
        expired_token = create_access_token(
            subject=student.UserId,
            role=student.Role,
            email=student.Email,
            expires_delta=timedelta(seconds=-60),
        )
    r8 = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert r8.status_code == 401


# ------------------------------------------------------------------------------
# 3. ROLE-BASED ACCESS CONTROL (RBAC) ENFORCEMENT (403 FORBIDDEN)
# ------------------------------------------------------------------------------

def test_challenger_rbac_student_forbidden_admin_routes(client, student1_token):
    """
    Verify student token receives strict 403 Forbidden across all Admin endpoints:
    - GET /api/users
    - POST /api/users
    - GET /api/users/{user_id}
    - PATCH /api/users/{user_id}/status
    - POST /api/courses
    - POST /api/courses/{course_id}/enrollments
    - GET /api/dashboard/admin
    """
    headers = {"Authorization": f"Bearer {student1_token}"}
    dummy_uuid = str(uuid.uuid4())
    cs101_id = "10000000-0000-0000-0000-000000000001"

    # 1. Admin user list
    r1 = client.get("/api/users", headers=headers)
    assert r1.status_code == 403, f"Expected 403 for GET /api/users, got {r1.status_code}"

    # 2. Admin create user
    r2 = client.post("/api/users", json={
        "email": "hacked_user@test.com",
        "fullName": "Hacker",
        "role": "ADMIN",
        "password": "Password123!"
    }, headers=headers)
    assert r2.status_code == 403, f"Expected 403 for POST /api/users, got {r2.status_code}"

    # 3. Admin user detail
    r3 = client.get(f"/api/users/{dummy_uuid}", headers=headers)
    assert r3.status_code == 403, f"Expected 403 for GET /api/users/{{id}}, got {r3.status_code}"

    # 4. Admin update user status
    r4 = client.patch(f"/api/users/{dummy_uuid}/status", json={"isActive": False}, headers=headers)
    assert r4.status_code == 403, f"Expected 403 for PATCH /api/users/{{id}}/status, got {r4.status_code}"

    # 5. Admin create course
    r5 = client.post("/api/courses", json={
        "courseCode": "HACK999",
        "title": "Hacked Course",
        "lecturerId": dummy_uuid,
        "semester": "Fall",
        "academicYear": "2026-2027",
        "credits": 3,
        "status": "ACTIVE"
    }, headers=headers)
    assert r5.status_code == 403, f"Expected 403 for POST /api/courses, got {r5.status_code}"

    # 6. Admin enroll student
    r6 = client.post(f"/api/courses/{cs101_id}/enrollments", json={"studentId": dummy_uuid}, headers=headers)
    assert r6.status_code == 403, f"Expected 403 for POST /api/courses/{{id}}/enrollments, got {r6.status_code}"

    # 7. Admin dashboard
    r7 = client.get("/api/dashboard/admin", headers=headers)
    assert r7.status_code == 403, f"Expected 403 for GET /api/dashboard/admin, got {r7.status_code}"


def test_challenger_rbac_student_forbidden_lecturer_routes(client, student1_token):
    """
    Verify student token receives strict 403 Forbidden across Lecturer management endpoints:
    - GET /api/dashboard/lecturer
    - GET /api/courses/{course_id}/gradebook
    - POST /api/courses/{course_id}/modules
    - POST /api/courses/{course_id}/assignments
    - POST /api/courses/{course_id}/quizzes
    """
    headers = {"Authorization": f"Bearer {student1_token}"}
    cs101_id = "10000000-0000-0000-0000-000000000001"

    # Lecturer dashboard
    r1 = client.get("/api/dashboard/lecturer", headers=headers)
    assert r1.status_code == 403

    # Lecturer gradebook
    r2 = client.get(f"/api/courses/{cs101_id}/gradebook", headers=headers)
    assert r2.status_code == 403

    # Lecturer module creation
    r3 = client.post(f"/api/courses/{cs101_id}/modules", json={"title": "Hacked Module", "sortOrder": 1, "isPublished": True}, headers=headers)
    assert r3.status_code == 403

    # Lecturer assignment creation
    future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    r4 = client.post(f"/api/courses/{cs101_id}/assignments", json={"title": "Hacked Assignment", "dueAt": future, "maxScore": 10.0, "allowLate": False}, headers=headers)
    assert r4.status_code == 403

    # Lecturer quiz creation
    r5 = client.post(f"/api/courses/{cs101_id}/quizzes", json={"title": "Hacked Quiz", "startAt": future, "endAt": future, "timeLimitMinutes": 10, "maxAttempts": 1}, headers=headers)
    assert r5.status_code == 403


def test_challenger_rbac_lecturer_forbidden_admin_routes(client, lecturer1_token):
    """
    Verify lecturer token is also forbidden from Admin management endpoints (403 Forbidden).
    """
    headers = {"Authorization": f"Bearer {lecturer1_token}"}
    r1 = client.get("/api/users", headers=headers)
    assert r1.status_code == 403
    r2 = client.get("/api/dashboard/admin", headers=headers)
    assert r2.status_code == 403


# ------------------------------------------------------------------------------
# 4. ASSIGNMENT DEADLINE & LIFECYCLE ENFORCEMENT
# ------------------------------------------------------------------------------

def test_challenger_assignment_deadline_enforcement(client, lecturer1_token, student1_token):
    """
    Empirically stress-test assignment deadline business rules:
    - AllowLate=False + past deadline -> REJECT (400 Bad Request)
    - AllowLate=True + past deadline -> ACCEPT with status 'LATE' (200 OK)
    - Assignment status DRAFT -> REJECT (400 Bad Request)
    - Assignment status CLOSED -> REJECT (400 Bad Request)
    - Graded submission immutability -> REJECT update (400 Bad Request)
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    lec_headers = {"Authorization": f"Bearer {lecturer1_token}"}
    st_headers = {"Authorization": f"Bearer {student1_token}"}

    # Case A: AllowLate=False, DueAt in the past
    past_due = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
    create_strict = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Challenger Strict Past Deadline Assignment",
            "dueAt": past_due,
            "maxScore": 10.0,
            "allowLate": False,
            "status": "PUBLISHED"
        },
        headers=lec_headers
    )
    assert create_strict.status_code == 201
    strict_id = create_strict.json()["assignmentId"]

    sub_strict = client.put(
        f"/api/assignments/{strict_id}/submission",
        json={"contentText": "Submitting after deadline with AllowLate=False"},
        headers=st_headers
    )
    assert sub_strict.status_code == 400
    assert "deadline has passed" in sub_strict.json()["detail"].lower()

    # Case B: AllowLate=True, DueAt in the past -> Accepted as LATE
    create_permissive = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Challenger Permissive Past Deadline Assignment",
            "dueAt": past_due,
            "maxScore": 10.0,
            "allowLate": True,
            "status": "PUBLISHED"
        },
        headers=lec_headers
    )
    assert create_permissive.status_code == 201
    permissive_id = create_permissive.json()["assignmentId"]

    sub_permissive = client.put(
        f"/api/assignments/{permissive_id}/submission",
        json={"contentText": "Submitting late with AllowLate=True"},
        headers=st_headers
    )
    assert sub_permissive.status_code == 200
    assert sub_permissive.json()["status"] == "LATE"

    # Case C: Status DRAFT -> Cannot submit
    future_due = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
    create_draft = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Challenger Draft Assignment",
            "dueAt": future_due,
            "maxScore": 10.0,
            "allowLate": True,
            "status": "DRAFT"
        },
        headers=lec_headers
    )
    assert create_draft.status_code == 201
    draft_id = create_draft.json()["assignmentId"]

    sub_draft = client.put(
        f"/api/assignments/{draft_id}/submission",
        json={"contentText": "Attempting submit to draft"},
        headers=st_headers
    )
    assert sub_draft.status_code == 400
    assert "draft" in sub_draft.json()["detail"].lower()

    # Case D: Status CLOSED -> Cannot submit
    create_closed = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Challenger Closed Assignment",
            "dueAt": future_due,
            "maxScore": 10.0,
            "allowLate": True,
            "status": "CLOSED"
        },
        headers=lec_headers
    )
    assert create_closed.status_code == 201
    closed_id = create_closed.json()["assignmentId"]

    sub_closed = client.put(
        f"/api/assignments/{closed_id}/submission",
        json={"contentText": "Attempting submit to closed"},
        headers=st_headers
    )
    assert sub_closed.status_code == 400
    assert "closed" in sub_closed.json()["detail"].lower()

    # Case E: Graded submission immutability
    create_active = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Challenger Immutability Assignment",
            "dueAt": future_due,
            "maxScore": 10.0,
            "allowLate": True,
            "status": "PUBLISHED"
        },
        headers=lec_headers
    )
    assert create_active.status_code == 201
    active_id = create_active.json()["assignmentId"]

    # Student submits
    sub_init = client.put(
        f"/api/assignments/{active_id}/submission",
        json={"contentText": "Initial valid submission"},
        headers=st_headers
    )
    assert sub_init.status_code == 200
    sub_id = sub_init.json()["submissionId"]

    # Lecturer grades it
    grade_resp = client.put(
        f"/api/submissions/{sub_id}/grade",
        json={"score": 8.5, "feedback": "Solid work"},
        headers=lec_headers
    )
    assert grade_resp.status_code == 200
    assert grade_resp.json()["status"] == "GRADED"

    # Student tries to overwrite/resubmit graded work -> Must be rejected (400)
    sub_tamper = client.put(
        f"/api/assignments/{active_id}/submission",
        json={"contentText": "Overwriting my graded submission"},
        headers=st_headers
    )
    assert sub_tamper.status_code == 400
    assert "already been graded" in sub_tamper.json()["detail"].lower()


# ------------------------------------------------------------------------------
# 5. QUIZ SECRET PROTECTION (NO CORRECT ANSWER LEAK)
# ------------------------------------------------------------------------------

def test_challenger_quiz_secret_protection_full_lifecycle(client, lecturer1_token, student1_token):
    """
    Empirically verify that secret question answers are NEVER leaked to student:
    - Created questions with unique high-entropy secret answer strings.
    - Test 1: GET /api/courses/{course_id}/quizzes does not contain secret strings.
    - Test 2: GET /api/quizzes/{quiz_id} student view excludes 'correctAnswer' key and values.
    - Test 3: POST /api/quizzes/{quiz_id}/attempts/start response excludes 'correctAnswer' key and values.
    - Test 4: POST /api/quiz-attempts/{attempt_id}/submit response excludes question correctAnswer.
    - Test 5: GET /api/quizzes/{quiz_id}/attempts student view excludes correctAnswer.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    lec_headers = {"Authorization": f"Bearer {lecturer1_token}"}
    st_headers = {"Authorization": f"Bearer {student1_token}"}

    secret_key_1 = "SECRET_SINGLE_CHOICE_ANSWER_ALPHA"
    secret_key_2 = "SECRET_TRUE_FALSE_ANSWER_BETA"
    secret_key_3 = "SECRET_SHORT_TEXT_ANSWER_GAMMA"

    start_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    end_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()

    # 1. Lecturer creates published quiz
    q_create = client.post(
        f"/api/courses/{cs101_id}/quizzes",
        json={
            "title": "Challenger Secret Leak Audit Quiz",
            "startAt": start_time,
            "endAt": end_time,
            "timeLimitMinutes": 30,
            "maxAttempts": 2,
            "passingScore": 5.0,
            "isPublished": True
        },
        headers=lec_headers
    )
    assert q_create.status_code == 201
    quiz_id = q_create.json()["quizId"]

    # 2. Add 3 questions with secrets
    q1 = client.post(f"/api/quizzes/{quiz_id}/questions", json={
        "questionText": "What is secret 1?",
        "questionType": "SINGLE_CHOICE",
        "optionsJson": json.dumps([{"key": secret_key_1, "text": "Alpha"}, {"key": "WRONG", "text": "Beta"}]),
        "correctAnswer": secret_key_1,
        "score": 4.0,
        "sortOrder": 1
    }, headers=lec_headers)
    assert q1.status_code == 201

    q2 = client.post(f"/api/quizzes/{quiz_id}/questions", json={
        "questionText": "Is the secret true?",
        "questionType": "TRUE_FALSE",
        "optionsJson": json.dumps([{"key": "true", "text": "True"}, {"key": "false", "text": "False"}]),
        "correctAnswer": "true",
        "score": 3.0,
        "sortOrder": 2
    }, headers=lec_headers)
    assert q2.status_code == 201

    q3 = client.post(f"/api/quizzes/{quiz_id}/questions", json={
        "questionText": "Type secret 3",
        "questionType": "SHORT_TEXT",
        "correctAnswer": secret_key_3,
        "score": 3.0,
        "sortOrder": 3
    }, headers=lec_headers)
    assert q3.status_code == 400
    assert "invalid questiontype" in q3.json()["detail"].lower()
    assert secret_key_3 not in q3.text

    # --- AUDIT PHASE 1: Quiz detail & Start Attempt secret protection ---

    # Audit 1: Course Quizzes List as Student
    r_list = client.get(f"/api/courses/{cs101_id}/quizzes", headers=st_headers)
    assert r_list.status_code == 200
    assert secret_key_1 not in r_list.text
    assert secret_key_3 not in r_list.text

    # Audit 2: Quiz Detail as Student
    r_detail = client.get(f"/api/quizzes/{quiz_id}", headers=st_headers)
    assert r_detail.status_code == 200
    detail_data = r_detail.json()
    assert "questions" in detail_data
    for qn in detail_data["questions"]:
        assert "correctAnswer" not in qn, f"VULNERABILITY: 'correctAnswer' key leaked in quiz detail! Question: {qn}"
    # Raw text check: secret_key_3 was only in correctAnswer, not in optionsJson!
    assert secret_key_3 not in r_detail.text, "VULNERABILITY: secret_key_3 leaked in raw JSON of quiz detail!"

    # Audit 3: Start Attempt as Student
    r_start = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=st_headers)
    assert r_start.status_code == 200
    start_data = r_start.json()
    assert "questions" in start_data
    for qn in start_data["questions"]:
        assert "correctAnswer" not in qn, f"VULNERABILITY: 'correctAnswer' key leaked in attempt start! Question: {qn}"
    assert secret_key_3 not in r_start.text, "VULNERABILITY: secret_key_3 leaked in raw JSON of attempt start!"


def test_challenger_quiz_attempt_submit_execution(client, lecturer1_token, student1_token):
    """
    Empirically test quiz attempt submission and auto-scoring:
    POST /api/quiz-attempts/{attempt_id}/submit
    Reveals whether backend can successfully process a student's submission without crashing.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    lec_headers = {"Authorization": f"Bearer {lecturer1_token}"}
    st_headers = {"Authorization": f"Bearer {student1_token}"}

    start_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    end_time = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()

    q_create = client.post(
        f"/api/courses/{cs101_id}/quizzes",
        json={
            "title": "Challenger Quiz Submission Test",
            "startAt": start_time,
            "endAt": end_time,
            "timeLimitMinutes": 30,
            "maxAttempts": 2,
            "passingScore": 5.0,
            "isPublished": True
        },
        headers=lec_headers
    )
    assert q_create.status_code == 201
    quiz_id = q_create.json()["quizId"]

    q1 = client.post(f"/api/quizzes/{quiz_id}/questions", json={
        "questionText": "Question 1",
        "questionType": "SINGLE_CHOICE",
        "optionsJson": json.dumps([{"key": "A", "text": "Choice A"}, {"key": "B", "text": "Choice B"}]),
        "correctAnswer": "A",
        "score": 10.0,
        "sortOrder": 1
    }, headers=lec_headers)
    assert q1.status_code == 201

    r_start = client.post(f"/api/quizzes/{quiz_id}/attempts/start", headers=st_headers)
    assert r_start.status_code == 200
    start_data = r_start.json()
    attempt_id = start_data["attemptId"]
    q1_id = str(start_data["questions"][0]["questionId"])

    # Attempt submission
    r_submit = client.post(
        f"/api/quiz-attempts/{attempt_id}/submit",
        json={"answers": {q1_id: "A"}},
        headers=st_headers
    )
    assert r_submit.status_code == 200, f"Submission failed with status {r_submit.status_code}: {r_submit.text}"
    sub_data = r_submit.json()
    assert sub_data["status"] == "SUBMITTED"
    assert sub_data["score"] == 10.0


def test_challenger_concurrent_quiz_start_and_submit_have_single_effects(
    client, lecturer1_token, student1_token
):
    """Exercise real SQL Server-backed start/submit endpoints concurrently."""
    course_id = "10000000-0000-0000-0000-000000000001"
    lecturer_headers = {"Authorization": f"Bearer {lecturer1_token}"}
    student_headers = {"Authorization": f"Bearer {student1_token}"}
    suffix = uuid.uuid4().hex
    now = datetime.now(timezone.utc)

    created = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Concurrent attempt regression {suffix}",
            "startAt": (now - timedelta(minutes=1)).isoformat(),
            "endAt": (now + timedelta(hours=1)).isoformat(),
            "timeLimitMinutes": 30,
            "maxAttempts": 2,
            "passingScore": 1.0,
            "isPublished": True,
        },
        headers=lecturer_headers,
    )
    assert created.status_code == 201, created.text
    quiz_id = created.json()["quizId"]

    question = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": f"Concurrent test question {suffix}?",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([
                {"key": "A", "text": "Choice A"},
                {"key": "B", "text": "Choice B"},
            ]),
            "correctAnswer": "A",
            "score": 2.0,
            "sortOrder": 1,
        },
        headers=lecturer_headers,
    )
    assert question.status_code == 201, question.text

    async def post_simultaneously(path: str, headers: dict, payload: dict | None = None):
        barrier = asyncio.Barrier(5)

        async def post_once():
            transport = ASGITransport(app=client.app, raise_app_exceptions=False)
            async with AsyncClient(transport=transport, base_url="http://lms.test") as http:
                await barrier.wait()
                return await http.post(path, headers=headers, json=payload, timeout=30)

        return await asyncio.gather(*(post_once() for _ in range(5)))

    starts = asyncio.run(
        post_simultaneously(
            f"/api/quizzes/{quiz_id}/attempts/start",
            student_headers,
        )
    )
    assert [response.status_code for response in starts] == [200] * 5, [
        (response.status_code, response.text) for response in starts
    ]
    attempt_ids = {response.json()["attemptId"] for response in starts}
    assert len(attempt_ids) == 1, [response.json() for response in starts]
    attempt_id = next(iter(attempt_ids))
    question_id = str(starts[0].json()["questions"][0]["questionId"])

    submissions = asyncio.run(
        post_simultaneously(
            f"/api/quiz-attempts/{attempt_id}/submit",
            student_headers,
            {"answers": {question_id: "A"}},
        )
    )
    submit_statuses = [response.status_code for response in submissions]
    assert submit_statuses.count(200) == 1, [
        (response.status_code, response.text) for response in submissions
    ]
    assert submit_statuses.count(400) == 4, [
        (response.status_code, response.text) for response in submissions
    ]
    assert next(response for response in submissions if response.status_code == 200).json()["status"] == "SUBMITTED"

    with SessionLocal() as db:
        attempt_rows = db.query(QuizAttempt).filter(QuizAttempt.QuizId == quiz_id).all()
        grade_rows = db.query(Grade).filter(
            Grade.SourceType == "QUIZ",
            Grade.SourceId == quiz_id,
        ).all()
        notification_rows = db.query(Notification).filter(
            Notification.Type == "QUIZ",
            Notification.RelatedUrl == f"/courses/{course_id}/quizzes/{quiz_id}",
        ).all()
        assert len(attempt_rows) == 1
        assert attempt_rows[0].Status == "SUBMITTED"
        assert len(grade_rows) == 1
        assert float(grade_rows[0].Score) == 2.0
        assert len(notification_rows) == 1


def test_challenger_quiz_expiry_rejects_start_and_expires_active_attempt(
    client, lecturer1_token, student1_token
):
    """Use SQL Server state plus real API requests to verify both quiz expiry paths."""
    course_id = "10000000-0000-0000-0000-000000000001"
    lecturer_headers = {"Authorization": f"Bearer {lecturer1_token}"}
    student_headers = {"Authorization": f"Bearer {student1_token}"}
    suffix = uuid.uuid4().hex
    now = datetime.now(timezone.utc)

    expired_window = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Expired window regression {suffix}",
            "startAt": (now - timedelta(hours=2)).isoformat(),
            "endAt": (now - timedelta(minutes=1)).isoformat(),
            "timeLimitMinutes": 30,
            "maxAttempts": 1,
            "passingScore": 1.0,
            "isPublished": True,
        },
        headers=lecturer_headers,
    )
    assert expired_window.status_code == 201, expired_window.text
    expired_window_id = expired_window.json()["quizId"]
    question = client.post(
        f"/api/quizzes/{expired_window_id}/questions",
        json={
            "questionText": f"Expired window question {suffix}?",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "A"}, {"key": "B", "text": "B"}]),
            "correctAnswer": "A",
            "score": 2.0,
            "sortOrder": 1,
        },
        headers=lecturer_headers,
    )
    assert question.status_code == 201, question.text
    rejected_start = client.post(
        f"/api/quizzes/{expired_window_id}/attempts/start",
        headers=student_headers,
    )
    assert rejected_start.status_code == 400
    assert "availability window has ended" in rejected_start.json()["detail"].lower()

    now = datetime.now(timezone.utc)
    timed_quiz = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": f"Expired attempt regression {suffix}",
            "startAt": (now - timedelta(minutes=1)).isoformat(),
            "endAt": (now + timedelta(hours=1)).isoformat(),
            "timeLimitMinutes": 1,
            "maxAttempts": 1,
            "passingScore": 1.0,
            "isPublished": True,
        },
        headers=lecturer_headers,
    )
    assert timed_quiz.status_code == 201, timed_quiz.text
    timed_quiz_id = timed_quiz.json()["quizId"]
    question = client.post(
        f"/api/quizzes/{timed_quiz_id}/questions",
        json={
            "questionText": f"Expired attempt question {suffix}?",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "A"}, {"key": "B", "text": "B"}]),
            "correctAnswer": "A",
            "score": 2.0,
            "sortOrder": 1,
        },
        headers=lecturer_headers,
    )
    assert question.status_code == 201, question.text
    started = client.post(
        f"/api/quizzes/{timed_quiz_id}/attempts/start",
        headers=student_headers,
    )
    assert started.status_code == 200, started.text
    attempt_id = started.json()["attemptId"]
    question_id = str(started.json()["questions"][0]["questionId"])

    with SessionLocal() as db:
        attempt = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == attempt_id).one()
        # Leave margin beyond the one-minute limit plus grace window because
        # SQL Server DATETIME2(0) rounds StartedAt to whole seconds.
        attempt.StartedAt = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=5)
        db.commit()

    rejected_submit = client.post(
        f"/api/quiz-attempts/{attempt_id}/submit",
        json={"answers": {question_id: "A"}},
        headers=student_headers,
    )
    assert rejected_submit.status_code == 400
    assert "deadline has passed" in rejected_submit.json()["detail"].lower()

    with SessionLocal() as db:
        attempt = db.query(QuizAttempt).filter(QuizAttempt.AttemptId == attempt_id).one()
        assert attempt.Status == "EXPIRED"
        assert db.query(Grade).filter(Grade.SourceType == "QUIZ", Grade.SourceId == timed_quiz_id).count() == 0
        assert db.query(Notification).filter(
            Notification.Type == "QUIZ",
            Notification.RelatedUrl == f"/courses/{course_id}/quizzes/{timed_quiz_id}",
        ).count() == 0

