import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Notification, User, Course, Enrollment
from backend.app.schemas.schemas import (
    NotificationResponse, NotificationBroadcastRequest, NotificationBroadcastResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import get_current_user
from backend.app.services.notification_service import notify_users, notify_course_students

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


@router.post("/broadcast", response_model=NotificationBroadcastResponse)
def broadcast_notification(
    req: NotificationBroadcastRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Broadcast notifications:
    - Admin can broadcast to ALL, STUDENTS, LECTURERS, or COURSE_STUDENTS.
    - Lecturer can broadcast to COURSE_STUDENTS of courses they own.
    """
    target = req.target.upper()
    recipient_ids = []

    if current_user.Role == "ADMIN":
        if target == "ALL":
            users = db.query(User.UserId).filter(User.IsActive == True).all()
            recipient_ids = [u[0] for u in users]
        elif target == "STUDENTS":
            users = db.query(User.UserId).filter(User.Role == "STUDENT", User.IsActive == True).all()
            recipient_ids = [u[0] for u in users]
        elif target == "LECTURERS":
            users = db.query(User.UserId).filter(User.Role == "LECTURER", User.IsActive == True).all()
            recipient_ids = [u[0] for u in users]
        elif target == "COURSE_STUDENTS":
            if not req.courseId:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="courseId is required for COURSE_STUDENTS")
            enrollments = db.query(Enrollment.StudentId).filter(
                Enrollment.CourseId == req.courseId,
                Enrollment.Status == "ACTIVE"
            ).all()
            recipient_ids = [e[0] for e in enrollments]
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid broadcast target: {req.target}")

    elif current_user.Role == "LECTURER":
        if target != "COURSE_STUDENTS":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Lecturers can only broadcast announcements to COURSE_STUDENTS of their own courses"
            )
        if not req.courseId:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="courseId is required for COURSE_STUDENTS")
        course = db.query(Course).filter(Course.CourseId == req.courseId).first()
        if not course or course.LecturerId != current_user.UserId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only broadcast to courses you teach"
            )
        enrollments = db.query(Enrollment.StudentId).filter(
            Enrollment.CourseId == req.courseId,
            Enrollment.Status == "ACTIVE"
        ).all()
        recipient_ids = [e[0] for e in enrollments]

    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Students cannot broadcast notifications")

    if not recipient_ids:
        return NotificationBroadcastResponse(
            success=True,
            recipientCount=0,
            message="Không tìm thấy người nhận phù hợp với tiêu chí đã chọn."
        )

    count = notify_users(
        db,
        recipient_ids,
        title=req.title,
        message=req.message,
        type=req.type,
        related_url=req.relatedUrl,
        commit=True
    )

    return NotificationBroadcastResponse(
        success=True,
        recipientCount=count,
        message=f"Đã gửi thông báo thành công đến {count} người nhận!"
    )
