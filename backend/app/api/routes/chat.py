import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import or_, and_, func
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User, Course, Enrollment, Message, BlockedUser
from backend.app.schemas.schemas import (
    MessageCreate, ChatMessageResponse, ContactResponse, BlockedUserResponse
)
from backend.app.schemas.common import MessageResponse as CommonMessageResponse
from backend.app.core.dependencies import get_current_user
from backend.app.api.routes.assignments import to_utc_datetime

router = APIRouter(prefix="/chat", tags=["Chat & Real-time Messaging"])


# ==========================================
# WEBSOCKET CONNECTION MANAGER
# ==========================================

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        if user_id in self.active_connections:
            for connection in list(self.active_connections[user_id]):
                try:
                    await connection.send_json(message)
                except Exception:
                    pass


manager = ConnectionManager()


# ==========================================
# ELIGIBILITY VERIFICATION
# ==========================================

def check_chat_eligibility(sender: User, receiver: User, db: Session) -> None:
    """
    Verifies messaging rules:
    - Admins can message anyone.
    - Students can only message Lecturers of courses they have taken or are taking.
    - Lecturers can only message Students enrolled in their courses.
    - If Lecturer disabled chat (IsChatEnabled=False), students cannot message them.
    - If Lecturer blocked the student, the student cannot message them.
    """
    if sender.Role == "ADMIN" or receiver.Role == "ADMIN":
        return

    if sender.Role == "STUDENT" and receiver.Role == "LECTURER":
        # Check if lecturer has chat enabled
        if receiver.IsChatEnabled is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Giảng viên hiện đang tạm tắt tính năng nhận tin nhắn."
            )

        # Check if student is blocked
        is_blocked = db.query(BlockedUser).filter(
            BlockedUser.LecturerId == receiver.UserId,
            BlockedUser.StudentId == sender.UserId
        ).first()
        if is_blocked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn không thể gửi tin nhắn cho giảng viên này do đã bị chặn."
            )

        # Check course enrollment connection
        shared_course = db.query(Enrollment).join(
            Course, Course.CourseId == Enrollment.CourseId
        ).filter(
            Enrollment.StudentId == sender.UserId,
            Course.LecturerId == receiver.UserId
        ).first()

        if not shared_course:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn chỉ có thể nhắn tin với giảng viên phụ trách khóa học mà bạn đã hoặc đang theo học."
            )

    elif sender.Role == "LECTURER" and receiver.Role == "STUDENT":
        # Check course enrollment connection
        shared_course = db.query(Enrollment).join(
            Course, Course.CourseId == Enrollment.CourseId
        ).filter(
            Enrollment.StudentId == receiver.UserId,
            Course.LecturerId == sender.UserId
        ).first()

        if not shared_course:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn chỉ có thể nhắn tin cho sinh viên đã hoặc đang theo học các khóa học của bạn."
            )

    elif sender.Role == "STUDENT" and receiver.Role == "STUDENT":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tin nhắn trực tiếp giữa sinh viên với nhau hiện không được hỗ trợ."
        )


def format_chat_message(msg: Message, sender_name: Optional[str] = None) -> ChatMessageResponse:
    created_at = to_utc_datetime(msg.CreatedAt) if msg.CreatedAt is not None else datetime.now(timezone.utc)
    recalled_at = to_utc_datetime(msg.RecalledAt) if msg.RecalledAt is not None else None

    return ChatMessageResponse(
        messageId=msg.MessageId,
        senderId=msg.SenderId,
        receiverId=msg.ReceiverId,
        content=msg.Content if not msg.IsRecalled else None,
        createdAt=created_at,
        isRead=bool(msg.IsRead) if msg.IsRead is not None else False,
        isRecalled=bool(msg.IsRecalled),
        recalledAt=recalled_at,
        attachmentUrl=msg.AttachmentUrl if not msg.IsRecalled else None,
        attachmentName=msg.AttachmentName if not msg.IsRecalled else None,
        attachmentType=msg.AttachmentType if not msg.IsRecalled else None,
        attachmentSize=msg.AttachmentSize if not msg.IsRecalled else None,
        senderName=sender_name
    )


# ==========================================
# REST ENDPOINTS
# ==========================================

@router.get("/contacts", response_model=List[ContactResponse])
def get_chat_contacts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns eligible chat contacts for the current user.
    - Lecturers get students of their courses (active & past) with blocked status and unread count.
    - Students get lecturers of their courses with lecturer's isChatEnabled status.
    - Admins get all active users.
    """
    contacts: List[ContactResponse] = []

    if current_user.Role == "LECTURER":
        # Find distinct students in courses taught by this lecturer
        enrolled_records = db.query(
            User, Course.Title
        ).join(
            Enrollment, Enrollment.StudentId == User.UserId
        ).join(
            Course, Course.CourseId == Enrollment.CourseId
        ).filter(
            Course.LecturerId == current_user.UserId,
            User.Role == "STUDENT"
        ).all()

        student_courses: Dict[uuid.UUID, List[str]] = {}
        students_map: Dict[uuid.UUID, User] = {}
        for s_user, c_title in enrolled_records:
            students_map[s_user.UserId] = s_user
            if s_user.UserId not in student_courses:
                student_courses[s_user.UserId] = []
            if c_title not in student_courses[s_user.UserId]:
                student_courses[s_user.UserId].append(c_title)

        # Get blocked student IDs
        blocked_ids = set(
            u[0] for u in db.query(BlockedUser.StudentId).filter(
                BlockedUser.LecturerId == current_user.UserId
            ).all()
        )

        for s_id, s_user in students_map.items():
            unread_cnt = db.query(func.count(Message.MessageId)).filter(
                Message.SenderId == s_id,
                Message.ReceiverId == current_user.UserId,
                Message.IsRead == False
            ).scalar() or 0

            contacts.append(ContactResponse(
                userId=s_user.UserId,
                fullName=s_user.FullName,
                email=s_user.Email,
                role=s_user.Role,
                department=s_user.Department,
                courseNames=student_courses.get(s_id, []),
                isBlocked=s_id in blocked_ids,
                isChatEnabled=True,
                unreadCount=unread_cnt
            ))

    elif current_user.Role == "STUDENT":
        # Find distinct lecturers teaching courses this student is enrolled in
        lecturer_records = db.query(
            User, Course.Title
        ).join(
            Course, Course.LecturerId == User.UserId
        ).join(
            Enrollment, Enrollment.CourseId == Course.CourseId
        ).filter(
            Enrollment.StudentId == current_user.UserId,
            User.Role == "LECTURER"
        ).all()

        lecturer_courses: Dict[uuid.UUID, List[str]] = {}
        lecturers_map: Dict[uuid.UUID, User] = {}
        for l_user, c_title in lecturer_records:
            lecturers_map[l_user.UserId] = l_user
            if l_user.UserId not in lecturer_courses:
                lecturer_courses[l_user.UserId] = []
            if c_title not in lecturer_courses[l_user.UserId]:
                lecturer_courses[l_user.UserId].append(c_title)

        # Check if student is blocked by any lecturer
        blocked_by_lecturers = set(
            u[0] for u in db.query(BlockedUser.LecturerId).filter(
                BlockedUser.StudentId == current_user.UserId
            ).all()
        )

        for l_id, l_user in lecturers_map.items():
            unread_cnt = db.query(func.count(Message.MessageId)).filter(
                Message.SenderId == l_id,
                Message.ReceiverId == current_user.UserId,
                Message.IsRead == False
            ).scalar() or 0

            contacts.append(ContactResponse(
                userId=l_user.UserId,
                fullName=l_user.FullName,
                email=l_user.Email,
                role=l_user.Role,
                department=l_user.Department,
                courseNames=lecturer_courses.get(l_id, []),
                isBlocked=l_id in blocked_by_lecturers,
                isChatEnabled=bool(l_user.IsChatEnabled),
                unreadCount=unread_cnt
            ))

    else:
        # Admin: list all active users except self
        all_users = db.query(User).filter(
            User.UserId != current_user.UserId,
            User.IsActive == True
        ).all()
        for u in all_users:
            unread_cnt = db.query(func.count(Message.MessageId)).filter(
                Message.SenderId == u.UserId,
                Message.ReceiverId == current_user.UserId,
                Message.IsRead == False
            ).scalar() or 0

            contacts.append(ContactResponse(
                userId=u.UserId,
                fullName=u.FullName,
                email=u.Email,
                role=u.Role,
                department=u.Department,
                courseNames=[],
                isBlocked=False,
                isChatEnabled=bool(u.IsChatEnabled),
                unreadCount=unread_cnt
            ))

    contacts.sort(key=lambda c: (c.unreadCount > 0, c.fullName), reverse=True)
    return contacts


@router.get("/messages/{partner_id}", response_model=List[ChatMessageResponse])
def get_chat_history(
    partner_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get conversation thread between current user and partner.
    Marks partner's unread messages to current user as read.
    """
    partner = db.query(User).filter(User.UserId == partner_id).first()
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Partner user not found")

    # Mark unread messages sent by partner as read
    db.query(Message).filter(
        Message.SenderId == partner_id,
        Message.ReceiverId == current_user.UserId,
        Message.IsRead == False
    ).update({"IsRead": True}, synchronize_session=False)
    db.commit()

    # Query all messages between current_user and partner
    messages = db.query(Message).filter(
        or_(
            and_(Message.SenderId == current_user.UserId, Message.ReceiverId == partner_id),
            and_(Message.SenderId == partner_id, Message.ReceiverId == current_user.UserId)
        )
    ).order_by(Message.CreatedAt.asc()).all()

    users_map = {
        current_user.UserId: current_user.FullName,
        partner.UserId: partner.FullName
    }

    return [
        format_chat_message(m, sender_name=users_map.get(m.SenderId, "Unknown"))
        for m in messages
    ]


@router.post("/messages", response_model=ChatMessageResponse)
async def send_chat_message(
    msg_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a direct message. Verifies permissions, persists, and pushes via WebSocket.
    """
    receiver = db.query(User).filter(User.UserId == msg_in.receiverId).first()
    if not receiver:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receiver not found")

    check_chat_eligibility(current_user, receiver, db)

    content_clean = msg_in.content.strip() if msg_in.content else None
    if not content_clean and not msg_in.attachmentUrl:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tin nhắn phải có nội dung văn bản hoặc tệp đính kèm."
        )

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    new_msg = Message(
        MessageId=uuid.uuid4(),
        SenderId=current_user.UserId,
        ReceiverId=receiver.UserId,
        Content=content_clean,
        CreatedAt=now,
        IsRead=False,
        IsRecalled=False,
        AttachmentUrl=msg_in.attachmentUrl,
        AttachmentName=msg_in.attachmentName,
        AttachmentType=msg_in.attachmentType,
        AttachmentSize=msg_in.attachmentSize
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    resp = format_chat_message(new_msg, sender_name=current_user.FullName)

    # Push to WebSocket connections
    payload = {
        "type": "NEW_MESSAGE",
        "data": {
            "messageId": str(resp.messageId),
            "senderId": str(resp.senderId),
            "receiverId": str(resp.receiverId),
            "content": resp.content,
            "createdAt": resp.createdAt.isoformat() if getattr(resp.createdAt, "tzinfo", None) else f"{resp.createdAt.isoformat()}Z",
            "isRead": resp.isRead,
            "isRecalled": resp.isRecalled,
            "attachmentUrl": resp.attachmentUrl,
            "attachmentName": resp.attachmentName,
            "attachmentType": resp.attachmentType,
            "attachmentSize": resp.attachmentSize,
            "senderName": resp.senderName
        }
    }
    await manager.send_personal_message(payload, str(receiver.UserId))
    await manager.send_personal_message(payload, str(current_user.UserId))

    return resp


@router.post("/messages/{message_id}/recall")
async def recall_chat_message(
    message_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Recall (unsend) a message. Allowed for the sender or an administrator.
    """
    msg = db.query(Message).filter(Message.MessageId == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tin nhắn")

    if current_user.Role != "ADMIN" and msg.SenderId != current_user.UserId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bạn chỉ có thể thu hồi tin nhắn do chính mình gửi đi."
        )

    if msg.IsRecalled:
        return {"message": "Tin nhắn đã được thu hồi trước đó.", "messageId": str(message_id)}

    msg.IsRecalled = True
    msg.RecalledAt = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()

    # Broadcast recall event via WebSocket
    payload = {
        "type": "MESSAGE_RECALLED",
        "data": {
            "messageId": str(msg.MessageId),
            "senderId": str(msg.SenderId),
            "receiverId": str(msg.ReceiverId),
        }
    }
    await manager.send_personal_message(payload, str(msg.ReceiverId))
    await manager.send_personal_message(payload, str(msg.SenderId))

    return {"message": "Đã thu hồi tin nhắn thành công.", "messageId": str(message_id)}


@router.patch("/toggle-enabled")
def toggle_lecturer_chat(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle chat availability (Lecturer only)."""
    if current_user.Role != "LECTURER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lecturers can toggle chat reception")

    new_state = not (current_user.IsChatEnabled if current_user.IsChatEnabled is not None else True)
    current_user.IsChatEnabled = new_state
    db.commit()

    state_str = "bật" if new_state else "tắt"
    return {
        "success": True,
        "isChatEnabled": new_state,
        "message": f"Đã {state_str} tính năng nhận tin nhắn từ sinh viên."
    }


@router.post("/block/{student_id}", response_model=CommonMessageResponse)
def block_student(
    student_id: uuid.UUID,
    reason: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Block a student from messaging (Lecturer only)."""
    if current_user.Role != "LECTURER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lecturers can block students")

    student = db.query(User).filter(User.UserId == student_id, User.Role == "STUDENT").first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    existing = db.query(BlockedUser).filter(
        BlockedUser.LecturerId == current_user.UserId,
        BlockedUser.StudentId == student_id
    ).first()

    if not existing:
        block_record = BlockedUser(
            BlockId=uuid.uuid4(),
            LecturerId=current_user.UserId,
            StudentId=student_id,
            CreatedAt=datetime.now(timezone.utc).replace(tzinfo=None),
            Reason=reason
        )
        db.add(block_record)
        db.commit()

    return CommonMessageResponse(message=f"Đã chặn sinh viên {student.FullName} gửi tin nhắn.")


@router.delete("/block/{student_id}", response_model=CommonMessageResponse)
def unblock_student(
    student_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unblock a student (Lecturer only)."""
    if current_user.Role != "LECTURER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lecturers can unblock students")

    record = db.query(BlockedUser).filter(
        BlockedUser.LecturerId == current_user.UserId,
        BlockedUser.StudentId == student_id
    ).first()

    if record:
        db.delete(record)
        db.commit()

    return CommonMessageResponse(message="Đã gỡ chặn sinh viên thành công.")


@router.get("/blocked", response_model=List[BlockedUserResponse])
def get_blocked_students(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List students blocked by the current lecturer."""
    if current_user.Role != "LECTURER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only lecturers can list blocked students")

    blocks = db.query(BlockedUser).filter(BlockedUser.LecturerId == current_user.UserId).all()
    results = []
    for b in blocks:
        st = db.query(User).filter(User.UserId == b.StudentId).first()
        results.append(BlockedUserResponse(
            blockId=b.BlockId,
            studentId=b.StudentId,
            studentName=st.FullName if st else "Unknown",
            studentEmail=st.Email if st else None,
            createdAt=b.CreatedAt,
            reason=b.Reason
        ))
    return results


@router.get("/unread-count")
def get_unread_chat_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get total unread messages count for current user."""
    count = db.query(func.count(Message.MessageId)).filter(
        Message.ReceiverId == current_user.UserId,
        Message.IsRead == False
    ).scalar() or 0
    return {"unreadCount": count}


# ==========================================
# WEBSOCKET ENDPOINT
# ==========================================

@router.websocket("/ws/{user_id}")
async def chat_websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            # Keep socket alive and receive client pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)
