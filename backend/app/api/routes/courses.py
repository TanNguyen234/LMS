import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import Field, field_validator
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_course_or_404,
    get_current_user,
    require_admin,
    require_student,
    verify_course_read_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import (
    AcademicSemester,
    Assignment,
    Course,
    Enrollment,
    Grade,
    Lesson,
    Module,
    Quiz,
    QuizAttempt,
    Submission,
    User,
    utcnow,
)
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.schemas import (
    CourseBulkImportError,
    CourseBulkImportRequest,
    CourseBulkImportResponse,
    CourseCatalogItemResponse,
    CourseCloneRequest,
    CourseCreate,
    CourseResponse,
    CourseStatusUpdate,
    CourseUpdate,
    EnrollmentCreate,
    EnrollmentResponse,
    EnrollmentSettingsUpdate,
    JoinByCodeRequest,
)
from backend.app.services.grading import sync_enrollment_final_score
from backend.app.services.schedule_conflicts import find_student_enrollment_schedule_conflicts
from backend.app.services.semester_lifecycle import compute_archive_after_date

router = APIRouter(prefix="/courses", tags=["Courses & Enrollments"])


class CourseEnrollmentSettingsUpdate(EnrollmentSettingsUpdate):
    """Local superset adding optional category updates to EnrollmentSettingsUpdate."""

    category: Optional[str] = Field(default=None, max_length=100)

    @field_validator("category")
    @classmethod
    def normalize_category(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned or None


def _load_lecturer_names(courses: List[Course], db: Session) -> Dict[uuid.UUID, str]:
    lecturer_ids = {c.LecturerId for c in courses if c.LecturerId is not None}
    if not lecturer_ids:
        return {}
    rows = db.query(User.UserId, User.FullName).filter(User.UserId.in_(lecturer_ids)).all()
    return {uid: name for uid, name in rows}


def _load_semester_map(courses: List[Course], db: Session) -> Dict[uuid.UUID, AcademicSemester]:
    sem_ids = {c.SemesterId for c in courses if c.SemesterId is not None}
    if not sem_ids:
        return {}
    rows = db.query(AcademicSemester).filter(AcademicSemester.SemesterId.in_(sem_ids)).all()
    return {s.SemesterId: s for s in rows}


def _resolve_course_semester(
    db: Session,
    semester_id: Optional[uuid.UUID],
    semester: str,
    academic_year: str,
) -> tuple[Optional[AcademicSemester], str, str]:
    if semester_id is not None:
        sem_obj = db.query(AcademicSemester).filter(AcademicSemester.SemesterId == semester_id).first()
        if not sem_obj:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic semester not found")
        return sem_obj, sem_obj.Semester, sem_obj.AcademicYear

    sem_clean = semester.strip()
    year_clean = academic_year.strip()
    matched = (
        db.query(AcademicSemester)
        .filter(
            AcademicSemester.Semester == sem_clean,
            AcademicSemester.AcademicYear == year_clean,
        )
        .first()
    )
    return matched, sem_clean, year_clean


def _format_enrollment_response(enrollment: Enrollment, student: Optional[User]) -> EnrollmentResponse:
    return EnrollmentResponse(
        enrollmentId=enrollment.EnrollmentId,
        courseId=enrollment.CourseId,
        studentId=enrollment.StudentId,
        enrolledAt=enrollment.EnrolledAt,
        status=enrollment.Status,
        finalScore=float(enrollment.FinalScore) if enrollment.FinalScore is not None else None,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None,
        studentEmail=student.Email if student else None,
    )


def format_course_response(
    course: Course,
    db: Session,
    lecturer_map: Optional[Dict[uuid.UUID, str]] = None,
    semester_map: Optional[Dict[uuid.UUID, AcademicSemester]] = None,
    mask_join_code: bool = False,
) -> CourseResponse:
    if lecturer_map is not None:
        lecturer_name = lecturer_map.get(course.LecturerId, "Unknown")
    else:
        lecturer = db.query(User.FullName).filter(User.UserId == course.LecturerId).first()
        lecturer_name = lecturer[0] if lecturer else "Unknown"

    sem_obj: Optional[AcademicSemester] = None
    if course.SemesterId is not None:
        if semester_map is not None:
            sem_obj = semester_map.get(course.SemesterId)
        else:
            sem_obj = db.query(AcademicSemester).filter(AcademicSemester.SemesterId == course.SemesterId).first()

    return CourseResponse(
        courseId=course.CourseId,
        courseCode=course.CourseCode,
        sectionCode=course.SectionCode or "",
        title=course.Title,
        description=course.Description,
        lecturerId=course.LecturerId,
        semesterId=course.SemesterId,
        semester=course.Semester,
        academicYear=course.AcademicYear,
        credits=course.Credits,
        status=course.Status,
        joinCode=None if mask_join_code else course.JoinCode,
        allowSelfEnroll=bool(course.AllowSelfEnroll),
        maxStudents=course.MaxStudents,
        category=course.Category,
        createdAt=course.CreatedAt,
        lecturerName=lecturer_name,
        semesterName=sem_obj.Name if sem_obj else None,
        semesterStatus=sem_obj.Status if sem_obj else None,
        semesterEndDate=sem_obj.EndDate if sem_obj else None,
        archiveAfterDate=compute_archive_after_date(sem_obj) if sem_obj else None,
    )


def _active_enrollment_count(course_id: uuid.UUID, db: Session) -> int:
    return (
        db.query(func.count(Enrollment.EnrollmentId))
        .filter(Enrollment.CourseId == course_id, Enrollment.Status == "ACTIVE")
        .scalar()
        or 0
    )


def _self_enroll_student(course: Course, student: User, db: Session) -> EnrollmentResponse:
    if not student.IsActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student account is inactive",
        )
    if course.Status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course is not active for enrollment",
        )

    # Lock course row while inspecting capacity to prevent concurrent over-enrollment.
    locked_course = (
        db.query(Course)
        .filter(Course.CourseId == course.CourseId)
        .with_for_update()
        .first()
    )
    if not locked_course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course not found")

    existing = (
        db.query(Enrollment)
        .filter(
            Enrollment.CourseId == locked_course.CourseId,
            Enrollment.StudentId == student.UserId,
        )
        .first()
    )
    if existing:
        if existing.Status == "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already actively enrolled in this course",
            )
        if existing.Status == "COMPLETED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course has already been completed by student",
            )

    if locked_course.MaxStudents is not None:
        active_count = _active_enrollment_count(locked_course.CourseId, db)
        if active_count >= locked_course.MaxStudents:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Course has reached maximum student capacity",
            )

    schedule_conflict = find_student_enrollment_schedule_conflicts(
        db, student.UserId, locked_course.CourseId
    )
    if schedule_conflict:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=schedule_conflict,
        )

    try:
        if existing:
            existing.Status = "ACTIVE"
            existing.EnrolledAt = utcnow()
            existing.FinalScore = None
            target = existing
        else:
            target = Enrollment(
                EnrollmentId=uuid.uuid4(),
                CourseId=locked_course.CourseId,
                StudentId=student.UserId,
                EnrolledAt=utcnow(),
                Status="ACTIVE",
                FinalScore=None,
            )
            db.add(target)
        db.commit()
        db.refresh(target)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Could not complete enrollment due to a concurrent conflict",
        )

    return _format_enrollment_response(target, student)


@router.get("", response_model=List[CourseResponse])
def get_courses(
    status_filter: Optional[str] = Query(None, alias="status"),
    lecturer_id: Optional[uuid.UUID] = Query(None, alias="lecturerId"),
    semester_id: Optional[uuid.UUID] = Query(None, alias="semesterId"),
    semester: Optional[str] = Query(None),
    academic_year: Optional[str] = Query(None, alias="academicYear"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    List courses visible to current user based on role:
    - Admin: all courses
    - Lecturer: courses taught by lecturer
    - Student: ACTIVE/COMPLETED enrollments in ACTIVE/ARCHIVED courses
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
                Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
                Course.Status.in_(["ACTIVE", "ARCHIVED"]),
            )
        )
    else:
        return []

    if status_filter is not None:
        normalized_status = status_filter.strip().upper()
        if normalized_status not in {"DRAFT", "ACTIVE", "ARCHIVED"}:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid course status filter")
        if current_user.Role == "STUDENT" and normalized_status == "DRAFT":
            return []
        query = query.filter(Course.Status == normalized_status)

    if semester_id is not None:
        query = query.filter(Course.SemesterId == semester_id)
    if semester is not None and semester.strip():
        query = query.filter(Course.Semester == semester.strip())
    if academic_year is not None and academic_year.strip():
        query = query.filter(Course.AcademicYear == academic_year.strip())

    courses = query.order_by(Course.CreatedAt.desc(), Course.CourseCode.asc(), Course.SectionCode.asc()).all()
    lecturer_map = _load_lecturer_names(courses, db)
    semester_map = _load_semester_map(courses, db)
    mask_code = current_user.Role == "STUDENT"
    return [
        format_course_response(c, db, lecturer_map=lecturer_map, semester_map=semester_map, mask_join_code=mask_code)
        for c in courses
    ]


@router.get("/catalog", response_model=List[CourseCatalogItemResponse])
def get_course_catalog(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    semester: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Discover ACTIVE courses with live enrollment counts and current user's enrollment state."""
    query = db.query(Course).filter(Course.Status == "ACTIVE")
    if semester is not None and semester.strip():
        query = query.filter(Course.Semester == semester.strip())
    if category is not None and category.strip():
        query = query.filter(Course.Category == category.strip())

    courses = query.order_by(Course.CreatedAt.desc(), Course.CourseCode.asc(), Course.SectionCode.asc()).all()
    if search is not None and search.strip():
        needle = search.strip().lower()
        courses = [
            c for c in courses
            if needle in (c.CourseCode or "").lower()
            or needle in (c.Title or "").lower()
            or needle in (c.Description or "").lower()
            or needle in (c.Category or "").lower()
        ]

    if not courses:
        return []

    course_ids = [c.CourseId for c in courses]
    lecturer_map = _load_lecturer_names(courses, db)
    semester_map = _load_semester_map(courses, db)

    count_rows = (
        db.query(Enrollment.CourseId, func.count(Enrollment.EnrollmentId))
        .filter(Enrollment.CourseId.in_(course_ids), Enrollment.Status == "ACTIVE")
        .group_by(Enrollment.CourseId)
        .all()
    )
    count_map = {cid: int(cnt or 0) for cid, cnt in count_rows}

    my_enroll_map: Dict[uuid.UUID, str] = {}
    if current_user.Role == "STUDENT":
        my_rows = (
            db.query(Enrollment.CourseId, Enrollment.Status)
            .filter(
                Enrollment.CourseId.in_(course_ids),
                Enrollment.StudentId == current_user.UserId,
            )
            .all()
        )
        my_enroll_map = {cid: st for cid, st in my_rows}

    mask_code = current_user.Role == "STUDENT"
    results: List[CourseCatalogItemResponse] = []
    for c in courses:
        enr_status = my_enroll_map.get(c.CourseId)
        base = format_course_response(
            c, db, lecturer_map=lecturer_map, semester_map=semester_map, mask_join_code=mask_code
        )
        results.append(
            CourseCatalogItemResponse(
                **base.model_dump(),
                enrolledCount=count_map.get(c.CourseId, 0),
                isEnrolled=enr_status in ("ACTIVE", "COMPLETED"),
                enrollmentStatus=enr_status,
            )
        )
    return results


@router.post("/join-by-code", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
def join_course_by_code(
    body: JoinByCodeRequest,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Self-enroll into an ACTIVE course using its JoinCode."""
    course = (
        db.query(Course)
        .filter(Course.JoinCode == body.joinCode)
        .first()
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code")
    return _self_enroll_student(course, student, db)


@router.get("/{course_id}", response_model=CourseResponse)
def get_course_detail(
    course: Course = Depends(verify_course_read_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single course detail (authorized read access)."""
    return format_course_response(course, db, mask_join_code=(current_user.Role == "STUDENT"))


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
def create_course(
    course_in: CourseCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new course/class section (Admin only). Uniqueness is scoped by (CourseCode, SectionCode, Semester, AcademicYear)."""
    code_clean = course_in.courseCode.strip().upper()
    section_clean = (course_in.sectionCode or "").strip().upper()
    sem_obj, sem_str, year_str = _resolve_course_semester(
        db, course_in.semesterId, course_in.semester, course_in.academicYear
    )

    existing = (
        db.query(Course)
        .filter(
            Course.CourseCode == code_clean,
            Course.Semester == sem_str,
            Course.AcademicYear == year_str,
            Course.SectionCode == section_clean,
        )
        .first()
    )
    if existing:
        sec_label = f" (nhóm {section_clean})" if section_clean else ""
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Lớp học phần '{code_clean}'{sec_label} đã tồn tại trong {sem_str} {year_str}",
        )

    if course_in.joinCode is not None:
        dup_join = db.query(Course).filter(Course.JoinCode == course_in.joinCode).first()
        if dup_join:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"JoinCode '{course_in.joinCode}' is already in use",
            )

    lecturer = db.query(User).filter(User.UserId == course_in.lecturerId).first()
    if not lecturer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lecturer not found")
    if lecturer.Role != "LECTURER":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User {lecturer.Email} is not a LECTURER",
        )
    if not lecturer.IsActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned lecturer is currently inactive",
        )

    new_course = Course(
        CourseId=uuid.uuid4(),
        CourseCode=code_clean,
        SectionCode=section_clean,
        Title=course_in.title.strip(),
        Description=course_in.description.strip() if course_in.description else None,
        LecturerId=course_in.lecturerId,
        SemesterId=sem_obj.SemesterId if sem_obj else None,
        Semester=sem_str,
        AcademicYear=year_str,
        Credits=course_in.credits,
        Status=course_in.status.upper(),
        JoinCode=course_in.joinCode,
        AllowSelfEnroll=bool(course_in.allowSelfEnroll),
        MaxStudents=course_in.maxStudents,
        Category=course_in.category.strip() if course_in.category and course_in.category.strip() else None,
    )
    try:
        db.add(new_course)
        db.commit()
        db.refresh(new_course)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course section or JoinCode conflicts with an existing course",
        )

    return format_course_response(new_course, db)


@router.post("/bulk-import", response_model=CourseBulkImportResponse)
def bulk_import_courses(
    payload: CourseBulkImportRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Bulk-create courses in a target semester, matching lecturers by StaffCode or Email."""
    sem_obj = (
        db.query(AcademicSemester)
        .filter(AcademicSemester.SemesterId == payload.semesterId)
        .first()
    )
    if not sem_obj:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target semester not found")

    lecturers = (
        db.query(User)
        .filter(User.Role == "LECTURER", User.IsActive == True)  # noqa: E712
        .all()
    )
    by_email = {u.Email.strip().lower(): u for u in lecturers if u.Email}
    by_staff = {u.StaffCode.strip().upper(): u for u in lecturers if u.StaffCode}

    existing_keys = {
        (c.CourseCode.upper(), (c.SectionCode or "").upper())
        for c in db.query(Course)
        .filter(Course.Semester == sem_obj.Semester, Course.AcademicYear == sem_obj.AcademicYear)
        .all()
    }
    existing_join_codes = {
        jc.upper()
        for (jc,) in db.query(Course.JoinCode).filter(Course.JoinCode.isnot(None)).all()
        if jc
    }

    created: List[Course] = []
    errors: List[CourseBulkImportError] = []

    for idx, row in enumerate(payload.rows, start=1):
        code_clean = row.courseCode.strip().upper()
        section_clean = (row.sectionCode or "").strip().upper()
        ident = row.lecturerIdentifier.strip()
        lecturer = by_staff.get(ident.upper()) or by_email.get(ident.lower())
        if not lecturer:
            errors.append(
                CourseBulkImportError(
                    row=idx,
                    courseCode=code_clean,
                    message=f"Không tìm thấy giảng viên hoạt động với mã/email '{ident}'",
                )
            )
            continue

        if (code_clean, section_clean) in existing_keys:
            errors.append(
                CourseBulkImportError(
                    row=idx,
                    courseCode=code_clean,
                    message=f"Lớp '{code_clean}' nhóm '{section_clean or '-'}' đã tồn tại trong kỳ {sem_obj.Name}",
                )
            )
            continue

        join_clean = row.joinCode.strip().upper() if row.joinCode and row.joinCode.strip() else None
        if join_clean and join_clean in existing_join_codes:
            errors.append(
                CourseBulkImportError(
                    row=idx,
                    courseCode=code_clean,
                    message=f"Mã lớp tự tham gia '{join_clean}' đã được sử dụng",
                )
            )
            continue

        new_course = Course(
            CourseId=uuid.uuid4(),
            CourseCode=code_clean,
            SectionCode=section_clean,
            Title=row.title.strip(),
            Description=row.description.strip() if row.description else None,
            LecturerId=lecturer.UserId,
            SemesterId=sem_obj.SemesterId,
            Semester=sem_obj.Semester,
            AcademicYear=sem_obj.AcademicYear,
            Credits=row.credits,
            Status=row.status.upper(),
            JoinCode=join_clean,
            AllowSelfEnroll=bool(row.allowSelfEnroll),
            MaxStudents=row.maxStudents,
            Category=row.category.strip() if row.category and row.category.strip() else None,
        )
        db.add(new_course)
        created.append(new_course)
        existing_keys.add((code_clean, section_clean))
        if join_clean:
            existing_join_codes.add(join_clean)

    if created:
        db.commit()
        for c in created:
            db.refresh(c)

    lecturer_map = _load_lecturer_names(created, db)
    semester_map = {sem_obj.SemesterId: sem_obj}
    return CourseBulkImportResponse(
        createdCount=len(created),
        createdCourses=[
            format_course_response(c, db, lecturer_map=lecturer_map, semester_map=semester_map)
            for c in created
        ],
        errors=errors,
    )


@router.post("/clone-to-semester", response_model=CourseBulkImportResponse)
def clone_courses_to_semester(
    payload: CourseCloneRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Clone selected courses (and optionally module/lesson syllabus) into a target semester."""
    target_sem = (
        db.query(AcademicSemester)
        .filter(AcademicSemester.SemesterId == payload.targetSemesterId)
        .first()
    )
    if not target_sem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target semester not found")

    sources = db.query(Course).filter(Course.CourseId.in_(payload.sourceCourseIds)).all()
    if not sources:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No source courses found")

    existing_keys = {
        (c.CourseCode.upper(), (c.SectionCode or "").upper())
        for c in db.query(Course)
        .filter(Course.Semester == target_sem.Semester, Course.AcademicYear == target_sem.AcademicYear)
        .all()
    }

    created: List[Course] = []
    errors: List[CourseBulkImportError] = []

    for idx, src in enumerate(sources, start=1):
        code_clean = src.CourseCode.strip().upper()
        section_clean = (src.SectionCode or "").strip().upper()
        if (code_clean, section_clean) in existing_keys:
            errors.append(
                CourseBulkImportError(
                    row=idx,
                    courseCode=code_clean,
                    message=f"Lớp '{code_clean}' nhóm '{section_clean or '-'}' đã tồn tại ở kỳ đích",
                )
            )
            continue

        cloned = Course(
            CourseId=uuid.uuid4(),
            CourseCode=code_clean,
            SectionCode=section_clean,
            Title=src.Title,
            Description=src.Description,
            LecturerId=src.LecturerId,
            SemesterId=target_sem.SemesterId,
            Semester=target_sem.Semester,
            AcademicYear=target_sem.AcademicYear,
            Credits=src.Credits,
            Status=payload.defaultStatus,
            JoinCode=None,
            AllowSelfEnroll=bool(src.AllowSelfEnroll),
            MaxStudents=src.MaxStudents,
            Category=src.Category,
        )
        db.add(cloned)
        db.flush()

        if payload.copyModulesAndLessons:
            src_modules = (
                db.query(Module)
                .filter(Module.CourseId == src.CourseId)
                .order_by(Module.SortOrder.asc())
                .all()
            )
            for mod in src_modules:
                cloned_mod = Module(
                    ModuleId=uuid.uuid4(),
                    CourseId=cloned.CourseId,
                    Title=mod.Title,
                    SortOrder=mod.SortOrder,
                    Description=mod.Description,
                    IsPublished=mod.IsPublished,
                )
                db.add(cloned_mod)
                db.flush()

                src_lessons = (
                    db.query(Lesson)
                    .filter(Lesson.ModuleId == mod.ModuleId)
                    .order_by(Lesson.SortOrder.asc())
                    .all()
                )
                for les in src_lessons:
                    db.add(
                        Lesson(
                            LessonId=uuid.uuid4(),
                            ModuleId=cloned_mod.ModuleId,
                            Title=les.Title,
                            ContentHtml=les.ContentHtml,
                            MaterialUrl=les.MaterialUrl,
                            ContentType=les.ContentType,
                            AttachmentFileId=les.AttachmentFileId,
                            SortOrder=les.SortOrder,
                            IsPublished=les.IsPublished,
                            EstimatedMinutes=les.EstimatedMinutes,
                        )
                    )

        created.append(cloned)
        existing_keys.add((code_clean, section_clean))

    if created:
        db.commit()
        for c in created:
            db.refresh(c)

    lecturer_map = _load_lecturer_names(created, db)
    semester_map = {target_sem.SemesterId: target_sem}
    return CourseBulkImportResponse(
        createdCount=len(created),
        createdCourses=[
            format_course_response(c, db, lecturer_map=lecturer_map, semester_map=semester_map)
            for c in created
        ],
        errors=errors,
    )


@router.put("/{course_id}", response_model=CourseResponse)
def update_course(
    course_id: uuid.UUID,
    course_in: CourseUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update course metadata and optional enrollment fields (Admin only)."""
    c = get_course_or_404(course_id, db)
    fields = course_in.model_fields_set

    if course_in.title is not None:
        c.Title = course_in.title.strip()
    if "description" in fields:
        c.Description = course_in.description.strip() if course_in.description else None
    if course_in.sectionCode is not None:
        c.SectionCode = course_in.sectionCode.strip().upper()
    if course_in.semesterId is not None or course_in.semester is not None or course_in.academicYear is not None:
        sem_obj, sem_str, year_str = _resolve_course_semester(
            db,
            course_in.semesterId if "semesterId" in fields else c.SemesterId,
            course_in.semester if course_in.semester is not None else c.Semester,
            course_in.academicYear if course_in.academicYear is not None else c.AcademicYear,
        )
        c.Semester = sem_str
        c.AcademicYear = year_str
        c.SemesterId = sem_obj.SemesterId if sem_obj else None

    dup_term = (
        db.query(Course)
        .filter(
            Course.CourseId != course_id,
            Course.CourseCode == c.CourseCode,
            Course.Semester == c.Semester,
            Course.AcademicYear == c.AcademicYear,
            Course.SectionCode == (c.SectionCode or ""),
        )
        .first()
    )
    if dup_term:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="CourseCode and SectionCode already exist in this semester",
        )
    if course_in.credits is not None:
        c.Credits = course_in.credits
    if course_in.status is not None:
        if course_in.status not in ["DRAFT", "ACTIVE", "ARCHIVED"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
        c.Status = course_in.status.upper()
    if course_in.lecturerId is not None:
        lecturer = db.query(User).filter(User.UserId == course_in.lecturerId).first()
        if not lecturer or lecturer.Role != "LECTURER" or not lecturer.IsActive:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or inactive lecturer")
        c.LecturerId = course_in.lecturerId
    if "allowSelfEnroll" in fields and course_in.allowSelfEnroll is not None:
        c.AllowSelfEnroll = bool(course_in.allowSelfEnroll)
    if "joinCode" in fields:
        if course_in.joinCode is not None:
            dup = (
                db.query(Course)
                .filter(Course.JoinCode == course_in.joinCode, Course.CourseId != course_id)
                .first()
            )
            if dup:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="JoinCode is already in use")
        c.JoinCode = course_in.joinCode
    if "maxStudents" in fields:
        if course_in.maxStudents is not None:
            active_count = _active_enrollment_count(course_id, db)
            if course_in.maxStudents < active_count:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"maxStudents ({course_in.maxStudents}) cannot be less than active enrollments ({active_count})",
                )
        c.MaxStudents = course_in.maxStudents
    if "category" in fields:
        c.Category = course_in.category.strip() if course_in.category and course_in.category.strip() else None

    try:
        db.commit()
        db.refresh(c)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Course update conflicts with existing constraints")
    return format_course_response(c, db)


@router.patch("/{course_id}/status", response_model=MessageResponse)
def toggle_course_status(
    course_id: uuid.UUID,
    status_in: CourseStatusUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Toggle course status (Admin only)."""
    c = get_course_or_404(course_id, db)
    if status_in.status not in ["DRAFT", "ACTIVE", "ARCHIVED"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid status")
    c.Status = status_in.status.upper()
    db.commit()
    return MessageResponse(message=f"Course {c.CourseCode} status updated to {c.Status}")


@router.patch("/{course_id}/enrollment-settings", response_model=CourseResponse)
def update_enrollment_settings(
    course_id: uuid.UUID,
    settings_in: CourseEnrollmentSettingsUpdate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Configure self-enrollment, JoinCode, safe MaxStudents cap, and Category."""
    if settings_in.maxStudents is not None:
        active_count = _active_enrollment_count(course_id, db)
        if settings_in.maxStudents < active_count:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"maxStudents ({settings_in.maxStudents}) cannot be below active student count ({active_count})",
            )

    if settings_in.joinCode is not None:
        dup = (
            db.query(Course)
            .filter(Course.JoinCode == settings_in.joinCode, Course.CourseId != course_id)
            .first()
        )
        if dup:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"JoinCode '{settings_in.joinCode}' is already in use",
            )

    course.AllowSelfEnroll = bool(settings_in.allowSelfEnroll)
    course.JoinCode = settings_in.joinCode
    course.MaxStudents = settings_in.maxStudents
    if "category" in settings_in.model_fields_set:
        course.Category = settings_in.category

    try:
        db.commit()
        db.refresh(course)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Enrollment settings conflict with existing constraints",
        )
    return format_course_response(course, db)


@router.post("/{course_id}/self-enroll", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
def self_enroll_course(
    course_id: uuid.UUID,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Open self-enrollment for ACTIVE courses with AllowSelfEnroll=True."""
    course = get_course_or_404(course_id, db)
    if not course.AllowSelfEnroll:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Course does not allow open self-enrollment",
        )
    return _self_enroll_student(course, student, db)


@router.delete("/{course_id}/self-enroll", response_model=MessageResponse)
def self_drop_course(
    course_id: uuid.UUID,
    student: User = Depends(require_student),
    db: Session = Depends(get_db),
):
    """Allow student to withdraw from an ACTIVE course only before any submission, quiz attempt, or grade."""
    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == student.UserId,
        )
        .first()
    )
    if not enrollment or enrollment.Status == "DROPPED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Active enrollment not found")
    if enrollment.Status == "COMPLETED":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot drop a completed course")

    has_submission = (
        db.query(Submission.SubmissionId)
        .join(Assignment, Assignment.AssignmentId == Submission.AssignmentId)
        .filter(Assignment.CourseId == course_id, Submission.StudentId == student.UserId)
        .first()
        is not None
    )
    has_attempt = (
        db.query(QuizAttempt.AttemptId)
        .join(Quiz, Quiz.QuizId == QuizAttempt.QuizId)
        .filter(Quiz.CourseId == course_id, QuizAttempt.StudentId == student.UserId)
        .first()
        is not None
    )
    has_grade = (
        db.query(Grade.GradeId)
        .filter(Grade.CourseId == course_id, Grade.StudentId == student.UserId)
        .first()
        is not None
    )
    if has_submission or has_attempt or has_grade:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot withdraw after submitting assignments, attempting quizzes, or receiving grades",
        )

    enrollment.Status = "DROPPED"
    db.commit()
    return MessageResponse(message="Successfully dropped from course")


# ==========================================
# ENROLLMENTS
# ==========================================


@router.get("/{course_id}/enrollments", response_model=List[EnrollmentResponse])
def get_course_enrollments(
    course_id: uuid.UUID,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """List ACTIVE and COMPLETED enrollments of a course (Admin or course Lecturer)."""
    enrollments = (
        db.query(Enrollment)
        .filter(Enrollment.CourseId == course_id, Enrollment.Status.in_(["ACTIVE", "COMPLETED"]))
        .order_by(Enrollment.EnrolledAt.asc())
        .all()
    )
    if not enrollments:
        return []
    student_ids = {e.StudentId for e in enrollments}
    students = db.query(User).filter(User.UserId.in_(student_ids)).all()
    student_map = {u.UserId: u for u in students}
    return [_format_enrollment_response(e, student_map.get(e.StudentId)) for e in enrollments]


@router.post("/{course_id}/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
def enroll_student(
    course_id: uuid.UUID,
    enroll_in: EnrollmentCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Enroll student into course (Admin only). Blocks inactive users and ARCHIVED courses."""
    course = get_course_or_404(course_id, db)
    if course.Status == "ARCHIVED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot enroll students into an ARCHIVED course",
        )

    student = db.query(User).filter(User.UserId == enroll_in.studentId).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    if student.Role != "STUDENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Target user is not a STUDENT")
    if not student.IsActive:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Target student account is inactive",
        )

    existing = (
        db.query(Enrollment)
        .filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == enroll_in.studentId,
        )
        .first()
    )
    if existing:
        if existing.Status == "ACTIVE":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student is already actively enrolled in this course",
            )
        if existing.Status == "COMPLETED":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Student has already completed this course",
            )

    if course.MaxStudents is not None and _active_enrollment_count(course_id, db) >= course.MaxStudents:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Course has reached maximum student capacity",
        )

    try:
        if existing:
            existing.Status = "ACTIVE"
            existing.EnrolledAt = utcnow()
            existing.FinalScore = None
            target = existing
        else:
            target = Enrollment(
                EnrollmentId=uuid.uuid4(),
                CourseId=course_id,
                StudentId=enroll_in.studentId,
                EnrolledAt=utcnow(),
                Status="ACTIVE",
                FinalScore=None,
            )
            db.add(target)
        db.commit()
        db.refresh(target)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Student enrollment conflict",
        )

    return _format_enrollment_response(target, student)


@router.patch("/{course_id}/enrollments/{student_id}/complete", response_model=EnrollmentResponse)
def complete_student_enrollment(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Mark a student's enrollment COMPLETED and synchronize their FinalScore."""
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.CourseId == course_id, Enrollment.StudentId == student_id)
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
    if enrollment.Status == "DROPPED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot complete a DROPPED enrollment",
        )

    sync_enrollment_final_score(db, course_id, student_id)
    enrollment.Status = "COMPLETED"
    db.commit()
    db.refresh(enrollment)

    student = db.query(User).filter(User.UserId == student_id).first()
    return _format_enrollment_response(enrollment, student)


@router.delete("/{course_id}/enrollments/{student_id}", response_model=MessageResponse)
def remove_enrollment(
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Drop student enrollment (Admin only)."""
    enrollment = (
        db.query(Enrollment)
        .filter(
            Enrollment.CourseId == course_id,
            Enrollment.StudentId == student_id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found")
    enrollment.Status = "DROPPED"
    db.commit()
    return MessageResponse(message="Enrollment status updated to DROPPED")
