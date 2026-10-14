import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Module, Lesson, Course, User
from backend.app.schemas.schemas import (
    ModuleCreate, ModuleUpdate, ModulePublish, ModuleResponse,
    LessonCreate, LessonUpdate, LessonPublish, LessonResponse
)
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, verify_course_access, verify_lecturer_course_owner,
    get_course_or_404
)

router = APIRouter(tags=["Modules & Lessons"])


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


def check_lesson_ownership(lesson_id: uuid.UUID, current_user: User, db: Session) -> Lesson:
    lesson = db.query(Lesson).filter(Lesson.LessonId == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    m = db.query(Module).filter(Module.ModuleId == lesson.ModuleId).first()
    course = get_course_or_404(m.CourseId, db)
    if current_user.Role == "ADMIN":
        return lesson
    if current_user.Role == "LECTURER" and course.LecturerId == current_user.UserId:
        return lesson
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this lesson")


# ==========================================
# MODULES
# ==========================================

@router.get("/courses/{course_id}/modules", response_model=List[ModuleResponse])
def get_course_modules(
    course_id: uuid.UUID,
    course: Course = Depends(verify_course_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get modules of course.
    - Students only see published modules and published lessons.
    - Lecturers & Admins see all modules and lessons (including drafts).
    """
    module_query = db.query(Module).filter(Module.CourseId == course_id)
    if current_user.Role == "STUDENT":
        module_query = module_query.filter(Module.IsPublished == True)

    modules = module_query.order_by(Module.SortOrder.asc()).all()
    results = []

    for m in modules:
        lesson_query = db.query(Lesson).filter(Lesson.ModuleId == m.ModuleId)
        if current_user.Role == "STUDENT":
            lesson_query = lesson_query.filter(Lesson.IsPublished == True)
        lessons = lesson_query.order_by(Lesson.SortOrder.asc()).all()

        results.append(ModuleResponse(
            moduleId=m.ModuleId,
            courseId=m.CourseId,
            title=m.Title,
            sortOrder=m.SortOrder,
            description=m.Description,
            isPublished=m.IsPublished,
            createdAt=m.CreatedAt,
            lessons=[
                LessonResponse(
                    lessonId=l.LessonId,
                    moduleId=l.ModuleId,
                    title=l.Title,
                    contentHtml=l.ContentHtml,
                    materialUrl=l.MaterialUrl,
                    sortOrder=l.SortOrder,
                    isPublished=l.IsPublished,
                    estimatedMinutes=l.EstimatedMinutes,
                    createdAt=l.CreatedAt
                )
                for l in lessons
            ]
        ))
    return results


@router.post("/courses/{course_id}/modules", response_model=ModuleResponse, status_code=status.HTTP_201_CREATED)
def create_module(
    course_id: uuid.UUID,
    module_in: ModuleCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    db: Session = Depends(get_db)
):
    """Create a new module in course (own Lecturer or Admin)."""
    new_mod = Module(
        ModuleId=uuid.uuid4(),
        CourseId=course_id,
        Title=module_in.title.strip(),
        SortOrder=module_in.sortOrder,
        Description=module_in.description.strip() if module_in.description else None,
        IsPublished=module_in.isPublished
    )
    db.add(new_mod)
    db.commit()
    db.refresh(new_mod)
    return ModuleResponse(
        moduleId=new_mod.ModuleId,
        courseId=new_mod.CourseId,
        title=new_mod.Title,
        sortOrder=new_mod.SortOrder,
        description=new_mod.Description,
        isPublished=new_mod.IsPublished,
        createdAt=new_mod.CreatedAt,
        lessons=[]
    )


@router.put("/modules/{module_id}", response_model=ModuleResponse)
def update_module(
    module_id: uuid.UUID,
    mod_in: ModuleUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update module info (own Lecturer or Admin)."""
    m = check_module_ownership(module_id, current_user, db)
    if mod_in.title is not None:
        m.Title = mod_in.title.strip()
    if mod_in.sortOrder is not None:
        m.SortOrder = mod_in.sortOrder
    if mod_in.description is not None:
        m.Description = mod_in.description.strip() if mod_in.description else None
    if mod_in.isPublished is not None:
        m.IsPublished = mod_in.isPublished
    db.commit()
    db.refresh(m)
    return ModuleResponse(
        moduleId=m.ModuleId,
        courseId=m.CourseId,
        title=m.Title,
        sortOrder=m.SortOrder,
        description=m.Description,
        isPublished=m.IsPublished,
        createdAt=m.CreatedAt,
        lessons=[]
    )


@router.patch("/modules/{module_id}/publish", response_model=MessageResponse)
def toggle_module_publish(
    module_id: uuid.UUID,
    pub_in: ModulePublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish or unpublish module (own Lecturer or Admin)."""
    m = check_module_ownership(module_id, current_user, db)
    m.IsPublished = pub_in.isPublished
    db.commit()
    status_str = "published" if pub_in.isPublished else "unpublished"
    return MessageResponse(message=f"Module '{m.Title}' successfully {status_str}")


# ==========================================
# LESSONS
# ==========================================

@router.post("/modules/{module_id}/lessons", response_model=LessonResponse, status_code=status.HTTP_201_CREATED)
def create_lesson(
    module_id: uuid.UUID,
    lesson_in: LessonCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new lesson in module (own Lecturer or Admin)."""
    check_module_ownership(module_id, current_user, db)
    new_lesson = Lesson(
        LessonId=uuid.uuid4(),
        ModuleId=module_id,
        Title=lesson_in.title.strip(),
        ContentHtml=lesson_in.contentHtml,
        MaterialUrl=lesson_in.materialUrl,
        SortOrder=lesson_in.sortOrder,
        IsPublished=lesson_in.isPublished,
        EstimatedMinutes=lesson_in.estimatedMinutes
    )
    db.add(new_lesson)
    db.commit()
    db.refresh(new_lesson)
    return LessonResponse(
        lessonId=new_lesson.LessonId,
        moduleId=new_lesson.ModuleId,
        title=new_lesson.Title,
        contentHtml=new_lesson.ContentHtml,
        materialUrl=new_lesson.MaterialUrl,
        sortOrder=new_lesson.SortOrder,
        isPublished=new_lesson.IsPublished,
        estimatedMinutes=new_lesson.EstimatedMinutes,
        createdAt=new_lesson.CreatedAt
    )


@router.get("/lessons/{lesson_id}", response_model=LessonResponse)
def get_lesson_detail(
    lesson_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get single lesson detail. Students can only view published lessons."""
    lesson = db.query(Lesson).filter(Lesson.LessonId == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    m = db.query(Module).filter(Module.ModuleId == lesson.ModuleId).first()
    # Verify course access
    verify_course_access(m.CourseId, current_user, db)

    if current_user.Role == "STUDENT":
        if not lesson.IsPublished or not m.IsPublished:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson is not available or unpublished"
            )

    return LessonResponse(
        lessonId=lesson.LessonId,
        moduleId=lesson.ModuleId,
        title=lesson.Title,
        contentHtml=lesson.ContentHtml,
        materialUrl=lesson.MaterialUrl,
        sortOrder=lesson.SortOrder,
        isPublished=lesson.IsPublished,
        estimatedMinutes=lesson.EstimatedMinutes,
        createdAt=lesson.CreatedAt
    )


@router.put("/lessons/{lesson_id}", response_model=LessonResponse)
def update_lesson(
    lesson_id: uuid.UUID,
    l_in: LessonUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update lesson content (own Lecturer or Admin)."""
    lesson = check_lesson_ownership(lesson_id, current_user, db)
    if l_in.title is not None:
        lesson.Title = l_in.title.strip()
    if l_in.contentHtml is not None:
        lesson.ContentHtml = l_in.contentHtml
    if l_in.materialUrl is not None:
        lesson.MaterialUrl = l_in.materialUrl
    if l_in.sortOrder is not None:
        lesson.SortOrder = l_in.sortOrder
    if l_in.isPublished is not None:
        lesson.IsPublished = l_in.isPublished
    if l_in.estimatedMinutes is not None:
        lesson.EstimatedMinutes = l_in.estimatedMinutes

    db.commit()
    db.refresh(lesson)
    return LessonResponse(
        lessonId=lesson.LessonId,
        moduleId=lesson.ModuleId,
        title=lesson.Title,
        contentHtml=lesson.ContentHtml,
        materialUrl=lesson.MaterialUrl,
        sortOrder=lesson.SortOrder,
        isPublished=lesson.IsPublished,
        estimatedMinutes=lesson.EstimatedMinutes,
        createdAt=lesson.CreatedAt
    )


@router.patch("/lessons/{lesson_id}/publish", response_model=MessageResponse)
def toggle_lesson_publish(
    lesson_id: uuid.UUID,
    pub_in: LessonPublish,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Publish or unpublish lesson (own Lecturer or Admin)."""
    lesson = check_lesson_ownership(lesson_id, current_user, db)
    lesson.IsPublished = pub_in.isPublished
    db.commit()
    status_str = "published" if pub_in.isPublished else "unpublished"
    return MessageResponse(message=f"Lesson '{lesson.Title}' successfully {status_str}")
