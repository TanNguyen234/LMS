import pytest
import uuid
from backend.app.models.models import Course, Enrollment, Meeting, MeetingLog, CourseMessage


def test_create_meeting_as_lecturer(client, lecturer1_token, student1_token, admin_token):
    # Get courses of lecturer1
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert resp.status_code == 200
    courses = resp.json()
    assert len(courses) > 0
    course = courses[0]
    course_id = course["courseId"]

    # Lecturer creates meeting (replaceActive=True ends any existing LIVE meeting cleanly)
    create_payload = {
        "courseId": course_id,
        "title": "Buổi học trực tuyến thử nghiệm - MS Teams",
        "roomCode": "TEST-ROOM-101",
        "replaceActive": True,
    }
    meeting_resp = client.post("/api/meetings", json=create_payload, headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert meeting_resp.status_code == 200, meeting_resp.text
    meeting_data = meeting_resp.json()
    assert meeting_data["title"] == "Buổi học trực tuyến thử nghiệm - MS Teams"
    assert meeting_data["roomCode"] == "TEST-ROOM-101"
    assert meeting_data["status"] == "LIVE"
    assert "meetingId" in meeting_data
    meeting_id = meeting_data["meetingId"]

    # Creating a second LIVE meeting on the same course without replaceActive returns 409
    dup_resp = client.post(
        "/api/meetings",
        json={"courseId": course_id, "title": "Trùng phòng LIVE"},
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert dup_resp.status_code == 409

    # Student1 checks notifications to verify broadcast
    notif_resp = client.get("/api/notifications", headers={"Authorization": f"Bearer {student1_token}"})
    assert notif_resp.status_code == 200
    notifs = notif_resp.json()
    assert any("Lớp học trực tuyến" in n["title"] or "Lớp học trực tuyến" in n["message"] for n in notifs)

    # Active meetings endpoint (student never sees detailed activeLogs PII)
    active_resp = client.get("/api/meetings/active", headers={"Authorization": f"Bearer {student1_token}"})
    assert active_resp.status_code == 200
    active_list = active_resp.json()
    matched = next((m for m in active_list if m["meetingId"] == meeting_id), None)
    assert matched is not None
    assert matched["activeLogs"] == []


def test_student_forbidden_to_create_meeting(client, student1_token):
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {student1_token}"})
    assert resp.status_code == 200
    courses = resp.json()
    if courses:
        target_course_id = courses[0]["courseId"]
        bad_create = client.post("/api/meetings", json={
            "courseId": target_course_id,
            "title": "Hack meeting"
        }, headers={"Authorization": f"Bearer {student1_token}"})
        assert bad_create.status_code == 403


def test_unauthorized_lecturer_forbidden_for_other_course(client, lecturer2_token, lecturer1_token):
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert resp.status_code == 200
    course_id = resp.json()[0]["courseId"]

    bad_create = client.post("/api/meetings", json={
        "courseId": course_id,
        "title": "Lecturer 2 Intrusion"
    }, headers={"Authorization": f"Bearer {lecturer2_token}"})
    assert bad_create.status_code == 403


def test_meeting_join_leave_and_audit_logs(client, lecturer1_token, student1_token):
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    course_id = resp.json()[0]["courseId"]

    m_resp = client.post("/api/meetings", json={
        "courseId": course_id,
        "title": "Buổi học kiểm tra Audit Logs",
        "replaceActive": True,
    }, headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert m_resp.status_code == 200
    meeting_id = m_resp.json()["meetingId"]

    # Student joins meeting
    join_resp = client.post(f"/api/meetings/{meeting_id}/join", headers={"Authorization": f"Bearer {student1_token}"})
    assert join_resp.status_code == 200
    join_data = join_resp.json()
    assert join_data["status"] == "joined"
    assert "logId" in join_data

    # Student leaves meeting: server ignores spoofed client chatCount / handRaisesCount
    leave_resp = client.post(f"/api/meetings/{meeting_id}/leave", json={
        "chatCount": 3,
        "handRaisesCount": 1,
        "activitySummary": "Watched presentation and asked questions"
    }, headers={"Authorization": f"Bearer {student1_token}"})
    assert leave_resp.status_code == 200
    assert leave_resp.json()["status"] == "left"

    # Lecturer checks audit logs: counts remain 0 because server manages interaction counts
    audit_resp = client.get(f"/api/meetings/{meeting_id}/logs", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert audit_resp.status_code == 200
    logs = audit_resp.json()
    assert len(logs) >= 2  # host log + student log
    student_log = next((l for l in logs if l["userRole"] == "STUDENT"), None)
    assert student_log is not None
    assert student_log["chatCount"] == 0
    assert student_log["handRaisesCount"] == 0
    assert student_log["activitySummary"] == "Watched presentation and asked questions"
    assert student_log["leftAt"] is not None

    # Student cannot read audit logs
    bad_audit = client.get(f"/api/meetings/{meeting_id}/logs", headers={"Authorization": f"Bearer {student1_token}"})
    assert bad_audit.status_code == 403


def test_course_channel_messages(client, lecturer1_token, student1_token):
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    course_id = resp.json()[0]["courseId"]

    post1 = client.post(f"/api/courses/{course_id}/messages", json={
        "content": "Chào cả lớp, tuần này chúng ta có buổi học trực tuyến về MS Teams Clone!"
    }, headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert post1.status_code == 200
    msg1 = post1.json()
    assert msg1["senderRole"] == "LECTURER"
    assert "Chào cả lớp" in msg1["content"]

    post2 = client.post(f"/api/courses/{course_id}/messages", json={
        "content": "Em đã nhận thông báo ạ, cảm ơn thầy!"
    }, headers={"Authorization": f"Bearer {student1_token}"})
    assert post2.status_code == 200
    msg2 = post2.json()
    assert msg2["senderRole"] == "STUDENT"

    get_msgs = client.get(f"/api/courses/{course_id}/messages", headers={"Authorization": f"Bearer {student1_token}"})
    assert get_msgs.status_code == 200
    all_msgs = get_msgs.json()
    assert len(all_msgs) >= 2
    assert any(m["content"] == msg1["content"] for m in all_msgs)
    assert any(m["content"] == msg2["content"] for m in all_msgs)


def test_end_meeting(client, lecturer1_token):
    resp = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"})
    course_id = resp.json()[0]["courseId"]

    m_resp = client.post("/api/meetings", json={
        "courseId": course_id,
        "title": "Meeting to End",
        "replaceActive": True,
    }, headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert m_resp.status_code == 200
    meeting_id = m_resp.json()["meetingId"]

    end_resp = client.post(f"/api/meetings/{meeting_id}/end", headers={"Authorization": f"Bearer {lecturer1_token}"})
    assert end_resp.status_code == 200
    assert end_resp.json()["status"] == "ENDED"
    assert end_resp.json()["endedAt"] is not None
