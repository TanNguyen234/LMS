"""Modules & Lessons routes (Wave 1 owner: storage-files-dev)."""
import html
import re
import uuid
from html.parser import HTMLParser
from typing import Dict, List, Literal, Optional, Set
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_course_or_404,
    get_current_user,
    verify_course_read_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import Course, Lesson, LessonProgress, Module, StoredFile, User
from backend.app.schemas.common import MessageResponse
from backend.app.schemas.schemas import (
    LessonCreate,
    LessonPublish,
    LessonResponse,
    LessonUpdate,
    ModuleCreate,
    ModulePublish,
    ModuleResponse,
    ModuleUpdate,
)

router = APIRouter(tags=["Modules & Lessons"])

VALID_CONTENT_TYPES: Set[str] = {"TEXT", "PDF", "VIDEO", "SLIDE"}

DROP_CONTENT_TAGS: Set[str] = {
    "script",
    "style",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "applet",
    "noscript",
    "template",
    "svg",
    "math",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "meta",
    "link",
    "base",
}

ALLOWED_HTML_TAGS: Set[str] = {
    "p",
    "br",
    "hr",
    "div",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "del",
    "ins",
    "mark",
    "sub",
    "sup",
    "small",
    "blockquote",
    "pre",
    "code",
    "kbd",
    "samp",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "th",
    "td",
    "caption",
    "a",
    "img",
    "figure",
    "figcaption",
}

VOID_HTML_TAGS: Set[str] = {"br", "hr", "img"}

ALLOWED_ATTRS_BY_TAG: Dict[str, Set[str]] = {
    "a": {"href", "title", "target", "rel"},
    "img": {"src", "alt", "title", "width", "height"},
    "th": {"colspan", "rowspan", "scope"},
    "td": {"colspan", "rowspan"},
    "ol": {"start", "type"},
    "code": {"class"},
    "pre": {"class"},
}

_CTRL_AND_SPACE_RE = re.compile(r"[\x00-\x20\x7f]+")
_SAFE_CODE_CLASS_RE = re.compile(r"^language-[a-z0-9_-]{1,32}$", re.IGNORECASE)
_SAFE_SIZE_ATTR_RE = re.compile(r"^\d{1,4}$")


class SingleReorderRequest(BaseModel):
    direction: Optional[Literal["UP", "DOWN"]] = None
    sortOrder: Optional[int] = Field(default=None, ge=0)
    orderedIds: Optional[List[uuid.UUID]] = None

    @model_validator(mode="after")
    def require_one_mode(self):
        if self.direction is None and self.sortOrder is None and not self.orderedIds:
            raise ValueError("One of direction, sortOrder, or orderedIds is required")
        return self


class ModuleListReorderRequest(BaseModel):
    moduleIds: List[uuid.UUID] = Field(..., min_length=1)


class LessonListReorderRequest(BaseModel):
    lessonIds: List[uuid.UUID] = Field(..., min_length=1)


def _is_safe_url(raw_url: str, allow_fragment: bool = False) -> bool:
    if not raw_url:
        return False
    stripped = raw_url.strip()
    compact = _CTRL_AND_SPACE_RE.sub("", stripped)
    decoded_compact = _CTRL_AND_SPACE_RE.sub("", unquote(compact))
    for candidate in (compact, decoded_compact):
        lower = candidate.lower()
        if lower.startswith(("javascript:", "vbscript:", "data:", "file:", "//")):
            return False

    if allow_fragment and stripped.startswith("#"):
        return True
    if stripped.startswith("/api/files/"):
        return ".." not in stripped and not stripped.startswith("//")

    parsed = urlparse(stripped)
    return parsed.scheme.lower() in {"http", "https"} and bool(parsed.netloc)


class _AcademicHtmlSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: List[str] = []
        self._drop_depth = 0
        self._open_stack: List[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag = tag.lower()
        if self._drop_depth > 0:
            if tag in DROP_CONTENT_TAGS:
                self._drop_depth += 1
            return
        if tag in DROP_CONTENT_TAGS:
            self._drop_depth = 1
            return
        if tag not in ALLOWED_HTML_TAGS:
            return

        allowed_attrs = ALLOWED_ATTRS_BY_TAG.get(tag, set())
        cleaned_attrs: List[tuple[str, str]] = []
        has_valid_href = False
        has_valid_src = False
        has_blank_target = False

        for attr_name, attr_val in attrs:
            name = (attr_name or "").lower().strip()
            if not name or name.startswith("on") or name not in allowed_attrs:
                continue
            val = (attr_val or "").strip()
            if name == "href":
                if _is_safe_url(val, allow_fragment=True):
                    cleaned_attrs.append(("href", val))
                    has_valid_href = True
            elif name == "src":
                if _is_safe_url(val, allow_fragment=False):
                    cleaned_attrs.append(("src", val))
                    has_valid_src = True
            elif name == "target":
                if val.lower() == "_blank":
                    cleaned_attrs.append(("target", "_blank"))
                    has_blank_target = True
            elif name == "rel":
                continue
            elif name == "class":
                safe_classes = [c for c in val.split() if _SAFE_CODE_CLASS_RE.match(c)]
                if safe_classes:
                    cleaned_attrs.append(("class", " ".join(safe_classes)))
            elif name in {"width", "height"}:
                if _SAFE_SIZE_ATTR_RE.match(val):
                    cleaned_attrs.append((name, val))
            elif name == "scope":
                if val.lower() in {"col", "row", "colgroup", "rowgroup"}:
                    cleaned_attrs.append(("scope", val.lower()))
            elif name in {"colspan", "rowspan", "start"}:
                if _SAFE_SIZE_ATTR_RE.match(val):
                    cleaned_attrs.append((name, val))
            else:
                cleaned_attrs.append((name, val))

        if tag == "img" and not has_valid_src:
            return
        if tag == "a" and has_valid_href and has_blank_target:
            cleaned_attrs.append(("rel", "noopener noreferrer"))

        attr_str = "".join(f' {k}="{html.escape(v, quote=True)}"' for k, v in cleaned_attrs)
        self._chunks.append(f"<{tag}{attr_str}>")
        if tag not in VOID_HTML_TAGS:
            self._open_stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        tag_lower = tag.lower()
        if tag_lower in DROP_CONTENT_TAGS:
            return
        self.handle_starttag(tag, attrs)
        if tag_lower in ALLOWED_HTML_TAGS and tag_lower not in VOID_HTML_TAGS and self._open_stack and self._open_stack[-1] == tag_lower:
            self._open_stack.pop()
            self._chunks.append(f"</{tag_lower}>")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self._drop_depth > 0:
            if tag in DROP_CONTENT_TAGS:
                self._drop_depth -= 1
            return
        if tag not in ALLOWED_HTML_TAGS or tag in VOID_HTML_TAGS:
            return
        if tag in self._open_stack:
            while self._open_stack:
                top = self._open_stack.pop()
                self._chunks.append(f"</{top}>")
                if top == tag:
                    break

    def handle_data(self, data: str) -> None:
        if self._drop_depth > 0:
            return
        self._chunks.append(html.escape(data, quote=False))

    def handle_comment(self, data: str) -> None:
        return

    def handle_decl(self, decl: str) -> None:
        return

    def handle_pi(self, data: str) -> None:
        return

    def get_sanitized_html(self) -> str:
        while self._open_stack:
            self._chunks.append(f"</{self._open_stack.pop()}>")
        return "".join(self._chunks)


def sanitize_lesson_html(raw_html: Optional[str]) -> Optional[str]:
    if raw_html is None:
        return None
    if not raw_html.strip():
        return ""
    parser = _AcademicHtmlSanitizer()
    parser.feed(raw_html)
    parser.close()
    return parser.get_sanitized_html()


def validate_material_url(raw_url: Optional[str]) -> Optional[str]:
    if raw_url is None:
        return None
    cleaned = raw_url.strip()
    if not cleaned:
        return None
    if any(ord(ch) < 32 or ord(ch) == 127 for ch in cleaned):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MaterialUrl contains invalid control characters",
        )
    if not _is_safe_url(cleaned, allow_fragment=False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MaterialUrl must use http://, https://, or /api/files/...",
        )
    if len(cleaned) > 500:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MaterialUrl must not exceed 500 characters",
        )
    return cleaned


def _validate_attachment_file(
    file_id: Optional[uuid.UUID],
    course_id: uuid.UUID,
    db: Session,
) -> Optional[StoredFile]:
    if file_id is None:
        return None
    sf = db.query(StoredFile).filter(StoredFile.FileId == file_id).first()
    if not sf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment file not found")
    if sf.CourseId is not None and sf.CourseId != course_id and sf.Scope != "SEED":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Attachment file does not belong to this course",
        )
    return sf


def _to_lesson_response(lesson: Lesson) -> LessonResponse:
    content_type = (lesson.ContentType or "TEXT").upper()
    if content_type not in VALID_CONTENT_TYPES:
        content_type = "TEXT"
    return LessonResponse(
        lessonId=lesson.LessonId,
        moduleId=lesson.ModuleId,
        title=lesson.Title,
        contentHtml=lesson.ContentHtml,
        materialUrl=lesson.MaterialUrl,
        contentType=content_type,
        attachmentFileId=lesson.AttachmentFileId,
        sortOrder=lesson.SortOrder,
        isPublished=lesson.IsPublished,
        estimatedMinutes=lesson.EstimatedMinutes,
        createdAt=lesson.CreatedAt,
    )


def _to_module_response(module: Module, lessons: List[Lesson]) -> ModuleResponse:
    return ModuleResponse(
        moduleId=module.ModuleId,
        courseId=module.CourseId,
        title=module.Title,
        sortOrder=module.SortOrder,
        description=module.Description,
        isPublished=module.IsPublished,
        createdAt=module.CreatedAt,
        lessons=[_to_lesson_response(item) for item in lessons],
    )


def _load_module_lessons(module_id: uuid.UUID, db: Session) -> List[Lesson]:
    return (
        db.query(Lesson)
        .filter(Lesson.ModuleId == module_id)
        .order_by(Lesson.SortOrder.asc(), Lesson.CreatedAt.asc())
        .all()
    )


def check_module_ownership(module_id: uuid.UUID, current_user: User, db: Session) -> Module:
    m = db.query(Module).filter(Module.ModuleId == module_id).first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Module not found")
    course = get_course_or_404(m.CourseId, db)
    if current_user.Role == "ADMIN":
        return m
    if current_user.Role == "LECTURER" and course.LecturerId == current_user.UserId:
        return m
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this course module")


def check_lesson_ownership(lesson_id: uuid.UUID, current_user: User, db: Session) -> tuple[Lesson, Module]:
    lesson = db.query(Lesson).filter(Lesson.LessonId == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    m = db.query(Module).filter(Module.ModuleId == lesson.ModuleId).first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent module not found")
    course = get_course_or_404(m.CourseId, db)
    if current_user.Role == "ADMIN":
        return lesson, m
    if current_user.Role == "LECTURER" and course.LecturerId == current_user.UserId:
        return lesson, m
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this lesson")


def _apply_reordered_sequence(items: list, ordered_ids: List[uuid.UUID], id_attr: str, label: str) -> None:
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Duplicate {label} IDs in reorder list")
    by_id = {getattr(item, id_attr): item for item in items}
    if set(ordered_ids) != set(by_id.keys()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Reorder list must include all {label}s in the parent container",
        )
    for idx, item_id in enumerate(ordered_ids, start=1):
        by_id[item_id].SortOrder = idx


def _apply_single_reorder(
    items: list,
    target_id: uuid.UUID,
    id_attr: str,
    payload: SingleReorderRequest,
    label: str,
) -> None:
    if payload.orderedIds:
        _apply_reordered_sequence(items, payload.orderedIds, id_attr, label)
        return

    ids = [getattr(item, id_attr) for item in items]
    current_idx = ids.index(target_id)
    if payload.direction == "UP" and current_idx > 0:
        ids[current_idx - 1], ids[current_idx] = ids[current_idx], ids[current_idx - 1]
    elif payload.direction == "DOWN" and current_idx < len(ids) - 1:
        ids[current_idx + 1], ids[current_idx] = ids[current_idx], ids[current_idx + 1]
    elif payload.sortOrder is not None:
        target_pos = max(0, min(len(ids) - 1, payload.sortOrder - 1 if payload.sortOrder >= 1 else 0))
        moved = ids.pop(current_idx)
        ids.insert(target_pos, moved)

    by_id = {getattr(item, id_attr): item for item in items}
    for idx, item_id in enumerate(ids, start=1):
        by_id[item_id].SortOrder = idx


# ==========================================
# MODULES
# ==========================================


@router.get("/courses/{course_id}/modules", response_model=List[ModuleResponse])
def get_course_modules(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_read_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Get modules of course.
    - Students only see published modules and published lessons.
    - Lecturers & Admins see all modules and lessons (including drafts).
    """
    module_query = db.query(Module).filter(Module.CourseId == course_id)
    if current_user.Role == "STUDENT":
        module_query = module_query.filter(Module.IsPublished == True)  # noqa: E712

    modules = module_query.order_by(Module.SortOrder.asc(), Module.CreatedAt.asc()).all()
    if not modules:
        return []

    module_ids = [m.ModuleId for m in modules]
    lesson_query = db.query(Lesson).filter(Lesson.ModuleId.in_(module_ids))
    if current_user.Role == "STUDENT":
        lesson_query = lesson_query.filter(Lesson.IsPublished == True)  # noqa: E712
    lessons = lesson_query.order_by(Lesson.SortOrder.asc(), Lesson.CreatedAt.asc()).all()

    lessons_by_module: Dict[uuid.UUID, List[Lesson]] = {mid: [] for mid in module_ids}
    for lesson in lessons:
        lessons_by_module.setdefault(lesson.ModuleId, []).append(lesson)

    return [_to_module_response(m, lessons_by_module.get(m.ModuleId, [])) for m in modules]


@router.post("/courses/{course_id}/modules", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
def create_module(
    course_id: uuid.UUID,
    module_in: ModuleCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Create a new module in course (own Lecturer or Admin)."""
    new_mod = Module(
        ModuleId=uuid.uuid4(),
        CourseId=course_id,
        Title=module_in.title.strip(),
        SortOrder=module_in.sortOrder,
        Description=module_in.description.strip() if module_in.description else None,
        IsPublished=module_in.isPublished,
    )
    db.add(new_mod)
    db.commit()
    db.refresh(new_mod)
    return _to_module_response(new_mod, [])


@router.put("/modules/{module_id}", response_model=ModuleResponse)
def update_module(
    module_id: uuid.UUID,
    mod_in: ModuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update module info and return its lessons (own Lecturer or Admin)."""
    m = check_module_ownership(module_id, current_user, db)
    if mod_in.title is not None:
        m.Title = mod_in.title.strip()
    if mod_in.sortOrder is not None:
        m.SortOrder = mod_in.sortOrder
    if "description" in mod_in.model_fields_set:
        m.Description = mod_in.description.strip() if mod_in.description else None
    if mod_in.isPublished is not None:
        m.IsPublished = mod_in.isPublished
    db.commit()
    db.refresh(m)
    lessons = _load_module_lessons(m.ModuleId, db)
    return _to_module_response(m, lessons)


@router.patch("/modules/{module_id}/publish", response_model=MessageResponse)
def toggle_module_publish(
    module_id: uuid.UUID,
    pub_in: ModulePublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publish or unpublish module (own Lecturer or Admin)."""
    m = check_module_ownership(module_id, current_user, db)
    m.IsPublished = pub_in.isPublished
    db.commit()
    status_str = "published" if pub_in.isPublished else "unpublished"
    return MessageResponse(message=f"Module '{m.Title}' successfully {status_str}")


@router.patch("/courses/{course_id}/modules/reorder", response_model=List[ModuleResponse])
def reorder_course_modules(
    course_id: uuid.UUID,
    reorder_in: ModuleListReorderRequest,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db),
):
    """Reorder all modules in a course using an ordered array of module IDs."""
    modules = (
        db.query(Module)
        .filter(Module.CourseId == course_id)
        .order_by(Module.SortOrder.asc(), Module.CreatedAt.asc())
        .all()
    )
    _apply_reordered_sequence(modules, reorder_in.moduleIds, "ModuleId", "module")
    db.commit()

    refreshed = (
        db.query(Module)
        .filter(Module.CourseId == course_id)
        .order_by(Module.SortOrder.asc(), Module.CreatedAt.asc())
        .all()
    )
    module_ids = [m.ModuleId for m in refreshed]
    lessons = (
        db.query(Lesson)
        .filter(Lesson.ModuleId.in_(module_ids))
        .order_by(Lesson.SortOrder.asc(), Lesson.CreatedAt.asc())
        .all()
        if module_ids
        else []
    )
    lessons_by_module: Dict[uuid.UUID, List[Lesson]] = {mid: [] for mid in module_ids}
    for lesson in lessons:
        lessons_by_module.setdefault(lesson.ModuleId, []).append(lesson)
    return [_to_module_response(m, lessons_by_module.get(m.ModuleId, [])) for m in refreshed]


@router.patch("/modules/{module_id}/reorder", response_model=ModuleResponse)
def reorder_single_module(
    module_id: uuid.UUID,
    reorder_in: SingleReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move a module UP/DOWN, to a target sortOrder, or reorder via orderedIds."""
    m = check_module_ownership(module_id, current_user, db)
    siblings = (
        db.query(Module)
        .filter(Module.CourseId == m.CourseId)
        .order_by(Module.SortOrder.asc(), Module.CreatedAt.asc())
        .all()
    )
    _apply_single_reorder(siblings, m.ModuleId, "ModuleId", reorder_in, "module")
    db.commit()
    db.refresh(m)
    lessons = _load_module_lessons(m.ModuleId, db)
    return _to_module_response(m, lessons)


@router.delete("/modules/{module_id}", response_model=MessageResponse)
def delete_module(
    module_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete an empty module; blocks with 409 if lessons still exist."""
    m = check_module_ownership(module_id, current_user, db)
    lesson_count = db.query(Lesson).filter(Lesson.ModuleId == module_id).count()
    if lesson_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa chương học vì vẫn còn bài giảng bên trong. Vui lòng xóa các bài giảng trước.",
        )

    title = m.Title
    try:
        db.delete(m)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa chương học do ràng buộc dữ liệu.",
        )
    return MessageResponse(message=f"Module '{title}' deleted successfully", detail=str(module_id))


# ==========================================
# LESSONS
# ==========================================


@router.post("/modules/{module_id}/lessons", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(
    module_id: uuid.UUID,
    lesson_in: LessonCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new lesson in module (own Lecturer or Admin)."""
    parent_module = check_module_ownership(module_id, current_user, db)
    sanitized_html = sanitize_lesson_html(lesson_in.contentHtml)
    validated_url = validate_material_url(lesson_in.materialUrl)
    _validate_attachment_file(lesson_in.attachmentFileId, parent_module.CourseId, db)

    if lesson_in.attachmentFileId is not None and not validated_url:
        validated_url = f"/api/files/{lesson_in.attachmentFileId}/content"

    new_lesson = Lesson(
        LessonId=uuid.uuid4(),
        ModuleId=module_id,
        Title=lesson_in.title.strip(),
        ContentHtml=sanitized_html,
        MaterialUrl=validated_url,
        ContentType=lesson_in.contentType,
        AttachmentFileId=lesson_in.attachmentFileId,
        SortOrder=lesson_in.sortOrder,
        IsPublished=lesson_in.isPublished,
        EstimatedMinutes=lesson_in.estimatedMinutes,
    )
    db.add(new_lesson)
    db.commit()
    db.refresh(new_lesson)
    return _to_lesson_response(new_lesson)


@router.get("/lessons/{lesson_id}", response_model=LessonResponse)
def get_lesson_detail(
    lesson_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single lesson detail. Students can only view published lessons."""
    lesson = db.query(Lesson).filter(Lesson.LessonId == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    m = db.query(Module).filter(Module.ModuleId == lesson.ModuleId).first()
    if not m:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent module not found")

    verify_course_read_access(m.CourseId, current_user, db)

    if current_user.Role == "STUDENT" and (not lesson.IsPublished or not m.IsPublished):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson is not available or unpublished",
        )

    return _to_lesson_response(lesson)


@router.put("/lessons/{lesson_id}", response_model=LessonResponse)
def update_lesson(
    lesson_id: uuid.UUID,
    l_in: LessonUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update lesson content (own Lecturer or Admin)."""
    lesson, parent_module = check_lesson_ownership(lesson_id, current_user, db)
    fields_set = l_in.model_fields_set

    if l_in.title is not None:
        lesson.Title = l_in.title.strip()
    if "contentHtml" in fields_set:
        lesson.ContentHtml = sanitize_lesson_html(l_in.contentHtml)
    if l_in.contentType is not None:
        lesson.ContentType = l_in.contentType
    if "attachmentFileId" in fields_set:
        _validate_attachment_file(l_in.attachmentFileId, parent_module.CourseId, db)
        lesson.AttachmentFileId = l_in.attachmentFileId
    if "materialUrl" in fields_set:
        lesson.MaterialUrl = validate_material_url(l_in.materialUrl)
    elif "attachmentFileId" in fields_set:
        if l_in.attachmentFileId is not None:
            lesson.MaterialUrl = f"/api/files/{l_in.attachmentFileId}/content"
        elif lesson.MaterialUrl and lesson.MaterialUrl.startswith("/api/files/"):
            lesson.MaterialUrl = None

    if l_in.sortOrder is not None:
        lesson.SortOrder = l_in.sortOrder
    if l_in.isPublished is not None:
        lesson.IsPublished = l_in.isPublished
    if "estimatedMinutes" in fields_set:
        lesson.EstimatedMinutes = l_in.estimatedMinutes

    db.commit()
    db.refresh(lesson)
    return _to_lesson_response(lesson)


@router.patch("/lessons/{lesson_id}/publish", response_model=MessageResponse)
def toggle_lesson_publish(
    lesson_id: uuid.UUID,
    pub_in: LessonPublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Publish or unpublish lesson (own Lecturer or Admin)."""
    lesson, _ = check_lesson_ownership(lesson_id, current_user, db)
    lesson.IsPublished = pub_in.isPublished
    db.commit()
    status_str = "published" if pub_in.isPublished else "unpublished"
    return MessageResponse(message=f"Lesson '{lesson.Title}' successfully {status_str}")


@router.patch("/modules/{module_id}/lessons/reorder", response_model=List[LessonResponse])
def reorder_module_lessons(
    module_id: uuid.UUID,
    reorder_in: LessonListReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reorder all lessons in a module using an ordered array of lesson IDs."""
    check_module_ownership(module_id, current_user, db)
    lessons = _load_module_lessons(module_id, db)
    _apply_reordered_sequence(lessons, reorder_in.lessonIds, "LessonId", "lesson")
    db.commit()
    return [_to_lesson_response(item) for item in _load_module_lessons(module_id, db)]


@router.patch("/lessons/{lesson_id}/reorder", response_model=LessonResponse)
def reorder_single_lesson(
    lesson_id: uuid.UUID,
    reorder_in: SingleReorderRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move a lesson UP/DOWN, to a target sortOrder, or reorder via orderedIds."""
    lesson, _ = check_lesson_ownership(lesson_id, current_user, db)
    siblings = _load_module_lessons(lesson.ModuleId, db)
    _apply_single_reorder(siblings, lesson.LessonId, "LessonId", reorder_in, "lesson")
    db.commit()
    db.refresh(lesson)
    return _to_lesson_response(lesson)


@router.delete("/lessons/{lesson_id}", response_model=MessageResponse)
def delete_lesson(
    lesson_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a lesson; blocks with 409 if student LessonProgress exists."""
    lesson, _ = check_lesson_ownership(lesson_id, current_user, db)
    progress_count = db.query(LessonProgress).filter(LessonProgress.LessonId == lesson_id).count()
    if progress_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa bài giảng vì đã có dữ liệu tiến độ học tập của sinh viên.",
        )

    title = lesson.Title
    try:
        db.delete(lesson)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Không thể xóa bài giảng do ràng buộc dữ liệu.",
        )
    return MessageResponse(message=f"Lesson '{title}' deleted successfully", detail=str(lesson_id))
