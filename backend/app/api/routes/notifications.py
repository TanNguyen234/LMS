"""Notification REST endpoints with WebSocket push emission."""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from backend.app.core.dependencies import get_current_user
from backend.app.db.session import get_db
from backend.app.models.models import Notification, User
from backend.app.schemas.common import MessageResponse, to_utc_iso
from backend.app.schemas.schemas import NotificationResponse
from backend.app.services.notification_push import push_notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def create_and_push_notification(
    db: Session,
    *,
    user_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str = "GENERAL",
    related_url: Optional[str] = None,
    commit: bool = False,
) -> Notification:
    """Create a Notification row and push its realtime payload (never raises on push failure)."""
    notif = Notification(
        UserId=user_id,
        Title=title,
        Message=message,
        Type=notification_type,
        RelatedUrl=related_url,
        CreatedAt=_utcnow(),
    )
    db.add(notif)
    db.flush()
    if commit:
        db.commit()
        db.refresh(notif)

    push_notification(
        user_id,
        {
            "type": "notification.created",
            "notificationId": str(notif.NotificationId),
            "notificationType": notif.Type,
            "title": notif.Title,
            "message": notif.Message,
            "relatedUrl": notif.RelatedUrl,
            "isRead": False,
            "createdAt": to_utc_iso(notif.CreatedAt),
        },
    )
    return notif


def _notif_to_response(n: Notification) -> NotificationResponse:
    return NotificationResponse(
        notificationId=n.NotificationId,
        userId=n.UserId,
        title=n.Title,
        message=n.Message,
        type=n.Type,
        isRead=n.IsRead,
        createdAt=n.CreatedAt,
        relatedUrl=n.RelatedUrl,
    )


@router.get("", response_model=List[NotificationResponse])
def list_notifications(
    unread_only: bool = Query(False, alias="unreadOnly"),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Liệt kê thông báo của người dùng hiện tại."""
    query = db.query(Notification).filter(Notification.UserId == current_user.UserId)
    if unread_only:
        query = query.filter(Notification.IsRead == False)
    items = query.order_by(Notification.CreatedAt.desc()).limit(limit).all()
    return [_notif_to_response(n) for n in items]


@router.get("/unread-count")
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Trả về số thông báo chưa đọc của người dùng hiện tại."""
    unread_count = (
        db.query(Notification)
        .filter(Notification.UserId == current_user.UserId, Notification.IsRead == False)
        .count()
    )
    return {"unreadCount": unread_count}


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Đánh dấu một thông báo là đã đọc và phát đồng bộ qua WebSocket."""
    n = db.query(Notification).filter(Notification.NotificationId == notification_id).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    if n.UserId != current_user.UserId:
        raise HTTPException(status_code=403, detail="Not authorized to modify this notification")
    n.IsRead = True
    db.commit()
    db.refresh(n)

    unread_count = (
        db.query(Notification)
        .filter(Notification.UserId == current_user.UserId, Notification.IsRead == False)
        .count()
    )
    push_notification(
        current_user.UserId,
        {
            "type": "notification.read",
            "notificationId": str(n.NotificationId),
            "unreadCount": unread_count,
        },
    )
    return _notif_to_response(n)


@router.patch("/read-all", response_model=MessageResponse)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Đánh dấu tất cả thông báo là đã đọc và phát đồng bộ qua WebSocket."""
    db.query(Notification).filter(
        Notification.UserId == current_user.UserId,
        Notification.IsRead == False,
    ).update({"IsRead": True}, synchronize_session=False)
    db.commit()

    push_notification(
        current_user.UserId,
        {
            "type": "notification.read_all",
            "unreadCount": 0,
        },
    )
    return MessageResponse(message="All notifications marked as read")
