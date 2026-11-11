import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from backend.app.db.session import get_db
from backend.app.models.models import CourseMessage, User, Course
from backend.app.schemas.schemas import CourseMessageCreate, CourseMessageResponse
from backend.app.core.dependencies import get_current_user, verify_course_access

router = APIRouter(prefix="/courses", tags=["Class Messages & MS Teams Channels"])


def utcnow():
    return datetime.now(timezone.utc)


@router.get("/{course_id}/messages", response_model=List[CourseMessageResponse])
def get_course_channel_messages(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all discussion messages in the course channel."""
    verify_course_access(course_id, current_user, db)

    messages = db.query(CourseMessage).filter(
        CourseMessage.CourseId == course_id
    ).order_by(CourseMessage.CreatedAt.asc()).all()

    response = []
    for m in messages:
        sender = db.query(User).filter(User.UserId == m.SenderId).first()
        response.append(
            CourseMessageResponse(
                messageId=m.MessageId,
                courseId=m.CourseId,
                senderId=m.SenderId,
                senderName=sender.FullName if sender else "Unknown",
                senderRole=sender.Role if sender else "STUDENT",
                senderEmail=sender.Email if sender else "unknown",
                content=m.Content,
                attachmentUrl=m.AttachmentUrl,
                createdAt=m.CreatedAt
            )
        )
    return response


@router.post("/{course_id}/messages", response_model=CourseMessageResponse)
def post_course_channel_message(
    course_id: uuid.UUID,
    payload: CourseMessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Post a message to the course channel."""
    verify_course_access(course_id, current_user, db)

    content = payload.content.strip()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message content cannot be empty")

    new_msg = CourseMessage(
        CourseId=course_id,
        SenderId=current_user.UserId,
        Content=content,
        AttachmentUrl=payload.attachmentUrl,
        CreatedAt=utcnow()
    )
    db.add(new_msg)
    db.commit()
    db.refresh(new_msg)

    return CourseMessageResponse(
        messageId=new_msg.MessageId,
        courseId=new_msg.CourseId,
        senderId=new_msg.SenderId,
        senderName=current_user.FullName,
        senderRole=current_user.Role,
        senderEmail=current_user.Email,
        content=new_msg.Content,
        attachmentUrl=new_msg.AttachmentUrl,
        createdAt=new_msg.CreatedAt
    )
