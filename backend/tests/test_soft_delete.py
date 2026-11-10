import uuid
import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock
from fastapi import HTTPException
from backend.app.models.models import User, Course, Assignment, Quiz
from backend.app.api.routes.courses import delete_course, restore_course
from backend.app.api.routes.assignments import delete_assignment, restore_assignment
from backend.app.api.routes.quizzes import delete_quiz, restore_quiz


def test_lecturer_soft_delete_own_course():
    lec_id = uuid.uuid4()
    lecturer = User(UserId=lec_id, Role="LECTURER", FullName="Lecturer A")
    course = Course(CourseId=uuid.uuid4(), LecturerId=lec_id, Title="Algorithms", IsDeleted=False)

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = course

    res = delete_course(course.CourseId, hard_delete=False, current_user=lecturer, db=db)
    assert course.IsDeleted is True
    assert course.DeletedBy == lec_id
    assert course.DeletedAt is not None
    assert db.commit.called


def test_lecturer_cannot_delete_other_course():
    lec_id = uuid.uuid4()
    other_lec_id = uuid.uuid4()
    lecturer = User(UserId=lec_id, Role="LECTURER", FullName="Lecturer A")
    course = Course(CourseId=uuid.uuid4(), LecturerId=other_lec_id, Title="Algorithms", IsDeleted=False)

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = course

    with pytest.raises(HTTPException) as exc_info:
        delete_course(course.CourseId, hard_delete=False, current_user=lecturer, db=db)
    assert exc_info.value.status_code == 403


def test_admin_restore_course():
    admin = User(UserId=uuid.uuid4(), Role="ADMIN", FullName="Admin User")
    course = Course(
        CourseId=uuid.uuid4(),
        LecturerId=uuid.uuid4(),
        Title="Algorithms",
        IsDeleted=True,
        DeletedBy=uuid.uuid4(),
        DeletedAt=datetime.now()
    )

    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = course

    res = restore_course(course.CourseId, admin=admin, db=db)
    assert course.IsDeleted is False
    assert course.DeletedAt is None
    assert course.DeletedBy is None
    assert db.commit.called


def test_assignment_soft_delete_and_restore():
    lec_id = uuid.uuid4()
    lecturer = User(UserId=lec_id, Role="LECTURER", FullName="Lecturer A")
    admin = User(UserId=uuid.uuid4(), Role="ADMIN", FullName="Admin User")
    course = Course(CourseId=uuid.uuid4(), LecturerId=lec_id)
    assignment = Assignment(AssignmentId=uuid.uuid4(), CourseId=course.CourseId, Title="BTL 1", IsDeleted=False)

    db = MagicMock()
    # Mocking query chain for assignment & course check
    def mock_query(model):
        m = MagicMock()
        if model == Assignment:
            m.filter.return_value.first.return_value = assignment
        elif model == Course:
            m.filter.return_value.first.return_value = course
        return m
    db.query.side_effect = mock_query

    # Delete
    delete_assignment(assignment.AssignmentId, hard_delete=False, current_user=lecturer, db=db)
    assert assignment.IsDeleted is True
    assert assignment.DeletedBy == lec_id

    # Restore
    restore_assignment(assignment.AssignmentId, admin=admin, db=db)
    assert assignment.IsDeleted is False
    assert assignment.DeletedBy is None


def test_quiz_soft_delete_and_restore():
    lec_id = uuid.uuid4()
    lecturer = User(UserId=lec_id, Role="LECTURER", FullName="Lecturer A")
    admin = User(UserId=uuid.uuid4(), Role="ADMIN", FullName="Admin User")
    course = Course(CourseId=uuid.uuid4(), LecturerId=lec_id)
    quiz = Quiz(QuizId=uuid.uuid4(), CourseId=course.CourseId, Title="Quiz 1", IsDeleted=False)

    db = MagicMock()
    def mock_query(model):
        m = MagicMock()
        if model == Quiz:
            m.filter.return_value.first.return_value = quiz
        elif model == Course:
            m.filter.return_value.first.return_value = course
        return m
    db.query.side_effect = mock_query

    # Delete
    delete_quiz(quiz.QuizId, hard_delete=False, current_user=lecturer, db=db)
    assert quiz.IsDeleted is True
    assert quiz.DeletedBy == lec_id

    # Restore
    restore_quiz(quiz.QuizId, admin=admin, db=db)
    assert quiz.IsDeleted is False
    assert quiz.DeletedBy is None
