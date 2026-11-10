import uuid
from datetime import datetime, timezone
from backend.app.models.models import (
    User, Course, Assignment, Quiz, Module, Lesson, Message, BlockedUser
)
from backend.app.schemas.schemas import (
    UserResponse, CourseResponse, QuizResponse, AssignmentResponse,
    BulkQuestionImportRequest, MessageCreate, MessageResponse, ContactResponse
)


def test_models_have_enhancement_attributes():
    user = User(
        Email="test_enhancement@university.edu.vn",
        FullName="Test Enhancement",
        PasswordHash="hash",
        Role="LECTURER",
        Department="Khoa Công nghệ Thông tin",
        IsChatEnabled=True
    )
    assert user.Department == "Khoa Công nghệ Thông tin"
    assert user.IsChatEnabled is True

    course = Course(
        CourseCode="TEST-101",
        Title="Test Course",
        LecturerId=uuid.uuid4(),
        Semester="HK1",
        AcademicYear="2026-2027",
        Credits=3,
        SubjectCode="TEST",
        IsDeleted=False
    )
    assert course.SubjectCode == "TEST"
    assert course.IsDeleted is False

    quiz = Quiz(
        Title="Test Quiz",
        StartAt=datetime.now(timezone.utc),
        EndAt=datetime.now(timezone.utc),
        TimeLimitMinutes=45,
        TotalScore=10.0,
        ScoreVisibility="AFTER_CLOSED",
        IsDeleted=False
    )
    assert quiz.TotalScore == 10.0
    assert quiz.ScoreVisibility == "AFTER_CLOSED"
    assert quiz.IsDeleted is False

    msg = Message(
        SenderId=uuid.uuid4(),
        ReceiverId=uuid.uuid4(),
        Content="Xin chào giảng viên",
        IsRead=False
    )
    assert msg.Content == "Xin chào giảng viên"
    assert msg.IsRead is False


def test_schemas_enhancements_validation():
    # UserResponse with department
    uid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    u_resp = UserResponse(
        userId=uid,
        email="test@university.edu.vn",
        fullName="Test User",
        role="LECTURER",
        department="Khoa CNTT",
        isChatEnabled=True,
        createdAt=now
    )
    assert u_resp.department == "Khoa CNTT"
    assert u_resp.isChatEnabled is True

    # Bulk import schema
    bulk_req = BulkQuestionImportRequest(
        rawText="Cau 1: Test?\nA. Dung\nB. Sai\nDap an: A",
        autoEqualScore=True
    )
    assert bulk_req.autoEqualScore is True

    # MessageCreate
    rec_id = uuid.uuid4()
    m_create = MessageCreate(receiverId=rec_id, content="Tin nhắn thử nghiệm")
    assert m_create.content == "Tin nhắn thử nghiệm"
