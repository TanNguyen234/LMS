from datetime import datetime, timedelta, timezone
import hashlib
import logging
from pathlib import Path
import sys
from typing import Dict, Optional
import uuid

_REPO_ROOT = str(Path(__file__).resolve().parents[3])
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

import pypdf
from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.models.models import (
    Assignment,
    Course,
    CourseMessage,
    Lesson,
    LessonProgress,
    Meeting,
    MeetingLog,
    Quiz,
    StoredFile,
    WhiteboardSnapshot,
)

logger = logging.getLogger(__name__)

SEED_PDF_FILE_ID = uuid.UUID("f0000000-0000-0000-0000-000000000001")
SEED_MD_FILE_ID = uuid.UUID("f0000000-0000-0000-0000-000000000002")

LECTURER1_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
STUDENT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")
STUDENT2_ID = uuid.UUID("00000000-0000-0000-0000-000000000006")

COURSE_CS101_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
COURSE_CS202_ID = uuid.UUID("10000000-0000-0000-0000-000000000002")
COURSE_AI310_ID = uuid.UUID("10000000-0000-0000-0000-000000000006")
COURSE_WEB220_ID = uuid.UUID("10000000-0000-0000-0000-000000000007")

LESSON_CS101_ID = uuid.UUID("40000000-0000-0000-0000-000000000001")
LESSON_AI310_ID = uuid.UUID("40000000-0000-0000-0000-000000000006")
ASSIGNMENT_CS101_ID = uuid.UUID("50000000-0000-0000-0000-000000000001")
MEETING_CS101_ID = uuid.UUID("c0000000-0000-0000-0000-000000000001")
MEETING_WEB220_ID = uuid.UUID("c0000000-0000-0000-0000-000000000002")

SEED_LESSON_IDS = [uuid.UUID(f"40000000-0000-0000-0000-{i:012d}") for i in range(1, 11)]
SEED_ASSIGNMENT_IDS = [uuid.UUID(f"50000000-0000-0000-0000-{i:012d}") for i in range(1, 11)]
SEED_QUIZ_IDS = [uuid.UUID(f"70000000-0000-0000-0000-{i:012d}") for i in range(1, 11)]


def _utcnow_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)


def _vault_root(vault_dir: Optional[str] = None) -> Path:
    raw = Path(vault_dir or settings.FILE_VAULT_DIR)
    if raw.is_absolute():
        return raw
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / raw


def _build_sample_pdf_bytes() -> bytes:
    lines = [
        "University LMS - CS101 Study Handbook",
        "Course: CS101 - Introduction to Programming",
        "Module 1: Variables, Control Flow, and Modular Functions",
        "Key Concepts:",
        "1. Static vs dynamic typing: integers, floating-point numbers, booleans, strings.",
        "2. Conditional branching evaluates boolean expressions cleanly before executing branches.",
        "3. Loops iterate over bounded ranges or continue until a termination invariant holds.",
        "4. Weighted grading combines assignments, quizzes, midterm, and final scores on scale 10.",
        "5. Academic integrity: submit original code and verify edge cases before deadline.",
    ]
    stream_lines = ["BT", "/F1 12 Tf", "50 750 Td", "16 TL"]
    for idx, line in enumerate(lines):
        escaped = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        if idx == 0:
            stream_lines.append(f"({escaped}) Tj")
        else:
            stream_lines.append(f"T* ({escaped}) Tj")
    stream_lines.append("ET")
    stream_bytes = ("\n".join(stream_lines) + "\n").encode("latin-1")

    objects = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
        f"5 0 obj\n<< /Length {len(stream_bytes)} >>\nstream\n".encode("latin-1")
        + stream_bytes
        + b"endstream\nendobj\n",
    ]

    buf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for obj in objects:
        offsets.append(len(buf))
        buf.extend(obj)
    xref_pos = len(buf)
    buf.extend(f"xref\n0 {len(objects) + 1}\n".encode("latin-1"))
    buf.extend(b"0000000000 65535 f \n")
    for off in offsets[1:]:
        buf.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    buf.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1")
    )
    return bytes(buf)


def _sample_markdown_text() -> str:
    return (
        "# CS101 - Nhập môn Lập trình & Tư duy Giải thuật\n\n"
        "## 1. Mục tiêu môn học\n"
        "- Hiểu rõ khái niệm biến, kiểu dữ liệu cơ bản (`int`, `float`, `bool`, `str`), biểu thức và toán tử.\n"
        "- Nắm vững cấu trúc rẽ nhánh (`if`/`elif`/`else`) và vòng lặp (`for`/`while`) khi giải quyết bài toán.\n"
        "- Biết phân rã bài toán thành các hàm tái sử dụng, kiểm thử trường hợp biên và đánh giá độ phức tạp cơ bản.\n\n"
        "## 2. Hướng dẫn cài đặt môi trường\n"
        "1. Cài đặt Python 3.12+ và Visual Studio Code.\n"
        "2. Mở terminal kiểm tra phiên bản bằng lệnh `python --version`.\n"
        "3. Chạy chương trình đầu tiên: `print(\"Xin chao University LMS\")`.\n\n"
        "## 3. Bài tập thực hành gợi ý\n"
        "- Viết hàm kiểm tra số nguyên tố và tối ưu vòng lặp đến căn bậc hai của `n`.\n"
        "- Tính điểm trung bình có trọng số thang 10 và quy đổi GPA thang 4 cho sinh viên.\n"
    )


def ensure_sample_vault_files(vault_dir: Optional[str] = None) -> Dict[str, dict]:
    """Ensure sample PDF & Markdown seed files exist on disk and return metadata."""
    seed_dir = _vault_root(vault_dir) / "seed"
    seed_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = seed_dir / "lms_sample_handbook.pdf"
    if not pdf_path.exists():
        pdf_path.write_bytes(_build_sample_pdf_bytes())
    pdf_bytes = pdf_path.read_bytes()
    reader = pypdf.PdfReader(str(pdf_path))
    pdf_text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()

    md_path = seed_dir / "cs101_intro_guide.md"
    if not md_path.exists():
        md_path.write_text(_sample_markdown_text(), encoding="utf-8")
    md_bytes = md_path.read_bytes()
    md_text = md_path.read_text(encoding="utf-8").strip()

    return {
        "pdf": {
            "fileId": SEED_PDF_FILE_ID,
            "originalName": "lms_sample_handbook.pdf",
            "storedPath": "seed/lms_sample_handbook.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": len(pdf_bytes),
            "sha256": hashlib.sha256(pdf_bytes).hexdigest(),
            "extractedText": pdf_text[:50000],
        },
        "md": {
            "fileId": SEED_MD_FILE_ID,
            "originalName": "cs101_intro_guide.md",
            "storedPath": "seed/cs101_intro_guide.md",
            "mimeType": "text/markdown",
            "sizeBytes": len(md_bytes),
            "sha256": hashlib.sha256(md_bytes).hexdigest(),
            "extractedText": md_text[:50000],
        },
    }


def ensure_demo_seed(db: Session, vault_dir: Optional[str] = None) -> Dict[str, int]:
    """
    Idempotently align demo seed data with relative dates (`utcnow() + N days`),
    course join codes, weights, real vault sample files, meetings, and progress rows.
    """
    now = _utcnow_naive()
    meta = ensure_sample_vault_files(vault_dir)
    updated_counts: Dict[str, int] = {
        "storedFiles": 0,
        "courses": 0,
        "lessons": 0,
        "assignments": 0,
        "quizzes": 0,
        "meetings": 0,
        "messages": 0,
        "lessonProgress": 0,
        "whiteboard": 0,
    }

    # 1. StoredFiles (only if Course & Lecturer exist)
    cs101 = db.query(Course).filter(Course.CourseId == COURSE_CS101_ID).first()
    if cs101:
        for item in meta.values():
            sf = db.query(StoredFile).filter(StoredFile.FileId == item["fileId"]).first()
            if sf is None:
                sf = StoredFile(
                    FileId=item["fileId"],
                    OwnerId=cs101.LecturerId,
                    CourseId=cs101.CourseId,
                    Scope="SEED",
                    OriginalName=item["originalName"],
                    StoredPath=item["storedPath"],
                    MimeType=item["mimeType"],
                    SizeBytes=item["sizeBytes"],
                    Sha256=item["sha256"],
                    ExtractedText=item["extractedText"],
                    CreatedAt=now,
                )
                db.add(sf)
            else:
                sf.StoredPath = item["storedPath"]
                sf.MimeType = item["mimeType"]
                sf.SizeBytes = item["sizeBytes"]
                sf.Sha256 = item["sha256"]
                sf.ExtractedText = item["extractedText"]
            updated_counts["storedFiles"] += 1
        db.flush()

    # 2. Course JoinCodes & Self-Enrollment Settings
    course_settings = {
        COURSE_CS101_ID: ("CS101-DEMO", True, 60, "Khoa học máy tính"),
        COURSE_CS202_ID: ("CS202-OPEN", True, 60, "Khoa học máy tính"),
        COURSE_AI310_ID: ("OS301-OPEN", True, 60, "Hệ điều hành & Hệ thống"),
        COURSE_WEB220_ID: ("WEB220-DEMO", True, 60, "Kỹ thuật phần mềm"),
    }
    for cid, (join_code, allow_self, max_students, category) in course_settings.items():
        course = db.query(Course).filter(Course.CourseId == cid).first()
        if course:
            expected_join = f"{course.CourseCode}-OPEN" if cid == COURSE_AI310_ID and course.CourseCode != "AI310" else join_code
            if not course.JoinCode or (cid == COURSE_AI310_ID and course.JoinCode == "AI310-OPEN" and course.CourseCode != "AI310"):
                course.JoinCode = expected_join
            course.AllowSelfEnroll = allow_self
            course.MaxStudents = course.MaxStudents or max_students
            course.Category = course.Category or category
            updated_counts["courses"] += 1

    # 3. Link seeded lesson/assignment to real StoredFiles and remove dead /materials/*.pdf & /assignments/*.pdf URLs
    from backend.app.models.models import Module

    cs101_lesson = db.query(Lesson).filter(Lesson.LessonId == LESSON_CS101_ID).first()
    if cs101_lesson is None and cs101 is not None:
        cs101_lesson = (
            db.query(Lesson)
            .join(Module, Module.ModuleId == Lesson.ModuleId)
            .filter(Module.CourseId == cs101.CourseId, Lesson.IsPublished == True)  # noqa: E712
            .order_by(Lesson.SortOrder.asc())
            .first()
        )

    all_seed_or_legacy_lessons = (
        db.query(Lesson)
        .filter(
            (Lesson.LessonId.in_(SEED_LESSON_IDS))
            | (Lesson.MaterialUrl.like("/materials/%"))
        )
        .all()
    )
    for lesson in all_seed_or_legacy_lessons:
        if cs101_lesson and lesson.LessonId == cs101_lesson.LessonId and cs101:
            lesson.ContentType = "PDF"
            lesson.AttachmentFileId = SEED_PDF_FILE_ID
            lesson.MaterialUrl = f"/api/files/{SEED_PDF_FILE_ID}/content"
        elif lesson.MaterialUrl and lesson.MaterialUrl.startswith("/materials/"):
            lesson.MaterialUrl = None
        updated_counts["lessons"] += 1
    if cs101_lesson and cs101_lesson.AttachmentFileId is None and cs101:
        cs101_lesson.ContentType = "PDF"
        cs101_lesson.AttachmentFileId = SEED_PDF_FILE_ID
        cs101_lesson.MaterialUrl = f"/api/files/{SEED_PDF_FILE_ID}/content"
        updated_counts["lessons"] += 1

    # 4. Seeded Assignments: refresh relative DueAt & replace dead /assignments/*.pdf URLs
    cs101_assignment = db.query(Assignment).filter(Assignment.AssignmentId == ASSIGNMENT_CS101_ID).first()
    if cs101_assignment is None and cs101 is not None:
        cs101_assignment = (
            db.query(Assignment)
            .filter(
                Assignment.CourseId == cs101.CourseId,
                Assignment.AttachmentUrl.like("/assignments/%"),
            )
            .order_by(Assignment.CreatedAt.asc())
            .first()
        )

    seed_assignments = (
        db.query(Assignment)
        .filter(
            (Assignment.AssignmentId.in_(SEED_ASSIGNMENT_IDS))
            | (Assignment.AttachmentUrl.like("/assignments/%"))
        )
        .order_by(Assignment.AssignmentId.asc())
        .all()
    )
    for idx, assignment in enumerate(seed_assignments, start=1):
        if assignment.AssignmentId in SEED_ASSIGNMENT_IDS:
            assignment.DueAt = now + timedelta(days=2 + idx)
        if assignment.WeightPercent is None:
            assignment.WeightPercent = 20.0
        if cs101_assignment and assignment.AssignmentId == cs101_assignment.AssignmentId and cs101:
            assignment.AttachmentFileId = SEED_MD_FILE_ID
            assignment.AttachmentUrl = f"/api/files/{SEED_MD_FILE_ID}/content"
        elif assignment.AttachmentUrl and assignment.AttachmentUrl.startswith("/assignments/"):
            assignment.AttachmentUrl = None
        updated_counts["assignments"] += 1

    # 5. Seeded Quizzes: keep open relative window (StartAt = now - 2d, EndAt = now + 14d)
    seed_quizzes = (
        db.query(Quiz)
        .filter(Quiz.QuizId.in_(SEED_QUIZ_IDS))
        .order_by(Quiz.QuizId.asc())
        .all()
    )
    for quiz in seed_quizzes:
        if quiz.IsPublished:
            quiz.StartAt = now - timedelta(days=2)
            quiz.EndAt = now + timedelta(days=14)
        else:
            quiz.StartAt = now + timedelta(days=1)
            quiz.EndAt = now + timedelta(days=21)
        if quiz.WeightPercent is None:
            quiz.WeightPercent = 10.0
        if not quiz.ScoreVisibility or quiz.ScoreVisibility == "IMMEDIATE":
            quiz.ScoreVisibility = "AFTER_CLOSE"
        updated_counts["quizzes"] += 1

    # 6. Seed Meetings, Logs, CourseMessages, LessonProgress, WhiteboardSnapshot for CS101
    if cs101:
        meeting1 = db.query(Meeting).filter(Meeting.MeetingId == MEETING_CS101_ID).first()
        if meeting1 is None:
            meeting1 = Meeting(
                MeetingId=MEETING_CS101_ID,
                CourseId=cs101.CourseId,
                HostId=cs101.LecturerId,
                Title="CS101 - Giờ học trực tuyến Tuần 1",
                RoomCode="unilms-cs101-demo",
                Status="LIVE",
                StartedAt=now - timedelta(hours=1),
                EndedAt=None,
                CreatedAt=now - timedelta(hours=1),
            )
            db.add(meeting1)
            db.flush()
            updated_counts["meetings"] += 1

        if not db.query(MeetingLog).filter(MeetingLog.MeetingId == MEETING_CS101_ID).first():
            db.add(
                MeetingLog(
                    LogId=uuid.UUID("d0000000-0000-0000-0000-000000000001"),
                    MeetingId=MEETING_CS101_ID,
                    UserId=STUDENT1_ID,
                    JoinedAt=now - timedelta(minutes=45),
                    DurationSeconds=2700,
                    ChatCount=2,
                    HandRaisesCount=1,
                    ActivitySummary="Đang tham dự buổi học trực tuyến.",
                )
            )

        if not db.query(CourseMessage).filter(CourseMessage.CourseId == cs101.CourseId).first():
            db.add(
                CourseMessage(
                    MessageId=uuid.UUID("e0000000-0000-0000-0000-000000000001"),
                    CourseId=cs101.CourseId,
                    MeetingId=MEETING_CS101_ID,
                    SenderId=cs101.LecturerId,
                    MessageType="TEXT",
                    Content="Chào các em, hôm nay chúng ta ôn tập về biến, vòng lặp và cách chia hàm.",
                    CreatedAt=now - timedelta(minutes=30),
                )
            )
            updated_counts["messages"] += 1

        if not db.query(WhiteboardSnapshot).filter(WhiteboardSnapshot.CourseId == cs101.CourseId).first():
            db.add(
                WhiteboardSnapshot(
                    SnapshotId=uuid.UUID("c2000000-0000-0000-0000-000000000001"),
                    CourseId=cs101.CourseId,
                    MeetingId=MEETING_CS101_ID,
                    StrokesJson='[{"id":"seed-1","color":"#2563eb","width":3,"points":[{"x":0.15,"y":0.25},{"x":0.45,"y":0.25},{"x":0.45,"y":0.55}]}]',
                    UpdatedBy=cs101.LecturerId,
                    UpdatedAt=now,
                )
            )
            updated_counts["whiteboard"] += 1

    progress_targets = []
    if cs101_lesson:
        progress_targets.append((uuid.UUID("c1000000-0000-0000-0000-000000000001"), cs101_lesson, 1200))
    ai310_lesson = db.query(Lesson).filter(Lesson.LessonId == LESSON_AI310_ID).first()
    if ai310_lesson and (not cs101_lesson or ai310_lesson.LessonId != cs101_lesson.LessonId):
        progress_targets.append((uuid.UUID("c1000000-0000-0000-0000-000000000002"), ai310_lesson, 900))

    for progress_id, lesson, seconds in progress_targets:
        if not db.query(LessonProgress).filter(
            LessonProgress.LessonId == lesson.LessonId,
            LessonProgress.StudentId == STUDENT1_ID,
        ).first():
            db.add(
                LessonProgress(
                    ProgressId=progress_id,
                    LessonId=lesson.LessonId,
                    StudentId=STUDENT1_ID,
                    IsCompleted=True,
                    CompletedAt=now - timedelta(days=2),
                    LastViewedAt=now - timedelta(days=1),
                    TimeSpentSeconds=seconds,
                )
            )
            updated_counts["lessonProgress"] += 1

    db.commit()
    return updated_counts


if __name__ == "__main__":
    from backend.app.db.session import SessionLocal

    logging.basicConfig(level=logging.INFO)
    session = SessionLocal()
    try:
        summary = ensure_demo_seed(session)
        logger.info("Demo seed synchronized: %s", summary)
    finally:
        session.close()
