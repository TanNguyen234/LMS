import uuid
from typing import List
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.core.security import decode_access_token
from backend.app.models.models import User, Course, Enrollment

security_bearer = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security_bearer),
    db: Session = Depends(get_db)
) -> User:
    """Validate JWT token and return active user."""
    token = credentials.credentials
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token subject missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user_id = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed user ID in token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.UserId == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.IsActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive"
        )
    return user


def require_roles(allowed_roles: List[str]):
    """Enforce server-side role check."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.Role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: Requires role in {allowed_roles}"
            )
        return current_user
    return role_checker


require_admin = require_roles(["ADMIN"])
require_lecturer = require_roles(["LECTURER"])
require_student = require_roles(["STUDENT"])
require_admin_or_lecturer = require_roles(["ADMIN", "LECTURER"])


def get_course_or_404(course_id: uuid.UUID, db: Session) -> Course:
    course = db.query(Course).filter(Course.CourseId == course_id).first()
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")
    return course


def verify_lecturer_course_owner(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Course:
    """Enforce that current user is either ADMIN or the assigned LECTURER of the course."""
    course = get_course_or_404(course_id, db)
    if current_user.Role == "ADMIN":
        return course
    if current_user.Role == "LECTURER" and course.LecturerId == current_user.UserId:
        return course
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not authorized to modify this course"
    )


def verify_course_access(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Course:
    """Verify that user has read access to course: Admin, course lecturer, or active enrolled student."""
    course = get_course_or_404(course_id, db)
    if current_user.Role == "ADMIN":
        return course
    if current_user.Role == "LECTURER":
        if course.LecturerId == current_user.UserId:
            return course
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Lecturer is not assigned to this course"
        )
    if current_user.Role == "STUDENT":
        enrollment = db.query(Enrollment).filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == current_user.UserId,
            Enrollment.Status == "ACTIVE"
        ).first()
        if not enrollment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Student is not actively enrolled in this course"
            )
        return course
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
