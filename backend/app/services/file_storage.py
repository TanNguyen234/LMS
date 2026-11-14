import hashlib
import io
import logging
import re
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional, Set, Tuple
from urllib.parse import quote
import xml.etree.ElementTree as ET

import pypdf
from fastapi import HTTPException, UploadFile, status

from backend.app.core.config import settings

logger = logging.getLogger(__name__)

EXTRACTED_TEXT_MAX_CHARS = 50_000
MAX_OOXML_XML_BYTES = 10 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MiB

ALLOWED_UPLOAD_SCOPES: Set[str] = {"LESSON", "ASSIGNMENT", "SUBMISSION", "CHAT"}
ALL_DB_SCOPES: Set[str] = ALLOWED_UPLOAD_SCOPES | {"SEED"}

ALLOWED_EXTENSIONS: Set[str] = {
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "mp4",
    "webm",
    "txt",
    "md",
    "csv",
    "docx",
    "pptx",
    "xlsx",
    "zip",
}

BLOCKED_EXTENSIONS: Set[str] = {
    "html",
    "htm",
    "xhtml",
    "svg",
    "svgz",
    "js",
    "mjs",
    "cjs",
    "exe",
    "dll",
    "msi",
    "ps1",
    "psm1",
    "bat",
    "cmd",
    "sh",
    "vbs",
    "php",
    "jsp",
    "asp",
    "aspx",
    "py",
}

ATTACHMENT_EXTENSIONS: Set[str] = {"docx", "pptx", "xlsx", "zip"}
TEXT_EXTENSIONS: Set[str] = {"txt", "md", "csv"}
OOXML_EXTENSIONS: Set[str] = {"docx", "pptx", "xlsx"}

CANONICAL_MIME_BY_EXT: Dict[str, str] = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "txt": "text/plain",
    "md": "text/markdown",
    "csv": "text/csv",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "zip": "application/zip",
}

DANGEROUS_DECLARED_MIMES: Set[str] = {
    "text/html",
    "application/xhtml+xml",
    "image/svg+xml",
    "application/javascript",
    "text/javascript",
    "application/ecmascript",
    "application/x-msdownload",
    "application/x-dosexec",
    "application/x-executable",
    "application/x-sh",
    "application/x-powershell",
    "application/x-bat",
}

_BINARY_EXEC_SIGNATURES: Tuple[bytes, ...] = (
    b"MZ",
    b"\x7fELF",
    b"\xfe\xed\xfa\xce",
    b"\xfe\xed\xfa\xcf",
    b"\xce\xfa\xed\xfe",
    b"\xcf\xfa\xed\xfe",
    b"\xca\xfe\xba\xbe",
)

_NON_TEXT_MAGIC_SIGNATURES: Tuple[bytes, ...] = (
    b"%PDF-",
    b"\x89PNG\r\n\x1a\n",
    b"\xff\xd8\xff",
    b"PK\x03\x04",
    b"PK\x05\x06",
    b"\x1a\x45\xdf\xa3",
    b"RIFF",
)

_SLIDE_XML_RE = re.compile(r"^ppt/slides/slide(\d+)\.xml$", re.IGNORECASE)
_SAFE_STEM_RE = re.compile(r"[^A-Za-z0-9_-]+")
_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


class RangeNotSatisfiableError(Exception):
    """Raised when an HTTP Range header cannot be satisfied for a file."""


@dataclass(frozen=True)
class SavedVaultPayload:
    file_id: uuid.UUID
    original_name: str
    extension: str
    stored_path: str
    mime_type: str
    size_bytes: int
    sha256: str
    extracted_text: Optional[str]


def get_vault_root(vault_dir: Optional[str] = None) -> Path:
    raw = Path(vault_dir or settings.FILE_VAULT_DIR)
    if raw.is_absolute():
        return raw.resolve()
    repo_root = Path(__file__).resolve().parents[3]
    return (repo_root / raw).resolve()


def resolve_vault_file_path(stored_path: str, vault_dir: Optional[str] = None) -> Path:
    root = get_vault_root(vault_dir)
    if not stored_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stored file path is empty")
    try:
        candidate = (root / stored_path).resolve()
        candidate.relative_to(root)
    except (OSError, RuntimeError, ValueError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid stored file path")
    return candidate


def extract_safe_extension(filename: Optional[str]) -> str:
    base_name = Path(filename or "").name.strip()
    if not base_name or "." not in base_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tên tệp phải có phần mở rộng hợp lệ.",
        )
    ext = base_name.rsplit(".", 1)[-1].lower().strip()
    if not ext or ext in BLOCKED_EXTENSIONS or ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Định dạng tệp '.{ext}' không được phép tải lên.",
        )
    return ext


def _sanitize_original_name(filename: Optional[str], fallback_ext: str) -> str:
    raw_name = Path((filename or "").replace("\\", "/")).name.strip()
    cleaned = "".join(ch for ch in raw_name if ord(ch) >= 32 and ch not in {'"', "<", ">"})
    if not cleaned:
        cleaned = f"upload.{fallback_ext}"
    if len(cleaned) > 255:
        stem, dot, ext = cleaned.rpartition(".")
        if dot and len(ext) <= 16:
            cleaned = f"{stem[: 255 - len(ext) - 1]}.{ext}"
        else:
            cleaned = cleaned[:255]
    return cleaned


def _build_stored_relative_path(
    file_id: uuid.UUID,
    scope: str,
    course_id: Optional[uuid.UUID],
    original_name: str,
    ext: str,
) -> str:
    raw_stem = original_name.rsplit(".", 1)[0] if "." in original_name else original_name
    safe_stem = _SAFE_STEM_RE.sub("_", raw_stem).strip("_")[:24] or "file"
    scope_part = scope.lower()
    course_part = str(course_id) if course_id is not None else "global"
    return f"{scope_part}/{course_part}/{file_id}_{safe_stem}.{ext}"


def _has_binary_exec_signature(data: bytes) -> bool:
    return any(data.startswith(sig) for sig in _BINARY_EXEC_SIGNATURES)


def _validate_ooxml_zip(data: bytes, ext: str) -> None:
    if not data.startswith(b"PK\x03\x04"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Nội dung tệp không khớp chữ ký định dạng .{ext}.",
        )
    try:
        with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
            names = set(zf.namelist())
    except zipfile.BadZipFile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tệp .{ext} bị hỏng hoặc không phải gói ZIP hợp lệ.",
        )
    if "[Content_Types].xml" not in names:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Tệp .{ext} thiếu cấu trúc Office XML hợp lệ.",
        )
    if ext == "docx" and not ("word/document.xml" in names or any(n.startswith("word/") for n in names)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .docx không hợp lệ.")
    if ext == "pptx" and not ("ppt/presentation.xml" in names or any(n.startswith("ppt/") for n in names)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .pptx không hợp lệ.")
    if ext == "xlsx" and not ("xl/workbook.xml" in names or any(n.startswith("xl/") for n in names)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .xlsx không hợp lệ.")


def validate_magic_bytes(data: bytes, ext: str, declared_content_type: Optional[str] = None) -> None:
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp tải lên không được rỗng.")

    if declared_content_type:
        declared_base = declared_content_type.split(";", 1)[0].strip().lower()
        if declared_base in DANGEROUS_DECLARED_MIMES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Loại nội dung '{declared_base}' bị chặn vì lý do bảo mật.",
            )

    if _has_binary_exec_signature(data):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phát hiện chữ ký tệp thực thi bị chặn.",
        )

    if ext == "pdf":
        head = data[:1024].lstrip()
        if not head.startswith(b"%PDF-"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .pdf không đúng định dạng PDF.")
        return

    if ext == "png":
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .png không đúng chữ ký PNG.")
        return

    if ext in {"jpg", "jpeg"}:
        if not data.startswith(b"\xff\xd8\xff"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp ảnh JPEG không đúng chữ ký JPEG.")
        return

    if ext == "webp":
        if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .webp không đúng chữ ký WebP.")
        return

    if ext == "mp4":
        if len(data) < 12 or data[4:8] != b"ftyp":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .mp4 không đúng chữ ký MP4.")
        return

    if ext == "webm":
        if not data.startswith(b"\x1a\x45\xdf\xa3"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .webm không đúng chữ ký WebM.")
        return

    if ext == "zip":
        if not data.startswith((b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .zip không đúng chữ ký ZIP.")
        try:
            with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                zf.infolist()
        except zipfile.BadZipFile:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Tệp .zip bị hỏng.")
        return

    if ext in OOXML_EXTENSIONS:
        _validate_ooxml_zip(data, ext)
        return

    if ext in TEXT_EXTENSIONS:
        if b"\x00" in data or any(data.startswith(sig) for sig in _NON_TEXT_MAGIC_SIGNATURES):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Nội dung nhị phân không hợp lệ cho tệp .{ext}.",
            )
        try:
            data.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Tệp .{ext} phải sử dụng mã hóa UTF-8 hợp lệ.",
            )
        return

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Định dạng tệp không được hỗ trợ.")


def _read_zip_member_capped(zf: zipfile.ZipFile, member: str) -> bytes:
    info = zf.getinfo(member)
    if info.file_size > MAX_OOXML_XML_BYTES:
        raise ValueError(f"XML member {member} exceeds safe extraction size")
    with zf.open(info, "r") as handle:
        raw = handle.read(MAX_OOXML_XML_BYTES + 1)
    if len(raw) > MAX_OOXML_XML_BYTES:
        raise ValueError(f"XML member {member} exceeds safe extraction size")
    return raw


def _extract_xml_paragraphs(xml_bytes: bytes, paragraph_local_name: str, text_local_name: str) -> str:
    root = ET.fromstring(xml_bytes)
    paragraphs: list[str] = []

    def _local_name(tag: str) -> str:
        return tag.rsplit("}", 1)[-1] if "}" in tag else tag

    for elem in root.iter():
        if _local_name(elem.tag) == paragraph_local_name:
            chunks = [
                child.text
                for child in elem.iter()
                if _local_name(child.tag) == text_local_name and child.text
            ]
            line = "".join(chunks).strip()
            if line:
                paragraphs.append(line)

    if paragraphs:
        return "\n".join(paragraphs)

    fallback = [
        elem.text.strip()
        for elem in root.iter()
        if _local_name(elem.tag) == text_local_name and elem.text and elem.text.strip()
    ]
    return "\n".join(fallback)


def extract_text_from_bytes(data: bytes, ext: str) -> Optional[str]:
    text: Optional[str] = None
    try:
        if ext == "pdf":
            reader = pypdf.PdfReader(io.BytesIO(data))
            pages = [page.extract_text() or "" for page in reader.pages]
            text = "\n".join(part.strip() for part in pages if part and part.strip())
        elif ext == "docx":
            with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                parts: list[str] = []
                candidate_members = ["word/document.xml"] + sorted(
                    name
                    for name in zf.namelist()
                    if name.startswith(("word/header", "word/footer")) and name.endswith(".xml")
                )
                for member in candidate_members:
                    if member in zf.namelist():
                        xml_raw = _read_zip_member_capped(zf, member)
                        extracted = _extract_xml_paragraphs(xml_raw, "p", "t")
                        if extracted:
                            parts.append(extracted)
                text = "\n".join(parts)
        elif ext == "pptx":
            with zipfile.ZipFile(io.BytesIO(data), "r") as zf:
                slide_entries: list[Tuple[int, str]] = []
                for name in zf.namelist():
                    match = _SLIDE_XML_RE.match(name)
                    if match:
                        slide_entries.append((int(match.group(1)), name))
                slide_entries.sort(key=lambda pair: pair[0])
                parts = []
                for _, member in slide_entries:
                    xml_raw = _read_zip_member_capped(zf, member)
                    extracted = _extract_xml_paragraphs(xml_raw, "p", "t")
                    if extracted:
                        parts.append(extracted)
                text = "\n".join(parts)
        elif ext in TEXT_EXTENSIONS:
            text = data.decode("utf-8-sig")
    except Exception as exc:
        logger.warning("Text extraction skipped for .%s upload: %s", ext, exc)
        return None

    if text is None:
        return None
    cleaned = text.strip()
    if not cleaned:
        return None
    return cleaned[:EXTRACTED_TEXT_MAX_CHARS]


async def read_upload_bounded(upload: UploadFile, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(UPLOAD_CHUNK_SIZE)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Kích thước tệp vượt quá giới hạn cho phép ({settings.FILE_MAX_SIZE_MB} MB).",
            )
        chunks.append(chunk)
    return b"".join(chunks)


async def validate_and_store_upload(
    upload: UploadFile,
    scope: str,
    course_id: Optional[uuid.UUID],
    vault_dir: Optional[str] = None,
) -> SavedVaultPayload:
    ext = extract_safe_extension(upload.filename)
    original_name = _sanitize_original_name(upload.filename, ext)
    max_bytes = max(1, int(settings.FILE_MAX_SIZE_MB)) * 1024 * 1024
    data = await read_upload_bounded(upload, max_bytes)

    validate_magic_bytes(data, ext, upload.content_type)
    sha256 = hashlib.sha256(data).hexdigest()
    extracted_text = extract_text_from_bytes(data, ext)
    mime_type = CANONICAL_MIME_BY_EXT[ext]

    file_id = uuid.uuid4()
    stored_path = _build_stored_relative_path(file_id, scope, course_id, original_name, ext)
    target_path = resolve_vault_file_path(stored_path, vault_dir)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(data)

    return SavedVaultPayload(
        file_id=file_id,
        original_name=original_name,
        extension=ext,
        stored_path=stored_path,
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=sha256,
        extracted_text=extracted_text,
    )


def delete_vault_file_quietly(stored_path: str, vault_dir: Optional[str] = None) -> None:
    try:
        target = resolve_vault_file_path(stored_path, vault_dir)
    except HTTPException:
        return
    try:
        if target.is_file():
            target.unlink()
    except OSError as exc:
        logger.warning("Failed to unlink vault file %s: %s", target, exc)


def build_content_disposition(original_name: str, mime_type: str, force_attachment: bool = False) -> str:
    ext = original_name.rsplit(".", 1)[-1].lower() if "." in original_name else ""
    is_attachment = force_attachment or ext in ATTACHMENT_EXTENSIONS
    disposition = "attachment" if is_attachment else "inline"

    ascii_fallback = original_name.encode("ascii", "ignore").decode("ascii")
    ascii_fallback = re.sub(r'["\\\r\n;]', "_", ascii_fallback).strip() or f"file.{ext or 'bin'}"
    encoded_utf8 = quote(original_name, safe="")
    return f"{disposition}; filename=\"{ascii_fallback}\"; filename*=UTF-8''{encoded_utf8}"


def parse_byte_range(range_header: str, file_size: int) -> Tuple[int, int]:
    if file_size <= 0:
        raise RangeNotSatisfiableError("Empty file")
    spec = range_header.strip()
    if "," in spec:
        raise RangeNotSatisfiableError("Multi-range requests are not supported")
    match = _RANGE_RE.match(spec)
    if not match:
        raise RangeNotSatisfiableError("Malformed Range header")

    start_str, end_str = match.group(1), match.group(2)
    if not start_str and not end_str:
        raise RangeNotSatisfiableError("Empty byte range")

    if not start_str:
        suffix_len = int(end_str)
        if suffix_len <= 0:
            raise RangeNotSatisfiableError("Zero suffix range")
        start = max(0, file_size - suffix_len)
        end = file_size - 1
        return start, end

    start = int(start_str)
    if start >= file_size:
        raise RangeNotSatisfiableError("Range start past EOF")
    end = int(end_str) if end_str else file_size - 1
    end = min(end, file_size - 1)
    if end < start:
        raise RangeNotSatisfiableError("Range end before start")
    return start, end
