import csv
import io
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, ValidationError
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import require_admin
from backend.app.core.security import get_password_hash
from backend.app.db.session import get_db
from backend.app.models.models import User
from backend.app.schemas.common import MessageResponse, PaginatedResponse
from backend.app.schemas.schemas import UserCreate, UserResponse, UserStatusUpdate, UserUpdate

router = APIRouter(prefix="/users", tags=["Users (Admin)"], dependencies=[Depends(require_admin)])

VALID_ROLES = ("ADMIN", "LECTURER", "STUDENT")
STATUS_FILTERS = {"ACTIVE": True, "INACTIVE": False, "LOCKED": False}
CSV_REQUIRED_COLUMNS = ("email", "fullName", "role")
CSV_OPTIONAL_COLUMNS = ("studentCode", "staffCode", "password")
CSV_MAX_BYTES = 2 * 1024 * 1024
CSV_MAX_ROWS = 2000
CSV_DEFAULT_PASSWORD = "Demo@123"


class UserImportRowError(BaseModel):
    row: int
    email: Optional[str] = None
    message: str


class UserImportSkippedRow(BaseModel):
    row: int
    email: str
    reason: str


class UserImportReport(BaseModel):
    created: int
    skipped: int
    errors: List[UserImportRowError]
    skippedRows: List[UserImportSkippedRow]
    totalRows: int


def _to_response(u: User) -> UserResponse:
    return UserResponse(
        userId=u.UserId,
        email=u.Email,
        fullName=u.FullName,
        role=u.Role,
        isActive=u.IsActive,
        studentCode=u.StudentCode,
        staffCode=u.StaffCode,
        createdAt=u.CreatedAt,
    )


def _normalize_code(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip().upper()
    return cleaned or None


def _code_conflict(db: Session, code: Optional[str], exclude_user_id: Optional[uuid.UUID] = None) -> bool:
    """Codes double as login identifiers, so they must be unique across StudentCode and StaffCode."""
    if not code:
        return False
    query = db.query(User.UserId).filter(or_(User.StudentCode == code, User.StaffCode == code))
    if exclude_user_id is not None:
        query = query.filter(User.UserId != exclude_user_id)
    return query.first() is not None


def _raise_code_conflict(code: str) -> None:
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"Mã '{code}' đã được sử dụng bởi tài khoản khác.",
    )


def _commit_or_409(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Dữ liệu bị trùng với tài khoản đã tồn tại.",
        )


def _get_user_or_404(db: Session, user_id: uuid.UUID) -> User:
    u = db.query(User).filter(User.UserId == user_id).first()
    if not u:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return u


@router.get("", response_model=PaginatedResponse[UserResponse])
def list_users(
    page: int = Query(1, ge=1),
    pageSize: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, max_length=150),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None, alias="isActive"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """List users with server-side search, role/status filters, and pagination (Admin only)."""
    query = db.query(User)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.Email.ilike(s),
                User.FullName.ilike(s),
                User.StudentCode.ilike(s),
                User.StaffCode.ilike(s),
            )
        )
    if role and role.strip():
        normalized_role = role.strip().upper()
        if normalized_role not in VALID_ROLES:
            raise HTTPException(
                status_code=422,
                detail="Role must be one of: ADMIN, LECTURER, STUDENT",
            )
        query = query.filter(User.Role == normalized_role)
    if status_filter and status_filter.strip():
        normalized_status = status_filter.strip().upper()
        if normalized_status not in STATUS_FILTERS:
            raise HTTPException(
                status_code=422,
                detail="Status must be one of: ACTIVE, INACTIVE",
            )
        query = query.filter(User.IsActive == STATUS_FILTERS[normalized_status])
    elif is_active is not None:
        query = query.filter(User.IsActive == is_active)

    total = query.count()
    users = (
        query.order_by(User.CreatedAt.desc(), User.UserId.asc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )
    return PaginatedResponse[UserResponse](
        items=[_to_response(u) for u in users],
        page=page,
        pageSize=pageSize,
        total=total,
    )


@router.post("/import-csv", response_model=UserImportReport)
async def import_users_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Bulk-create users from a UTF-8 CSV (with or without BOM).

    Columns: email, fullName, role, studentCode, staffCode, password.
    Existing emails are skipped; invalid rows are reported per row without aborting the import.
    """
    raw = await file.read(CSV_MAX_BYTES + 1)
    if len(raw) > CSV_MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Tệp CSV vượt quá 2 MB.")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp CSV phải được mã hóa UTF-8.")
    if "\x00" in text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp CSV phải được mã hóa UTF-8.")

    reader = csv.DictReader(io.StringIO(text, newline=""))
    header_map = {}
    for name in reader.fieldnames or []:
        key = (name or "").strip()
        for canonical in CSV_REQUIRED_COLUMNS + CSV_OPTIONAL_COLUMNS:
            if key.lower() == canonical.lower():
                header_map[canonical] = name
    missing = [col for col in CSV_REQUIRED_COLUMNS if col not in header_map]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tệp CSV thiếu cột bắt buộc: {', '.join(missing)}.",
        )

    def cell(row: dict, column: str) -> str:
        source = header_map.get(column)
        value = row.get(source) if source else None
        return value.strip() if isinstance(value, str) else ""

    created = 0
    skipped_rows: List[UserImportSkippedRow] = []
    errors: List[UserImportRowError] = []
    seen_emails: set[str] = set()
    total_rows = 0

    for row_number, row in enumerate(reader, start=2):
        if not any((v or "").strip() for v in row.values() if isinstance(v, str)):
            continue
        total_rows += 1
        if total_rows > CSV_MAX_ROWS:
            errors.append(
                UserImportRowError(row=row_number, message=f"Vượt quá giới hạn {CSV_MAX_ROWS} dòng mỗi lần nhập.")
            )
            break

        email = cell(row, "email").lower()
        if email and email in seen_emails:
            skipped_rows.append(UserImportSkippedRow(row=row_number, email=email, reason="Email trùng trong tệp."))
            continue
        if email and db.query(User.UserId).filter(User.Email == email).first():
            seen_emails.add(email)
            skipped_rows.append(UserImportSkippedRow(row=row_number, email=email, reason="Email đã tồn tại."))
            continue

        try:
            candidate = UserCreate(
                email=email,
                fullName=cell(row, "fullName"),
                role=cell(row, "role"),
                password=cell(row, "password") or CSV_DEFAULT_PASSWORD,
                studentCode=cell(row, "studentCode") or None,
                staffCode=cell(row, "staffCode") or None,
            )
        except ValidationError as exc:
            messages = []
            for item in exc.errors():
                field = ".".join(str(part) for part in item.get("loc", ())) or "row"
                messages.append(f"{field}: {item.get('msg', 'không hợp lệ')}")
            errors.append(UserImportRowError(row=row_number, email=email or None, message="; ".join(messages)))
            continue

        student_code = _normalize_code(candidate.studentCode)
        staff_code = _normalize_code(candidate.staffCode)
        conflict_code = next((c for c in (student_code, staff_code) if _code_conflict(db, c)), None)
        if conflict_code:
            errors.append(
                UserImportRowError(row=row_number, email=email, message=f"Mã '{conflict_code}' đã được sử dụng.")
            )
            continue

        db.add(
            User(
                UserId=uuid.uuid4(),
                Email=str(candidate.email).strip().lower(),
                FullName=candidate.fullName,
                PasswordHash=get_password_hash(candidate.password),
                Role=candidate.role,
                IsActive=True,
                StudentCode=student_code,
                StaffCode=staff_code,
            )
        )
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            errors.append(
                UserImportRowError(row=row_number, email=email, message="Dữ liệu trùng với tài khoản đã tồn tại.")
            )
            continue
        seen_emails.add(email)
        created += 1

    return UserImportReport(
        created=created,
        skipped=len(skipped_rows),
        errors=errors,
        skippedRows=skipped_rows,
        totalRows=total_rows,
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user_by_id(user_id: uuid.UUID, db: Session = Depends(get_db)):
    """Get single user by ID."""
    return _to_response(_get_user_or_404(db, user_id))


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(user_in: UserCreate, db: Session = Depends(get_db)):
    """Create new user account (Admin only)."""
    email_clean = str(user_in.email).strip().lower()
    if db.query(User.UserId).filter(User.Email == email_clean).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{email_clean}' is already registered",
        )
    student_code = _normalize_code(user_in.studentCode)
    staff_code = _normalize_code(user_in.staffCode)
    for code in (student_code, staff_code):
        if _code_conflict(db, code):
            _raise_code_conflict(code)

    new_user = User(
        UserId=uuid.uuid4(),
        Email=email_clean,
        FullName=user_in.fullName,
        PasswordHash=get_password_hash(user_in.password),
        Role=user_in.role.upper(),
        IsActive=user_in.isActive,
        StudentCode=student_code,
        StaffCode=staff_code,
    )
    db.add(new_user)
    _commit_or_409(db)
    db.refresh(new_user)
    return _to_response(new_user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Update user profile, role, codes, status, or reset password (Admin only)."""
    u = _get_user_or_404(db, user_id)
    fields = user_in.model_fields_set
    is_self = u.UserId == current_admin.UserId

    if is_self and user_in.isActive is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự khóa tài khoản của chính mình.")
    if is_self and user_in.role is not None and user_in.role.upper() != "ADMIN":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự hạ quyền quản trị của chính mình.")

    if user_in.email is not None:
        email = str(user_in.email).strip().lower()
        duplicate = db.query(User.UserId).filter(User.Email == email, User.UserId != user_id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email is already in use")
        u.Email = email

    if user_in.fullName is not None:
        u.FullName = user_in.fullName
    if user_in.role is not None:
        u.Role = user_in.role.upper()
    if user_in.isActive is not None:
        u.IsActive = user_in.isActive
    if "studentCode" in fields:
        code = _normalize_code(user_in.studentCode)
        if _code_conflict(db, code, exclude_user_id=u.UserId):
            _raise_code_conflict(code)
        u.StudentCode = code
    if "staffCode" in fields:
        code = _normalize_code(user_in.staffCode)
        if _code_conflict(db, code, exclude_user_id=u.UserId):
            _raise_code_conflict(code)
        u.StaffCode = code
    if user_in.password:
        u.PasswordHash = get_password_hash(user_in.password)

    _commit_or_409(db)
    db.refresh(u)
    return _to_response(u)


@router.patch("/{user_id}/status", response_model=MessageResponse)
def toggle_user_status(
    user_id: uuid.UUID,
    status_in: UserStatusUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Activate or deactivate user account."""
    u = _get_user_or_404(db, user_id)
    if u.UserId == current_admin.UserId and not status_in.isActive:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Không thể tự khóa tài khoản của chính mình.")
    u.IsActive = status_in.isActive
    _commit_or_409(db)
    state = "activated" if status_in.isActive else "deactivated"
    return MessageResponse(message=f"User {u.Email} successfully {state}")
