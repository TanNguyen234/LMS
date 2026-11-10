import uuid
from typing import List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from backend.app.models.models import Notification, Enrollment, User


def notify_user(
    db: Session,
    user_id: uuid.UUID,
    title: str,
    message: str,
    type: str = "SYSTEM",
    related_url: Optional[str] = None,
    commit: bool = True
) -> Notification:
    """Create a notification for a single user."""
    notif = Notification(
        NotificationId=uuid.uuid4(),
        UserId=user_id,
        Title=title.strip(),
        Message=message.strip(),
        Type=type.upper(),
        IsRead=False,
        CreatedAt=datetime.now(timezone.utc).replace(tzinfo=None),
        RelatedUrl=related_url
    )
    db.add(notif)
    if commit:
        db.commit()
        db.refresh(notif)
    return notif


def notify_users(
    db: Session,
    user_ids: List[uuid.UUID],
    title: str,
    message: str,
    type: str = "SYSTEM",
    related_url: Optional[str] = None,
    commit: bool = True
) -> int:
    """Create notifications for multiple users efficiently."""
    if not user_ids:
        return 0

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    unique_ids = set(user_ids)
    created_count = 0

    for uid in unique_ids:
        notif = Notification(
            NotificationId=uuid.uuid4(),
            UserId=uid,
            Title=title.strip(),
            Message=message.strip(),
            Type=type.upper(),
            IsRead=False,
            CreatedAt=now,
            RelatedUrl=related_url
        )
        db.add(notif)
        created_count += 1

    if commit and created_count > 0:
        db.commit()

    return created_count


def notify_course_students(
    db: Session,
    course_id: uuid.UUID,
    title: str,
    message: str,
    type: str = "COURSE",
    related_url: Optional[str] = None,
    commit: bool = True
) -> int:
    """Notify all active enrolled students in a course."""
    enrollments = db.query(Enrollment.StudentId).filter(
        Enrollment.CourseId == course_id,
        Enrollment.Status == "ACTIVE"
    ).all()
    student_ids = [e[0] for e in enrollments]
    return notify_users(db, student_ids, title, message, type=type, related_url=related_url, commit=commit)
