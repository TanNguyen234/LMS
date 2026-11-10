import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends, Query
from fastapi.responses import FileResponse
from backend.app.models.models import User
from backend.app.core.dependencies import get_current_user

router = APIRouter(tags=["Upload"])

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".zip", ".rar", ".7z", ".tar", ".gz",
    ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".xlsx", ".xls", ".pptx"
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Target directories
BASE_DIR = Path(__file__).resolve().parents[4]
BACKEND_STORAGE = BASE_DIR / "backend" / "storage" / "uploads"
FRONTEND_SUBMISSIONS = BASE_DIR / "frontend" / "public" / "submissions"
FRONTEND_DIST_SUBMISSIONS = BASE_DIR / "frontend" / "dist" / "submissions"

BACKEND_STORAGE.mkdir(parents=True, exist_ok=True)
FRONTEND_SUBMISSIONS.mkdir(parents=True, exist_ok=True)
if (BASE_DIR / "frontend" / "dist").exists():
    FRONTEND_DIST_SUBMISSIONS.mkdir(parents=True, exist_ok=True)


@router.get("/download")
async def download_file(
    path: str = Query(..., description="Đường dẫn tương đối của tệp cần tải về"),
    name: str | None = Query(None, description="Tên tệp hiển thị khi tải về")
):
    """
    Tải tệp đính kèm với Content-Disposition: attachment và Content-Type chuẩn xác.
    Đảm bảo các tệp Excel (.xlsx, .xls), CSV, PDF, Word không bị lỗi ký tự và tải xuống trọn vẹn.
    """
    clean_rel = path.lstrip("/\\")

    roots = [
        BASE_DIR / "frontend" / "public",
        BASE_DIR / "frontend" / "dist",
        BACKEND_STORAGE
    ]

    target_file: Path | None = None
    for root in roots:
        try:
            cand = (root / clean_rel).resolve()
            cand.relative_to(root.resolve())
            if cand.is_file():
                target_file = cand
                break
        except (ValueError, RuntimeError):
            continue

    if not target_file:
        filename_only = os.path.basename(clean_rel)
        for cand in [FRONTEND_SUBMISSIONS / filename_only, BACKEND_STORAGE / filename_only]:
            if cand.is_file():
                target_file = cand
                break

    if not target_file or not target_file.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tệp yêu cầu không tồn tại trên hệ thống."
        )

    ext = target_file.suffix.lower()
    content_type_map = {
        ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ".xls": "application/vnd.ms-excel",
        ".csv": "text/csv; charset=utf-8",
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".doc": "application/msword",
        ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        ".zip": "application/zip",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }
    media_type = content_type_map.get(ext, "application/octet-stream")
    download_filename = name or target_file.name

    return FileResponse(
        path=str(target_file),
        media_type=media_type,
        filename=download_filename,
        content_disposition_type="attachment"
    )


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """
    Upload an assignment submission or academic document.
    Returns the public relative URL to access the uploaded file.
    """
    orig_name = file.filename or "file.bin"
    ext = os.path.splitext(orig_name)[1].lower()
    
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp '{ext}' không được hỗ trợ. Vui lòng tải lên các tệp tài liệu (PDF, Word, ZIP, Ảnh...)."
        )

    # Sanitize base filename
    safe_base = "".join(c for c in os.path.splitext(orig_name)[0] if c.isalnum() or c in ("-", "_")).strip()
    if not safe_base:
        safe_base = "upload"
    
    unique_filename = f"{safe_base}_{uuid.uuid4().hex[:8]}{ext}"

    # Save to backend storage
    backend_dest = BACKEND_STORAGE / unique_filename
    frontend_dest = FRONTEND_SUBMISSIONS / unique_filename

    total_bytes = 0
    try:
        with open(backend_dest, "wb") as f_out:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE:
                    f_out.close()
                    if backend_dest.exists():
                        backend_dest.unlink()
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Kích thước tệp vượt quá giới hạn tối đa cho phép (50 MB)."
                    )
                f_out.write(chunk)
        
        # Copy to frontend public/submissions for direct static serving
        shutil.copyfile(backend_dest, frontend_dest)
        if FRONTEND_DIST_SUBMISSIONS.exists():
            shutil.copyfile(backend_dest, FRONTEND_DIST_SUBMISSIONS / unique_filename)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Lỗi khi lưu tệp tải lên: {str(e)}"
        )

    file_url = f"/submissions/{unique_filename}"
    return {
        "fileUrl": file_url,
        "fileName": orig_name,
        "fileSize": total_bytes,
        "contentType": file.content_type,
    }
