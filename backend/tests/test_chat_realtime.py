import uuid
import asyncio
import pytest
from unittest.mock import MagicMock, AsyncMock
from fastapi import HTTPException
from backend.app.models.models import User, Course, Enrollment, Message, BlockedUser
from backend.app.api.routes.chat import (
    check_chat_eligibility,
    ConnectionManager,
    send_chat_message,
    get_chat_history,
    toggle_lecturer_chat,
    block_student,
    unblock_student,
    get_unread_chat_count,
    recall_chat_message,
    format_chat_message,
)
from backend.app.schemas.schemas import MessageCreate


def test_check_chat_eligibility_admin():
    db = MagicMock()
    admin = User(UserId=uuid.uuid4(), Role="ADMIN")
    student = User(UserId=uuid.uuid4(), Role="STUDENT")

    # Admins should not raise an exception
    check_chat_eligibility(admin, student, db)
    check_chat_eligibility(student, admin, db)


def test_check_chat_eligibility_student_to_student_denied():
    db = MagicMock()
    student1 = User(UserId=uuid.uuid4(), Role="STUDENT")
    student2 = User(UserId=uuid.uuid4(), Role="STUDENT")

    with pytest.raises(HTTPException) as exc:
        check_chat_eligibility(student1, student2, db)
    assert exc.value.status_code == 403


def test_check_chat_eligibility_student_lecturer_enrolled():
    db = MagicMock()
    student = User(UserId=uuid.uuid4(), Role="STUDENT")
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", IsChatEnabled=True)
    course = Course(CourseId=uuid.uuid4(), LecturerId=lecturer.UserId)

    def mock_query(model):
        m = MagicMock()
        if model is BlockedUser:
            m.filter.return_value.first.return_value = None
        elif model is Enrollment:
            m.join.return_value.filter.return_value.first.return_value = (course,)
        return m

    db.query.side_effect = mock_query

    # Should not raise exception
    check_chat_eligibility(student, lecturer, db)


def test_check_chat_eligibility_student_lecturer_not_enrolled():
    db = MagicMock()
    student = User(UserId=uuid.uuid4(), Role="STUDENT")
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", IsChatEnabled=True)

    def mock_query(model):
        m = MagicMock()
        if model is BlockedUser:
            m.filter.return_value.first.return_value = None
        elif model is Enrollment:
            m.join.return_value.filter.return_value.first.return_value = None
        return m

    db.query.side_effect = mock_query

    with pytest.raises(HTTPException) as exc:
        check_chat_eligibility(student, lecturer, db)
    assert exc.value.status_code == 403
    assert "chỉ có thể nhắn tin" in exc.value.detail


def test_student_message_to_lecturer_disabled_chat():
    db = MagicMock()
    student = User(UserId=uuid.uuid4(), Role="STUDENT")
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", IsChatEnabled=False)

    db.query.return_value.filter.return_value.first.return_value = lecturer

    req = MessageCreate(receiverId=lecturer.UserId, content="Hello professor")

    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_chat_message(req, current_user=student, db=db))
    assert exc.value.status_code == 403
    assert "tạm tắt tính năng" in exc.value.detail


def test_student_message_when_blocked_by_lecturer():
    db = MagicMock()
    student = User(UserId=uuid.uuid4(), Role="STUDENT")
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", IsChatEnabled=True)
    block_entry = BlockedUser(LecturerId=lecturer.UserId, StudentId=student.UserId)

    def mock_query(model):
        m = MagicMock()
        if model is User:
            m.filter.return_value.first.return_value = lecturer
        elif model is BlockedUser:
            m.filter.return_value.first.return_value = block_entry
        return m

    db.query.side_effect = mock_query

    req = MessageCreate(receiverId=lecturer.UserId, content="Hello")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_chat_message(req, current_user=student, db=db))
    assert exc.value.status_code == 403
    assert "đã bị chặn" in exc.value.detail


def test_toggle_lecturer_chat():
    db = MagicMock()
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER", IsChatEnabled=True)

    res = toggle_lecturer_chat(current_user=lecturer, db=db)
    assert res["isChatEnabled"] is False
    assert lecturer.IsChatEnabled is False
    assert db.commit.called

    # Non-lecturer should fail
    student = User(UserId=uuid.uuid4(), Role="STUDENT", IsChatEnabled=True)
    with pytest.raises(HTTPException) as exc:
        toggle_lecturer_chat(current_user=student, db=db)
    assert exc.value.status_code == 403


def test_block_and_unblock_student():
    db = MagicMock()
    lecturer = User(UserId=uuid.uuid4(), Role="LECTURER")
    student_id = uuid.uuid4()
    student = User(UserId=student_id, Role="STUDENT")

    def mock_query(model):
        m = MagicMock()
        if model is User:
            m.filter.return_value.first.return_value = student
        elif model is BlockedUser:
            m.filter.return_value.first.return_value = None
        return m

    db.query.side_effect = mock_query

    # Block
    res = block_student(student_id=student_id, reason="Spamming", current_user=lecturer, db=db)
    assert "chặn" in res.message.lower()
    assert db.add.called
    assert db.commit.called

    # Unblock
    block_entry = BlockedUser(LecturerId=lecturer.UserId, StudentId=student_id)
    mock_q = MagicMock()
    mock_q.filter.return_value.first.return_value = block_entry
    db.query.side_effect = None
    db.query.return_value = mock_q

    unblock_res = unblock_student(student_id=student_id, current_user=lecturer, db=db)
    assert "gỡ chặn" in unblock_res.message.lower() or "bỏ chặn" in unblock_res.message.lower()
    assert db.delete.called
    assert db.commit.called


def test_unread_count_endpoint():
    db = MagicMock()
    user = User(UserId=uuid.uuid4())
    db.query.return_value.filter.return_value.scalar.return_value = 5

    res = get_unread_chat_count(current_user=user, db=db)
    assert res["unreadCount"] == 5


def test_connection_manager():
    async def run_test():
        manager = ConnectionManager()
        u1 = uuid.uuid4()
        ws_mock = AsyncMock()

        await manager.connect(u1, ws_mock)
        assert u1 in manager.active_connections
        assert ws_mock in manager.active_connections[u1]

        # Send message to connected user
        await manager.send_personal_message({"type": "NEW_MESSAGE", "content": "Hi"}, u1)
        ws_mock.send_json.assert_awaited_once_with({"type": "NEW_MESSAGE", "content": "Hi"})

        # Disconnect
        manager.disconnect(u1, ws_mock)
        assert u1 not in manager.active_connections

    asyncio.run(run_test())


def test_send_message_with_attachment():
    db = MagicMock()
    sender = User(UserId=uuid.uuid4(), Role="ADMIN")
    receiver = User(UserId=uuid.uuid4(), Role="STUDENT")

    db.query.return_value.filter.return_value.first.return_value = receiver

    req = MessageCreate(
        receiverId=receiver.UserId,
        content="Here is the syllabus document",
        attachmentUrl="/submissions/syllabus_123.pdf",
        attachmentName="syllabus.pdf",
        attachmentType="application/pdf",
        attachmentSize=102400
    )

    resp = asyncio.run(send_chat_message(req, current_user=sender, db=db))
    assert resp.attachmentUrl == "/submissions/syllabus_123.pdf"
    assert resp.attachmentName == "syllabus.pdf"
    assert resp.attachmentSize == 102400
    assert db.add.called
    assert db.commit.called


def test_send_message_without_content_and_attachment_fails():
    db = MagicMock()
    sender = User(UserId=uuid.uuid4(), Role="ADMIN")
    receiver = User(UserId=uuid.uuid4(), Role="STUDENT")

    db.query.return_value.filter.return_value.first.return_value = receiver

    req = MessageCreate(receiverId=receiver.UserId, content="")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(send_chat_message(req, current_user=sender, db=db))
    assert exc.value.status_code == 400
    assert "nội dung văn bản hoặc tệp đính kèm" in exc.value.detail


def test_recall_chat_message_success():
    db = MagicMock()
    user_id = uuid.uuid4()
    sender = User(UserId=user_id, Role="STUDENT")
    msg_id = uuid.uuid4()
    msg = Message(
        MessageId=msg_id,
        SenderId=user_id,
        ReceiverId=uuid.uuid4(),
        Content="Mistake message",
        IsRecalled=False
    )
    db.query.return_value.filter.return_value.first.return_value = msg

    res = asyncio.run(recall_chat_message(message_id=msg_id, current_user=sender, db=db))
    assert "Đã thu hồi" in res["message"]
    assert msg.IsRecalled is True
    assert msg.RecalledAt is not None
    assert db.commit.called


def test_recall_chat_message_forbidden_for_other_user():
    db = MagicMock()
    user_a = uuid.uuid4()
    user_b = uuid.uuid4()
    sender_b = User(UserId=user_b, Role="STUDENT")
    msg_id = uuid.uuid4()
    msg = Message(
        MessageId=msg_id,
        SenderId=user_a,
        ReceiverId=uuid.uuid4(),
        Content="Hello from A",
        IsRecalled=False
    )
    db.query.return_value.filter.return_value.first.return_value = msg

    with pytest.raises(HTTPException) as exc:
        asyncio.run(recall_chat_message(message_id=msg_id, current_user=sender_b, db=db))
    assert exc.value.status_code == 403
    assert "chính mình gửi" in exc.value.detail


def test_format_chat_message_masks_recalled_content():
    import datetime
    msg = Message(
        MessageId=uuid.uuid4(),
        SenderId=uuid.uuid4(),
        ReceiverId=uuid.uuid4(),
        Content="Sensitive message",
        CreatedAt=datetime.datetime.now(datetime.timezone.utc),
        IsRead=False,
        IsRecalled=True,
        AttachmentUrl="/submissions/secret.pdf",
        AttachmentName="secret.pdf"
    )

    formatted = format_chat_message(msg, sender_name="Tester")
    assert formatted.isRecalled is True
    assert formatted.content is None
    assert formatted.attachmentUrl is None
    assert formatted.attachmentName is None
    # Ensure timezone info was set to UTC
    assert formatted.createdAt.tzinfo is not None


def test_format_chat_message_with_sql_string_datetime():
    # SQL Server datetime2 string returned by pyodbc
    msg = Message(
        MessageId=uuid.uuid4(),
        SenderId=uuid.uuid4(),
        ReceiverId=uuid.uuid4(),
        Content="Message with string datetime from pyodbc",
        CreatedAt="2026-11-10 13:24:28.123456",
        IsRead=False,
        IsRecalled=False
    )

    formatted = format_chat_message(msg, sender_name="Tester")
    assert formatted.content == "Message with string datetime from pyodbc"
    assert formatted.createdAt.tzinfo is not None
    assert formatted.createdAt.year == 2026


