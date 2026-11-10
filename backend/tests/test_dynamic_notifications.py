import uuid
import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from backend.app.models.models import User, Course, Enrollment, Notification
from backend.app.services.notification_service import notify_user, notify_users, notify_course_students
from backend.app.api.routes.notifications import broadcast_notification
from backend.app.schemas.schemas import NotificationBroadcastRequest


def test_notify_user_service():
    db = MagicMock()
    user_id = uuid.uuid4()
    notif = notify_user(
        db,
        user_id=user_id,
        title="Test Notification",
        message="This is a test message",
        type="COURSE",
        related_url="/courses/123",
        commit=True
    )
    assert notif.UserId == user_id
    assert notif.Title == "Test Notification"
    assert notif.Type == "COURSE"
    assert notif.IsRead is False
    assert db.add.called
    assert db.commit.called


def test_notify_course_students_service():
    db = MagicMock()
    course_id = uuid.uuid4()
    s1 = uuid.uuid4()
    s2 = uuid.uuid4()

    db.query.return_value.filter.return_value.all.return_value = [(s1,), (s2,)]

    count = notify_course_students(
        db,
        course_id=course_id,
        title="New Assignment",
        message="Assignment 1 is published",
        type="ASSIGNMENT",
        commit=True
    )
    assert count == 2
    assert db.add.call_count == 2
    assert db.commit.called


def test_admin_broadcast_all():
    db = MagicMock()
    admin = User(UserId=uuid.uuid4(), Role="ADMIN", FullName="Admin User")
    u1 = uuid.uuid4()
    u2 = uuid.uuid4()
    db.query.return_value.filter.return_value.all.return_value = [(u1,), (u2,)]

    req = NotificationBroadcastRequest(
        target="ALL",
        title="School Announcement",
        message="Holiday tomorrow",
        type="ANNOUNCEMENT"
    )
    resp = broadcast_notification(req, current_user=admin, db=db)
    assert resp.success is True
    assert resp.recipientCount == 2


def test_lecturer_broadcast_own_course():
    db = MagicMock()
    lec_id = uuid.uuid4()
    course_id = uuid.uuid4()
    lecturer = User(UserId=lec_id, Role="LECTURER", FullName="Lecturer A")
    course = Course(CourseId=course_id, LecturerId=lec_id)

    def mock_query(model):
        m = MagicMock()
        if model is Course:
            m.filter.return_value.first.return_value = course
        else:
            m.filter.return_value.all.return_value = [(uuid.uuid4(),), (uuid.uuid4(),)]
        return m
    db.query.side_effect = mock_query

    req = NotificationBroadcastRequest(
        target="COURSE_STUDENTS",
        courseId=course_id,
        title="Class update",
        message="Please bring your laptops",
        type="ANNOUNCEMENT"
    )
    resp = broadcast_notification(req, current_user=lecturer, db=db)
    assert resp.success is True
    assert resp.recipientCount == 2


def test_lecturer_cannot_broadcast_to_all():
    db = MagicMock()
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", FullName="Lecturer A")

    req = NotificationBroadcastRequest(
        target="ALL",
        title="Announcement",
        message="Test",
        type="ANNOUNCEMENT"
    )
    with pytest.raises(HTTPException) as exc:
        broadcast_notification(req, current_user=lecturer, db=db)
    assert exc.value.status_code == 403


def test_student_cannot_broadcast():
    db = MagicMock()
    student = User(UserId=uuid.uuid4(), Role="STUDENT", FullName="Student A")

    req = NotificationBroadcastRequest(
        target="ALL",
        title="Announcement",
        message="Test",
        type="ANNOUNCEMENT"
    )
    with pytest.raises(HTTPException) as exc:
        broadcast_notification(req, current_user=student, db=db)
    assert exc.value.status_code == 403
