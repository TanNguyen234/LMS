"""Academic semester lifecycle management and automatic term-end archiving."""
from datetime import datetime, timedelta, timezone
from typing import Dict, Optional
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from backend.app.models.models import AcademicSemester, Course, utcnow

SEED_CURRENT_SEMESTER_ID = uuid.UUID("90000000-0000-0000-0000-000000000001")
SEED_PAST_SEMESTER_ID = uuid.UUID("90000000-0000-0000-0000-000000000002")


def _naive_utc(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def compute_archive_after_date(semester: AcademicSemester) -> datetime:
    return _naive_utc(semester.EndDate) + timedelta(days=int(semester.GraceDays or 0))


def archive_semester_courses(db: Session, semester: AcademicSemester) -> int:
    """Move all ACTIVE and DRAFT courses belonging to the given semester into ARCHIVED (read-only) without deleting data."""
    courses = (
        db.query(Course)
        .filter(
            Course.Status.in_(["ACTIVE", "DRAFT"]),
            or_(
                Course.SemesterId == semester.SemesterId,
                (Course.SemesterId.is_(None))
                & (Course.Semester == semester.Semester)
                & (Course.AcademicYear == semester.AcademicYear),
            ),
        )
        .all()
    )
    archived = 0
    for course in courses:
        if course.SemesterId is None:
            course.SemesterId = semester.SemesterId
        course.Status = "ARCHIVED"
        archived += 1
    return archived


def sync_expired_semesters_and_courses(
    db: Session,
    now: Optional[datetime] = None,
) -> Dict[str, int]:
    """
    Auto-archive semesters (and their ACTIVE courses) once EndDate + GraceDays has passed.
    Also activates UPCOMING semesters whose StartDate has arrived (before expiration).
    """
    ref_now = _naive_utc(now or utcnow())
    archived_semesters = 0
    archived_courses = 0
    activated_semesters = 0
    dirty = False

    semesters = db.query(AcademicSemester).all()
    for sem in semesters:
        start_dt = _naive_utc(sem.StartDate)
        archive_after = compute_archive_after_date(sem)

        if sem.AutoArchiveOnExpire and sem.Status != "ARCHIVED" and ref_now > archive_after:
            sem.Status = "ARCHIVED"
            sem.IsCurrent = False
            archived_semesters += 1
            archived_courses += archive_semester_courses(db, sem)
            dirty = True
        elif sem.Status == "UPCOMING" and start_dt <= ref_now <= archive_after:
            sem.Status = "ACTIVE"
            activated_semesters += 1
            dirty = True

    if dirty:
        db.commit()

    return {
        "archivedSemesters": archived_semesters,
        "archivedCourses": archived_courses,
        "activatedSemesters": activated_semesters,
    }


def link_unassigned_courses_to_semesters(db: Session) -> int:
    """Backfill Course.SemesterId for legacy courses matching an AcademicSemester by (Semester, AcademicYear)."""
    semesters = db.query(AcademicSemester).all()
    by_term = {(s.Semester.upper(), s.AcademicYear): s for s in semesters}
    unlinked = db.query(Course).filter(Course.SemesterId.is_(None)).all()
    linked = 0
    for course in unlinked:
        matched = by_term.get(((course.Semester or "").strip().upper(), (course.AcademicYear or "").strip()))
        if matched:
            course.SemesterId = matched.SemesterId
            linked += 1
    if linked:
        db.commit()
    return linked


def ensure_seed_semesters(db: Session, now: Optional[datetime] = None) -> None:
    """Idempotently seed baseline current and past semesters and link existing courses."""
    ref_now = _naive_utc(now or utcnow()).replace(microsecond=0)

    current = (
        db.query(AcademicSemester)
        .filter(
            or_(
                AcademicSemester.SemesterId == SEED_CURRENT_SEMESTER_ID,
                AcademicSemester.Code == "2026-2027-HK1",
            )
        )
        .first()
    )
    if current is None:
        has_any_current = db.query(AcademicSemester).filter(AcademicSemester.IsCurrent == True).first() is not None  # noqa: E712
        current = AcademicSemester(
            SemesterId=SEED_CURRENT_SEMESTER_ID,
            Code="2026-2027-HK1",
            Name="Học kỳ 1 (2026-2027)",
            Semester="HK1",
            AcademicYear="2026-2027",
            StartDate=ref_now - timedelta(days=60),
            EndDate=ref_now + timedelta(days=90),
            GraceDays=14,
            Status="ACTIVE",
            IsCurrent=not has_any_current,
            AutoArchiveOnExpire=True,
            CreatedAt=ref_now,
        )
        db.add(current)

    past = (
        db.query(AcademicSemester)
        .filter(
            or_(
                AcademicSemester.SemesterId == SEED_PAST_SEMESTER_ID,
                AcademicSemester.Code == "2025-2026-HK2",
            )
        )
        .first()
    )
    if past is None:
        past = AcademicSemester(
            SemesterId=SEED_PAST_SEMESTER_ID,
            Code="2025-2026-HK2",
            Name="Học kỳ 2 (2025-2026)",
            Semester="HK2",
            AcademicYear="2025-2026",
            StartDate=ref_now - timedelta(days=240),
            EndDate=ref_now - timedelta(days=90),
            GraceDays=14,
            Status="ARCHIVED",
            IsCurrent=False,
            AutoArchiveOnExpire=True,
            CreatedAt=ref_now - timedelta(days=240),
        )
        db.add(past)

    db.commit()
    link_unassigned_courses_to_semesters(db)
