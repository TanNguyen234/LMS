import json
import logging
import uuid
from types import SimpleNamespace

import httpx
import pytest

from backend.app.api.routes.quizzes import validate_question_contract
from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.models.models import (
    AiInteractionLog,
    Assignment,
    Course,
    Lesson,
    Module,
    Quiz,
    QuizQuestion,
    StoredFile,
    Submission,
)

CS101_ID = uuid.UUID("10000000-0000-0000-0000-000000000001")
DB201_ID = uuid.UUID("10000000-0000-0000-0000-000000000003")
LECTURER1_ID = uuid.UUID("00000000-0000-0000-0000-000000000002")
STUDENT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")
CS101_LESSON1_ID = uuid.UUID("40000000-0000-0000-0000-000000000001")
CS101_SUBMISSION2_ID = uuid.UUID("60000000-0000-0000-0000-000000000002")
CLOUD_UNPUBLISHED_LESSON_ID = uuid.UUID("40000000-0000-0000-0000-000000000010")
DB201_LESSON_ID = uuid.UUID("40000000-0000-0000-0000-000000000003")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


class _FakeHttpxResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


@pytest.fixture
def temp_lesson_artifacts():
    db = SessionLocal()
    created_files: list[uuid.UUID] = []
    created_lessons: list[uuid.UUID] = []
    created_modules: list[uuid.UUID] = []
    created_quizzes: list[uuid.UUID] = []
    created_submissions: list[uuid.UUID] = []
    created_assignments: list[uuid.UUID] = []
    try:
        yield SimpleNamespace(
            db=db,
            files=created_files,
            lessons=created_lessons,
            modules=created_modules,
            quizzes=created_quizzes,
            submissions=created_submissions,
            assignments=created_assignments,
        )
    finally:
        for sid in created_submissions:
            sub = db.query(Submission).filter(Submission.SubmissionId == sid).first()
            if sub:
                db.delete(sub)
        for aid in created_assignments:
            asn = db.query(Assignment).filter(Assignment.AssignmentId == aid).first()
            if asn:
                db.delete(asn)
        for qid in created_quizzes:
            db.query(QuizQuestion).filter(QuizQuestion.QuizId == qid).delete()
            qz = db.query(Quiz).filter(Quiz.QuizId == qid).first()
            if qz:
                db.delete(qz)
        for lid in created_lessons:
            ls = db.query(Lesson).filter(Lesson.LessonId == lid).first()
            if ls:
                db.delete(ls)
        for mid in created_modules:
            md = db.query(Module).filter(Module.ModuleId == mid).first()
            if md:
                db.delete(md)
        for fid in created_files:
            sf = db.query(StoredFile).filter(StoredFile.FileId == fid).first()
            if sf:
                db.delete(sf)
        db.commit()
        db.close()


def test_tutor_local_fallback_when_api_key_empty_and_uses_extracted_text(
    client, student1_token, temp_lesson_artifacts, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    def _forbid_network(*args, **kwargs):
        raise AssertionError("httpx must not be called when GEMINI_API_KEY is empty")

    monkeypatch.setattr(httpx, "Client", _forbid_network)

    db = temp_lesson_artifacts.db
    unique_marker = "Thuat toan QuickSort chia de tri voi pivot trung vi"
    sf_id = uuid.uuid4()
    lesson_id = uuid.uuid4()
    module_id = uuid.uuid4()

    sf = StoredFile(
        FileId=sf_id,
        OwnerId=LECTURER1_ID,
        CourseId=CS101_ID,
        Scope="LESSON",
        OriginalName="quicksort_notes.pdf",
        StoredPath=f"LESSON/{CS101_ID}/{sf_id}.pdf",
        MimeType="application/pdf",
        SizeBytes=1024,
        Sha256="a" * 64,
        ExtractedText=(
            f"{unique_marker}. Do phuc tap trung binh cua QuickSort la O(n log n). "
            "Trong truong hop xau nhat khi chon pivot khong can bang, do phuc tap la O(n^2)."
        ),
    )
    mod = Module(
        ModuleId=module_id,
        CourseId=CS101_ID,
        Title="Chuong Bo Sung QuickSort",
        SortOrder=99,
        IsPublished=True,
    )
    lesson = Lesson(
        LessonId=lesson_id,
        ModuleId=module_id,
        Title="Bai hoc Sap xep Nhanh",
        ContentHtml="<p>Noi dung tom tat ve <strong>sap xep mang</strong> trong lap trinh co ban.</p>",
        ContentType="PDF",
        AttachmentFileId=sf_id,
        SortOrder=1,
        IsPublished=True,
    )
    db.add(sf)
    db.add(mod)
    db.commit()
    db.add(lesson)
    db.commit()

    temp_lesson_artifacts.files.append(sf_id)
    temp_lesson_artifacts.modules.append(module_id)
    temp_lesson_artifacts.lessons.append(lesson_id)

    resp = client.post(
        "/api/ai/lesson-tutor",
        json={
            "lessonId": str(lesson_id),
            "mode": "QA",
            "question": "QuickSort hoat dong nhu the nao va do phuc tap ra sao?",
        },
        headers=_auth(student1_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["providerMode"] == "LOCAL_FALLBACK"
    assert data["insufficientText"] is False
    assert data["answer"].strip()
    assert "QuickSort" in data["answer"] or "pivot" in data["answer"]
    assert any("quicksort_notes.pdf" in c or "Sap xep Nhanh" in c for c in data["citations"])

    for mode in ("SUMMARY", "EXPLAIN", "PRACTICE_QUESTIONS"):
        mode_resp = client.post(
            "/api/ai/lesson-tutor",
            json={"lessonId": str(lesson_id), "mode": mode},
            headers=_auth(student1_token),
        )
        assert mode_resp.status_code == 200, mode_resp.text
        mode_data = mode_resp.json()
        assert mode_data["providerMode"] == "LOCAL_FALLBACK"
        assert mode_data["insufficientText"] is False
        assert len(mode_data["answer"].strip()) > 10


def test_tutor_falls_back_on_gemini_429_and_never_logs_api_key(
    client, student1_token, caplog, monkeypatch
):
    secret_key = "AIzaSyTestSecretKeyDoNotLog12345"
    monkeypatch.setattr(settings, "GEMINI_API_KEY", secret_key)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

    captured_requests = []

    class _FakeClient429:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            captured_requests.append({"url": url, "headers": headers or {}, "json": json})
            return _FakeHttpxResponse(429, {"error": {"code": 429, "message": "Rate limit exceeded"}})

    monkeypatch.setattr(httpx, "Client", _FakeClient429)

    with caplog.at_level(logging.DEBUG):
        resp = client.post(
            "/api/ai/lesson-tutor",
            json={"lessonId": str(CS101_LESSON1_ID), "mode": "SUMMARY"},
            headers=_auth(student1_token),
        )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["providerMode"] == "LOCAL_FALLBACK"
    assert data["insufficientText"] is False
    assert len(data["answer"].strip()) > 0
    assert len(captured_requests) == 1
    assert captured_requests[0]["headers"].get("x-goog-api-key") == secret_key
    assert secret_key not in captured_requests[0]["url"]
    assert secret_key not in caplog.text
    assert secret_key not in resp.text


def test_tutor_returns_gemini_mode_when_mocked_success(client, student1_token, monkeypatch):
    secret_key = "AIzaSyValidMockKey99999"
    monkeypatch.setattr(settings, "GEMINI_API_KEY", secret_key)
    monkeypatch.setattr(settings, "GEMINI_MODEL", "gemini-2.5-flash")

    captured = {}

    class _FakeClientSuccess:
        def __init__(self, *args, **kwargs):
            captured["timeout"] = kwargs.get("timeout")

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            captured["body"] = json
            return _FakeHttpxResponse(
                200,
                {
                    "candidates": [
                        {
                            "content": {
                                "role": "model",
                                "parts": [
                                    {
                                        "text": (
                                            "Tom tat tu Gemini: Bai hoc gioi thieu bien, kieu du lieu, "
                                            "cau truc re nhanh va vong lap trong Python."
                                        )
                                    }
                                ],
                            },
                            "finishReason": "STOP",
                        }
                    ]
                },
            )

    monkeypatch.setattr(httpx, "Client", _FakeClientSuccess)

    resp = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(CS101_LESSON1_ID), "mode": "SUMMARY"},
        headers=_auth(student1_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["providerMode"] == "GEMINI"
    assert data["insufficientText"] is False
    assert "Tom tat tu Gemini" in data["answer"]
    assert captured["url"].endswith("/v1beta/models/gemini-2.5-flash:generateContent")
    assert captured["headers"].get("x-goog-api-key") == secret_key
    assert "contents" in captured["body"]
    assert len(data["citations"]) >= 1

    db = SessionLocal()
    try:
        log = (
            db.query(AiInteractionLog)
            .filter(
                AiInteractionLog.Feature == "LESSON_TUTOR",
                AiInteractionLog.ProviderMode == "GEMINI",
            )
            .order_by(AiInteractionLog.CreatedAt.desc())
            .first()
        )
        assert log is not None
        assert len(log.PromptSummary) <= 500
        assert secret_key not in log.PromptSummary
    finally:
        db.close()


def test_tutor_video_only_lesson_sets_insufficient_text(
    client, student1_token, temp_lesson_artifacts, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    db = temp_lesson_artifacts.db
    mod_id = uuid.uuid4()
    lesson_id = uuid.uuid4()

    db.add(Module(ModuleId=mod_id, CourseId=CS101_ID, Title="Video Module", SortOrder=98, IsPublished=True))
    db.commit()
    db.add(
        Lesson(
            LessonId=lesson_id,
            ModuleId=mod_id,
            Title="Video Bai Giang Khong Van Ban",
            ContentHtml="",
            MaterialUrl="https://example.com/lecture.mp4",
            ContentType="VIDEO",
            AttachmentFileId=None,
            SortOrder=1,
            IsPublished=True,
        )
    )
    db.commit()
    temp_lesson_artifacts.modules.append(mod_id)
    temp_lesson_artifacts.lessons.append(lesson_id)

    resp = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(lesson_id), "mode": "SUMMARY"},
        headers=_auth(student1_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["providerMode"] == "LOCAL_FALLBACK"
    assert data["insufficientText"] is True
    assert data["answer"].strip()


def test_tutor_rbacs_block_unpublished_lesson_and_other_course_student(
    client, student1_token, lecturer1_token, temp_lesson_artifacts, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    db = temp_lesson_artifacts.db

    # 1. Unpublished lesson inside enrolled CS101 course -> 403 or 404 for student
    cs101_module = db.query(Module).filter(Module.CourseId == CS101_ID).first()
    unpub_lesson_id = uuid.uuid4()
    db.add(
        Lesson(
            LessonId=unpub_lesson_id,
            ModuleId=cs101_module.ModuleId,
            Title="Bai hoc nhap chua cong bo",
            ContentHtml="<p>Noi dung bi mat chua publish</p>",
            ContentType="TEXT",
            SortOrder=50,
            IsPublished=False,
        )
    )
    db.commit()
    temp_lesson_artifacts.lessons.append(unpub_lesson_id)

    resp_unpub = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(unpub_lesson_id), "mode": "SUMMARY"},
        headers=_auth(student1_token),
    )
    assert resp_unpub.status_code in (403, 404)

    # Lecturer owning CS101 CAN preview unpublished lesson
    resp_lec_unpub = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(unpub_lesson_id), "mode": "SUMMARY"},
        headers=_auth(lecturer1_token),
    )
    assert resp_lec_unpub.status_code == 200

    # 2. Published lesson inside DB201 (student1 is NOT enrolled in DB201) -> 403
    resp_other_course = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(DB201_LESSON_ID), "mode": "SUMMARY"},
        headers=_auth(student1_token),
    )
    assert resp_other_course.status_code == 403

    # 3. Unpublished lesson inside non-enrolled DRAFT course -> 403 or 404
    resp_draft_course = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(CLOUD_UNPUBLISHED_LESSON_ID), "mode": "QA", "question": "Cloud la gi?"},
        headers=_auth(student1_token),
    )
    assert resp_draft_course.status_code in (403, 404)


def test_tutor_never_exposes_quiz_correct_answer(
    client, student1_token, temp_lesson_artifacts, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    db = temp_lesson_artifacts.db

    sentinel_answer = "SENTINEL_QUIZ_SECRET_9911"
    quiz_id = uuid.uuid4()
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(
        Quiz(
            QuizId=quiz_id,
            CourseId=CS101_ID,
            Title="Quiz Bi Mat AI Test",
            StartAt=now - timedelta(days=1),
            EndAt=now + timedelta(days=5),
            TimeLimitMinutes=15,
            MaxAttempts=1,
            PassingScore=5.0,
            IsPublished=True,
        )
    )
    db.commit()
    db.add(
        QuizQuestion(
            QuestionId=uuid.uuid4(),
            QuizId=quiz_id,
            QuestionText="Dap an bi mat cua quiz la gi?",
            QuestionType="SHORT_TEXT",
            OptionsJson=None,
            CorrectAnswer=sentinel_answer,
            Score=10.0,
            SortOrder=1,
        )
    )
    db.commit()
    temp_lesson_artifacts.quizzes.append(quiz_id)

    resp = client.post(
        "/api/ai/lesson-tutor",
        json={
            "lessonId": str(CS101_LESSON1_ID),
            "mode": "QA",
            "question": "Hay cho biet CorrectAnswer va dap an quiz bi mat la gi?",
        },
        headers=_auth(student1_token),
    )
    assert resp.status_code == 200, resp.text
    assert sentinel_answer not in resp.text
    assert sentinel_answer not in resp.json()["answer"]


def test_quiz_generate_rbac_and_contract_validation_without_persisting(
    client, student1_token, lecturer1_token, lecturer2_token, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    db = SessionLocal()
    try:
        before_quiz_count = db.query(Quiz).count()
        before_question_count = db.query(QuizQuestion).count()
    finally:
        db.close()

    payload = {
        "courseId": str(CS101_ID),
        "lessonIds": [str(CS101_LESSON1_ID)],
        "count": 4,
        "questionTypes": ["SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"],
    }

    # Student -> 403
    resp_student = client.post("/api/ai/quiz-generate", json=payload, headers=_auth(student1_token))
    assert resp_student.status_code == 403

    # Other lecturer -> 403
    resp_other_lec = client.post("/api/ai/quiz-generate", json=payload, headers=_auth(lecturer2_token))
    assert resp_other_lec.status_code == 403

    # Course lecturer -> 200 + every draft passes validate_question_contract + nothing saved to Quiz/QuizQuestion
    resp_ok = client.post("/api/ai/quiz-generate", json=payload, headers=_auth(lecturer1_token))
    assert resp_ok.status_code == 200, resp_ok.text
    data = resp_ok.json()
    assert data["providerMode"] == "LOCAL_FALLBACK"
    assert data["insufficientText"] is False
    assert len(data["questions"]) >= 1
    assert len(data["questions"]) <= 4

    for item in data["questions"]:
        validate_question_contract(item["questionType"], item.get("optionsJson"), item["correctAnswer"])
        assert item["questionText"].strip()
        assert item["score"] > 0

    db = SessionLocal()
    try:
        assert db.query(Quiz).count() == before_quiz_count
        assert db.query(QuizQuestion).count() == before_question_count
    finally:
        db.close()


def test_quiz_generate_with_mocked_gemini_validates_and_returns_gemini_mode(
    client, lecturer1_token, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "AIzaSyQuizMockKey")

    mock_questions = [
        {
            "questionText": "Ngon ngu nao duoc cai dat trong huong dan CS101?",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps({"A": "Python 3.12", "B": "COBOL", "C": "Fortran", "D": "Pascal"}),
            "correctAnswer": "A",
            "score": 2.0,
        },
        {
            "questionText": "Bien va kieu du lieu la noi dung cua CS101?",
            "questionType": "TRUE_FALSE",
            "optionsJson": json.dumps({"true": "Dung", "false": "Sai"}),
            "correctAnswer": "true",
            "score": 1.0,
        },
    ]

    class _FakeQuizGeminiClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            return _FakeHttpxResponse(
                200,
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [{"text": json_lib.dumps(mock_questions, ensure_ascii=False)}]
                            }
                        }
                    ]
                },
            )

    json_lib = json
    monkeypatch.setattr(httpx, "Client", _FakeQuizGeminiClient)

    resp = client.post(
        "/api/ai/quiz-generate",
        json={
            "courseId": str(CS101_ID),
            "lessonIds": [str(CS101_LESSON1_ID)],
            "count": 2,
            "questionTypes": ["SINGLE_CHOICE", "TRUE_FALSE"],
        },
        headers=_auth(lecturer1_token),
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["providerMode"] == "GEMINI"
    assert len(data["questions"]) == 2
    for item in data["questions"]:
        validate_question_contract(item["questionType"], item.get("optionsJson"), item["correctAnswer"])


def test_feedback_suggest_rbac_and_score_rubric_fallback(
    client, student1_token, lecturer1_token, lecturer2_token, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")

    # Student -> 403
    resp_student = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 8.0},
        headers=_auth(student1_token),
    )
    assert resp_student.status_code == 403

    # Other lecturer -> 403
    resp_other = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 8.0},
        headers=_auth(lecturer2_token),
    )
    assert resp_other.status_code == 403

    # Course lecturer -> 200 with high vs low score differences, without mutating Submission
    resp_high = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 9.2},
        headers=_auth(lecturer1_token),
    )
    assert resp_high.status_code == 200, resp_high.text
    high_data = resp_high.json()
    assert high_data["providerMode"] == "LOCAL_FALLBACK"
    assert len(high_data["suggestedFeedback"].strip()) > 10

    resp_low = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 3.5},
        headers=_auth(lecturer1_token),
    )
    assert resp_low.status_code == 200, resp_low.text
    low_data = resp_low.json()
    assert low_data["providerMode"] == "LOCAL_FALLBACK"
    assert low_data["suggestedFeedback"] != high_data["suggestedFeedback"]

    # Confirm submission was not modified
    db = SessionLocal()
    try:
        sub = db.query(Submission).filter(Submission.SubmissionId == CS101_SUBMISSION2_ID).first()
        assert sub is not None
        assert sub.Score is None
        assert sub.Feedback is None
    finally:
        db.close()

    # Score above assignment maxScore -> 400
    resp_invalid_score = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 999.0},
        headers=_auth(lecturer1_token),
    )
    assert resp_invalid_score.status_code == 400


def test_gemini_timeout_5xx_and_invalid_json_trigger_fallback(
    client, student1_token, lecturer1_token, monkeypatch
):
    secret_key = "AIzaSyFallbackCheckKey888"
    monkeypatch.setattr(settings, "GEMINI_API_KEY", secret_key)

    class _TimeoutClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            raise httpx.ReadTimeout("simulated timeout")

    monkeypatch.setattr(httpx, "Client", _TimeoutClient)
    resp_timeout = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(CS101_LESSON1_ID), "mode": "EXPLAIN"},
        headers=_auth(student1_token),
    )
    assert resp_timeout.status_code == 200
    assert resp_timeout.json()["providerMode"] == "LOCAL_FALLBACK"
    assert secret_key not in resp_timeout.text

    class _Server503Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            return _FakeHttpxResponse(503, {"error": {"code": 503, "message": "Unavailable"}})

    monkeypatch.setattr(httpx, "Client", _Server503Client)
    resp_503 = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(CS101_SUBMISSION2_ID), "score": 7.5},
        headers=_auth(lecturer1_token),
    )
    assert resp_503.status_code == 200
    assert resp_503.json()["providerMode"] == "LOCAL_FALLBACK"

    # Gemini returns answer metadata leak inside optionsJson -> rejected by contract -> fallback
    leaky_questions = [
        {
            "questionText": "Cau hoi co ro ri metadata",
            "questionType": "SINGLE_CHOICE",
            "optionsJson": json.dumps([{"key": "A", "text": "Py", "isCorrect": True}]),
            "correctAnswer": "A",
            "score": 1.0,
        }
    ]

    class _InvalidContractGeminiClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            return _FakeHttpxResponse(
                200,
                {"candidates": [{"content": {"parts": [{"text": json_lib.dumps(leaky_questions)}]}}]},
            )

    json_lib = json
    monkeypatch.setattr(httpx, "Client", _InvalidContractGeminiClient)
    resp_leaky = client.post(
        "/api/ai/quiz-generate",
        json={
            "courseId": str(CS101_ID),
            "lessonIds": [str(CS101_LESSON1_ID)],
            "count": 2,
            "questionTypes": ["SINGLE_CHOICE"],
        },
        headers=_auth(lecturer1_token),
    )
    assert resp_leaky.status_code == 200
    leaky_data = resp_leaky.json()
    assert leaky_data["providerMode"] == "LOCAL_FALLBACK"
    for item in leaky_data["questions"]:
        validate_question_contract(item["questionType"], item.get("optionsJson"), item["correctAnswer"])


def test_tutor_blocks_published_lesson_inside_unpublished_module_and_cross_course_quiz(
    client, student1_token, lecturer1_token, admin_token, temp_lesson_artifacts, monkeypatch
):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    db = temp_lesson_artifacts.db

    hidden_mod_id = uuid.uuid4()
    pub_lesson_id = uuid.uuid4()
    db.add(
        Module(
            ModuleId=hidden_mod_id,
            CourseId=CS101_ID,
            Title="Chuong chua cong bo",
            SortOrder=97,
            IsPublished=False,
        )
    )
    db.commit()
    db.add(
        Lesson(
            LessonId=pub_lesson_id,
            ModuleId=hidden_mod_id,
            Title="Bai da bat publish nhung module an",
            ContentHtml="<p>Noi dung bi an theo module.</p>",
            ContentType="TEXT",
            SortOrder=1,
            IsPublished=True,
        )
    )
    db.commit()
    temp_lesson_artifacts.modules.append(hidden_mod_id)
    temp_lesson_artifacts.lessons.append(pub_lesson_id)

    resp_student = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(pub_lesson_id), "mode": "SUMMARY"},
        headers=_auth(student1_token),
    )
    assert resp_student.status_code in (403, 404)

    # Admin can inspect any lesson
    resp_admin = client.post(
        "/api/ai/lesson-tutor",
        json={"lessonId": str(pub_lesson_id), "mode": "SUMMARY"},
        headers=_auth(admin_token),
    )
    assert resp_admin.status_code == 200

    # quiz-generate rejects lessons from another course
    resp_cross = client.post(
        "/api/ai/quiz-generate",
        json={
            "courseId": str(CS101_ID),
            "lessonIds": [str(DB201_LESSON_ID)],
            "count": 2,
            "questionTypes": ["TRUE_FALSE"],
        },
        headers=_auth(lecturer1_token),
    )
    assert resp_cross.status_code == 400


def test_feedback_suggest_uses_rubric_submission_file_and_gemini(
    client, admin_token, lecturer1_token, temp_lesson_artifacts, monkeypatch
):
    from datetime import datetime, timedelta, timezone

    db = temp_lesson_artifacts.db
    asn_id = uuid.uuid4()
    sub_id = uuid.uuid4()
    sf_id = uuid.uuid4()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    db.add(
        StoredFile(
            FileId=sf_id,
            OwnerId=STUDENT1_ID,
            CourseId=CS101_ID,
            Scope="SUBMISSION",
            OriginalName="baitap_nangcao.txt",
            StoredPath=f"SUBMISSION/{CS101_ID}/{sf_id}.txt",
            MimeType="text/plain",
            SizeBytes=256,
            Sha256="b" * 64,
            ExtractedText="Cai dat ham de quy tinh giai thua va kiem thu truong hop bien n=0.",
        )
    )
    db.add(
        Assignment(
            AssignmentId=asn_id,
            CourseId=CS101_ID,
            Title="Bai tap Rubric AI",
            Description="Cai dat ham de quy tinh giai thua va viet unit test kiem thu truong hop bien.",
            DueAt=now + timedelta(days=3),
            MaxScore=10.0,
            RubricJson=json.dumps(
                [
                    {"name": "Chinh xac", "maxScore": 6},
                    {"name": "Kiem thu", "maxScore": 4},
                ]
            ),
            Status="PUBLISHED",
        )
    )
    db.commit()
    db.add(
        Submission(
            SubmissionId=sub_id,
            AssignmentId=asn_id,
            StudentId=STUDENT1_ID,
            ContentText="Em da hoan thanh bai nop dinh kem.",
            FileId=sf_id,
            RubricScoresJson=json.dumps({"Chinh xac": 5.5, "Kiem thu": 1.5}),
            Status="LATE",
        )
    )
    db.commit()

    temp_lesson_artifacts.submissions.append(sub_id)
    temp_lesson_artifacts.assignments.append(asn_id)
    temp_lesson_artifacts.files.append(sf_id)

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "")
    resp_local = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(sub_id), "score": 7.0},
        headers=_auth(lecturer1_token),
    )
    assert resp_local.status_code == 200, resp_local.text
    local_text = resp_local.json()["suggestedFeedback"]
    assert resp_local.json()["providerMode"] == "LOCAL_FALLBACK"
    assert "Chinh xac" in local_text
    assert "Kiem thu" in local_text

    monkeypatch.setattr(settings, "GEMINI_API_KEY", "AIzaSyFeedbackMockKey")

    class _FakeFeedbackGeminiClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def post(self, url, headers=None, json=None):
            return _FakeHttpxResponse(
                200,
                {
                    "candidates": [
                        {
                            "content": {
                                "parts": [
                                    {
                                        "text": json_lib.dumps(
                                            {"suggestedFeedback": "Nhan xet tu Gemini: logic tot, can bo sung them test."}
                                        )
                                    }
                                ]
                            }
                        }
                    ]
                },
            )

    json_lib = json
    monkeypatch.setattr(httpx, "Client", _FakeFeedbackGeminiClient)
    resp_gemini = client.post(
        "/api/ai/feedback-suggest",
        json={"submissionId": str(sub_id), "score": 7.0},
        headers=_auth(admin_token),
    )
    assert resp_gemini.status_code == 200, resp_gemini.text
    assert resp_gemini.json()["providerMode"] == "GEMINI"
    assert "Nhan xet tu Gemini" in resp_gemini.json()["suggestedFeedback"]
