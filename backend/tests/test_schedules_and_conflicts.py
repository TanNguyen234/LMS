from datetime import timedelta
import uuid

from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    AiInteractionLog,
    Course,
    CourseMessage,
    CourseSession,
    Enrollment,
    Meeting,
    MeetingLog,
    StoredFile,
    User,
    WhiteboardSnapshot,
    utcnow,
)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _create_isolated_course(client, admin_token, lecturer_id: str, code_prefix: str, suffix: str):
    resp = client.post(
        "/api/courses",
        json={
            "courseCode": f"{code_prefix}{suffix}",
            "sectionCode": "N01",
            "title": f"Schedule Course {code_prefix} {suffix}",
            "lecturerId": lecturer_id,
            "semester": "HK1",
            "academicYear": "2026-2027",
            "credits": 3,
            "status": "ACTIVE",
            "allowSelfEnroll": True,
        },
        headers=_auth(admin_token),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _delete_courses_cascade(db, uuids: list[uuid.UUID]) -> None:
    if not uuids:
        return
    db.query(CourseSession).filter(CourseSession.CourseId.in_(uuids)).delete(synchronize_session=False)
    db.query(CourseMessage).filter(CourseMessage.CourseId.in_(uuids)).delete(synchronize_session=False)
    db.query(WhiteboardSnapshot).filter(WhiteboardSnapshot.CourseId.in_(uuids)).delete(synchronize_session=False)
    meeting_ids = [mid for (mid,) in db.query(Meeting.MeetingId).filter(Meeting.CourseId.in_(uuids)).all()]
    if meeting_ids:
        db.query(MeetingLog).filter(MeetingLog.MeetingId.in_(meeting_ids)).delete(synchronize_session=False)
        db.query(Meeting).filter(Meeting.MeetingId.in_(meeting_ids)).delete(synchronize_session=False)
    db.query(AiInteractionLog).filter(AiInteractionLog.CourseId.in_(uuids)).delete(synchronize_session=False)
    db.query(StoredFile).filter(StoredFile.CourseId.in_(uuids)).delete(synchronize_session=False)
    for course in db.query(Course).filter(Course.CourseId.in_(uuids)).all():
        db.delete(course)
    db.commit()


def _cleanup_test_courses(course_ids: list[str]) -> None:
    if not course_ids:
        return
    uuids = [uuid.UUID(cid) for cid in course_ids]
    db = SessionLocal()
    try:
        _delete_courses_cascade(db, uuids)
    finally:
        db.close()


def _cleanup_legacy_schedule_test_rows() -> None:
    db = SessionLocal()
    try:
        old_courses = (
            db.query(Course.CourseId)
            .filter(
                (Course.CourseCode.like("SCH%")) | (Course.CourseCode.like("STU%"))
            )
            .all()
        )
        old_ids = [cid for (cid,) in old_courses]
        _delete_courses_cascade(db, old_ids)
    finally:
        db.close()


def test_quick_generate_schedule_and_detect_lecturer_room_conflicts(client, admin_token, lecturer1_token):
    _cleanup_legacy_schedule_test_rows()
    suffix = uuid.uuid4().hex[:5].upper()
    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    lec2 = db.query(User).filter(User.Email == "lecturer2@university.edu.vn").first()
    db.close()

    c1 = _create_isolated_course(client, admin_token, str(lec1.UserId), "SCHA", suffix)
    c2 = _create_isolated_course(client, admin_token, str(lec1.UserId), "SCHB", suffix)
    c3 = _create_isolated_course(client, admin_token, str(lec2.UserId), "SCHC", suffix)
    created_ids = [c1["courseId"], c2["courseId"], c3["courseId"]]

    try:

        # Pick a future Monday and generate 2 weeks (2 Mondays)
        today = utcnow().date()
        days_until_monday = (7 - today.weekday()) % 7 or 7
        monday = today + timedelta(days=days_until_monday + 14)
        end_day = monday + timedelta(days=7)

        gen1 = client.post(
            "/api/schedules/quick-generate",
            json={
                "courseId": c1["courseId"],
                "titlePrefix": "Buổi giảng",
                "weekdays": [0],  # Monday
                "startTime": "08:00",
                "endTime": "10:00",
                "startDate": monday.isoformat(),
                "endDate": end_day.isoformat(),
                "deliveryMode": "IN_PERSON",
                "room": f"ROOM-{suffix}",
            },
            headers=_auth(admin_token),
        )
        assert gen1.status_code == 200, gen1.text
        assert gen1.json()["createdCount"] == 2

        # Same lecturer on c2 at overlapping time (09:00-11:00) -> conflict 409
        chk = client.post(
            "/api/schedules/check-conflicts",
            json={
                "courseId": c2["courseId"],
                "slots": [
                    {
                        "startAt": f"{monday.isoformat()}T09:00:00Z",
                        "endAt": f"{monday.isoformat()}T11:00:00Z",
                        "deliveryMode": "ONLINE",
                        "room": "Trực tuyến",
                    }
                ],
            },
            headers=_auth(admin_token),
        )
        assert chk.status_code == 200, chk.text
        assert chk.json()["hasConflicts"] is True
        assert chk.json()["conflicts"][0]["lecturerConflict"] is True

        gen2_conflict = client.post(
            "/api/schedules/quick-generate",
            json={
                "courseId": c2["courseId"],
                "titlePrefix": "Trùng GV",
                "weekdays": [0],
                "startTime": "09:00",
                "endTime": "11:00",
                "startDate": monday.isoformat(),
                "endDate": end_day.isoformat(),
                "deliveryMode": "ONLINE",
                "room": "Trực tuyến",
                "skipConflicts": False,
            },
            headers=_auth(admin_token),
        )
        assert gen2_conflict.status_code == 409

        # Different lecturer on c3, same physical room ROOM-{suffix} -> room conflict 409
        gen3_room_conflict = client.post(
            "/api/schedules/quick-generate",
            json={
                "courseId": c3["courseId"],
                "titlePrefix": "Trùng phòng",
                "weekdays": [0],
                "startTime": "08:30",
                "endTime": "09:30",
                "startDate": monday.isoformat(),
                "endDate": end_day.isoformat(),
                "deliveryMode": "IN_PERSON",
                "room": f"ROOM-{suffix}",
                "skipConflicts": False,
            },
            headers=_auth(admin_token),
        )
        assert gen3_room_conflict.status_code == 409

        # Lecturer calendar contains SESSION events and can filter by lecturerId as Admin
        cal_lec = client.get(
            f"/api/dashboard/calendar?courseId={c1['courseId']}",
            headers=_auth(lecturer1_token),
        )
        assert cal_lec.status_code == 200
        assert any(ev["kind"] == "SESSION" for ev in cal_lec.json())
    finally:
        _cleanup_test_courses(created_ids)


def test_student_conflict_detected_on_schedule_and_enrollment(
    client, admin_token, student1_token
):
    _cleanup_legacy_schedule_test_rows()
    suffix = uuid.uuid4().hex[:5].upper()
    db = SessionLocal()
    lec1 = db.query(User).filter(User.Email == "lecturer1@university.edu.vn").first()
    lec2 = db.query(User).filter(User.Email == "lecturer2@university.edu.vn").first()
    stu1 = db.query(User).filter(User.Email == "student1@university.edu.vn").first()
    db.close()

    # Two courses taught by DIFFERENT lecturers
    c_lec1 = _create_isolated_course(client, admin_token, str(lec1.UserId), "STUA", suffix)
    c_lec2 = _create_isolated_course(client, admin_token, str(lec2.UserId), "STUB", suffix)
    c_lec2_free = _create_isolated_course(client, admin_token, str(lec2.UserId), "STUC", suffix)
    created_ids = [c_lec1["courseId"], c_lec2["courseId"], c_lec2_free["courseId"]]

    try:
        # Enroll student1 into c_lec1
        r_enr = client.post(
            f"/api/courses/{c_lec1['courseId']}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )
        assert r_enr.status_code in (200, 201), r_enr.text

        today = utcnow().date()
        days_until_tue = (1 - today.weekday()) % 7 or 7
        tuesday = today + timedelta(days=days_until_tue + 21)

        # Schedule c_lec1 on Tuesday 13:00-15:00
        s1 = client.post(
            "/api/schedules",
            json={
                "courseId": c_lec1["courseId"],
                "title": "Lớp sáng/chiều 1",
                "startAt": f"{tuesday.isoformat()}T13:00:00Z",
                "endAt": f"{tuesday.isoformat()}T15:00:00Z",
                "deliveryMode": "ONLINE",
                "room": "Trực tuyến",
            },
            headers=_auth(admin_token),
        )
        assert s1.status_code == 201, s1.text

        # Schedule c_lec2 at overlapping Tuesday 14:00-16:00 AFTER student1 is enrolled in BOTH -> detects student1 conflict!
        r_enr2 = client.post(
            f"/api/courses/{c_lec2['courseId']}/enrollments",
            json={"studentId": str(stu1.UserId)},
            headers=_auth(admin_token),
        )
        assert r_enr2.status_code in (200, 201), r_enr2.text

        s2_conflict = client.post(
            "/api/schedules",
            json={
                "courseId": c_lec2["courseId"],
                "title": "Lớp trùng giờ sinh viên",
                "startAt": f"{tuesday.isoformat()}T14:00:00Z",
                "endAt": f"{tuesday.isoformat()}T16:00:00Z",
                "deliveryMode": "ONLINE",
                "room": "Trực tuyến",
            },
            headers=_auth(admin_token),
        )
        assert s2_conflict.status_code == 409, s2_conflict.text

        # Schedule a 3rd course c_lec2_free at Tuesday 14:00-16:00 (no shared student yet),
        # then student1 tries to self-enroll -> blocked with 409 because of schedule conflict with c_lec1!
        s3_ok = client.post(
            "/api/schedules",
            json={
                "courseId": c_lec2_free["courseId"],
                "title": "Lớp thứ 3 trùng giờ c1",
                "startAt": f"{tuesday.isoformat()}T14:00:00Z",
                "endAt": f"{tuesday.isoformat()}T16:00:00Z",
                "deliveryMode": "ONLINE",
                "room": "Trực tuyến",
            },
            headers=_auth(admin_token),
        )
        assert s3_ok.status_code == 201, s3_ok.text

        self_enroll_conflict = client.post(
            f"/api/courses/{c_lec2_free['courseId']}/self-enroll",
            headers=_auth(student1_token),
        )
        assert self_enroll_conflict.status_code == 409, self_enroll_conflict.text
    finally:
        _cleanup_test_courses(created_ids)
