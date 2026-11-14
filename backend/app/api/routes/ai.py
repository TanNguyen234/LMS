"""AI academic assistant routes (Wave 1 owner: ai-assistant-dev)."""
from typing import Dict, List
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.core.dependencies import (
    get_current_user,
    verify_course_read_access,
    verify_lecturer_course_owner,
)
from backend.app.db.session import get_db
from backend.app.models.models import Assignment, Lesson, Module, Submission, User
from backend.app.schemas.schemas import (
    AiFeedbackSuggestRequest,
    AiFeedbackSuggestResponse,
    AiQuizGenerateRequest,
    AiQuizGenerateResponse,
    AiTutorRequest,
    AiTutorResponse,
)
from backend.app.services.ai_service import (
    run_feedback_suggest,
    run_lesson_tutor,
    run_quiz_generate,
)

router = APIRouter(tags=["AI Assistant"])


@router.post("/ai/lesson-tutor", response_model=AiTutorResponse)
def ai_lesson_tutor(
    payload: AiTutorRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Provide AI-assisted summary, explanation, practice prompts, or Q&A for a lesson.
    Students require course read access and both Module + Lesson to be published.
    Never reads QuizQuestion.CorrectAnswer.
    """
    lesson = db.query(Lesson).filter(Lesson.LessonId == payload.lessonId).first()
    if not lesson:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")

    module = db.query(Module).filter(Module.ModuleId == lesson.ModuleId).first()
    if not module:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent module not found")

    course = verify_course_read_access(module.CourseId, current_user, db)

    if current_user.Role == "STUDENT" and (not lesson.IsPublished or not module.IsPublished):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lesson is not available or unpublished",
        )

    return run_lesson_tutor(
        db=db,
        lesson=lesson,
        course=course,
        current_user=current_user,
        mode=payload.mode,
        question=payload.question,
    )


@router.post("/ai/quiz-generate", response_model=AiQuizGenerateResponse)
def ai_quiz_generate(
    payload: AiQuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate draft quiz questions from selected course lessons without saving to the database.
    Restricted to the course lecturer or admin.
    """
    course = verify_lecturer_course_owner(payload.courseId, current_user, db)

    if not payload.questionTypes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one questionType must be selected",
        )

    unique_ids: List[uuid.UUID] = list(dict.fromkeys(payload.lessonIds))
    rows = (
        db.query(Lesson, Module)
        .join(Module, Module.ModuleId == Lesson.ModuleId)
        .filter(Lesson.LessonId.in_(unique_ids))
        .all()
    )
    lesson_by_id: Dict[uuid.UUID, tuple[Lesson, Module]] = {
        lesson.LessonId: (lesson, module) for lesson, module in rows
    }

    ordered_lessons: List[Lesson] = []
    for lid in unique_ids:
        pair = lesson_by_id.get(lid)
        if not pair:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
        lesson, module = pair
        if module.CourseId != course.CourseId:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="All lessons must belong to the target course",
            )
        ordered_lessons.append(lesson)

    return run_quiz_generate(
        db=db,
        course=course,
        lessons=ordered_lessons,
        current_user=current_user,
        count=payload.count,
        question_types=list(dict.fromkeys(payload.questionTypes)),
    )


@router.post("/ai/feedback-suggest", response_model=AiFeedbackSuggestResponse)
def ai_feedback_suggest(
    payload: AiFeedbackSuggestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Generate draft grading feedback for a submission without overwriting submission data.
    Restricted to the course lecturer or admin.
    """
    submission = (
        db.query(Submission).filter(Submission.SubmissionId == payload.submissionId).first()
    )
    if not submission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submission not found")

    assignment = (
        db.query(Assignment).filter(Assignment.AssignmentId == submission.AssignmentId).first()
    )
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    course = verify_lecturer_course_owner(assignment.CourseId, current_user, db)

    if payload.score is not None and payload.score > float(assignment.MaxScore):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Score cannot exceed assignment maxScore",
        )

    return run_feedback_suggest(
        db=db,
        course=course,
        assignment=assignment,
        submission=submission,
        current_user=current_user,
        score=payload.score,
    )
