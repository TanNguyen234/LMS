import uuid
from unittest.mock import patch

from sqlalchemy.exc import DBAPIError

from backend.app.api.routes import quizzes as quizzes_route


def test_lecturer_active_meetings_returns_200_and_scopes_to_own_courses(client, lecturer1_token):
    courses_resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert courses_resp.status_code == 200
    lecturer_courses = courses_resp.json()
    assert len(lecturer_courses) > 0
    own_course_ids = {c["courseId"] for c in lecturer_courses}

    # Ensure at least one LIVE meeting exists on lecturer1's first course
    create_resp = client.post(
        "/api/meetings",
        json={
            "courseId": lecturer_courses[0]["courseId"],
            "title": "Regression Active Meeting Check",
            "replaceActive": True,
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert create_resp.status_code == 200, create_resp.text

    active_resp = client.get("/api/meetings/active", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert active_resp.status_code == 200, active_resp.text
    active_list = active_resp.json()
    assert len(active_list) >= 1
    assert all(m["courseId"] in own_course_ids for m in active_list)


def test_student_my_attempts_skips_write_when_clean_and_retries_deadlock(client, student1_token):
    courses_resp = client.get("/api/courses", headers={"Authorization": f"Bearer {student1_token}"})
    assert courses_resp.status_code == 200
    cs101 = next(c for c in courses_resp.json() if c["courseCode"] == "CS101")

    quizzes_resp = client.get(
        f"/api/courses/{cs101['courseId']}/quizzes",
        headers={"Authorization": f"Bearer {student1_token}"},
    )
    assert quizzes_resp.status_code == 200
    quizzes = quizzes_resp.json()
    assert len(quizzes) > 0
    quiz_id = quizzes[0]["quizId"]

    calls = {"count": 0}
    real_get_quiz = quizzes_route.get_quiz_or_404

    def flaky_once(qid, db):
        calls["count"] += 1
        if calls["count"] == 1:
            raise DBAPIError(
                "SELECT ...",
                {},
                Exception("('40001', '[40001] Transaction was deadlocked on lock resources (1205)')"),
            )
        return real_get_quiz(qid, db)

    with patch.object(quizzes_route, "get_quiz_or_404", side_effect=flaky_once):
        resp = client.get(
            f"/api/quizzes/{quiz_id}/my-attempts",
            headers={"Authorization": f"Bearer {student1_token}"},
        )

    assert resp.status_code == 200, resp.text
    assert calls["count"] == 2
    assert isinstance(resp.json(), list)
