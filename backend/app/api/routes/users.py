import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User
from backend.app.schemas.common import PaginatedResponse, MessageResponse
from backend.app.schemas.schemas import UserCreate, UserUpdate, UserStatusUpdate, UserResponse
from backend.app.core.security import get_password_hash
from backend.app.core.dependencies import require_admin

router = APIRouter(prefix="/users", tags=["Users (Admin)"], dependencies=[Depends(require_admin)])


@router.get("", response_model=PaginatedResponse[UserResponse])
def list_users(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None, alias="isActive"),
    db: Session = Depends(get_db)
):
    """List users with pagination and search (Admin only)."""
    query = db.query(User)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.filter((User.Email.ilike(s)) | (User.FullName.ilike(s)))
    if role:
        query = query.filter(User.Role == role.upper())
    if is_active is not None:
        query = query.filter(User.IsActive == is_active)

    total = query.count()
    users = query.order_by(User.CreatedAt.desc()).offset((page - 1) * pageSize).limit(pageSize).all()

    items = [
        UserResponse(
            userId=u.UserId,
            email=u.Email,
            fullName=u.FullName,
            role=u.Role,
            isActive=u.IsActive,
            studentCode=u.StudentCode,
            staffCode=u.StaffCode,
            createdAt=u.CreatedAt
        )
        for u in users
    ]
    return PaginatedResponse[UserResponse](
        items=items,
        page=page,
        pageSize=pageSize,
        total=total
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user_by_id(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single user by ID."""
    u = db.query(User).filter(User.UserId == user_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return UserResponse(
        userId=u.UserId,
        email=u.Email,
        fullName=u.FullName,
        role=u.Role,
        isActive=u.IsActive,
        studentCode=u.StudentCode,
        staffCode=u.StaffCode,
        createdAt=u.CreatedAt
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """Create new user account (Admin only)."""
    email_clean = user_in.email.strip().lower()
    existing = db.query(User).filter(User.Email == email_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{email_clean}' is already registered"
        )
    if user_in.role not in ["ADMIN", "LECTURER", "STUDENT"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be one of: ADMIN, LECTURER, STUDENT"
        )

    new_user = User(
        UserId=uuid.uuid4(),
        Email=email_clean,
        FullName=user_in.fullName.strip(),
        PasswordHash=get_password_hash(user_in.password),
        Role=user_in.role.upper(),
        IsActive=user_in.isActive,
        StudentCode=user_in.studentCode.strip() if user_in.studentCode else None,
        StaffCode=user_in.staffCode.strip() if user_in.staffCode else None
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse(
        userId=new_user.UserId,
        email=new_user.Email,
        fullName=new_user.FullName,
        role=new_user.Role,
        isActive=new_user.IsActive,
        studentCode=new_user.StudentCode,
        staffCode=new_user.StaffCode,
        createdAt=new_user.CreatedAt
    )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: uuid.UUID, user_in: UserUpdate, db: Session = Depends(get_db)):
    """Update user profile information."""
    u = db.query(User).filter(User.UserId == user_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_in.email is not None:
        email = str(user_in.email).strip().lower()
        duplicate = db.query(User.UserId).filter(User.Email == email, User.UserId != user_id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already in use")
        u.Email = email

    if user_in.fullName is not None:
        u.FullName = user_in.fullName.strip()
    if user_in.role is not None:
        if user_in.role not in ["ADMIN", "LECTURER", "STUDENT"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")
        u.Role = user_in.role.upper()
    if user_in.isActive is not None:
        u.IsActive = user_in.isActive
    if user_in.studentCode is not None:
        u.StudentCode = user_in.studentCode.strip() if user_in.studentCode else None
    if user_in.staffCode is not None:
        u.StaffCode = user_in.staffCode.strip() if user_in.staffCode else None
    if user_in.password is not None and len(user_in.password.strip()) >= 6:
        u.PasswordHash = get_password_hash(user_in.password)

    db.commit()
    db.refresh(u)
    return UserResponse(
        userId=u.UserId,
        email=u.Email,
        fullName=u.FullName,
        role=u.Role,
        isActive=u.IsActive,
        studentCode=u.StudentCode,
        staffCode=u.StaffCode,
        createdAt=u.CreatedAt
    )


@router.patch("/{user_id}/status", response_model=MessageResponse)
def toggle_user_status(user_id: uuid.UUID, status_in: UserStatusUpdate, db: Session = Depends(get_db)):
    """Activate or deactivate user account."""
    u = db.query(User).filter(User.UserId == user_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    u.IsActive = status_in.isActive
    db.commit()
    state = "activated" if status_in.isActive else "deactivated"
    return MessageResponse(message=f"User {u.Email} successfully {state}")
