"""Integration checks for role-isolated SQL Server analytics.

Requires an isolated UniversityLms_Test_* database (enforced by conftest).
"""
from datetime import datetime, timedelta, timezone


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def assert_utc(value):
    date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    assert date.utcoffset() == timedelta(0)


def test_analytics_is_enforced_on_backend(client, admin_token, lecturer1_token, student1_token):
    allowed = {
        "/api/analytics/operations": admin_token,
        "/api/analytics/teaching": lecturer1_token,
        "/api/analytics/learning": student1_token,
    }
    for endpoint, allowed_token in allowed.items():
        anonymous = client.get(endpoint)
        assert anonymous.status_code in {401, 403}
        for token in (admin_token, lecturer1_token, student1_token):
            response = client.get(endpoint, headers=auth_header(token))
            assert response.status_code == (200 if token == allowed_token else 403), response.text


def test_lecturer_analytics_is_scoped_and_queue_contains_no_other_course(client, lecturer1_token, lecturer2_token):
    for token in (lecturer1_token, lecturer2_token):
        headers = auth_header(token)
        list_response = client.get("/api/courses", headers=headers)
        assert list_response.status_code == 200
        allowed = {course["courseId"] for course in list_response.json() if course["status"] == "ACTIVE"}
        response = client.get("/api/analytics/teaching", headers=headers)
        assert response.status_code == 200, response.text
        payload = response.json()
        assert_utc(payload["generatedAt"])
        assert payload["totalPending"] >= payload["shownPending"] == len(payload["queue"])
        assert payload["shownPending"] <= 60
        assert all(course["courseId"] in allowed for course in payload["courses"])
        assert all(entry["courseId"] in allowed for entry in payload["queue"])
        assert all(entry["status"] in {"SUBMITTED", "LATE"} for entry in payload["queue"])
        assert all("correctAnswer" not in entry and "passwordHash" not in entry for entry in payload["queue"])
        assert all(entry["maxScore"] > 0 for entry in payload["queue"])
        for entry in payload["queue"]:
            assert_utc(entry["submittedAt"])


def test_learning_analytics_contains_own_grades_and_no_fabricated_average(client, student1_token, student2_token):
    for token in (student1_token, student2_token):
        headers = auth_header(token)
        courses_response = client.get("/api/courses", headers=headers)
        assert courses_response.status_code == 200
        allowed = {course["courseId"] for course in courses_response.json()}
        response = client.get("/api/analytics/learning", headers=headers)
        assert response.status_code == 200, response.text
        report = response.json()
        assert_utc(report["generatedAt"])
        assert all(course["courseId"] in allowed for course in report["courses"])
        assert all(grade["courseId"] in allowed for grade in report["recentGrades"])
        assert report["totalGradedItems"] >= len(report["recentGrades"])
        assert len(report["recentGrades"]) <= 20
        if report["totalGradedItems"] == 0:
            assert report["averageOutOfTen"] is None
            assert all(c["averageOutOfTen"] is None for c in report["courses"])
        for grade in report["recentGrades"]:
            assert_utc(grade["gradedAt"])
            assert grade["maxScore"] > 0
            assert round(grade["score"] / grade["maxScore"] * 10, 2) == grade["normalizedOutOfTen"]
            assert "studentId" not in grade and "correctAnswer" not in grade


def test_operations_insights_reconcile_internal_counts(client, admin_token):
    response = client.get("/api/analytics/operations", headers=auth_header(admin_token))
    assert response.status_code == 200, response.text
    report = response.json()
    assert_utc(report["generatedAt"])
    assert sum(report["roles"].values()) == report["totalUsers"]
    assert report["activeUsers"] + report["inactiveUsers"] == report["totalUsers"]
    assert min(
        report["activeEnrollments"], report["pendingSubmissions"],
        report["publishedLessons"], report["publishedQuizzes"],
    ) >= 0
    assert all(amount >= 0 for amount in report["courseStatuses"].values())
