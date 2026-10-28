import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, File, UploadFile
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Course, User, Enrollment
from backend.app.schemas.schemas import (
    CourseCreate, CourseUpdate, CourseStatusUpdate, CourseResponse,
    EnrollmentCreate, EnrollmentResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, require_admin, verify_course_access,
    get_course_or_404
)

router = APIRouter(prefix="/courses", tags=["Courses & Enrollments"])


def format_course_response(course: Course, db: Session) -> CourseResponse:
    lecturer = db.query(User).filter(User.UserId == course.LecturerId).first()
    lecturer_name = lecturer.FullName if lecturer else "Unknown"
    return CourseResponse(
        courseId=course.CourseId,
        courseCode=course.CourseCode,
        title=course.Title,
        description=course.Description,
        lecturerId=course.LecturerId,
        semester=course.Semester,
        academicYear=course.AcademicYear,
        credits=course.Credits,
        status=course.Status,
        createdAt=course.CreatedAt,
        lecturerName=lecturer_name
    )


@router.get("", response_model=List[CourseResponse])
def get_courses(
    status_filter: Optional[str] = Query(None, alias="status"),
    lecturer_id: Optional[uuid.UUID] = Query(None, alias="lecturerId"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    List courses visible to current user based on role:
    - Admin: all courses
    - Lecturer: courses taught by lecturer
    - Student: courses actively enrolled by student
    """
    query = db.query(Course)
    if current_user.Role == "ADMIN":
        if lecturer_id is not None:
            query = query.filter(Course.LecturerId == lecturer_id)
    elif current_user.Role == "LECTURER":
        query = query.filter(Course.LecturerId == current_user.UserId)
        if lecturer_id is not None and lecturer_id != current_user.UserId:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot list another lecturer's courses")
    elif current_user.Role == "STUDENT":
        query = (
            query
            .join(Enrollment, Enrollment.CourseId == Course.CourseId)
            .filter(
                Enrollment.StudentId == current_user.UserId,
                Enrollment.Status == "ACTIVE",
                Course.Status == "ACTIVE"
            )
        )
    else:
        return []

    if status_filter is not None:
        normalized_status = status_filter.strip().upper()
        if normalized_status not in {"DRAFT", "ACTIVE", "ARCHIVED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid course status filter")
        if current_user.Role == "STUDENT" and normalized_status != "ACTIVE":
            return []
        query = query.filter(Course.Status == normalized_status)

    courses = query.order_by(Course.CreatedAt.desc()).all()

    return [format_course_response(c, db) for c in courses]


@router.get("/{course_id}", response_model=CourseResponse)
def get_course_detail(
    course: Course = Depends(verify_course_access),
    db: Session = Depends(get_db)
):
    """Get single course detail (authorized users only)."""
    return format_course_response(course, db)


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    course_in: CourseCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new course (Admin only). Enforces lecturer role integrity."""
    code_clean = course_in.courseCode.strip().upper()
    existing = db.query(Course).filter(Course.CourseCode == code_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"CourseCode '{code_clean}' already exists"
        )

    # Validate lecturer
    lecturer = db.query(User).filter(User.UserId == course_in.lecturerId).first()
    if not lecturer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecturer not found")
    if lecturer.Role != "LECTURER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User {lecturer.Email} is not a LECTURER"
        )
    if not lecturer.IsActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned lecturer is currently inactive"
        )

    new_course = Course(
        CourseId=uuid.uuid4(),
        CourseCode=code_clean,
        Title=course_in.title.strip(),
        Description=course_in.description.strip() if course_in.description else None,
        LecturerId=course_in.lecturerId,
        Semester=course_in.semester.strip(),
        AcademicYear=course_in.academicYear.strip(),
        Credits=course_in.credits,
        Status=course_in.status.upper()
    )
    db.add(new_course)
    db.commit()
    db.refresh(new_course)

    return format_course_response(new_course, db)


@router.put("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: uuid.UUID,
    course_in: CourseUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update course metadata (Admin only)."""
    c = get_course_or_404(course_id, db)
    if course_in.title is not None:
        c.Title = course_in.title.strip()
    if course_in.description is not None:
        c.Description = course_in.description.strip() if course_in.description else None
    if course_in.semester is not None:
        c.Semester = course_in.semester.strip()
    if course_in.academicYear is not None:
        c.AcademicYear = course_in.academicYear.strip()
    if course_in.credits is not None:
        c.Credits = course_in.credits
    if course_in.status is not None:
        if course_in.status not in ["DRAFT", "ACTIVE", "ARCHIVED"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        c.Status = course_in.status.upper()
    if course_in.lecturerId is not None:
        lecturer = db.query(User).filter(User.UserId == course_in.lecturerId).first()
        if not lecturer or lecturer.Role != "LECTURER":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid lecturer")
        c.LecturerId = course_in.lecturerId

    db.commit()
    db.refresh(c)
    return format_course_response(c, db)


@router.patch("/{course_id}/status", response_model=MessageResponse)
def toggle_course_status(
    course_id: uuid.UUID,
    status_in: CourseStatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Toggle course status (Admin only)."""
    c = get_course_or_404(course_id, db)
    if status_in.status not in ["DRAFT", "ACTIVE", "ARCHIVED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    c.Status = status_in.status.upper()
    db.commit()
    return MessageResponse(message=f"Course {c.CourseCode} status updated to {c.Status}")


# ==========================================
# ENROLLMENTS
# ==========================================

@router.get("/{course_id}/enrollments", response_model=List[EnrollmentResponse])
def get_course_enrollments(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """List enrollments of a course (Admin or course Lecturer)."""
    course = get_course_or_404(course_id, db)
    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.Role == "STUDENT":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    enrollments = db.query(Enrollment).filter(Enrollment.CourseId == course_id).all()
    results = []
    for e in enrollments:
        student = db.query(User).filter(User.UserId == e.StudentId).first()
        results.append(EnrollmentResponse(
            enrollmentId=e.EnrollmentId,
            courseId=e.CourseId,
            studentId=e.StudentId,
            enrolledAt=e.EnrolledAt,
            status=e.Status,
            finalScore=float(e.FinalScore) if e.FinalScore is not None else None,
            studentName=student.FullName if student else "Unknown",
            studentCode=student.StudentCode if student else None,
            studentEmail=student.Email if student else None
        ))
    return results


@router.post("/{course_id}/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
def enroll_student(
    course_id: uuid.UUID,
    enroll_in: EnrollmentCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Enroll student into course (Admin only). Enforces uniqueness and student role."""
    course = get_course_or_404(course_id, db)
    student = db.query(User).filter(User.UserId == enroll_in.studentId).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if student.Role != "STUDENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user is not a STUDENT")

    existing = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.StudentId == enroll_in.studentId
    ).first()
    if existing:
        if existing.Status == "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already actively enrolled in this course"
            )
        else:
            # Reactivate
            existing.Status = "ACTIVE"
            db.commit()
            db.refresh(existing)
            return EnrollmentResponse(
                enrollmentId=existing.EnrollmentId,
                courseId=existing.CourseId,
                studentId=existing.StudentId,
                enrolledAt=existing.EnrolledAt,
                status=existing.Status,
                finalScore=float(existing.FinalScore) if existing.FinalScore is not None else None,
                studentName=student.FullName,
                studentCode=student.StudentCode,
                studentEmail=student.Email
            )

    new_enroll = Enrollment(
        EnrollmentId=uuid.uuid4(),
        CourseId=course_id,
        StudentId=enroll_in.studentId,
        Status="ACTIVE"
    )
    db.add(new_enroll)
    db.commit()
    db.refresh(new_enroll)

    return EnrollmentResponse(
        enrollmentId=new_enroll.EnrollmentId,
        courseId=new_enroll.CourseId,
        studentId=new_enroll.StudentId,
        enrolledAt=new_enroll.EnrolledAt,
        status=new_enroll.Status,
        finalScore=None,
        studentName=student.FullName,
        studentCode=student.StudentCode,
        studentEmail=student.Email
    )


@router.delete("/{course_id}/enrollments/{student_id}", response_model=MessageResponse)
def remove_enrollment(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Drop or delete student enrollment (Admin only)."""
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.StudentId == student_id
    ).first()
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
    enrollment.Status = "DROPPED"
    db.commit()
    return MessageResponse(message="Enrollment status updated to DROPPED")

from pydantic import BaseModel

class BulkEnrollClassRequest(BaseModel):
    className: str

@router.post("/{course_id}/bulk-enroll-class")
def bulk_enroll_class(
    course_id: uuid.UUID,
    req: BulkEnrollClassRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Enroll all active students belonging to a class into the course (Admin only)."""
    course = get_course_or_404(course_id, db)
    class_name = req.className.strip()
    if not class_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ClassName is required")

    students = db.query(User).filter(
        User.Role == "STUDENT",
        User.ClassName == class_name,
        User.IsActive == True
    ).all()

    if not students:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No active students found in class '{class_name}'")

    enrolled_count = 0
    reactivated_count = 0

    for s in students:
        existing = db.query(Enrollment).filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == s.UserId
        ).first()

        if existing:
            if existing.Status != "ACTIVE":
                existing.Status = "ACTIVE"
                reactivated_count += 1
        else:
            new_enroll = Enrollment(
                EnrollmentId=uuid.uuid4(),
                CourseId=course_id,
                StudentId=s.UserId,
                Status="ACTIVE"
            )
            db.add(new_enroll)
            enrolled_count += 1

    db.commit()
    return {
        "success": True,
        "className": class_name,
        "totalStudentsInClass": len(students),
        "newlyEnrolled": enrolled_count,
        "reactivated": reactivated_count,
        "message": f"Đã ghi danh thành công {enrolled_count + reactivated_count} sinh viên của lớp {class_name} vào khóa học!"
    }


class BulkEnrollStudentIdsRequest(BaseModel):
    studentIds: List[uuid.UUID]


@router.post("/{course_id}/bulk-enroll-students")
def bulk_enroll_students(
    course_id: uuid.UUID,
    req: BulkEnrollStudentIdsRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Enroll a list of student IDs into the course (Admin only)."""
    course = get_course_or_404(course_id, db)
    if not req.studentIds:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="studentIds list cannot be empty")

    enrolled_count = 0
    reactivated_count = 0

    for s_id in req.studentIds:
        student = db.query(User).filter(User.UserId == s_id, User.Role == "STUDENT").first()
        if not student:
            continue

        existing = db.query(Enrollment).filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == s_id
        ).first()

        if existing:
            if existing.Status != "ACTIVE":
                existing.Status = "ACTIVE"
                reactivated_count += 1
        else:
            new_enroll = Enrollment(
                EnrollmentId=uuid.uuid4(),
                CourseId=course_id,
                StudentId=s_id,
                Status="ACTIVE"
            )
            db.add(new_enroll)
            enrolled_count += 1

    db.commit()
    return {
        "success": True,
        "totalRequested": len(req.studentIds),
        "newlyEnrolled": enrolled_count,
        "reactivated": reactivated_count,
        "message": f"Đã ghi danh thành công {enrolled_count + reactivated_count} sinh viên vào khóa học!"
    }


@router.post("/bulk-import-csv")
async def bulk_import_courses_csv(
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Bulk import courses from CSV/Excel export (Admin only).
    Columns supported: CourseCode, Title, Description, Credits, LecturerEmail, Semester, AcademicYear
    """
    import csv
    import io
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

    for idx, row in enumerate(reader, start=2):
        total += 1
        norm_row = {k.strip().lower(): v.strip() for k, v in row.items() if k}

        code = norm_row.get("coursecode") or norm_row.get("course_code") or norm_row.get("mã môn") or norm_row.get("ma mon")
        if not code:
            errors.append(f"Dòng {idx}: Thiếu Mã khóa học (CourseCode)")
            continue
        code = code.upper()

        title = norm_row.get("title") or norm_row.get("tên môn") or norm_row.get("ten mon") or norm_row.get("tên học phần")
        if not title:
            errors.append(f"Dòng {idx}: Thiếu Tên khóa học (Title)")
            continue

        desc = norm_row.get("description") or norm_row.get("mô tả") or norm_row.get("mo ta") or ""
        credits_raw = norm_row.get("credits") or norm_row.get("số tín chỉ") or norm_row.get("so tin chi") or "3"
        try:
            credits = int(float(credits_raw))
        except ValueError:
            credits = 3

        semester = norm_row.get("semester") or norm_row.get("học kỳ") or norm_row.get("hoc ky") or "HK1"
        academic_year = norm_row.get("academicyear") or norm_row.get("academic_year") or norm_row.get("năm học") or norm_row.get("nam hoc") or "2026-2027"

        lecturer_email = norm_row.get("lectureremail") or norm_row.get("lecturer_email") or norm_row.get("email giảng viên") or norm_row.get("email giang vien")
        lecturer = None
        if lecturer_email:
            lecturer = db.query(User).filter(User.Email == lecturer_email.lower(), User.Role == "LECTURER").first()

        if not lecturer:
            lecturer = db.query(User).filter(User.Role == "LECTURER", User.IsActive == True).first()

        if not lecturer:
            errors.append(f"Dòng {idx} ({code}): Không tìm thấy giảng viên phụ trách hợp lệ")
            continue

        existing = db.query(Course).filter(Course.CourseCode == code).first()
        if existing:
            existing.Title = title
            existing.Description = desc
            existing.Credits = credits
            existing.LecturerId = lecturer.UserId
            existing.Semester = semester
            existing.AcademicYear = academic_year
            updated += 1
        else:
            new_course = Course(
                CourseId=uuid.uuid4(),
                CourseCode=code,
                Title=title,
                Description=desc,
                Credits=credits,
                LecturerId=lecturer.UserId,
                Semester=semester,
                AcademicYear=academic_year,
                Status="ACTIVE"
            )
            db.add(new_course)
            created += 1

    db.commit()
    return {
        "success": True,
        "totalProcessed": total,
        "createdCount": created,
        "updatedCount": updated,
        "errorCount": len(errors),
        "errors": errors[:10]
    }
