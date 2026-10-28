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


@router.post("/courses/{course_id}/generate-standard-syllabus")
def generate_standard_syllabus(
    course_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate standard 15-week university syllabus structure (Lecturer or Admin)."""
    course = get_course_or_404(course_id, db)
    if current_user.Role == "LECTURER" and course.LecturerId != current_user.UserId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.Role == "STUDENT":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    standard_weeks = [
        ("Tuần 1: Nhập môn & Giới thiệu đề cương học phần", "Tổng quan mục tiêu, phương pháp học tập và tiêu chí đánh giá."),
        ("Tuần 2: Kiến thức nền tảng & Tổng quan kiến trúc", "Các khái niệm lý thuyết cốt lõi và thuật ngữ chuyên môn."),
        ("Tuần 3: Phương pháp & Mô hình lý thuyết", "Phân tích nguyên lý và mô hình vận hành tiêu chuẩn."),
        ("Tuần 4: Thực hành chuyên đề 1", "Bài tập thực hành củng cố lý thuyết các tuần trước."),
        ("Tuần 5: Kỹ thuật phân tích & Thiết kế hệ thống", "Phương pháp tiếp cận bài toán thực tế và xây dựng sơ đồ thiết kế."),
        ("Tuần 6: Thực hành chuyên đề 2", "Áp dụng kỹ thuật phân tích vào bài tập tình huống."),
        ("Tuần 7: Chuyên đề nâng cao phần 1", "Các khái niệm nâng cao và tối ưu hóa giải pháp."),
        ("Tuần 8: Ôn tập & Kiểm tra đánh giá giữa kỳ", "Đánh giá quá trình và giải đáp thắc mắc nửa đầu học phần."),
        ("Tuần 9: Chuyên đề nâng cao phần 2", "Mở rộng nghiên cứu sâu các vấn đề thực tiễn."),
        ("Tuần 10: Thực hành chuyên đề 3", "Bài tập lớn và bài thực hành nâng cao theo nhóm."),
        ("Tuần 11: Ứng dụng thực tế & Nghiên cứu tình huống", "Case study thực tế từ doanh nghiệp và các dự án điển hình."),
        ("Tuần 12: Đồ án môn học & Làm việc nhóm", "Phân công và triển khai đồ án học phần."),
        ("Tuần 13: Báo cáo tiến độ đồ án & Giải đáp thắc mắc", "Giảng viên phản hồi và hướng dẫn sửa đổi đồ án."),
        ("Tuần 14: Hoàn thiện sản phẩm & Kiểm thử", "Kiểm thử sản phẩm và chuẩn bị tài liệu báo cáo."),
        ("Tuần 15: Ôn tập tổng kết & Chuẩn bị thi kết thúc học phần", "Hệ thống hóa toàn bộ kiến thức và hướng dẫn ôn tập thi.")
    ]

    existing_count = db.query(Module).filter(Module.CourseId == course_id).count()
    start_order = existing_count + 1

    created_modules = []
    for idx, (title, desc) in enumerate(standard_weeks):
        m = Module(
            ModuleId=uuid.uuid4(),
            CourseId=course_id,
            Title=title,
            SortOrder=start_order + idx,
            Description=desc,
            IsPublished=True
        )
        db.add(m)
        created_modules.append(m)

    db.commit()
    return {
        "success": True,
        "createdCount": len(created_modules),
        "message": f"Đã khởi tạo thành công 15 tuần học chuẩn cho khóa học '{course.CourseCode}'!"
    }

