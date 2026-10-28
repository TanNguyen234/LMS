import os
import uuid
import shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from backend.app.models.models import User
from backend.app.core.dependencies import get_current_user

router = APIRouter(tags=["Upload"])

ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".zip", ".rar", ".7z", ".tar", ".gz",
    ".png", ".jpg", ".jpeg", ".webp", ".txt", ".csv", ".xlsx", ".pptx"
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Target directories
BASE_DIR = Path(__file__).resolve().parents[3]
BACKEND_STORAGE = BASE_DIR / "backend" / "storage" / "uploads"
FRONTEND_SUBMISSIONS = BASE_DIR / "frontend" / "public" / "submissions"
FRONTEND_DIST_SUBMISSIONS = BASE_DIR / "frontend" / "dist" / "submissions"

BACKEND_STORAGE.mkdir(parents=True, exist_ok=True)
FRONTEND_SUBMISSIONS.mkdir(parents=True, exist_ok=True)
if (BASE_DIR / "frontend" / "dist").exists():
    FRONTEND_DIST_SUBMISSIONS.mkdir(parents=True, exist_ok=True)


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
