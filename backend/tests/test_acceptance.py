import uuid
from datetime import datetime, timezone, timedelta
from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    User, Course, Enrollment, Module, Lesson, Assignment, Submission, Quiz, QuizQuestion, Notification
)


def test_ac01_authentication(client):
    """
    AC-01 Authentication:
    Given active user with correct password, login returns token and profile.
    """
    response = client.post("/api/auth/login", json={
        "email": "student1@university.edu.vn",
        "password": "Demo@123"
    })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["email"] == "student1@university.edu.vn"
    assert data["user"]["role"] == "STUDENT"
    assert data["user"]["isActive"] is True

    # Check /api/auth/me
    token = data["access_token"]
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    assert me_resp.json()["email"] == "student1@university.edu.vn"


def test_ac02_authorization(client, student1_token):
    """
    AC-02 Authorization:
    Given student token, calling Admin user endpoint returns 403 Forbidden.
    """
    response = client.get("/api/users", headers={"Authorization": f"Bearer {student1_token}"})
    assert response.status_code == 403
    assert "Access denied" in response.json()["detail"] or "Forbidden" in response.text


def test_ac03_course_isolation(client, lecturer2_token):
    """
    AC-03 Course isolation:
    Given Lecturer A, editing Lecturer B course returns 403 Forbidden.
    Lecturer 2 tries to add a module to CS101 (which belongs to Lecturer 1).
    """
    # CS101 is '10000000-0000-0000-0000-000000000001', taught by Lecturer 1
    cs101_id = "10000000-0000-0000-0000-000000000001"
    response = client.post(
        f"/api/courses/{cs101_id}/modules",
        json={"title": "Hacked Module", "sortOrder": 99, "isPublished": True},
        headers={"Authorization": f"Bearer {lecturer2_token}"}
    )
    assert response.status_code == 403
    assert "not authorized" in response.json()["detail"].lower()


def test_ac04_enrollment_uniqueness(client, admin_token):
    """
    AC-04 Enrollment uniqueness:
    Admin cannot create duplicate active enrollment for same student/course.
    """
    # Student 1 ('00000000-0000-0000-0000-000000000005') is enrolled in CS101 ('10000000-0000-0000-0000-000000000001')
    cs101_id = "10000000-0000-0000-0000-000000000001"
    student1_id = "00000000-0000-0000-0000-000000000005"

    response = client.post(
        f"/api/courses/{cs101_id}/enrollments",
        json={"studentId": student1_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 400
    assert "already actively enrolled" in response.json()["detail"]


def test_ac05_published_content(client, student1_token, lecturer1_token):
    """
    AC-05 Published content:
    Student does not receive draft lesson in course content API.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"

    # Step 1: Lecturer creates a draft module and draft lesson in CS101
    mod_resp = client.post(
        f"/api/courses/{cs101_id}/modules",
        json={"title": "Draft Module For Test", "sortOrder": 10, "isPublished": False},
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert mod_resp.status_code == 201
    draft_mod_id = mod_resp.json()["moduleId"]

    les_resp = client.post(
        f"/api/modules/{draft_mod_id}/lessons",
        json={"title": "Draft Secret Lesson", "contentHtml": "<p>Secret</p>", "sortOrder": 1, "isPublished": False},
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert les_resp.status_code == 201
    draft_lesson_id = les_resp.json()["lessonId"]

    # Step 2: Student queries CS101 modules
    st_resp = client.get(
        f"/api/courses/{cs101_id}/modules",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert st_resp.status_code == 200
    modules = st_resp.json()
    module_ids = [m["moduleId"] for m in modules]
    assert draft_mod_id not in module_ids, "Student should NOT see unpublished module!"

    # Step 3: Student tries to fetch the draft lesson directly
    get_les = client.get(
        f"/api/lessons/{draft_lesson_id}",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert get_les.status_code in [403, 404]


def test_ac06_assignment_deadline(client, student1_token, lecturer1_token):
    """
    AC-06 Assignment deadline:
    Student cannot submit after DueAt when AllowLate=false.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    # Create past deadline assignment with AllowLate=False
    past_due = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    assign_resp = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Expired Strict Assignment",
            "dueAt": past_due,
            "maxScore": 10.0,
            "allowLate": False,
            "status": "PUBLISHED"
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert assign_resp.status_code == 201
    assign_id = assign_resp.json()["assignmentId"]

    # Student attempts to submit
    sub_resp = client.put(
        f"/api/assignments/{assign_id}/submission",
        json={"contentText": "My late submission"},
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert sub_resp.status_code == 400
    assert "deadline has passed" in sub_resp.json()["detail"].lower()


def test_ac07_grading_sync(client, student1_token, lecturer1_token):
    """
    AC-07 Grading:
    Lecturer grades a submission; student sees the same score and feedback in My Grades.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    # Create assignment with future deadline
    future_due = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    assign_resp = client.post(
        f"/api/courses/{cs101_id}/assignments",
        json={
            "title": "Grading Sync Test Assignment",
            "dueAt": future_due,
            "maxScore": 10.0,
            "allowLate": True,
            "status": "PUBLISHED"
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert assign_resp.status_code == 201
    assign_id = assign_resp.json()["assignmentId"]

    # Student submits
    sub_resp = client.put(
        f"/api/assignments/{assign_id}/submission",
        json={"contentText": "Ready for grading"},
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert sub_resp.status_code == 200
    submission_id = sub_resp.json()["submissionId"]

    # Lecturer grades with 9.5 and feedback
    grade_resp = client.put(
        f"/api/submissions/{submission_id}/grade",
        json={"score": 9.5, "feedback": "Excellent work!"},
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert grade_resp.status_code == 200
    assert grade_resp.json()["score"] == 9.5
    assert grade_resp.json()["status"] == "GRADED"

    # Student checks my-grades
    my_grades_resp = client.get(
        f"/api/courses/{cs101_id}/my-grades",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert my_grades_resp.status_code == 200
    grades = my_grades_resp.json()
    matched = [g for g in grades if g["sourceId"] == assign_id or g["feedback"] == "Excellent work!"]
    assert len(matched) > 0
    assert matched[0]["score"] == 9.5
    assert matched[0]["feedback"] == "Excellent work!"


def test_ac08_quiz_max_attempts(client, student1_token, lecturer1_token):
    """
    AC-08 Quiz max attempts:
    Student cannot start attempt N+1 when MaxAttempts reached.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    start_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    end_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    # Create quiz with MaxAttempts = 1
    quiz_resp = client.post(
        f"/api/courses/{cs101_id}/quizzes",
        json={
            "title": "Strict One-Attempt Quiz",
            "startAt": start_time,
            "endAt": end_time,
            "timeLimitMinutes": 20,
            "maxAttempts": 1,
            "passingScore": 5.0,
            "isPublished": True
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert quiz_resp.status_code == 201
    quiz_id = quiz_resp.json()["quizId"]

    # Add 1 question
    qn_resp = client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "Is 2+2=4?",
            "questionType": "TRUE_FALSE",
            "correctAnswer": "true",
            "score": 10.0,
            "sortOrder": 1
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert qn_resp.status_code == 201

    # Attempt 1: Start
    start1 = client.post(
        f"/api/quizzes/{quiz_id}/attempts/start",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert start1.status_code == 200
    assert start1.json()["attemptNo"] == 1

    # Attempt 2: Start -> Should be rejected with 400 Bad Request
    start2 = client.post(
        f"/api/quizzes/{quiz_id}/attempts/start",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert start2.status_code == 400
    assert "maximum attempts" in start2.json()["detail"].lower()


def test_ac09_quiz_secret_protection(client, student1_token, lecturer1_token):
    """
    AC-09 Quiz secret:
    Student quiz detail response never includes CorrectAnswer before/while attempting.
    """
    cs101_id = "10000000-0000-0000-0000-000000000001"
    start_time = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    end_time = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    quiz_resp = client.post(
        f"/api/courses/{cs101_id}/quizzes",
        json={
            "title": "Confidential Exam Quiz",
            "startAt": start_time,
            "endAt": end_time,
            "timeLimitMinutes": 30,
            "maxAttempts": 3,
            "passingScore": 5.0,
            "isPublished": True
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )
    assert quiz_resp.status_code == 201
    quiz_id = quiz_resp.json()["quizId"]

    # Add Question with sensitive correct answer
    client.post(
        f"/api/quizzes/{quiz_id}/questions",
        json={
            "questionText": "What is the capital of Vietnam?",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": '[{"key": "A", "text": "Hanoi"}, {"key": "B", "text": "HCMC"}]',
            "correctAnswer": "A",
            "score": 5.0,
            "sortOrder": 1
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"}
    )

    # 1. Student queries quiz detail
    st_quiz = client.get(
        f"/api/quizzes/{quiz_id}",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert st_quiz.status_code == 200
    st_data = st_quiz.json()
    for qn in st_data["questions"]:
        assert "correctAnswer" not in qn, "CRITICAL: Student saw correctAnswer in quiz detail!"

    # 2. Student starts attempt
    attempt_resp = client.post(
        f"/api/quizzes/{quiz_id}/attempts/start",
        headers={"Authorization": f"Bearer {student1_token}"}
    )
    assert attempt_resp.status_code == 200
    at_data = attempt_resp.json()
    for qn in at_data["questions"]:
        assert "correctAnswer" not in qn, "CRITICAL: Student saw correctAnswer in start attempt response!"


def test_ac10_notification_ownership(client, student1_token, student2_token):
    """
    AC-10 Notification ownership:
    User cannot mark another user's notification as read.
    """
    db = SessionLocal()
    # Find student 1 ID and student 2 ID
    st1 = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
    st2 = db.query(User).filter(User.Email == "student2@university.edu.vn").first()

    # Create a notification belonging to Student 1
    notif = Notification(
        NotificationId=uuid.uuid4(),
        UserId=st1.UserId,
        Title="Private Student 1 Notification",
        Message="Confidential info",
        Type="GENERAL",
        IsRead=False
    )
    db.add(notif)
    db.commit()
    notif_id = str(notif.NotificationId)
    db.close()

    # Student 2 tries to mark Student 1's notification as read
    patch_resp = client.patch(
        f"/api/notifications/{notif_id}/read",
        headers={"Authorization": f"Bearer {student2_token}"}
    )
    assert patch_resp.status_code == 403
    assert "not authorized" in patch_resp.json()["detail"].lower()
