import csv
import io
from fastapi import UploadFile, File
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
    cohort: Optional[str] = Query(None),
    major: Optional[str] = Query(None),
    className: Optional[str] = Query(None),
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
    if cohort:
        query = query.filter(User.Cohort == cohort)
    if major:
        query = query.filter(User.Major == major)
    if className:
        query = query.filter(User.ClassName == className)

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
            cohort=u.Cohort,
            major=u.Major,
            className=u.ClassName,
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
        StaffCode=user_in.staffCode.strip() if user_in.staffCode else None,
        Cohort=user_in.cohort.strip() if user_in.cohort else None,
        Major=user_in.major.strip() if user_in.major else None,
        ClassName=user_in.className.strip() if user_in.className else None
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
        cohort=new_user.Cohort,
        major=new_user.Major,
        className=new_user.ClassName,
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
    if user_in.cohort is not None:
        u.Cohort = user_in.cohort.strip() if user_in.cohort else None
    if user_in.major is not None:
        u.Major = user_in.major.strip() if user_in.major else None
    if user_in.className is not None:
        u.ClassName = user_in.className.strip() if user_in.className else None
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


@router.post("/bulk-import-csv")
async def bulk_import_users_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Bulk import users from CSV/Excel export.
    Supports columns: Email, FullName, Role, StudentCode, Cohort, Major, ClassName, Password.
    """
    content = await file.read()
    try:
        text_content = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text_content = content.decode("cp1252", errors="ignore")

    reader = csv.DictReader(io.StringIO(text_content))
    total = 0
    created = 0
    updated = 0
    errors = []

    role_map = {
        "SINH VIÊN": "STUDENT",
        "SINHVIEN": "STUDENT",
        "STUDENT": "STUDENT",
        "GIẢNG VIÊN": "LECTURER",
        "GIANGVIEN": "LECTURER",
        "LECTURER": "LECTURER",
        "QUẢN TRỊ VIÊN": "ADMIN",
        "QUANTRI": "ADMIN",
        "ADMIN": "ADMIN"
    }

    for idx, row in enumerate(reader, start=2):
        total += 1
        # Normalize keys by removing spaces and lowercase
        norm_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}
        
        email = norm_row.get("email") or norm_row.get("thư điện tử") or norm_row.get("thu dien tu")
        if not email or "@" not in email:
            errors.append(f"Dòng {idx}: Thiếu hoặc sai định dạng thư điện tử ({email})")
            continue
        email = email.lower()

        full_name = norm_row.get("fullname") or norm_row.get("full_name") or norm_row.get("họ và tên") or norm_row.get("ho va ten") or "Sinh viên"
        raw_role = (norm_row.get("role") or norm_row.get("phân quyền") or norm_row.get("phan quyen") or "STUDENT").upper()
        role = role_map.get(raw_role, "STUDENT")
        
        student_code = norm_row.get("studentcode") or norm_row.get("student_code") or norm_row.get("mã sv") or norm_row.get("ma sv") or None
        cohort = norm_row.get("cohort") or norm_row.get("khối") or norm_row.get("khoi") or norm_row.get("khóa") or None
        major = norm_row.get("major") or norm_row.get("chuyên ngành") or norm_row.get("ngành") or norm_row.get("nganh") or None
        class_name = norm_row.get("classname") or norm_row.get("class_name") or norm_row.get("lớp") or norm_row.get("lop") or None
        password = norm_row.get("password") or norm_row.get("mật khẩu") or norm_row.get("mat khau") or "Demo@123"

        existing = db.query(User).filter(User.Email == email).first()
        if existing:
            # Update existing user info
            existing.FullName = full_name
            existing.Role = role
            if student_code: existing.StudentCode = student_code
            if cohort: existing.Cohort = cohort
            if major: existing.Major = major
            if class_name: existing.ClassName = class_name
            updated += 1
        else:
            new_u = User(
                UserId=uuid.uuid4(),
                Email=email,
                FullName=full_name,
                Role=role,
                PasswordHash=get_password_hash(password),
                IsActive=True,
                StudentCode=student_code,
                Cohort=cohort,
                Major=major,
                ClassName=class_name
            )
            db.add(new_u)
            created += 1

    db.commit()
    return {
        "success": True,
        "totalProcessed": total,
        "createdCount": created,
        "updatedCount": updated,
        "errorCount": len(errors),
        "errors": errors[:10]  # return first 10 errors if any
    }


from pydantic import BaseModel
from typing import List

class GenerateBatchUsersRequest(BaseModel):
    codePrefix: str
    startNumber: int
    endNumber: int
    padLength: int = 2
    emailDomain: str = "university.edu.vn"
    namePrefix: str = "Sinh viên"
    className: Optional[str] = None
    cohort: Optional[str] = None
    major: Optional[str] = None
    defaultPassword: str = "Demo@123"

class BatchUserActionsRequest(BaseModel):
    userIds: List[uuid.UUID]
    action: str  # "ACTIVATE", "DEACTIVATE", "RESET_PASSWORD"
    newPassword: Optional[str] = "Demo@123"


@router.post("/generate-batch")
def generate_batch_users(
    req: GenerateBatchUsersRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Auto-provision a batch of student accounts based on sequential code range.
    Example: SV24CN01 to SV24CN40 for class 24CNTT01.
    """
    if req.endNumber < req.startNumber:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="endNumber must be >= startNumber")
    if (req.endNumber - req.startNumber + 1) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 200 accounts per batch")

    created = 0
    skipped = 0
    password_hash = get_password_hash(req.defaultPassword)

    for num in range(req.startNumber, req.endNumber + 1):
        num_str = str(num).zfill(req.padLength)
        student_code = f"{req.codePrefix.strip().upper()}{num_str}"
        email = f"{student_code.lower()}@{req.emailDomain.strip().lower()}"
        full_name = f"{req.namePrefix.strip()} {num_str}"

        existing = db.query(User).filter((User.Email == email) | (User.StudentCode == student_code)).first()
        if existing:
            skipped += 1
            continue

        new_user = User(
            UserId=uuid.uuid4(),
            Email=email,
            FullName=full_name,
            PasswordHash=password_hash,
            Role="STUDENT",
            IsActive=True,
            StudentCode=student_code,
            Cohort=req.cohort.strip() if req.cohort else None,
            Major=req.major.strip() if req.major else None,
            ClassName=req.className.strip() if req.className else None
        )
        db.add(new_user)
        created += 1

    db.commit()
    return {
        "success": True,
        "createdCount": created,
        "skippedCount": skipped,
        "message": f"Đã tự động khởi tạo thành công {created} tài khoản sinh viên (bỏ qua {skipped} tài khoản đã tồn tại)!"
    }


@router.post("/batch-actions")
def batch_user_actions(
    req: BatchUserActionsRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Perform batch operations on multiple users: ACTIVATE, DEACTIVATE, RESET_PASSWORD.
    """
    if not req.userIds:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="userIds list cannot be empty")

    action = req.action.upper()
    users = db.query(User).filter(User.UserId.in_(req.userIds)).all()
    count = 0

    if action == "ACTIVATE":
        for u in users:
            u.IsActive = True
            count += 1
    elif action == "DEACTIVATE":
        for u in users:
            # Protect admin from deactivating themselves
            if u.UserId != admin.UserId:
                u.IsActive = False
                count += 1
    elif action == "RESET_PASSWORD":
        new_pwd = req.newPassword or "Demo@123"
        pwd_hash = get_password_hash(new_pwd)
        for u in users:
            u.PasswordHash = pwd_hash
            count += 1
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported action: {action}")

    db.commit()
    return {
        "success": True,
        "action": action,
        "affectedCount": count,
        "message": f"Thực hiện thao tác {action} thành công trên {count} người dùng!"
    }
