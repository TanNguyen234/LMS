"""Academic Semesters CRUD & term-expiration archiving routes."""
from typing import Dict, List, Tuple
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import get_current_user, require_admin
from backend.app.db.session import get_db
from backend.app.models.models import AcademicSemester, Course, User
from backend.app.schemas.schemas import (
    AcademicSemesterCreate,
    AcademicSemesterResponse,
    AcademicSemesterUpdate,
    SemesterSyncResponse,
)
from backend.app.services.semester_lifecycle import (
    _naive_utc,
    archive_semester_courses,
    compute_archive_after_date,
    link_unassigned_courses_to_semesters,
    sync_expired_semesters_and_courses,
)

router = APIRouter(prefix="/semesters", tags=["Academic Semesters"])


def _course_counts_by_semester(db: Session) -> Dict[uuid.UUID, Tuple[int, int, int]]:
    rows = (
        db.query(Course.SemesterId, Course.Status, func.count(Course.CourseId))
        .filter(Course.SemesterId.isnot(None))
        .group_by(Course.SemesterId, Course.Status)
        .all()
    )
    counts: Dict[uuid.UUID, List[int]] = {}
    for sem_id, c_status, cnt in rows:
        bucket = counts.setdefault(sem_id, [0, 0, 0])
        n = int(cnt or 0)
        bucket[0] += n
        if c_status == "ACTIVE":
            bucket[1] += n
        elif c_status == "ARCHIVED":
            bucket[2] += n
    return {k: (v[0], v[1], v[2]) for k, v in counts.items()}


def _format_semester(
    sem: AcademicSemester,
    counts: Tuple[int, int, int] = (0, 0, 0),
) -> AcademicSemesterResponse:
    total, active, archived = counts
    return AcademicSemesterResponse(
        semesterId=sem.SemesterId,
        code=sem.Code,
        name=sem.Name,
        semester=sem.Semester,
        academicYear=sem.AcademicYear,
        startDate=sem.StartDate,
        endDate=sem.EndDate,
        graceDays=sem.GraceDays,
        status=sem.Status,
        isCurrent=bool(sem.IsCurrent),
        autoArchiveOnExpire=bool(sem.AutoArchiveOnExpire),
        createdAt=sem.CreatedAt,
        archiveAfterDate=compute_archive_after_date(sem),
        courseCount=total,
        activeCourseCount=active,
        archivedCourseCount=archived,
    )


@router.get("", response_model=List[AcademicSemesterResponse])
def list_semesters(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all academic semesters (auto-syncing any expired terms first)."""
    sync_expired_semesters_and_courses(db)
    link_unassigned_courses_to_semesters(db)
    semesters = (
        db.query(AcademicSemester)
        .order_by(AcademicSemester.IsCurrent.desc(), AcademicSemester.StartDate.desc())
        .all()
    )
    counts_map = _course_counts_by_semester(db)
    return [_format_semester(s, counts_map.get(s.SemesterId, (0, 0, 0))) for s in semesters]


@router.post("", response_model=AcademicSemesterResponse, status_code=status.HTTP_201_CREATED)
def create_semester(
    payload: AcademicSemesterCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Create a new academic semester with explicit start/end dates and grace days (Admin only)."""
    start_dt = _naive_utc(payload.startDate)
    end_dt = _naive_utc(payload.endDate)
    if end_dt <= start_dt:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="EndDate must be strictly after StartDate",
        )

    code_clean = payload.code.strip().upper()
    existing = db.query(AcademicSemester).filter(AcademicSemester.Code == code_clean).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Semester code '{code_clean}' already exists",
        )

    if payload.isCurrent:
        db.query(AcademicSemester).update({AcademicSemester.IsCurrent: False})

    sem = AcademicSemester(
        SemesterId=uuid.uuid4(),
        Code=code_clean,
        Name=payload.name.strip(),
        Semester=payload.semester.strip(),
        AcademicYear=payload.academicYear.strip(),
        StartDate=start_dt,
        EndDate=end_dt,
        GraceDays=payload.graceDays,
        Status=payload.status,
        IsCurrent=bool(payload.isCurrent),
        AutoArchiveOnExpire=bool(payload.autoArchiveOnExpire),
    )
    try:
        db.add(sem)
        db.commit()
        db.refresh(sem)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Semester conflicts with existing record",
        )

    link_unassigned_courses_to_semesters(db)
    counts = _course_counts_by_semester(db).get(sem.SemesterId, (0, 0, 0))
    return _format_semester(sem, counts)


@router.put("/{semester_id}", response_model=AcademicSemesterResponse)
def update_semester(
    semester_id: uuid.UUID,
    payload: AcademicSemesterUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Update semester dates, grace days, current flag, or reopen an archived term (Admin only)."""
    sem = db.query(AcademicSemester).filter(AcademicSemester.SemesterId == semester_id).first()
    if not sem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")

    next_start = _naive_utc(payload.startDate) if payload.startDate is not None else _naive_utc(sem.StartDate)
    next_end = _naive_utc(payload.endDate) if payload.endDate is not None else _naive_utc(sem.EndDate)
    if next_end <= next_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="EndDate must be strictly after StartDate",
        )

    if payload.name is not None:
        sem.Name = payload.name.strip()
    if payload.semester is not None:
        sem.Semester = payload.semester.strip()
    if payload.academicYear is not None:
        sem.AcademicYear = payload.academicYear.strip()
    if payload.startDate is not None:
        sem.StartDate = next_start
    if payload.endDate is not None:
        sem.EndDate = next_end
    if payload.graceDays is not None:
        sem.GraceDays = payload.graceDays
    if payload.autoArchiveOnExpire is not None:
        sem.AutoArchiveOnExpire = bool(payload.autoArchiveOnExpire)
    if payload.status is not None:
        sem.Status = payload.status
        if payload.status == "ARCHIVED":
            sem.IsCurrent = False
            archive_semester_courses(db, sem)
    if payload.isCurrent is not None:
        if payload.isCurrent:
            db.query(AcademicSemester).filter(AcademicSemester.SemesterId != semester_id).update(
                {AcademicSemester.IsCurrent: False}
            )
            sem.IsCurrent = True
        else:
            sem.IsCurrent = False

    db.commit()
    db.refresh(sem)
    counts = _course_counts_by_semester(db).get(sem.SemesterId, (0, 0, 0))
    return _format_semester(sem, counts)


@router.post("/{semester_id}/archive", response_model=AcademicSemesterResponse)
def archive_semester_now(
    semester_id: uuid.UUID,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Manually close a semester and move all its ACTIVE courses into read-only ARCHIVED state."""
    sem = db.query(AcademicSemester).filter(AcademicSemester.SemesterId == semester_id).first()
    if not sem:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Semester not found")

    sem.Status = "ARCHIVED"
    sem.IsCurrent = False
    archive_semester_courses(db, sem)
    db.commit()
    db.refresh(sem)
    counts = _course_counts_by_semester(db).get(sem.SemesterId, (0, 0, 0))
    return _format_semester(sem, counts)


@router.post("/sync-expired", response_model=SemesterSyncResponse)
def trigger_semester_sync(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Run immediate expiration check and archive expired semesters and their active courses."""
    result = sync_expired_semesters_and_courses(db)
    return SemesterSyncResponse(**result)
