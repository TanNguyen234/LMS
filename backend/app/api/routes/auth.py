from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import User
from backend.app.schemas.schemas import LoginRequest, TokenResponse, UserResponse
from backend.app.core.security import verify_password, create_access_token
from backend.app.core.dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    """User login with email and password."""
    email_clean = login_data.email.strip().lower()
    user = db.query(User).filter(User.Email == email_clean).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.IsActive:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated. Please contact administrator."
        )
    if not verify_password(login_data.password, user.PasswordHash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        subject=user.UserId,
        role=user.Role,
        email=user.Email
    )
    user_response = UserResponse(
        userId=user.UserId,
        email=user.Email,
        fullName=user.FullName,
        role=user.Role,
        isActive=user.IsActive,
        studentCode=user.StudentCode,
        staffCode=user.StaffCode,
        createdAt=user.CreatedAt
    )
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=user_response
    )


@router.get("/me", response_model=UserResponse)
def get_current_profile(current_user: User = Depends(get_current_user)):
    """Get current authenticated user profile."""
    return UserResponse(
        userId=current_user.UserId,
        email=current_user.Email,
        fullName=current_user.FullName,
        role=current_user.Role,
        isActive=current_user.IsActive,
        studentCode=current_user.StudentCode,
        staffCode=current_user.StaffCode,
        createdAt=current_user.CreatedAt
    )
