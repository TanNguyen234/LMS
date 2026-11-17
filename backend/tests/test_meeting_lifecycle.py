import asyncio
import uuid
from datetime import timedelta

from backend.app.db.seed_demo import MEETING_CS101_ID, ensure_demo_seed
from backend.app.db.session import SessionLocal
from backend.app.models.models import Course, Meeting, MeetingLog, User, utcnow
from backend.app.realtime.meeting_lifecycle import (
    cancel_empty_meeting_cleanup,
    cleanup_stale_live_meetings,
    schedule_empty_meeting_cleanup,
)


def test_demo_seed_has_no_empty_live_meeting(client):
    """Demo seed must not leave an unstaffed CS101 meeting in LIVE state on startup."""
    db = SessionLocal()
    try:
        ensure_demo_seed(db)
        meeting = db.query(Meeting).filter(Meeting.MeetingId == MEETING_CS101_ID).first()
        assert meeting is not None
        assert meeting.Status == "ENDED"
        assert meeting.EndedAt is not None

        open_logs = (
            db.query(MeetingLog)
            .filter(MeetingLog.MeetingId == MEETING_CS101_ID, MeetingLog.LeftAt.is_(None))
            .all()
        )
        assert open_logs == []
    finally:
        db.close()


def test_startup_cleanup_closes_orphaned_live_meetings(client):
    """Orphaned LIVE meetings with zero active WS connections must close on startup cleanup."""
    db = SessionLocal()
    meeting_id = uuid.uuid4()
    try:
        course = db.query(Course).first()
        lecturer = db.query(User).filter(User.Role == "LECTURER").first()
        assert course is not None and lecturer is not None

        stale_meeting = Meeting(
            MeetingId=meeting_id,
            CourseId=course.CourseId,
            HostId=lecturer.UserId,
            Title="Orphaned LIVE Meeting",
            RoomCode=f"ORPHAN-{meeting_id.hex[:6].upper()}",
            Status="LIVE",
            StartedAt=utcnow() - timedelta(minutes=10),
            CreatedAt=utcnow() - timedelta(minutes=10),
        )
        db.add(stale_meeting)
        db.flush()

        stale_log = MeetingLog(
            MeetingId=meeting_id,
            UserId=lecturer.UserId,
            JoinedAt=utcnow() - timedelta(minutes=10),
        )
        db.add(stale_log)
        db.commit()

        closed_count = cleanup_stale_live_meetings(db)
        assert closed_count >= 1

        db.refresh(stale_meeting)
        db.refresh(stale_log)
        assert stale_meeting.Status == "ENDED"
        assert stale_meeting.EndedAt is not None
        assert stale_log.LeftAt is not None
    finally:
        db.query(MeetingLog).filter(MeetingLog.MeetingId == meeting_id).delete()
        db.query(Meeting).filter(Meeting.MeetingId == meeting_id).delete()
        db.commit()
        db.close()


def test_empty_room_auto_ends_after_grace_period(client, lecturer1_token):
    """An empty LIVE room with 0 WS connections auto-ends once grace period expires."""
    courses = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"}).json()
    course_id = courses[0]["courseId"]

    resp = client.post(
        "/api/meetings",
        json={"courseId": course_id, "title": "Auto Close Empty Room", "replaceActive": True},
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert resp.status_code == 200
    meeting_id = uuid.UUID(resp.json()["meetingId"])

    async def _run_grace():
        schedule_empty_meeting_cleanup(meeting_id, delay_seconds=0.05)
        await asyncio.sleep(0.15)

    asyncio.run(_run_grace())

    detail = client.get(
        f"/api/meetings/{meeting_id}",
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "ENDED"
    assert detail.json()["participantCount"] == 0


def test_cancel_cleanup_keeps_meeting_live(client, lecturer1_token):
    """Cancelling scheduled cleanup (as on WS join) keeps meeting LIVE."""
    courses = client.get("/api/courses", headers={"Authorization": f"Bearer {lecturer1_token}"}).json()
    course_id = courses[0]["courseId"]

    resp = client.post(
        "/api/meetings",
        json={"courseId": course_id, "title": "Cancel Cleanup Room", "replaceActive": True},
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert resp.status_code == 200
    meeting_id = uuid.UUID(resp.json()["meetingId"])

    async def _run_cancel():
        schedule_empty_meeting_cleanup(meeting_id, delay_seconds=0.05)
        cancel_empty_meeting_cleanup(meeting_id)
        await asyncio.sleep(0.12)

    asyncio.run(_run_cancel())

    detail = client.get(
        f"/api/meetings/{meeting_id}",
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert detail.status_code == 200
    assert detail.json()["status"] == "LIVE"


def _ws_ticket(client, token: str) -> str:
    resp = client.post("/api/ws/ticket", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    return resp.json()["ticket"]


def test_meeting_ws_reactions_moderation_and_live_poll(
    client, lecturer1_token, student1_token
):
    """Meeting WS supports reactions, host moderation (lecturer/admin only), and live room polls."""
    m_resp = client.post(
        "/api/meetings",
        json={
            "courseId": "10000000-0000-0000-0000-000000000001",
            "title": "Teams UX WS Features",
            "replaceActive": True,
        },
        headers={"Authorization": f"Bearer {lecturer1_token}"},
    )
    assert m_resp.status_code == 200
    meeting_id = m_resp.json()["meetingId"]

    lec_ticket = _ws_ticket(client, lecturer1_token)
    stu_ticket = _ws_ticket(client, student1_token)

    try:
        with client.websocket_connect(f"/api/ws/meetings/{meeting_id}?ticket={lec_ticket}") as ws_lec:
            lec_init = ws_lec.receive_json()
            assert lec_init["type"] == "presence.state"

            with client.websocket_connect(f"/api/ws/meetings/{meeting_id}?ticket={stu_ticket}") as ws_stu:
                stu_init = ws_stu.receive_json()
                assert stu_init["type"] == "presence.state"
                stu_peer_id = stu_init["selfPeerId"]
                # Drain lecturer's presence update
                assert ws_lec.receive_json()["type"] == "presence.state"

                # 1. Reaction broadcast
                ws_stu.send_json({"type": "reaction.send", "emoji": "clap"})
                rx_lec = ws_lec.receive_json()
                assert rx_lec["type"] == "reaction.event"
                assert rx_lec["emoji"] == "clap"
                rx_stu = ws_stu.receive_json()
                assert rx_stu["type"] == "reaction.event"

                # 2. Student cannot invoke moderation
                ws_stu.send_json({"type": "moderation.mute_all"})
                err_msg = ws_stu.receive_json()
                assert err_msg["type"] == "error"

                # Student turns audio on + raises hand
                ws_stu.send_json({"type": "media.state", "audio": True, "video": False, "screen": False})
                assert ws_lec.receive_json()["type"] == "media.state"
                ws_stu.send_json({"type": "hand.raise"})
                assert ws_lec.receive_json()["type"] == "hand.state"
                assert ws_stu.receive_json()["type"] == "hand.state"

                # Lecturer mutes target peer
                ws_lec.send_json({"type": "moderation.mute_peer", "targetPeerId": stu_peer_id})
                stu_force = ws_stu.receive_json()
                assert stu_force["type"] == "moderation.force_mute"
                assert ws_lec.receive_json()["type"] == "media.state"
                assert ws_stu.receive_json()["type"] == "media.state"

                # Lecturer lowers all hands
                ws_lec.send_json({"type": "moderation.lower_all_hands"})
                p_lec = ws_lec.receive_json()
                p_stu = ws_stu.receive_json()
                assert p_lec["type"] == "presence.state"
                assert all(not p["handRaised"] for p in p_lec["participants"])
                assert p_stu["type"] == "presence.state"

                # 3. Live Poll create -> vote -> close
                ws_lec.send_json({
                    "type": "poll.create",
                    "question": "Các bạn đã hiểu thuật toán chưa?",
                    "options": ["Đã hiểu", "Cần giải thích thêm"],
                })
                poll_lec = ws_lec.receive_json()
                poll_stu = ws_stu.receive_json()
                assert poll_lec["type"] == "poll.state"
                assert poll_lec["poll"]["question"] == "Các bạn đã hiểu thuật toán chưa?"
                poll_id = poll_stu["poll"]["pollId"]

                ws_stu.send_json({"type": "poll.vote", "pollId": poll_id, "optionIndex": 0})
                v_lec = ws_lec.receive_json()
                v_stu = ws_stu.receive_json()
                assert v_lec["type"] == "poll.state"
                assert v_lec["poll"]["totalVotes"] == 1
                assert v_stu["poll"]["counts"][0] == 1

                ws_lec.send_json({"type": "poll.close", "pollId": poll_id})
                c_lec = ws_lec.receive_json()
                c_stu = ws_stu.receive_json()
                assert c_lec["type"] == "poll.state"
                assert c_lec["poll"]["isOpen"] is False
                assert c_stu["poll"]["isOpen"] is False
    finally:
        client.post(f"/api/meetings/{meeting_id}/end", headers={"Authorization": f"Bearer {lecturer1_token}"})
