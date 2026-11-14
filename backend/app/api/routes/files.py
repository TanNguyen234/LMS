"""Secure file vault routes (Wave 1 owner: storage-files-dev)."""
import uuid
from typing import Iterator, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    verify_course_read_access,
    verify_course_write_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import (
    Assignment,
    Course,
    CourseMessage,
    Lesson,
    Module,
    StoredFile,
    Submission,
    User,
)
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.schemas import StoredFileResponse
from backend.app.services.file_storage import (
    ALLOWED_UPLOAD_SCOPES,
    RangeNotSatisfiableError,
    build_content_disposition,
    delete_vault_file_quietly,
    parse_byte_range,
    resolve_vault_file_path,
    validate_and_store_upload,
)

router = APIRouter(tags=["Files"])

STREAM_CHUNK_SIZE = 64 * 1024


def _to_stored_file_response(sf: StoredFile) -> StoredFileResponse:
    preview = sf.ExtractedText[:500] if sf.ExtractedText else None
    return StoredFileResponse(
        fileId=sf.FileId,
        ownerId=sf.OwnerId,
        courseId=sf.CourseId,
        scope=sf.Scope,
        originalName=sf.OriginalName,
        mimeType=sf.MimeType,
        sizeBytes=int(sf.SizeBytes),
        extractedTextPreview=preview,
        downloadUrl=f"/api/files/{sf.FileId}/content",
        createdAt=sf.CreatedAt,
    )


def _get_stored_file_or_404(file_id: uuid.UUID, db: Session) -> StoredFile:
    sf = db.query(StoredFile).filter(StoredFile.FileId == file_id).first()
    if not sf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return sf


def _verify_file_read_access(sf: StoredFile, current_user: User, db: Session) -> None:
    if current_user.Role == "ADMIN":
        return

    if sf.CourseId is not None:
        verify_course_read_access(sf.CourseId, current_user, db)
    elif current_user.Role != "ADMIN" and sf.OwnerId != current_user.UserId and sf.Scope != "SEED":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to access this file")

    if current_user.Role != "STUDENT":
        return

    if sf.Scope == "SUBMISSION":
        if sf.OwnerId != current_user.UserId:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Students can only access their own submission files",
            )
        return

    if sf.Scope == "LESSON":
        published_lesson = (
            db.query(Lesson)
            .join(Module, Module.ModuleId == Lesson.ModuleId)
            .filter(
                Lesson.AttachmentFileId == sf.FileId,
                Lesson.IsPublished == True,  # noqa: E712
                Module.IsPublished == True,  # noqa: E712
            )
            .first()
        )
        if not published_lesson:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Lesson file is not published for student access",
            )
        return

    if sf.Scope == "ASSIGNMENT":
        published_assignment = (
            db.query(Assignment)
            .filter(
                Assignment.AttachmentFileId == sf.FileId,
                Assignment.Status.in_(["PUBLISHED", "CLOSED"]),
            )
            .first()
        )
        if not published_assignment:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Assignment file is not published for student access",
            )


def _iter_file_range(file_path, start: int, end: int) -> Iterator[bytes]:
    remaining = end - start + 1
    with open(file_path, "rb") as handle:
        handle.seek(start)
        while remaining > 0:
            chunk = handle.read(min(STREAM_CHUNK_SIZE, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


@router.post("/files/upload", response_model=StoredFileResponse, status_code=status.HTTP_201_CREATED)
async def upload_file(
    file: UploadFile = File(...),
    scope: str = Form(...),
    courseId: Optional[str] = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a validated file into the local vault outside webroot."""
    normalized_scope = (scope or "").strip().upper()
    if normalized_scope not in ALLOWED_UPLOAD_SCOPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scope must be one of: LESSON, ASSIGNMENT, SUBMISSION, CHAT",
        )

    raw_course_id = (courseId or "").strip()
    if not raw_course_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="courseId is required")
    try:
        parsed_course_id = uuid.UUID(raw_course_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid courseId format")

    if normalized_scope in {"LESSON", "ASSIGNMENT"}:
        verify_lecturer_course_owner(parsed_course_id, current_user, db)
    else:
        verify_course_write_access(parsed_course_id, current_user, db)

    saved = await validate_and_store_upload(file, normalized_scope, parsed_course_id)

    record = StoredFile(
        FileId=saved.file_id,
        OwnerId=current_user.UserId,
        CourseId=parsed_course_id,
        Scope=normalized_scope,
        OriginalName=saved.original_name,
        StoredPath=saved.stored_path,
        MimeType=saved.mime_type,
        SizeBytes=saved.size_bytes,
        Sha256=saved.sha256,
        ExtractedText=saved.extracted_text,
    )
    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        delete_vault_file_quietly(saved.stored_path)
        raise

    return _to_stored_file_response(record)


@router.get("/files/{file_id}", response_model=StoredFileResponse)
def get_file_metadata(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return metadata for a stored file after enforcing access rules."""
    sf = _get_stored_file_or_404(file_id, db)
    _verify_file_read_access(sf, current_user, db)
    return _to_stored_file_response(sf)


@router.get("/files/{file_id}/content")
def stream_file_content(
    file_id: uuid.UUID,
    request: Request,
    download: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Stream stored file content with HTTP Range 206 support and security headers."""
    sf = _get_stored_file_or_404(file_id, db)
    _verify_file_read_access(sf, current_user, db)

    file_path = resolve_vault_file_path(sf.StoredPath)
    if not file_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File payload missing from vault")

    file_size = file_path.stat().st_size
    disposition = build_content_disposition(sf.OriginalName, sf.MimeType, force_attachment=download)
    base_headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
    }

    range_header = request.headers.get("range")
    if range_header:
        try:
            start, end = parse_byte_range(range_header, file_size)
        except RangeNotSatisfiableError:
            raise HTTPException(
                status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
                detail="Requested range is not satisfiable",
                headers={
                    "Content-Range": f"bytes */{file_size}",
                    "X-Content-Type-Options": "nosniff",
                },
            )
        content_length = end - start + 1
        return StreamingResponse(
            _iter_file_range(file_path, start, end),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=sf.MimeType,
            headers={
                **base_headers,
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(content_length),
            },
        )

    return StreamingResponse(
        _iter_file_range(file_path, 0, max(0, file_size - 1)),
        status_code=status.HTTP_200_OK,
        media_type=sf.MimeType,
        headers={
            **base_headers,
            "Content-Length": str(file_size),
        },
    )


@router.delete("/files/{file_id}", response_model=MessageResponse)
def delete_stored_file(
    file_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an unreferenced file (owner, course lecturer, or admin)."""
    sf = _get_stored_file_or_404(file_id, db)

    is_admin = current_user.Role == "ADMIN"
    is_owner = sf.OwnerId == current_user.UserId
    is_course_lecturer = False
    if current_user.Role == "LECTURER" and sf.CourseId is not None:
        course = db.query(Course).filter(Course.CourseId == sf.CourseId).first()
        is_course_lecturer = bool(course and course.LecturerId == current_user.UserId)

    if not (is_admin or is_owner or is_course_lecturer):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to delete this file",
        )

    in_use = (
        db.query(Lesson).filter(Lesson.AttachmentFileId == file_id).first() is not None
        or db.query(Assignment).filter(Assignment.AttachmentFileId == file_id).first() is not None
        or db.query(Submission).filter(Submission.FileId == file_id).first() is not None
        or db.query(CourseMessage).filter(CourseMessage.AttachmentFileId == file_id).first() is not None
    )
    if in_use:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tệp đang được đính kèm trong bài giảng, bài tập, bài nộp hoặc tin nhắn nên không thể xóa.",
        )

    stored_path = sf.StoredPath
    try:
        db.delete(sf)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tệp đang được tham chiếu trong hệ thống nên không thể xóa.",
        )

    if sf.Scope != "SEED":
        delete_vault_file_quietly(stored_path)

    return MessageResponse(message="File deleted successfully", detail=str(file_id))
