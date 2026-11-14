from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.dependencies import get_current_user
from backend.app.core.security import create_access_token, get_password_hash, verify_password
from backend.app.db.session import get_db
from backend.app.models.models import User
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.schemas import (
    ChangePasswordRequest,
    DemoAccountItem,
    DemoSwitchRequest,
    ProfileUpdateRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

INVALID_CREDENTIALS_DETAIL = "Incorrect email or password"

# Seeded demo accounts that may be used for one-click login / role switching in development only.
DEMO_ACCOUNT_EMAILS: tuple[str, ...] = (
    "admin@university.edu.vn",
    "lecturer1@university.edu.vn",
    "lecturer2@university.edu.vn",
    "student1@university.edu.vn",
    "student2@university.edu.vn",
)
DEMO_EMAIL_DOMAIN = "@university.edu.vn"


class LoginPayload(BaseModel):
    """Login by email or by studentCode/staffCode. `email` is kept for backward compatibility."""

    identifier: Optional[str] = Field(default=None, max_length=150)
    email: Optional[str] = Field(default=None, max_length=150)
    password: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def require_identifier(self) -> "LoginPayload":
        candidate = (self.identifier or "").strip() or (self.email or "").strip()
        if not candidate:
            raise ValueError("Vui lòng nhập email hoặc mã sinh viên / mã cán bộ.")
        self.identifier = candidate
        return self


def to_user_response(user: User) -> UserResponse:
    return UserResponse(
        userId=user.UserId,
        email=user.Email,
        fullName=user.FullName,
        role=user.Role,
        isActive=user.IsActive,
        studentCode=user.StudentCode,
        staffCode=user.StaffCode,
        createdAt=user.CreatedAt,
    )


def _issue_token(user: User) -> TokenResponse:
    access_token = create_access_token(subject=user.UserId, role=user.Role, email=user.Email)
    return TokenResponse(access_token=access_token, token_type="bearer", user=to_user_response(user))


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=INVALID_CREDENTIALS_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _find_user_by_identifier(db: Session, identifier: str) -> Optional[User]:
    ident = identifier.strip()
    if "@" in ident:
        return db.query(User).filter(User.Email == ident.lower()).first()
    code = ident.upper()
    matches = (
        db.query(User)
        .filter(or_(User.StudentCode == code, User.StaffCode == code))
        .limit(2)
        .all()
    )
    # Ambiguous codes must never authenticate an arbitrary account.
    if len(matches) != 1:
        return None
    return matches[0]


def _ensure_demo_enabled() -> None:
    if settings.APP_ENV != "development":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")


def _is_demo_email(email: str) -> bool:
    normalized = email.strip().lower()
    return normalized.endswith(DEMO_EMAIL_DOMAIN) and normalized in DEMO_ACCOUNT_EMAILS


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginPayload, db: Session = Depends(get_db)):
    """Login with email or studentCode/staffCode and password."""
    user = _find_user_by_identifier(db, login_data.identifier or "")
    if not user:
        raise _invalid_credentials()
    if not user.IsActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact administrator.",
        )
    if not verify_password(login_data.password, user.PasswordHash):
        raise _invalid_credentials()
    return _issue_token(user)


@router.get("/me", response_model=UserResponse)
def get_current_profile(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return to_user_response(current_user)


@router.put("/me", response_model=UserResponse)
def update_current_profile(
    payload: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update own display name. Role, codes, and email are admin-managed."""
    user = db.query(User).filter(User.UserId == current_user.UserId).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.FullName = payload.fullName
    db.commit()
    db.refresh(user)
    return to_user_response(user)


@router.post("/change-password", response_model=MessageResponse)
def change_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change own password after verifying the current password."""
    user = db.query(User).filter(User.UserId == current_user.UserId).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(payload.currentPassword, user.PasswordHash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không chính xác.")
    if payload.currentPassword == payload.newPassword:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mật khẩu mới phải khác mật khẩu hiện tại.",
        )
    user.PasswordHash = get_password_hash(payload.newPassword)
    db.commit()
    return MessageResponse(message="Đổi mật khẩu thành công.")


@router.get("/demo-accounts", response_model=List[DemoAccountItem])
def list_demo_accounts(db: Session = Depends(get_db)):
    """List seeded demo accounts (development only; 404 otherwise)."""
    _ensure_demo_enabled()
    users = db.query(User).filter(User.Email.in_(DEMO_ACCOUNT_EMAILS), User.IsActive == True).all()  # noqa: E712
    by_email = {u.Email.lower(): u for u in users}
    items: List[DemoAccountItem] = []
    for email in DEMO_ACCOUNT_EMAILS:
        user = by_email.get(email)
        if not user:
            continue
        items.append(
            DemoAccountItem(
                userId=user.UserId,
                email=user.Email,
                fullName=user.FullName,
                role=user.Role,
                studentCode=user.StudentCode,
                staffCode=user.StaffCode,
            )
        )
    return items


@router.post("/demo-switch", response_model=TokenResponse)
def demo_switch(payload: DemoSwitchRequest, db: Session = Depends(get_db)):
    """Issue a token for a seeded demo account without a password (development only)."""
    _ensure_demo_enabled()
    if not _is_demo_email(payload.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Chỉ được chuyển sang tài khoản demo có sẵn.",
        )
    user = db.query(User).filter(User.Email == payload.email.strip().lower()).first()
    if not user or not user.IsActive:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy tài khoản demo.")
    return _issue_token(user)
