import json
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.db.session import engine, SessionLocal
from backend.app.db.init_db import init_development_passwords

client = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def require_disposable_test_database():
    database_name = engine.url.database or ""
    if not database_name.lower().startswith("universitylms_test_"):
        pytest.skip(
            "Integration tests require an isolated UniversityLms_Test_<id> database; "
            "the configured database will not be modified."
        )
    # This module uses a module-level TestClient directly, so it initializes
    # seed passwords itself instead of relying on another module's client fixture.
    db = SessionLocal()
    try:
        init_development_passwords(db)
    finally:
        db.close()

def test_health_contract():
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "ok"
    assert data["status_detail"] == "healthy"
    assert data["database_connected"] is True
    assert data["app"] == "University LMS API"

def test_auth_logins_and_user_dtos():
    for email, role in [
        ("admin@university.edu.vn", "ADMIN"),
        ("lecturer1@university.edu.vn", "LECTURER"),
        ("student1@university.edu.vn", "STUDENT")
    ]:
        r = client.post("/api/auth/login", json={"email": email, "password": "Demo@123"})
        assert r.status_code == 200
        res = r.json()
        assert "access_token" in res
        assert "user" in res
        u = res["user"]
        assert u["role"] == role
        assert "userId" in u
        assert isinstance(u["userId"], str)

def test_dashboards_contracts():
    # Admin login
    r_adm = client.post("/api/auth/login", json={"email": "admin@university.edu.vn", "password": "Demo@123"})
    adm_token = r_adm.json()["access_token"]
    r_adm_dash = client.get("/api/dashboard/admin", headers={"Authorization": f"Bearer {adm_token}"})
    assert r_adm_dash.status_code == 200
    adm_data = r_adm_dash.json()
    assert "totalCourses" in adm_data
    assert "totalStudents" in adm_data
    assert "totalLecturers" in adm_data

    # Lecturer login
    r_lec = client.post("/api/auth/login", json={"email": "lecturer1@university.edu.vn", "password": "Demo@123"})
    lec_token = r_lec.json()["access_token"]
    r_lec_dash = client.get("/api/dashboard/lecturer", headers={"Authorization": f"Bearer {lec_token}"})
    assert r_lec_dash.status_code == 200
    lec_data = r_lec_dash.json()
    assert "totalPendingSubmissions" in lec_data
    assert "totalCourses" in lec_data
    assert "totalStudents" in lec_data

    # Student login
    r_stu = client.post("/api/auth/login", json={"email": "student1@university.edu.vn", "password": "Demo@123"})
    stu_token = r_stu.json()["access_token"]
    r_stu_dash = client.get("/api/dashboard/student", headers={"Authorization": f"Bearer {stu_token}"})
    assert r_stu_dash.status_code == 200
    stu_data = r_stu_dash.json()
    assert "totalEnrolledCourses" in stu_data
    assert "upcomingAssignments" in stu_data
    assert "availableQuizzes" in stu_data

def test_courses_returned_have_course_id():
    r_adm = client.post("/api/auth/login", json={"email": "admin@university.edu.vn", "password": "Demo@123"})
    adm_token = r_adm.json()["access_token"]
    r = client.get("/api/courses", headers={"Authorization": f"Bearer {adm_token}"})
    assert r.status_code == 200
    courses = r.json()
    assert len(courses) > 0
    for c in courses:
        assert "courseId" in c
        assert "courseCode" in c
        assert isinstance(c["courseId"], str)

def test_quiz_question_type_enum():
    r_lec = client.post("/api/auth/login", json={"email": "lecturer1@university.edu.vn", "password": "Demo@123"})
    lec_token = r_lec.json()["access_token"]

    r_courses = client.get("/api/courses", headers={"Authorization": f"Bearer {lec_token}"})
    courses = r_courses.json()
    assert len(courses) > 0
    course_id = courses[0]["courseId"]

    now = datetime.now(timezone.utc)
    r_quiz = client.post(
        f"/api/courses/{course_id}/quizzes",
        json={
            "title": "Question type contract test",
            "startAt": now.isoformat(),
            "endAt": (now + timedelta(days=1)).isoformat(),
            "timeLimitMinutes": 15,
            "maxAttempts": 1,
            "passingScore": 1,
            "isPublished": False,
        },
        headers={"Authorization": f"Bearer {lec_token}"},
    )
    assert r_quiz.status_code == 201
    quiz_id = r_quiz.json()["quizId"]

    # SINGLE_CHOICE should succeed
    valid_payload = {
        "questionText": "What is Python?",
        "questionType": "SINGLE_CHOICE",
        "optionsJson": json.dumps([{"id": "A", "text": "Language"}, {"id": "B", "text": "Snake"}]),
        "correctAnswer": "A",
        "score": 2.5,
        "sortOrder": 1
    }
    r_valid = client.post(f"/api/quizzes/{quiz_id}/questions", json=valid_payload, headers={"Authorization": f"Bearer {lec_token}"})
    assert r_valid.status_code in [200, 201]

    # MULTIPLE_CHOICE should be rejected with 400
    invalid_payload = dict(valid_payload)
    invalid_payload["questionType"] = "MULTIPLE_CHOICE"
    r_invalid = client.post(f"/api/quizzes/{quiz_id}/questions", json=invalid_payload, headers={"Authorization": f"Bearer {lec_token}"})
    assert r_invalid.status_code == 400
    assert "Invalid questionType" in r_invalid.json()["detail"]

def test_student_grades_and_self_enrollment_denial():
    r_stu = client.post("/api/auth/login", json={"email": "student1@university.edu.vn", "password": "Demo@123"})
    stu_token = r_stu.json()["access_token"]

    # Student fetches their own courses (enrolled active courses)
    r_stu_courses = client.get("/api/courses", headers={"Authorization": f"Bearer {stu_token}"})
    assert r_stu_courses.status_code == 200
    stu_courses = r_stu_courses.json()
    assert len(stu_courses) > 0
    enrolled_course_id = stu_courses[0]["courseId"]

    # Student my-grades for enrolled course works
    r_grades = client.get(f"/api/courses/{enrolled_course_id}/my-grades", headers={"Authorization": f"Bearer {stu_token}"})
    assert r_grades.status_code == 200
    grades = r_grades.json()
    assert isinstance(grades, list)

    # Student cannot self-enroll in any course
    r_self_enroll = client.post(f"/api/courses/{enrolled_course_id}/enrollments", json={"studentId": "00000000-0000-0000-0000-000000000000"}, headers={"Authorization": f"Bearer {stu_token}"})
    assert r_self_enroll.status_code == 403
