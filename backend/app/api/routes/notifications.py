import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Notification, User
from backend.app.schemas.schemas import NotificationResponse
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=List[NotificationResponse])
def get_my_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get notifications for current authenticated user."""
    notifs = (
        db.query(Notification)
        .filter(Notification.UserId == current_user.UserId)
        .order_by(Notification.CreatedAt.desc())
        .all()
    )
    return [
        NotificationResponse(
            notificationId=n.NotificationId,
            userId=n.UserId,
            title=n.Title,
            message=n.Message,
            type=n.Type,
            isRead=n.IsRead,
            createdAt=n.CreatedAt,
            relatedUrl=n.RelatedUrl
        )
        for n in notifs
    ]


@router.patch("/{notification_id}/read", response_model=MessageResponse)
def mark_notification_as_read(
    notification_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Mark a notification as read (BR-11, AC-10).
    Enforces that user CANNOT mark another user's notification as read.
    """
    notif = db.query(Notification).filter(Notification.NotificationId == notification_id).first()
    if not notif:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notif.UserId != current_user.UserId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to access this notification"
        )

    notif.IsRead = True
    db.commit()
    return MessageResponse(message="Notification marked as read")


@router.patch("/read-all", response_model=MessageResponse)
def mark_all_as_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark all unread notifications of current user as read."""
    db.query(Notification).filter(
        Notification.UserId == current_user.UserId,
        Notification.IsRead == False
    ).update({"IsRead": True})
    db.commit()
    return MessageResponse(message="All notifications marked as read")
