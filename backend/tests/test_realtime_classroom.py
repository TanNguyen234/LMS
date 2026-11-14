import json
import threading
import uuid
from datetime import datetime, timezone

import pytest

from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    Course,
    CourseMessage,
    Enrollment,
    Meeting,
    MeetingLog,
    Notification,
    StoredFile,
    User,
    WhiteboardSnapshot,
)
from backend.app.services.notification_push import push_notification


CS101_ID = "10000000-0000-0000-0000-000000000001"
CS202_ID = "10000000-0000-0000-0000-000000000002"
WEB220_ID = "10000000-0000-0000-0000-000000000007"
ENDED_WEB220_MEETING_ID = "c0000000-0000-0000-0000-000000000002"


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _get_ws_ticket(client, token: str) -> str:
    resp = client.post("/api/ws/ticket", headers=_auth_headers(token))
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "ticket" in data
    assert data["expiresInSeconds"] == 30
    return data["ticket"]


def test_ws_ticket_is_single_use_and_rejects_reuse(client, student1_token):
    ticket = _get_ws_ticket(client, student1_token)

    with client.websocket_connect(f"/api/ws/notifications?ticket={ticket}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "notifications.connected"
        assert "unreadCount" in hello

    # Reusing the exact same ticket must fail
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/notifications?ticket={ticket}"):
            pass


def test_student_cannot_see_other_active_logs_pii_and_cannot_join_ended_meeting(
    client, lecturer1_token, student1_token, student2_token
):
    # Ensure CS101 has a live meeting (independent of prior test execution order)
    live_resp = client.get("/api/meetings/active", headers=_auth_headers(student1_token))
    assert live_resp.status_code == 200
    live_list = live_resp.json()
    if not live_list:
        reopen = client.post(
            "/api/meetings",
            json={"courseId": CS101_ID, "title": "CS101 Live Security Check"},
            headers=_auth_headers(lecturer1_token),
        )
        assert reopen.status_code == 200
        live_resp = client.get("/api/meetings/active", headers=_auth_headers(student1_token))
        assert live_resp.status_code == 200
        live_list = live_resp.json()

    assert len(live_list) > 0
    for item in live_list:
        assert item["activeLogs"] == [], "Student must NEVER receive other users' activeLogs PII"
        assert item["participantCount"] >= 0

    # Course meetings and meeting detail must also hide activeLogs for student
    cs101_meeting_id = live_list[0]["meetingId"]
    detail_student = client.get(
        f"/api/meetings/{cs101_meeting_id}",
        headers=_auth_headers(student1_token),
    )
    assert detail_student.status_code == 200
    assert detail_student.json()["activeLogs"] == []
    assert detail_student.json()["participantCount"] >= 1

    # Lecturer/Admin sees detailed activeLogs
    detail_lecturer = client.get(
        f"/api/meetings/{cs101_meeting_id}",
        headers=_auth_headers(lecturer1_token),
    )
    assert detail_lecturer.status_code == 200
    assert len(detail_lecturer.json()["activeLogs"]) >= 1

    # Cannot join or leave an ENDED meeting (student2 is enrolled in WEB220)
    join_ended = client.post(
        f"/api/meetings/{ENDED_WEB220_MEETING_ID}/join",
        headers=_auth_headers(student2_token),
    )
    assert join_ended.status_code in (400, 409)

    leave_ended = client.post(
        f"/api/meetings/{ENDED_WEB220_MEETING_ID}/leave",
        json={"activitySummary": "try leaving ended"},
        headers=_auth_headers(student2_token),
    )
    assert leave_ended.status_code in (400, 409)


def test_duplicate_live_meeting_conflict_replace_and_course_lecturer_can_end_admin_meeting(
    client, admin_token, lecturer1_token
):
    # Ensure CS101 has a LIVE meeting first, then creating without replaceActive returns 409
    client.post(
        "/api/meetings",
        json={"courseId": CS101_ID, "title": "CS101 Baseline Live Room", "replaceActive": True},
        headers=_auth_headers(lecturer1_token),
    )
    conflict_resp = client.post(
        "/api/meetings",
        json={"courseId": CS101_ID, "title": "Duplicate Live Room"},
        headers=_auth_headers(lecturer1_token),
    )
    assert conflict_resp.status_code == 409

    # Admin starts a new LIVE meeting on CS101 with replaceActive=True
    admin_start = client.post(
        "/api/meetings",
        json={
            "courseId": CS101_ID,
            "title": "Admin Started CS101 Live Session",
            "replaceActive": True,
        },
        headers=_auth_headers(admin_token),
    )
    assert admin_start.status_code == 200, admin_start.text
    admin_meeting_id = admin_start.json()["meetingId"]

    # Course lecturer (lecturer1) can end the meeting started by Admin
    lecturer_end = client.post(
        f"/api/meetings/{admin_meeting_id}/end",
        headers=_auth_headers(lecturer1_token),
    )
    assert lecturer_end.status_code == 200, lecturer_end.text
    assert lecturer_end.json()["status"] == "ENDED"

    # Re-open a clean LIVE meeting on CS101 for downstream tests
    reopen = client.post(
        "/api/meetings",
        json={"courseId": CS101_ID, "title": "CS101 Active Classroom"},
        headers=_auth_headers(lecturer1_token),
    )
    assert reopen.status_code == 200


def test_course_ws_chat_broadcast_persists_db_and_rejects_unauthorized(
    client, lecturer1_token, student1_token, student2_token
):
    # student2 is enrolled in WEB220, NOT enrolled in CS202
    unauth_ticket = _get_ws_ticket(client, student2_token)
    with pytest.raises(Exception):
        with client.websocket_connect(f"/api/ws/courses/{CS202_ID}?ticket={unauth_ticket}"):
            pass

    lec_ticket = _get_ws_ticket(client, lecturer1_token)
    stu_ticket = _get_ws_ticket(client, student1_token)

    with client.websocket_connect(f"/api/ws/courses/{CS101_ID}?ticket={lec_ticket}") as ws_lec:
        assert ws_lec.receive_json()["type"] == "course.connected"
        with client.websocket_connect(f"/api/ws/courses/{CS101_ID}?ticket={stu_ticket}") as ws_stu:
            assert ws_stu.receive_json()["type"] == "course.connected"

            ws_stu.send_json({"type": "chat.send", "content": "Em chao thay qua WebSocket!"})

            lec_msg = ws_lec.receive_json()
            assert lec_msg["type"] == "chat.message"
            assert lec_msg["message"]["content"] == "Em chao thay qua WebSocket!"
            assert lec_msg["message"]["senderRole"] == "STUDENT"

            stu_ack = ws_stu.receive_json()
            assert stu_ack["type"] == "chat.message"
            assert stu_ack["message"]["messageId"] == lec_msg["message"]["messageId"]

    # Confirm persisted in DB via REST GET
    msgs_resp = client.get(f"/api/courses/{CS101_ID}/messages", headers=_auth_headers(lecturer1_token))
    assert msgs_resp.status_code == 200
    assert any(m["content"] == "Em chao thay qua WebSocket!" for m in msgs_resp.json())


def test_meeting_ws_attendance_server_counts_whiteboard_and_webrtc_signaling(
    client, lecturer1_token, student1_token
):
    # Create dedicated LIVE meeting on WEB220 (owned by lecturer1, student2 enrolled; also student1 enrolled in CS101)
    # Use CS101 with replaceActive=True so both lecturer1 and student1 are members
    m_resp = client.post(
        "/api/meetings",
        json={
            "courseId": CS101_ID,
            "title": "Realtime Stage & Whiteboard Check",
            "replaceActive": True,
        },
        headers=_auth_headers(lecturer1_token),
    )
    assert m_resp.status_code == 200, m_resp.text
    meeting_id = m_resp.json()["meetingId"]

    lec_ticket = _get_ws_ticket(client, lecturer1_token)
    stu_ticket = _get_ws_ticket(client, student1_token)

    with client.websocket_connect(f"/api/ws/meetings/{meeting_id}?ticket={lec_ticket}") as ws_lec:
        lec_init = ws_lec.receive_json()
        assert lec_init["type"] == "presence.state"
        lec_peer_id = lec_init["selfPeerId"]

        with client.websocket_connect(f"/api/ws/meetings/{meeting_id}?ticket={stu_ticket}") as ws_stu:
            stu_init = ws_stu.receive_json()
            assert stu_init["type"] == "presence.state"
            stu_peer_id = stu_init["selfPeerId"]
            assert len(stu_init["participants"]) >= 2

            # Drain lecturer presence update when student joined
            lec_presence = ws_lec.receive_json()
            assert lec_presence["type"] == "presence.state"

            # 1. Server-side hand raise count
            ws_stu.send_json({"type": "hand.raise"})
            hand_lec = ws_lec.receive_json()
            assert hand_lec["type"] == "hand.state"
            assert hand_lec["raised"] is True
            hand_stu = ws_stu.receive_json()
            assert hand_stu["type"] == "hand.state"

            # 2. Server-side in-meeting chat count
            ws_stu.send_json({"type": "chat.send", "content": "Cau hoi trong phong hoc LIVE"})
            chat_lec = ws_lec.receive_json()
            assert chat_lec["type"] == "chat.message"
            assert chat_lec["message"]["content"] == "Cau hoi trong phong hoc LIVE"
            chat_stu = ws_stu.receive_json()
            assert chat_stu["type"] == "chat.message"

            # 3. Whiteboard op broadcast + snapshot persistence
            stroke_id = f"stroke-{uuid.uuid4().hex[:8]}"
            ws_lec.send_json({
                "type": "whiteboard.op",
                "op": {
                    "action": "add",
                    "stroke": {
                        "id": stroke_id,
                        "color": "#dc2626",
                        "width": 4,
                        "points": [{"x": 0.1, "y": 0.2}, {"x": 0.6, "y": 0.7}],
                    },
                },
            })
            wb_lec = ws_lec.receive_json()
            assert wb_lec["type"] == "whiteboard.op"
            wb_stu = ws_stu.receive_json()
            assert wb_stu["type"] == "whiteboard.op"
            assert wb_stu["op"]["stroke"]["id"] == stroke_id

            # Verify REST GET whiteboard snapshot persisted the stroke
            wb_rest = client.get(
                f"/api/courses/{CS101_ID}/whiteboard",
                headers=_auth_headers(student1_token),
            )
            assert wb_rest.status_code == 200
            strokes = json.loads(wb_rest.json()["strokesJson"])
            assert any(s.get("id") == stroke_id for s in strokes)

            # 4. WebRTC signaling unicast relay
            ws_lec.send_json({
                "type": "rtc.offer",
                "targetPeerId": stu_peer_id,
                "sdp": {"type": "offer", "sdp": "v=0-fake-sdp"},
            })
            offer_msg = ws_stu.receive_json()
            assert offer_msg["type"] == "rtc.offer"
            assert offer_msg["fromPeerId"] == lec_peer_id
            assert offer_msg["sdp"]["sdp"] == "v=0-fake-sdp"

    # After student disconnected, verify /leave with spoofed counts does NOT inflate server counts
    # First re-join or verify closed log on disconnect, then join & spoof leave
    audit_after_ws = client.get(
        f"/api/meetings/{meeting_id}/logs",
        headers=_auth_headers(lecturer1_token),
    )
    assert audit_after_ws.status_code == 200
    student_logs = [l for l in audit_after_ws.json() if l["userRole"] == "STUDENT"]
    assert len(student_logs) >= 1
    ws_log_id = student_logs[0]["logId"]
    latest_stu_log = student_logs[0]
    assert latest_stu_log["handRaisesCount"] == 1
    assert latest_stu_log["chatCount"] == 1
    assert latest_stu_log["leftAt"] is not None

    # Now student joins via REST and tries to spoof chatCount=99, handRaisesCount=77 in /leave
    join_rest = client.post(f"/api/meetings/{meeting_id}/join", headers=_auth_headers(student1_token))
    assert join_rest.status_code == 200
    rest_log_id = join_rest.json()["logId"]
    assert rest_log_id != ws_log_id
    spoof_leave = client.post(
        f"/api/meetings/{meeting_id}/leave",
        json={"chatCount": 99, "handRaisesCount": 77, "activitySummary": "Client summary kept"},
        headers=_auth_headers(student1_token),
    )
    assert spoof_leave.status_code == 200

    audit_after_spoof = client.get(
        f"/api/meetings/{meeting_id}/logs",
        headers=_auth_headers(lecturer1_token),
    )
    latest_after_spoof = next(
        l for l in audit_after_spoof.json()
        if l["userRole"] == "STUDENT" and l["logId"] == rest_log_id
    )
    assert latest_after_spoof["chatCount"] == 0
    assert latest_after_spoof["handRaisesCount"] == 0
    assert latest_after_spoof["activitySummary"] == "Client summary kept"


def test_whiteboard_rest_put_and_notifications_realtime_push(
    client, lecturer1_token, student1_token
):
    # PUT whiteboard REST saves & validates strokesJson
    new_strokes = json.dumps([
        {
            "id": "rest-stroke-1",
            "color": "#059669",
            "width": 3,
            "points": [{"x": 0.2, "y": 0.2}, {"x": 0.8, "y": 0.8}],
        }
    ])
    put_wb = client.put(
        f"/api/courses/{CS101_ID}/whiteboard",
        json={"strokesJson": new_strokes},
        headers=_auth_headers(lecturer1_token),
    )
    assert put_wb.status_code == 200, put_wb.text
    assert "rest-stroke-1" in put_wb.json()["strokesJson"]

    # Unread count endpoint + push_notification from sync context & background thread
    stu_ticket = _get_ws_ticket(client, student1_token)
    with client.websocket_connect(f"/api/ws/notifications?ticket={stu_ticket}") as ws_notif:
        connected = ws_notif.receive_json()
        assert connected["type"] == "notifications.connected"

        # Starting a meeting creates a Notification + pushes via push_notification
        m_resp = client.post(
            "/api/meetings",
            json={
                "courseId": CS101_ID,
                "title": "Push Notification Live Check",
                "replaceActive": True,
            },
            headers=_auth_headers(lecturer1_token),
        )
        assert m_resp.status_code == 200

        pushed = ws_notif.receive_json()
        assert pushed["type"] == "notification.created"
        assert "Push Notification Live Check" in pushed["title"]

        # Unread count endpoint reflects unread notifications
        unread_resp = client.get("/api/notifications/unread-count", headers=_auth_headers(student1_token))
        assert unread_resp.status_code == 200
        assert unread_resp.json()["unreadCount"] >= 1

        # Marking read-all pushes notification.read_all
        read_all = client.patch("/api/notifications/read-all", headers=_auth_headers(student1_token))
        assert read_all.status_code == 200
        read_all_ws = ws_notif.receive_json()
        assert read_all_ws["type"] == "notification.read_all"
        assert read_all_ws["unreadCount"] == 0

    # Calling push_notification when no socket is connected or from worker thread must NEVER raise
    errors = []

    def _call_push():
        try:
            push_notification(uuid.UUID("00000000-0000-0000-0000-000000000005"), {"type": "ping"})
        except Exception as exc:  # pragma: no cover
            errors.append(exc)

    t = threading.Thread(target=_call_push)
    t.start()
    t.join()
    assert errors == []
