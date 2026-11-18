from datetime import timedelta
import io
from pathlib import Path
import uuid

from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    AcademicSemester,
    AiInteractionLog,
    Assignment,
    Course,
    CourseMessage,
    CourseSession,
    Lesson,
    Meeting,
    MeetingLog,
    Module,
    Notification,
    StoredFile,
    User,
    WhiteboardSnapshot,
    utcnow,
)
from backend.app.services.file_storage import delete_vault_file_quietly


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cleanup_test_entities(
    course_ids: list[str] | None = None,
    semester_ids: list[str] | None = None,
    file_ids: list[str] | None = None,
) -> None:
    db = SessionLocal()
    try:
        cids = [uuid.UUID(cid) for cid in (course_ids or []) if cid]
        sids = [uuid.UUID(sid) for sid in (semester_ids or []) if sid]
        fids = [uuid.UUID(fid) for fid in (file_ids or []) if fid]

        if sids:
            for (cid,) in db.query(Course.CourseId).filter(Course.SemesterId.in_(sids)).all():
                if cid not in cids:
                    cids.append(cid)

        stored_paths: list[str] = []
        if cids:
            for cid in cids:
                db.query(Notification).filter(
                    Notification.RelatedUrl.contains(str(cid))
                ).delete(synchronize_session=False)

            db.query(CourseSession).filter(CourseSession.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(CourseMessage).filter(CourseMessage.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(WhiteboardSnapshot).filter(WhiteboardSnapshot.CourseId.in_(cids)).delete(synchronize_session=False)
            mids = [mid for (mid,) in db.query(Meeting.MeetingId).filter(Meeting.CourseId.in_(cids)).all()]
            if mids:
                db.query(MeetingLog).filter(MeetingLog.MeetingId.in_(mids)).delete(synchronize_session=False)
                db.query(Meeting).filter(Meeting.MeetingId.in_(mids)).delete(synchronize_session=False)
            db.query(AiInteractionLog).filter(AiInteractionLog.CourseId.in_(cids)).delete(synchronize_session=False)

            mod_ids = [mid for (mid,) in db.query(Module.ModuleId).filter(Module.CourseId.in_(cids)).all()]
            if mod_ids:
                db.query(Lesson).filter(Lesson.ModuleId.in_(mod_ids)).update(
                    {Lesson.AttachmentFileId: None}, synchronize_session=False
                )
            db.query(Assignment).filter(Assignment.CourseId.in_(cids)).update(
                {Assignment.AttachmentFileId: None}, synchronize_session=False
            )

            course_files = db.query(StoredFile).filter(StoredFile.CourseId.in_(cids)).all()
            for sf in course_files:
                if sf.Scope != "SEED" and sf.StoredPath:
                    stored_paths.append(sf.StoredPath)
            db.query(StoredFile).filter(StoredFile.CourseId.in_(cids)).delete(synchronize_session=False)

            for course in db.query(Course).filter(Course.CourseId.in_(cids)).all():
                db.delete(course)
            db.flush()

        if fids:
            extra_files = db.query(StoredFile).filter(StoredFile.FileId.in_(fids)).all()
            for sf in extra_files:
                if sf.Scope != "SEED" and sf.StoredPath:
                    stored_paths.append(sf.StoredPath)
                db.delete(sf)
            db.flush()

        if sids:
            db.query(AcademicSemester).filter(AcademicSemester.SemesterId.in_(sids)).delete(synchronize_session=False)

        db.commit()

        for sp in set(stored_paths):
            still_used = db.query(StoredFile.FileId).filter(StoredFile.StoredPath == sp).first() is not None
            if not still_used:
                delete_vault_file_quietly(sp)
    finally:
        db.close()


def test_student_course_response_exposes_my_enrollment_status_active_and_completed(
    client, admin_token, lecturer1_token, student2_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_ids: list[str] = []
    course_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    stu2 = db.query(User).filter(User.Email == "student2@university.edu.vn").first()
    db.close()

    try:
        sem = client.post(
            "/api/semesters",
            json={
                "code": f"ENR-{suffix}",
                "name": f"Enroll Status {suffix}",
                "semester": f"HK-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=10)).isoformat(),
                "endDate": (now + timedelta(days=80)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_ids.append(sem["semesterId"])

        course = client.post(
            "/api/courses",
            json={
                "courseCode": f"ENR{suffix}",
                "sectionCode": "N01",
                "title": "Enrollment Status Contract",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem["semesterId"],
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        cid = course["courseId"]
        course_ids.append(cid)

        enr_resp = client.post(
            f"/api/courses/{cid}/enrollments",
            json={"studentId": str(stu2.UserId)},
            headers=_auth(admin_token),
        )
        assert enr_resp.status_code == 201, enr_resp.text

        detail_active = client.get(f"/api/courses/{cid}", headers=_auth(student2_token))
        assert detail_active.status_code == 200
        assert detail_active.json().get("myEnrollmentStatus") == "ACTIVE"

        list_active = client.get("/api/courses", headers=_auth(student2_token)).json()
        matched_active = next((c for c in list_active if c["courseId"] == cid), None)
        assert matched_active is not None
        assert matched_active.get("myEnrollmentStatus") == "ACTIVE"

        dash_active = client.get("/api/dashboard/student", headers=_auth(student2_token)).json()
        dash_course = next((c for c in dash_active["enrolledCourses"] if c["courseId"] == cid), None)
        assert dash_course is not None
        assert dash_course.get("myEnrollmentStatus") == "ACTIVE"

        comp_resp = client.patch(
            f"/api/courses/{cid}/enrollments/{stu2.UserId}/complete",
            headers=_auth(lecturer1_token),
        )
        assert comp_resp.status_code == 200, comp_resp.text

        detail_completed = client.get(f"/api/courses/{cid}", headers=_auth(student2_token))
        assert detail_completed.status_code == 200
        assert detail_completed.json().get("myEnrollmentStatus") == "COMPLETED"

        list_completed = client.get("/api/courses", headers=_auth(student2_token)).json()
        matched_completed = next((c for c in list_completed if c["courseId"] == cid), None)
        assert matched_completed is not None
        assert matched_completed.get("myEnrollmentStatus") == "COMPLETED"
    finally:
        _cleanup_test_entities(course_ids=course_ids, semester_ids=sem_ids)


def test_student_can_read_lesson_scoped_file_attached_to_published_assignment(
    client, admin_token, lecturer1_token, student2_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_ids: list[str] = []
    course_ids: list[str] = []
    file_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    stu2 = db.query(User).filter(User.Email == "student2@university.edu.vn").first()
    db.close()

    try:
        sem = client.post(
            "/api/semesters",
            json={
                "code": f"ASF-{suffix}",
                "name": f"Assignment File {suffix}",
                "semester": f"HK-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=10)).isoformat(),
                "endDate": (now + timedelta(days=80)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_ids.append(sem["semesterId"])

        course = client.post(
            "/api/courses",
            json={
                "courseCode": f"ASF{suffix}",
                "sectionCode": "N01",
                "title": "Assignment Lesson File Access",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem["semesterId"],
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        cid = course["courseId"]
        course_ids.append(cid)

        client.post(
            f"/api/courses/{cid}/enrollments",
            json={"studentId": str(stu2.UserId)},
            headers=_auth(admin_token),
        )

        up_resp = client.post(
            "/api/files/upload",
            files={"file": ("assignment_prompt.md", io.BytesIO(b"# De bai thuc hanh\nYeu cau chi tiet."), "text/markdown")},
            data={"scope": "LESSON", "courseId": cid},
            headers=_auth(lecturer1_token),
        )
        assert up_resp.status_code == 201, up_resp.text
        fid = up_resp.json()["fileId"]
        file_ids.append(fid)

        # Draft assignment: student still cannot read unpublished lesson-scoped file
        asg_draft = client.post(
            f"/api/courses/{cid}/assignments",
            json={
                "title": "Bai tap nhap",
                "description": "Chua cong bo",
                "dueAt": (now + timedelta(days=7)).isoformat(),
                "maxScore": 10,
                "allowLate": True,
                "attachmentFileId": fid,
                "status": "DRAFT",
            },
            headers=_auth(lecturer1_token),
        )
        assert asg_draft.status_code == 201, asg_draft.text
        aid = asg_draft.json()["assignmentId"]

        denied_meta = client.get(f"/api/files/{fid}", headers=_auth(student2_token))
        assert denied_meta.status_code == 403

        # Publish assignment: student opening assignment prompt must get 200 OK, not 403
        pub_resp = client.put(
            f"/api/assignments/{aid}",
            json={"status": "PUBLISHED"},
            headers=_auth(lecturer1_token),
        )
        assert pub_resp.status_code == 200, pub_resp.text

        ok_meta = client.get(f"/api/files/{fid}", headers=_auth(student2_token))
        assert ok_meta.status_code == 200, ok_meta.text
        ok_stream = client.get(f"/api/files/{fid}/content", headers=_auth(student2_token))
        assert ok_stream.status_code == 200
        assert b"De bai thuc hanh" in ok_stream.content
    finally:
        _cleanup_test_entities(course_ids=course_ids, semester_ids=sem_ids, file_ids=file_ids)


def test_draft_course_does_not_push_unreachable_403_notifications_to_students(
    client, admin_token, lecturer1_token, student2_token
):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_ids: list[str] = []
    course_ids: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    stu2 = db.query(User).filter(User.Email == "student2@university.edu.vn").first()
    db.close()

    try:
        sem = client.post(
            "/api/semesters",
            json={
                "code": f"DRN-{suffix}",
                "name": f"Draft Notif {suffix}",
                "semester": f"HK-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=10)).isoformat(),
                "endDate": (now + timedelta(days=80)).isoformat(),
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        sem_ids.append(sem["semesterId"])

        course = client.post(
            "/api/courses",
            json={
                "courseCode": f"DRN{suffix}",
                "sectionCode": "N01",
                "title": "Draft Course Notification Guard",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem["semesterId"],
                "semester": sem["semester"],
                "academicYear": sem["academicYear"],
                "credits": 3,
                "status": "DRAFT",
            },
            headers=_auth(admin_token),
        ).json()
        cid = course["courseId"]
        course_ids.append(cid)

        client.post(
            f"/api/courses/{cid}/enrollments",
            json={"studentId": str(stu2.UserId)},
            headers=_auth(admin_token),
        )

        grd = client.post(
            f"/api/courses/{cid}/grades/manual",
            json={
                "studentId": str(stu2.UserId),
                "itemTitle": f"Draft Grade {suffix}",
                "sourceType": "MANUAL",
                "score": 8.5,
                "maxScore": 10,
                "weightPercent": 10,
            },
            headers=_auth(lecturer1_token),
        )
        assert grd.status_code == 201, grd.text

        notifs = client.get("/api/notifications", headers=_auth(student2_token)).json()
        leaked = [n for n in notifs if cid in (n.get("relatedUrl") or "")]
        assert leaked == [], f"Draft course leaked 403 notification links to student: {leaked}"
    finally:
        _cleanup_test_entities(course_ids=course_ids, semester_ids=sem_ids)


def test_frontend_assessment_and_classroom_whiteboard_contracts():
    repo_root = Path(__file__).resolve().parents[2]

    index_css = (repo_root / "frontend/src/index.css").read_text(encoding="utf-8")
    assert "@custom-variant dark" in index_css and ".theme-dark" in index_css

    theme_toggle = (repo_root / "frontend/src/components/ui/ThemeToggle.tsx").read_text(encoding="utf-8")
    assert "resolvedTheme === 'dark'" in theme_toggle

    meeting_room = (repo_root / "frontend/src/components/teams/MeetingRoom.tsx").read_text(encoding="utf-8")
    assert "useTheme" in meeting_room
    assert "darkSurface={isDarkSurface}" in meeting_room

    whiteboard = (repo_root / "frontend/src/components/teams/WhiteboardCanvas.tsx").read_text(encoding="utf-8")
    assert "!fillParent && (\n            <ExpandFullscreenControls" not in whiteboard
    assert "document.exitFullscreen()" not in whiteboard
    assert "z-[70]" in whiteboard

    quizzes_page = (repo_root / "frontend/src/pages/QuizzesPage.tsx").read_text(encoding="utf-8")
    assert "myEnrollmentStatus" in quizzes_page
    assert "user?.userId" in quizzes_page

    assignments_page = (repo_root / "frontend/src/pages/AssignmentsPage.tsx").read_text(encoding="utf-8")
    assert "myEnrollmentStatus" in assignments_page
    assert "user?.userId" in assignments_page
