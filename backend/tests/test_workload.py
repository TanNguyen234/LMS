"""Student planner: pure date contract and SQL Server authorization integration.

Integration tests require an isolated UniversityLms_Test_* database; see conftest.py.
"""
from datetime import datetime, timedelta, timezone

from backend.app.api.routes.workload import WorkloadItem, utc_datetime


def test_workload_dates_are_explicit_utc():
    naive = datetime(2026, 10, 23, 10, 0)
    local = datetime(2026, 10, 23, 17, 0, tzinfo=timezone(timedelta(hours=7)))
    assert utc_datetime(naive) == utc_datetime(local)
    assert utc_datetime(naive).utcoffset() == timedelta(0)
    assert utc_datetime(None) is None


def test_workload_contract_has_no_answer_or_other_student_fields():
    item = WorkloadItem(
        kind="QUIZ",
        id="10000000-0000-0000-0000-000000000001",
        courseId="10000000-0000-0000-0000-000000000002",
        courseCode="CS101",
        courseTitle="Programming",
        title="Quiz 1",
        dueAt=datetime(2026, 11, 1, tzinfo=timezone.utc),
        status="PUBLISHED",
        attemptsUsed=0,
        maxAttempts=1,
    )
    document = item.model_dump(mode="json")
    assert document["dueAt"].endswith("Z")
    assert not any(key in document for key in ("correctAnswer", "answersJson", "studentId", "score"))


def test_student_workload_requires_student_role(client, admin_token, lecturer1_token, student1_token):
    for token in (admin_token, lecturer1_token):
        response = client.get("/api/dashboard/student/workload", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 403

    response = client.get(
        "/api/dashboard/student/workload",
        headers={"Authorization": f"Bearer {student1_token}"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "generatedAt" in payload and isinstance(payload["items"], list)
    assert datetime.fromisoformat(payload["generatedAt"].replace("Z", "+00:00")).utcoffset() == timedelta(0)


def test_student_workload_returns_only_authorized_courses(client, student1_token, student2_token):
    # Both students may share a course; the assertion is based on each user's
    # independently authorized course listing, not a hard-coded seed roster.
    for token in (student1_token, student2_token):
        headers = {"Authorization": f"Bearer {token}"}
        course_response = client.get("/api/courses", headers=headers)
        assert course_response.status_code == 200
        allowed_ids = {course["courseId"] for course in course_response.json()}
        response = client.get("/api/dashboard/student/workload", headers=headers)
        assert response.status_code == 200, response.text
        items = response.json()["items"]
        assert all(item["courseId"] in allowed_ids for item in items)
        assert all(item["kind"] in ("ASSIGNMENT", "QUIZ") for item in items)
        assert all(item["status"] in ("PUBLISHED", "CLOSED") for item in items)
        assert all("correctAnswer" not in item and "answersJson" not in item for item in items)
        assert all(datetime.fromisoformat(item["dueAt"].replace("Z", "+00:00")).utcoffset() == timedelta(0) for item in items)
        due_values = [item["dueAt"] for item in items]
        assert due_values == sorted(due_values)
