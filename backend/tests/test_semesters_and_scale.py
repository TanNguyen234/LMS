from datetime import timedelta
import uuid

from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    AcademicSemester,
    AiInteractionLog,
    Course,
    CourseMessage,
    CourseSession,
    Lesson,
    Meeting,
    MeetingLog,
    Module,
    StoredFile,
    User,
    WhiteboardSnapshot,
    utcnow,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _cleanup_semester_test_rows(
    course_ids: list[str] | None = None,
    semester_ids: list[str] | None = None,
    *,
    clean_legacy: bool = False,
) -> None:
    db = SessionLocal()
    try:
        cids: list[uuid.UUID] = [uuid.UUID(cid) for cid in (course_ids or []) if cid]
        sids: list[uuid.UUID] = [uuid.UUID(sid) for sid in (semester_ids or []) if sid]
        if clean_legacy:
            legacy_courses = (
                db.query(Course.CourseId)
                .filter(
                    (Course.CourseCode.like("OLD%"))
                    | (Course.CourseCode.like("CSX%"))
                    | (Course.CourseCode.like("BLK%"))
                )
                .all()
            )
            cids.extend(cid for (cid,) in legacy_courses if cid not in cids)
            legacy_sems = (
                db.query(AcademicSemester.SemesterId)
                .filter(
                    (AcademicSemester.Code.like("2025-2026-PAST-%"))
                    | (AcademicSemester.Code.like("S1-%"))
                    | (AcademicSemester.Code.like("S2-%"))
                    | (AcademicSemester.Code.like("SRC-%"))
                    | (AcademicSemester.Code.like("DST-%"))
                )
                .all()
            )
            sids.extend(sid for (sid,) in legacy_sems if sid not in sids)

        if sids:
            sem_courses = db.query(Course.CourseId).filter(Course.SemesterId.in_(sids)).all()
            cids.extend(cid for (cid,) in sem_courses if cid not in cids)

        if cids:
            db.query(CourseSession).filter(CourseSession.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(CourseMessage).filter(CourseMessage.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(WhiteboardSnapshot).filter(WhiteboardSnapshot.CourseId.in_(cids)).delete(synchronize_session=False)
            mids = [mid for (mid,) in db.query(Meeting.MeetingId).filter(Meeting.CourseId.in_(cids)).all()]
            if mids:
                db.query(MeetingLog).filter(MeetingLog.MeetingId.in_(mids)).delete(synchronize_session=False)
                db.query(Meeting).filter(Meeting.MeetingId.in_(mids)).delete(synchronize_session=False)
            db.query(AiInteractionLog).filter(AiInteractionLog.CourseId.in_(cids)).delete(synchronize_session=False)
            db.query(StoredFile).filter(StoredFile.CourseId.in_(cids)).delete(synchronize_session=False)
            for course in db.query(Course).filter(Course.CourseId.in_(cids)).all():
                db.delete(course)
            db.flush()

        if sids:
            db.query(AcademicSemester).filter(AcademicSemester.SemesterId.in_(sids)).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


def test_semester_crud_and_expiration_auto_archives_courses_without_deleting(
    client, admin_token, lecturer1_token, student1_token
):
    _cleanup_semester_test_rows(clean_legacy=True)
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    sem_code = f"2025-2026-PAST-{suffix}"
    created_semesters: list[str] = []
    created_courses: list[str] = []

    try:
        # Invalid dates (endDate <= startDate) rejected
        bad_resp = client.post(
            "/api/semesters",
            json={
                "code": f"BAD-{suffix}",
                "name": "Bad Term",
                "semester": "HK2",
                "academicYear": "2025-2026",
                "startDate": now.isoformat(),
                "endDate": (now - timedelta(days=5)).isoformat(),
                "graceDays": 7,
            },
            headers=_auth(admin_token),
        )
        assert bad_resp.status_code == 400

        # Create a semester whose EndDate + GraceDays is already in the past
        create_sem = client.post(
            "/api/semesters",
            json={
                "code": sem_code,
                "name": f"HK2 (2025-2026) {suffix}",
                "semester": f"HK2-{suffix}",
                "academicYear": "2025-2026",
                "startDate": (now - timedelta(days=120)).isoformat(),
                "endDate": (now - timedelta(days=20)).isoformat(),
                "graceDays": 7,
                "autoArchiveOnExpire": True,
                "isCurrent": False,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        )
        assert create_sem.status_code == 201, create_sem.text
        sem_id = create_sem.json()["semesterId"]
        created_semesters.append(sem_id)

        # Create a course in that semester and enroll student1
        db = SessionLocal()
        lec = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
        stu = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
        db.close()

        course_resp = client.post(
            "/api/courses",
            json={
                "courseCode": f"OLD{suffix}",
                "sectionCode": "N01",
                "title": "Archived Term Course",
                "lecturerId": str(lec.UserId),
                "semesterId": sem_id,
                "semester": f"HK2-{suffix}",
                "academicYear": "2025-2026",
                "credits": 3,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        )
        assert course_resp.status_code == 201, course_resp.text
        course_id = course_resp.json()["courseId"]
        created_courses.append(course_id)

        enroll_resp = client.post(
            f"/api/courses/{course_id}/enrollments",
            json={"studentId": str(stu.UserId)},
            headers=_auth(admin_token),
        )
        assert enroll_resp.status_code in (200, 201), enroll_resp.text

        # Trigger sync-expired (also runs automatically on GET /api/semesters)
        sync_resp = client.post("/api/semesters/sync-expired", headers=_auth(admin_token))
        assert sync_resp.status_code == 200, sync_resp.text
        assert sync_resp.json()["archivedSemesters"] >= 1
        assert sync_resp.json()["archivedCourses"] >= 1

        # Verify semester & course are ARCHIVED (not deleted) and still visible to Admin/Lecturer/Student
        sem_list = client.get("/api/semesters", headers=_auth(student1_token)).json()
        matched_sem = next(s for s in sem_list if s["semesterId"] == sem_id)
        assert matched_sem["status"] == "ARCHIVED"

        lec_courses = client.get(
            f"/api/courses?semesterId={sem_id}", headers=_auth(lecturer1_token)
        ).json()
        assert any(c["courseId"] == course_id and c["status"] == "ARCHIVED" for c in lec_courses)

        stu_courses = client.get(
            f"/api/courses?semesterId={sem_id}", headers=_auth(student1_token)
        ).json()
        assert any(c["courseId"] == course_id and c["status"] == "ARCHIVED" for c in stu_courses)
    finally:
        _cleanup_semester_test_rows(created_courses, created_semesters)


def test_same_course_code_allowed_across_sections_and_semesters(client, admin_token):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    code = f"CSX{suffix}"
    created_semesters: list[str] = []
    created_courses: list[str] = []

    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    lec2 = db.query(User).filter(User.Email == "lecturer2@university.edu.vn").first()
    db.close()

    try:
        sem1 = client.post(
            "/api/semesters",
            json={
                "code": f"S1-{suffix}",
                "name": f"HK1 {suffix}",
                "semester": f"HK1-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=10)).isoformat(),
                "endDate": (now + timedelta(days=90)).isoformat(),
                "graceDays": 14,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        created_semesters.append(sem1["semesterId"])

        sem2 = client.post(
            "/api/semesters",
            json={
                "code": f"S2-{suffix}",
                "name": f"HK2 {suffix}",
                "semester": f"HK2-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now + timedelta(days=100)).isoformat(),
                "endDate": (now + timedelta(days=200)).isoformat(),
                "graceDays": 14,
                "status": "UPCOMING",
            },
            headers=_auth(admin_token),
        ).json()
        created_semesters.append(sem2["semesterId"])

        # Section N01 in sem1
        r1 = client.post(
            "/api/courses",
            json={
                "courseCode": code,
                "sectionCode": "N01",
                "title": "Software Engineering",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem1["semesterId"],
                "semester": sem1["semester"],
                "academicYear": sem1["academicYear"],
                "credits": 3,
            },
            headers=_auth(admin_token),
        )
        assert r1.status_code == 201, r1.text
        created_courses.append(r1.json()["courseId"])

        # Different section N02 in same sem1 -> allowed
        r2 = client.post(
            "/api/courses",
            json={
                "courseCode": code,
                "sectionCode": "N02",
                "title": "Software Engineering",
                "lecturerId": str(lec2.UserId),
                "semesterId": sem1["semesterId"],
                "semester": sem1["semester"],
                "academicYear": sem1["academicYear"],
                "credits": 3,
            },
            headers=_auth(admin_token),
        )
        assert r2.status_code == 201, r2.text
        created_courses.append(r2.json()["courseId"])

        # Exact same (courseCode, sectionCode, semester, academicYear) -> 400/409
        r_dup = client.post(
            "/api/courses",
            json={
                "courseCode": code,
                "sectionCode": "N01",
                "title": "Duplicate Section",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem1["semesterId"],
                "semester": sem1["semester"],
                "academicYear": sem1["academicYear"],
                "credits": 3,
            },
            headers=_auth(admin_token),
        )
        assert r_dup.status_code in (400, 409)

        # Same courseCode + sectionCode N01 in sem2 -> allowed
        r3 = client.post(
            "/api/courses",
            json={
                "courseCode": code,
                "sectionCode": "N01",
                "title": "Software Engineering",
                "lecturerId": str(lec1.UserId),
                "semesterId": sem2["semesterId"],
                "semester": sem2["semester"],
                "academicYear": sem2["academicYear"],
                "credits": 3,
            },
            headers=_auth(admin_token),
        )
        assert r3.status_code == 201, r3.text
        created_courses.append(r3.json()["courseId"])
    finally:
        _cleanup_semester_test_rows(created_courses, created_semesters)


def test_bulk_import_and_clone_courses_to_new_semester(client, admin_token):
    now = utcnow()
    suffix = uuid.uuid4().hex[:6].upper()
    created_semesters: list[str] = []
    created_courses: list[str] = []

    try:
        src_sem = client.post(
            "/api/semesters",
            json={
                "code": f"SRC-{suffix}",
                "name": f"Source {suffix}",
                "semester": f"HK1-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now - timedelta(days=10)).isoformat(),
                "endDate": (now + timedelta(days=80)).isoformat(),
                "graceDays": 14,
                "status": "ACTIVE",
            },
            headers=_auth(admin_token),
        ).json()
        created_semesters.append(src_sem["semesterId"])

        dst_sem = client.post(
            "/api/semesters",
            json={
                "code": f"DST-{suffix}",
                "name": f"Target {suffix}",
                "semester": f"HK2-{suffix}",
                "academicYear": "2026-2027",
                "startDate": (now + timedelta(days=95)).isoformat(),
                "endDate": (now + timedelta(days=185)).isoformat(),
                "graceDays": 14,
                "status": "UPCOMING",
            },
            headers=_auth(admin_token),
        ).json()
        created_semesters.append(dst_sem["semesterId"])

        # Bulk import 2 valid rows (1 matched by staffCode GV001, 1 by email) + 1 invalid row
        imp_resp = client.post(
            "/api/courses/bulk-import",
            json={
                "semesterId": src_sem["semesterId"],
                "rows": [
                    {
                        "courseCode": f"BLK1{suffix}",
                        "sectionCode": "N01",
                        "title": "Bulk Course One",
                        "credits": 3,
                        "lecturerIdentifier": "GV001",
                        "maxStudents": 60,
                        "category": "CNTT",
                    },
                    {
                        "courseCode": f"BLK2{suffix}",
                        "sectionCode": "N01",
                        "title": "Bulk Course Two",
                        "credits": 4,
                        "lecturerIdentifier": "lecturer2@university.edu.vn",
                    },
                    {
                        "courseCode": f"BLK3{suffix}",
                        "sectionCode": "N01",
                        "title": "Invalid Lecturer Row",
                        "credits": 3,
                        "lecturerIdentifier": "NO_SUCH_LECTURER_999",
                    },
                ],
            },
            headers=_auth(admin_token),
        )
        assert imp_resp.status_code == 200, imp_resp.text
        imp_data = imp_resp.json()
        assert imp_data["createdCount"] == 2
        assert len(imp_data["errors"]) == 1
        created_courses.extend(c["courseId"] for c in imp_data["createdCourses"])
        created_id = imp_data["createdCourses"][0]["courseId"]

        # Add a module & lesson to the first course, then clone to dst_sem
        mod_resp = client.post(
            f"/api/courses/{created_id}/modules",
            json={"title": "Module 1 - Intro", "sortOrder": 1, "isPublished": True},
            headers=_auth(admin_token),
        )
        assert mod_resp.status_code in (200, 201), mod_resp.text
        mod_id = mod_resp.json()["moduleId"]

        les_resp = client.post(
            f"/api/modules/{mod_id}/lessons",
            json={
                "title": "Lesson 1 - Setup",
                "contentType": "TEXT",
                "contentHtml": "<p>Welcome</p>",
                "sortOrder": 1,
                "isPublished": True,
            },
            headers=_auth(admin_token),
        )
        assert les_resp.status_code in (200, 201), les_resp.text

        clone_resp = client.post(
            "/api/courses/clone-to-semester",
            json={
                "sourceCourseIds": [created_id],
                "targetSemesterId": dst_sem["semesterId"],
                "copyModulesAndLessons": True,
                "defaultStatus": "DRAFT",
            },
            headers=_auth(admin_token),
        )
        assert clone_resp.status_code == 200, clone_resp.text
        clone_data = clone_resp.json()
        assert clone_data["createdCount"] == 1
        cloned_course_id = clone_data["createdCourses"][0]["courseId"]
        created_courses.append(cloned_course_id)
        assert clone_data["createdCourses"][0]["semesterId"] == dst_sem["semesterId"]
        assert clone_data["createdCourses"][0]["status"] == "DRAFT"

        # Confirm cloned course has module & lesson copied
        db = SessionLocal()
        try:
            mods = db.query(Module).filter(Module.CourseId == uuid.UUID(cloned_course_id)).all()
            assert len(mods) == 1
            lessons = db.query(Lesson).filter(Lesson.ModuleId == mods[0].ModuleId).all()
            assert len(lessons) == 1
        finally:
            db.close()
    finally:
        _cleanup_semester_test_rows(created_courses, created_semesters)
