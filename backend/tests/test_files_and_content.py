import io
import uuid
import zipfile
from pathlib import Path

import pytest

from backend.app.core.config import settings
from backend.app.db.session import SessionLocal
from backend.app.models.models import Lesson, LessonProgress, Module, StoredFile

CS101_ID = "10000000-0000-0000-0000-000000000001"
DB201_ID = "10000000-0000-0000-0000-000000000003"
SEED_PDF_FILE_ID = "f0000000-0000-0000-0000-000000000001"
STUDENT1_ID = uuid.UUID("00000000-0000-0000-0000-000000000005")


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _build_pdf_bytes(text: str = "CS101 Sample PDF Content") -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream_bytes = f"BT\n/F1 12 Tf\n50 750 Td\n({escaped}) Tj\nET\n".encode("latin-1")
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


def _build_docx_bytes(paragraph_text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            "</Types>",
        )
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>"
            + paragraph_text
            + "</w:t></w:r></w:p></w:body></w:document>",
        )
    return buf.getvalue()


def _build_pptx_bytes(slides: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="xml" ContentType="application/xml"/>'
            "</Types>",
        )
        zf.writestr("ppt/presentation.xml", "<p:presentation/>")
        for idx, text in enumerate(slides, start=1):
            zf.writestr(
                f"ppt/slides/slide{idx}.xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
                'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
                f"<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>"
                "</p:sld>",
            )
    return buf.getvalue()


def _build_zip_bytes() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("readme.txt", "Archive payload")
    return buf.getvalue()


def _build_minimal_mp4_bytes(size: int = 128) -> bytes:
    header = b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2mp41"
    if size <= len(header):
        return header
    return header + bytes((i % 251 for i in range(size - len(header))))


def _build_minimal_webm_bytes(size: int = 96) -> bytes:
    header = b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01\x42\x82\x84webm"
    return header + b"\x00" * max(0, size - len(header))


@pytest.fixture
def temp_vault(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "FILE_VAULT_DIR", str(tmp_path))
    return tmp_path


def test_upload_rejects_dangerous_extensions_and_spoofed_magic_bytes(
    client, lecturer1_token, student1_token, temp_vault
):
    dangerous_cases = [
        ("payload.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream"),
        ("xss.html", b"<html><script>alert(1)</script></html>", "text/html"),
        ("vector.svg", b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>', "image/svg+xml"),
        ("script.js", b"alert('xss');", "application/javascript"),
        ("run.ps1", b"Write-Host 'hi'", "text/plain"),
        ("run.bat", b"@echo off", "text/plain"),
        ("fake.pdf", b"<html><script>alert(1)</script></html>", "application/pdf"),
        ("fake_exe.pdf", b"MZ\x90\x00\x03\x00\x00\x00%PDF-1.4", "application/pdf"),
        ("fake.png", b"not a png file at all", "image/png"),
        ("fake.jpg", b"not a jpeg file", "image/jpeg"),
        ("fake.webp", b"RIFF1234NOTWEBP", "image/webp"),
        ("fake.mp4", b"NOTANMP4FILE123456", "video/mp4"),
        ("fake.docx", b"not a zip archive", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("zip_as.docx", _build_zip_bytes(), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("fake.txt", b"MZ\x90\x00\x03\x00binary\x00", "text/plain"),
    ]
    for filename, payload, mime in dangerous_cases:
        resp = client.post(
            "/api/files/upload",
            data={"scope": "SUBMISSION", "courseId": CS101_ID},
            files={"file": (filename, payload, mime)},
            headers=_auth(student1_token),
        )
        assert resp.status_code == 400, f"Expected 400 for {filename}, got {resp.status_code}: {resp.text}"

    # Student must not upload LESSON or ASSIGNMENT scope files
    resp_forbidden = client.post(
        "/api/files/upload",
        data={"scope": "LESSON", "courseId": CS101_ID},
        files={"file": ("notes.txt", b"Hello lesson", "text/plain")},
        headers=_auth(student1_token),
    )
    assert resp_forbidden.status_code == 403

    # Lecturer of CS101 cannot upload to DB201 (taught by Lecturer 2)
    resp_other_course = client.post(
        "/api/files/upload",
        data={"scope": "LESSON", "courseId": DB201_ID},
        files={"file": ("notes.txt", b"Wrong course", "text/plain")},
        headers=_auth(lecturer1_token),
    )
    assert resp_other_course.status_code == 403


def test_upload_enforces_max_size_413(client, lecturer1_token, temp_vault, monkeypatch):
    monkeypatch.setattr(settings, "FILE_MAX_SIZE_MB", 1)
    oversized = b"A" * (1024 * 1024 + 64)
    resp = client.post(
        "/api/files/upload",
        data={"scope": "LESSON", "courseId": CS101_ID},
        files={"file": ("too_large.txt", oversized, "text/plain")},
        headers=_auth(lecturer1_token),
    )
    assert resp.status_code == 413


def test_upload_extracts_text_and_validates_media_and_attachment_headers(
    client, lecturer1_token, temp_vault
):
    created_ids: list[str] = []
    try:
        # 1. TXT extraction + truncation to <= 50,000 chars
        long_text = ("Tai lieu CS101 tieng Viet co dau. " * 2000).encode("utf-8")
        r_txt = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("guide.txt", long_text, "text/plain")},
            headers=_auth(lecturer1_token),
        )
        assert r_txt.status_code == 201, r_txt.text
        txt_id = r_txt.json()["fileId"]
        created_ids.append(txt_id)

        # 2. PDF extraction with pypdf
        r_pdf = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("lecture.pdf", _build_pdf_bytes("Lecture 1 Algorithms and Trees"), "application/pdf")},
            headers=_auth(lecturer1_token),
        )
        assert r_pdf.status_code == 201, r_pdf.text
        pdf_id = r_pdf.json()["fileId"]
        created_ids.append(pdf_id)

        # 3. DOCX extraction
        r_docx = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={
                "file": (
                    "syllabus.docx",
                    _build_docx_bytes("Docx Content Binary Search Tree"),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
            headers=_auth(lecturer1_token),
        )
        assert r_docx.status_code == 201, r_docx.text
        docx_id = r_docx.json()["fileId"]
        created_ids.append(docx_id)

        # 4. PPTX extraction + ZIP + PNG
        r_pptx = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={
                "file": (
                    "slides.pptx",
                    _build_pptx_bytes(["Slide One Intro", "Slide Two Recursion"]),
                    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                )
            },
            headers=_auth(lecturer1_token),
        )
        assert r_pptx.status_code == 201, r_pptx.text
        pptx_id = r_pptx.json()["fileId"]
        created_ids.append(pptx_id)

        r_zip = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("starter.zip", _build_zip_bytes(), "application/zip")},
            headers=_auth(lecturer1_token),
        )
        assert r_zip.status_code == 201, r_zip.text
        zip_id = r_zip.json()["fileId"]
        created_ids.append(zip_id)

        r_png = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
            headers=_auth(lecturer1_token),
        )
        assert r_png.status_code == 201, r_png.text
        png_id = r_png.json()["fileId"]
        created_ids.append(png_id)

        with SessionLocal() as db:
            sf_txt = db.query(StoredFile).filter(StoredFile.FileId == uuid.UUID(txt_id)).one()
            sf_pdf = db.query(StoredFile).filter(StoredFile.FileId == uuid.UUID(pdf_id)).one()
            sf_docx = db.query(StoredFile).filter(StoredFile.FileId == uuid.UUID(docx_id)).one()
            sf_pptx = db.query(StoredFile).filter(StoredFile.FileId == uuid.UUID(pptx_id)).one()

            assert len(sf_txt.Sha256) == 64
            assert sf_txt.ExtractedText is not None and len(sf_txt.ExtractedText) <= 50_000
            assert (temp_vault / sf_txt.StoredPath).is_file()
            assert "Lecture 1 Algorithms and Trees" in (sf_pdf.ExtractedText or "")
            assert "Docx Content Binary Search Tree" in (sf_docx.ExtractedText or "")
            assert "Slide One Intro" in (sf_pptx.ExtractedText or "")
            assert "Slide Two Recursion" in (sf_pptx.ExtractedText or "")

        # Verify attachment header for office/zip files and inline + nosniff for png/pdf
        for attach_id in (pptx_id, zip_id):
            dl_attach = client.get(f"/api/files/{attach_id}/content", headers=_auth(lecturer1_token))
            assert dl_attach.status_code == 200
            assert dl_attach.headers.get("x-content-type-options") == "nosniff"
            assert "attachment" in (dl_attach.headers.get("content-disposition") or "").lower()

        dl_png = client.get(f"/api/files/{png_id}/content", headers=_auth(lecturer1_token))
        assert dl_png.status_code == 200
        assert dl_png.headers.get("x-content-type-options") == "nosniff"
        assert "inline" in (dl_png.headers.get("content-disposition") or "").lower()
    finally:
        for fid in created_ids:
            client.delete(f"/api/files/{fid}", headers=_auth(lecturer1_token))


def test_submission_file_isolation_and_unpublished_lesson_block_and_delete(
    client, lecturer1_token, lecturer2_token, student1_token, student2_token, admin_token, temp_vault
):
    sub_file_id = None
    les_file_id = None
    les_id = None
    mod_id = None
    try:
        # Student1 uploads submission file in CS101
        sub_upload = client.post(
            "/api/files/upload",
            data={"scope": "SUBMISSION", "courseId": CS101_ID},
            files={"file": ("solution.txt", b"Student 1 private solution", "text/plain")},
            headers=_auth(student1_token),
        )
        assert sub_upload.status_code == 201, sub_upload.text
        sub_file_id = sub_upload.json()["fileId"]

        # Student1 (owner), Lecturer1 (course lecturer), Admin can access
        assert client.get(f"/api/files/{sub_file_id}/content", headers=_auth(student1_token)).status_code == 200
        assert client.get(f"/api/files/{sub_file_id}/content", headers=_auth(lecturer1_token)).status_code == 200
        assert client.get(f"/api/files/{sub_file_id}/content", headers=_auth(admin_token)).status_code == 200

        # Student2 (other student) and Lecturer2 (other lecturer) CANNOT read or delete
        assert client.get(f"/api/files/{sub_file_id}", headers=_auth(student2_token)).status_code == 403
        assert client.get(f"/api/files/{sub_file_id}/content", headers=_auth(student2_token)).status_code == 403
        assert client.get(f"/api/files/{sub_file_id}/content", headers=_auth(lecturer2_token)).status_code == 403
        assert client.delete(f"/api/files/{sub_file_id}", headers=_auth(student2_token)).status_code == 403
        assert client.delete(f"/api/files/{sub_file_id}", headers=_auth(lecturer2_token)).status_code == 403

        # Unpublished lesson file cannot be downloaded by Student1 until published
        les_upload = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("draft_handout.pdf", _build_pdf_bytes("Draft Handout"), "application/pdf")},
            headers=_auth(lecturer1_token),
        )
        assert les_upload.status_code == 201
        les_file_id = les_upload.json()["fileId"]

        mod_resp = client.post(
            f"/api/courses/{CS101_ID}/modules",
            json={"title": "File Visibility Test Module", "sortOrder": 90, "isPublished": True},
            headers=_auth(lecturer1_token),
        )
        assert mod_resp.status_code == 201
        mod_id = mod_resp.json()["moduleId"]

        les_resp = client.post(
            f"/api/modules/{mod_id}/lessons",
            json={
                "title": "Hidden Lesson With File",
                "contentType": "PDF",
                "attachmentFileId": les_file_id,
                "sortOrder": 1,
                "isPublished": False,
            },
            headers=_auth(lecturer1_token),
        )
        assert les_resp.status_code == 201
        les_id = les_resp.json()["lessonId"]
        assert les_resp.json()["materialUrl"] == f"/api/files/{les_file_id}/content"

        # Student1 blocked while lesson is unpublished
        assert client.get(f"/api/files/{les_file_id}/content", headers=_auth(student1_token)).status_code == 403

        # Deleting a file still attached to a lesson returns 409 Conflict cleanly
        assert client.delete(f"/api/files/{les_file_id}", headers=_auth(lecturer1_token)).status_code == 409

        # Publish lesson -> Student1 can now download
        assert (
            client.patch(
                f"/api/lessons/{les_id}/publish",
                json={"isPublished": True},
                headers=_auth(lecturer1_token),
            ).status_code
            == 200
        )
        ok_dl = client.get(f"/api/files/{les_file_id}/content", headers=_auth(student1_token))
        assert ok_dl.status_code == 200
        assert ok_dl.headers.get("x-content-type-options") == "nosniff"
    finally:
        if sub_file_id:
            client.delete(f"/api/files/{sub_file_id}", headers=_auth(student1_token))
        if les_id:
            client.delete(f"/api/lessons/{les_id}", headers=_auth(lecturer1_token))
        if les_file_id:
            client.delete(f"/api/files/{les_file_id}", headers=_auth(lecturer1_token))
        if mod_id:
            client.delete(f"/api/modules/{mod_id}", headers=_auth(lecturer1_token))


def test_seed_vault_file_access_uses_real_vault_root(client, student1_token, lecturer2_token):
    r_ok = client.get(f"/api/files/{SEED_PDF_FILE_ID}/content", headers=_auth(student1_token))
    assert r_ok.status_code == 200
    assert r_ok.content.startswith(b"%PDF-")
    assert r_ok.headers.get("x-content-type-options") == "nosniff"

    r_denied = client.get(f"/api/files/{SEED_PDF_FILE_ID}/content", headers=_auth(lecturer2_token))
    assert r_denied.status_code == 403


def test_video_range_206_streaming(client, lecturer1_token, temp_vault):
    file_id = None
    webm_id = None
    try:
        mp4_bytes = _build_minimal_mp4_bytes(160)
        up = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("clip.mp4", mp4_bytes, "video/mp4")},
            headers=_auth(lecturer1_token),
        )
        assert up.status_code == 201
        file_id = up.json()["fileId"]

        r_part = client.get(
            f"/api/files/{file_id}/content",
            headers={**_auth(lecturer1_token), "Range": "bytes=0-31"},
        )
        assert r_part.status_code == 206
        assert r_part.headers.get("content-range") == f"bytes 0-31/{len(mp4_bytes)}"
        assert r_part.headers.get("accept-ranges") == "bytes"
        assert r_part.headers.get("x-content-type-options") == "nosniff"
        assert r_part.content == mp4_bytes[0:32]

        r_tail = client.get(
            f"/api/files/{file_id}/content",
            headers={**_auth(lecturer1_token), "Range": "bytes=100-"},
        )
        assert r_tail.status_code == 206
        assert r_tail.headers.get("content-range") == f"bytes 100-{len(mp4_bytes) - 1}/{len(mp4_bytes)}"
        assert r_tail.content == mp4_bytes[100:]

        r_oob = client.get(
            f"/api/files/{file_id}/content",
            headers={**_auth(lecturer1_token), "Range": "bytes=9999-10050"},
        )
        assert r_oob.status_code == 416

        webm_bytes = _build_minimal_webm_bytes(80)
        up_webm = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": CS101_ID},
            files={"file": ("clip.webm", webm_bytes, "video/webm")},
            headers=_auth(lecturer1_token),
        )
        assert up_webm.status_code == 201
        webm_id = up_webm.json()["fileId"]
        r_webm = client.get(
            f"/api/files/{webm_id}/content",
            headers={**_auth(lecturer1_token), "Range": "bytes=0-15"},
        )
        assert r_webm.status_code == 206
        assert r_webm.content == webm_bytes[0:16]
    finally:
        if file_id:
            client.delete(f"/api/files/{file_id}", headers=_auth(lecturer1_token))
        if webm_id:
            client.delete(f"/api/files/{webm_id}", headers=_auth(lecturer1_token))


def test_content_xss_sanitization_material_url_update_module_reorder_and_guarded_delete(
    client, lecturer1_token, lecturer2_token, student1_token, temp_vault
):
    m1_id = None
    m2_id = None
    l1_id = None
    l2_id = None
    lp_id = None
    db201_file_id = None
    try:
        m1 = client.post(
            f"/api/courses/{CS101_ID}/modules",
            json={"title": "Sanitize & Reorder Mod 1", "sortOrder": 95, "isPublished": True},
            headers=_auth(lecturer1_token),
        )
        assert m1.status_code == 201
        m1_id = m1.json()["moduleId"]

        m2 = client.post(
            f"/api/courses/{CS101_ID}/modules",
            json={"title": "Sanitize & Reorder Mod 2", "sortOrder": 96, "isPublished": True},
            headers=_auth(lecturer1_token),
        )
        assert m2.status_code == 201
        m2_id = m2.json()["moduleId"]

        # Reject dangerous MaterialUrl schemes
        for bad_url in [
            "javascript:alert(1)",
            "  JaVaScRiPt:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "vbscript:msgbox(1)",
            "//evil.example.com/payload.pdf",
        ]:
            bad_res = client.post(
                f"/api/modules/{m1_id}/lessons",
                json={
                    "title": "Bad URL Lesson",
                    "materialUrl": bad_url,
                    "contentType": "PDF",
                    "sortOrder": 1,
                    "isPublished": True,
                },
                headers=_auth(lecturer1_token),
            )
            assert bad_res.status_code in (400, 422), f"Expected 400/422 for {bad_url}, got {bad_res.status_code}"

        # Reject cross-course attachmentFileId
        up_other = client.post(
            "/api/files/upload",
            data={"scope": "LESSON", "courseId": DB201_ID},
            files={"file": ("db_only.txt", b"DB201 file", "text/plain")},
            headers=_auth(lecturer2_token),
        )
        assert up_other.status_code == 201
        db201_file_id = up_other.json()["fileId"]

        cross_res = client.post(
            f"/api/modules/{m1_id}/lessons",
            json={
                "title": "Cross Course Attachment",
                "attachmentFileId": db201_file_id,
                "contentType": "TEXT",
                "sortOrder": 1,
                "isPublished": True,
            },
            headers=_auth(lecturer1_token),
        )
        assert cross_res.status_code == 403

        # Create lessons with XSS payload and verify sanitization + contentType persistence
        dirty_html = (
            '<h2>Chuong 1</h2>'
            '<p onclick="alert(1)">Noi dung <strong>an toan</strong></p>'
            '<script>alert("xss")</script>'
            '<style>body{display:none}</style>'
            '<iframe src="https://evil.com"></iframe>'
            '<img src="https://example.edu.vn/ok.png" onerror="alert(2)" alt="diagram">'
            '<img src="javascript:alert(3)" alt="bad">'
            '<a href="javascript:alert(4)">Bad link</a>'
            '<a href="https://example.edu.vn/doc">Good link</a>'
        )
        l1 = client.post(
            f"/api/modules/{m1_id}/lessons",
            json={
                "title": "Lesson A",
                "contentHtml": dirty_html,
                "materialUrl": "https://example.edu.vn/slides.pdf",
                "contentType": "SLIDE",
                "sortOrder": 1,
                "isPublished": True,
            },
            headers=_auth(lecturer1_token),
        )
        assert l1.status_code == 201, l1.text
        l1_data = l1.json()
        l1_id = l1_data["lessonId"]
        assert l1_data["contentType"] == "SLIDE"
        saved_html = l1_data["contentHtml"] or ""
        assert "<script" not in saved_html.lower()
        assert "<style" not in saved_html.lower()
        assert "<iframe" not in saved_html.lower()
        assert "onerror" not in saved_html.lower()
        assert "onclick" not in saved_html.lower()
        assert "javascript:" not in saved_html.lower()
        assert "https://example.edu.vn/doc" in saved_html
        assert "<h2>Chuong 1</h2>" in saved_html

        # Update lesson also sanitizes HTML, validates URL, and preserves contentType
        l1_upd = client.put(
            f"/api/lessons/{l1_id}",
            json={
                "contentHtml": '<p>Updated</p><svg onload="alert(9)"></svg>',
                "contentType": "VIDEO",
                "materialUrl": "https://example.edu.vn/video.mp4",
            },
            headers=_auth(lecturer1_token),
        )
        assert l1_upd.status_code == 200
        assert l1_upd.json()["contentType"] == "VIDEO"
        assert "<svg" not in (l1_upd.json()["contentHtml"] or "").lower()

        bad_upd = client.put(
            f"/api/lessons/{l1_id}",
            json={"materialUrl": "javascript:alert(99)"},
            headers=_auth(lecturer1_token),
        )
        assert bad_upd.status_code in (400, 422)

        l2 = client.post(
            f"/api/modules/{m1_id}/lessons",
            json={
                "title": "Lesson B",
                "contentHtml": "<p>Second lesson</p>",
                "contentType": "TEXT",
                "sortOrder": 2,
                "isPublished": True,
            },
            headers=_auth(lecturer1_token),
        )
        assert l2.status_code == 201
        l2_id = l2.json()["lessonId"]

        # update_module must return actual lessons list (not [])
        mod_updated = client.put(
            f"/api/modules/{m1_id}",
            json={"title": "Sanitize & Reorder Mod 1 Renamed"},
            headers=_auth(lecturer1_token),
        )
        assert mod_updated.status_code == 200
        assert [item["lessonId"] for item in mod_updated.json()["lessons"]] == [l1_id, l2_id]

        # Reorder lessons: move Lesson B UP -> [l2_id, l1_id], then array reorder back
        assert (
            client.patch(
                f"/api/lessons/{l2_id}/reorder",
                json={"direction": "UP"},
                headers=_auth(student1_token),
            ).status_code
            == 403
        )
        r_reord = client.patch(
            f"/api/lessons/{l2_id}/reorder",
            json={"direction": "UP"},
            headers=_auth(lecturer1_token),
        )
        assert r_reord.status_code == 200
        assert r_reord.json()["sortOrder"] == 1

        r_arr_reord = client.patch(
            f"/api/modules/{m1_id}/lessons/reorder",
            json={"lessonIds": [l1_id, l2_id]},
            headers=_auth(lecturer1_token),
        )
        assert r_arr_reord.status_code == 200
        assert [x["lessonId"] for x in r_arr_reord.json()] == [l1_id, l2_id]

        # Reorder modules UP/DOWN
        r_mod_reord = client.patch(
            f"/api/modules/{m2_id}/reorder",
            json={"direction": "UP"},
            headers=_auth(lecturer1_token),
        )
        assert r_mod_reord.status_code == 200
        assert r_mod_reord.json()["sortOrder"] < 96

        # Deleting module with lessons -> 409 Conflict
        assert client.delete(f"/api/modules/{m1_id}", headers=_auth(lecturer1_token)).status_code == 409

        # Lesson with LessonProgress -> 409 Conflict
        with SessionLocal() as db:
            lp = LessonProgress(
                ProgressId=uuid.uuid4(),
                LessonId=uuid.UUID(l1_id),
                StudentId=STUDENT1_ID,
                IsCompleted=True,
                TimeSpentSeconds=30,
            )
            db.add(lp)
            db.commit()
            lp_id = lp.ProgressId

        assert client.delete(f"/api/lessons/{l1_id}", headers=_auth(lecturer1_token)).status_code == 409
    finally:
        if lp_id:
            with SessionLocal() as db:
                row = db.query(LessonProgress).filter(LessonProgress.ProgressId == lp_id).first()
                if row:
                    db.delete(row)
                    db.commit()
        if l1_id:
            client.delete(f"/api/lessons/{l1_id}", headers=_auth(lecturer1_token))
        if l2_id:
            client.delete(f"/api/lessons/{l2_id}", headers=_auth(lecturer1_token))
        if m1_id:
            client.delete(f"/api/modules/{m1_id}", headers=_auth(lecturer1_token))
        if m2_id:
            client.delete(f"/api/modules/{m2_id}", headers=_auth(lecturer1_token))
        if db201_file_id:
            client.delete(f"/api/files/{db201_file_id}", headers=_auth(lecturer2_token))
