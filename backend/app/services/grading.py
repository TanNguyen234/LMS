"""Grading calculations, scale-10 FinalScore synchronization, and 4.0 GPA transcript service."""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional, Sequence, Tuple

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.app.models.models import Assignment, Course, Enrollment, Grade, Quiz


GPA_SCALE_4_BANDS: List[Tuple[float, float, str]] = [
    (8.5, 4.0, "A"),
    (8.0, 3.5, "B+"),
    (7.0, 3.0, "B"),
    (6.5, 2.5, "C+"),
    (5.5, 2.0, "C"),
    (5.0, 1.5, "D+"),
    (4.0, 1.0, "D"),
]


def convert_score10_to_gpa4(score10: float) -> Tuple[float, str]:
    """Convert a 10-point score into Vietnamese university 4-point GPA and letter grade."""
    rounded = round(float(score10), 2)
    for threshold, gpa4, letter in GPA_SCALE_4_BANDS:
        if rounded >= threshold:
            return gpa4, letter
    return 0.0, "F"


def calculate_course_score10(grades: Sequence[Grade]) -> Optional[float]:
    """
    Compute final course score normalized to scale 10 (0.00..10.00).

    - Uses weighted average sum((score / maxScore) * 10 * weight) / sum(weight)
      when at least one grade has WeightPercent > 0.
    - Falls back to simple arithmetic mean of normalized 10-point scores when
      all weights are NULL (or total positive weight is 0).
    - Returns None when no grade records exist (never fabricates 0.0).
    """
    normalized_items: List[Tuple[float, Optional[float]]] = []
    for g in grades:
        if g.MaxScore is None or float(g.MaxScore) <= 0:
            continue
        score10 = max(0.0, min(10.0, (float(g.Score) / float(g.MaxScore)) * 10.0))
        weight = float(g.WeightPercent) if g.WeightPercent is not None else None
        normalized_items.append((score10, weight))

    if not normalized_items:
        return None

    positive_weighted = [(s, w) for s, w in normalized_items if w is not None and w > 0]
    if positive_weighted:
        total_weight = sum(w for _, w in positive_weighted)
        result = sum(s * w for s, w in positive_weighted) / total_weight
    else:
        result = sum(s for s, _ in normalized_items) / len(normalized_items)

    return round(max(0.0, min(10.0, result)), 2)


def sync_enrollment_final_score(
    db: Session,
    course_id: uuid.UUID,
    student_id: uuid.UUID,
) -> Optional[float]:
    """Recompute and flush Enrollment.FinalScore (scale 10) for a student in a course."""
    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.CourseId == course_id, Enrollment.StudentId == student_id)
        .first()
    )
    if not enrollment:
        return None

    grades = (
        db.query(Grade)
        .filter(Grade.CourseId == course_id, Grade.StudentId == student_id)
        .all()
    )
    score10 = calculate_course_score10(grades)
    enrollment.FinalScore = score10
    db.flush()
    return score10


def validate_course_weights(
    db: Session,
    course_id: uuid.UUID,
    student_id: uuid.UUID,
    incoming_weight: Optional[float],
    exclude_grade_id: Optional[uuid.UUID] = None,
) -> None:
    """Ensure cumulative WeightPercent for a student in a course never exceeds 100%."""
    if incoming_weight is None:
        return

    query = db.query(Grade).filter(
        Grade.CourseId == course_id,
        Grade.StudentId == student_id,
        Grade.WeightPercent.isnot(None),
    )
    if exclude_grade_id is not None:
        query = query.filter(Grade.GradeId != exclude_grade_id)

    existing_total = sum(float(row.WeightPercent) for row in query.all() if row.WeightPercent is not None)
    if existing_total + float(incoming_weight) > 100.0 + 1e-6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Cumulative weightPercent ({existing_total + float(incoming_weight):.2f}%) "
                "for student in this course cannot exceed 100%"
            ),
        )


def resolve_grade_source_titles(
    db: Session,
    grades: Sequence[Grade],
) -> Dict[Tuple[str, uuid.UUID], str]:
    """Batch load Assignment and Quiz titles for grades missing persisted ItemTitle."""
    assignment_ids = {
        g.SourceId for g in grades if g.SourceType == "ASSIGNMENT" and g.SourceId is not None and not g.ItemTitle
    }
    quiz_ids = {
        g.SourceId for g in grades if g.SourceType == "QUIZ" and g.SourceId is not None and not g.ItemTitle
    }
    titles: Dict[Tuple[str, uuid.UUID], str] = {}
    if assignment_ids:
        for a in db.query(Assignment.AssignmentId, Assignment.Title).filter(Assignment.AssignmentId.in_(assignment_ids)).all():
            titles[("ASSIGNMENT", a.AssignmentId)] = a.Title
    if quiz_ids:
        for q in db.query(Quiz.QuizId, Quiz.Title).filter(Quiz.QuizId.in_(quiz_ids)).all():
            titles[("QUIZ", q.QuizId)] = q.Title
    return titles


def grade_item_title(grade: Grade, title_lookup: Optional[Dict[Tuple[str, uuid.UUID], str]] = None) -> str:
    """Resolve readable item title for any grade record."""
    if grade.ItemTitle:
        return grade.ItemTitle
    if title_lookup and grade.SourceId and (grade.SourceType, grade.SourceId) in title_lookup:
        return title_lookup[(grade.SourceType, grade.SourceId)]
    if grade.SourceType == "ASSIGNMENT":
        return "Assignment"
    if grade.SourceType == "QUIZ":
        return "Quiz"
    if grade.SourceType == "MIDTERM":
        return "Giua ky"
    if grade.SourceType == "FINAL":
        return "Cuoi ky"
    return "Manual grade"


def build_student_transcript(db: Session, student_id: uuid.UUID) -> Dict[str, Any]:
    """
    Build student's full multi-course transcript separating Provisional GPA
    (graded ACTIVE + COMPLETED courses) and Official GPA (graded COMPLETED courses).

    Courses with zero Grade records never contribute to GPA even if Enrollments.FinalScore
    contains a stale default like 0.00.
    """
    enrollments = (
        db.query(Enrollment, Course)
        .join(Course, Course.CourseId == Enrollment.CourseId)
        .filter(
            Enrollment.StudentId == student_id,
            Enrollment.Status.in_(["ACTIVE", "COMPLETED"]),
            Course.Status != "DRAFT",
        )
        .order_by(Course.AcademicYear.desc(), Course.Semester.asc(), Course.CourseCode.asc())
        .all()
    )

    all_grades = (
        db.query(Grade)
        .filter(Grade.StudentId == student_id)
        .order_by(Grade.GradedAt.desc())
        .all()
    )
    title_lookup = resolve_grade_source_titles(db, all_grades)

    grades_by_course: Dict[uuid.UUID, List[Grade]] = {}
    for g in all_grades:
        grades_by_course.setdefault(g.CourseId, []).append(g)

    official_weighted_4 = 0.0
    official_weighted_10 = 0.0
    completed_credits = 0

    provisional_weighted_4 = 0.0
    provisional_weighted_10 = 0.0
    attempted_credits = 0
    total_credits = 0

    course_items: List[Dict[str, Any]] = []
    for enrollment, course in enrollments:
        credits = int(course.Credits or 0)
        total_credits += credits
        course_grades = grades_by_course.get(course.CourseId, [])
        score10 = calculate_course_score10(course_grades)

        if score10 is not None:
            gpa4, letter = convert_score10_to_gpa4(score10)
            passed: Optional[bool] = score10 >= 5.0
            provisional_weighted_4 += gpa4 * credits
            provisional_weighted_10 += score10 * credits
            attempted_credits += credits

            if enrollment.Status == "COMPLETED":
                official_weighted_4 += gpa4 * credits
                official_weighted_10 += score10 * credits
                completed_credits += credits
        else:
            gpa4, letter, passed = None, None, None

        total_weight = round(
            sum(float(g.WeightPercent) for g in course_grades if g.WeightPercent is not None),
            2,
        )

        course_items.append({
            "courseId": course.CourseId,
            "courseCode": course.CourseCode,
            "title": course.Title,
            "semester": course.Semester,
            "academicYear": course.AcademicYear,
            "credits": credits,
            "courseStatus": course.Status,
            "enrollmentStatus": enrollment.Status,
            "finalScore10": score10,
            "gpa4": gpa4,
            "letterGrade": letter,
            "passed": passed,
            "totalWeightPercent": total_weight,
            "gradesCount": len(course_grades),
            "grades": [
                {
                    "gradeId": g.GradeId,
                    "courseId": g.CourseId,
                    "studentId": g.StudentId,
                    "sourceType": g.SourceType,
                    "sourceId": g.SourceId,
                    "itemTitle": grade_item_title(g, title_lookup),
                    "score": float(g.Score),
                    "maxScore": float(g.MaxScore),
                    "weightPercent": float(g.WeightPercent) if g.WeightPercent is not None else None,
                    "feedback": g.Feedback,
                    "gradedBy": g.GradedBy,
                    "gradedAt": g.GradedAt,
                }
                for g in course_grades
            ],
        })

    official_gpa4 = (
        round(official_weighted_4 / completed_credits, 2) if completed_credits > 0 else None
    )
    official_gpa10 = (
        round(official_weighted_10 / completed_credits, 2) if completed_credits > 0 else None
    )
    provisional_gpa4 = (
        round(provisional_weighted_4 / attempted_credits, 2) if attempted_credits > 0 else None
    )
    provisional_gpa10 = (
        round(provisional_weighted_10 / attempted_credits, 2) if attempted_credits > 0 else None
    )

    return {
        "studentId": student_id,
        "officialGpaScale4": official_gpa4,
        "officialGpaScale10": official_gpa10,
        "provisionalGpaScale4": provisional_gpa4,
        "provisionalGpaScale10": provisional_gpa10,
        "completedCredits": completed_credits,
        "attemptedCredits": attempted_credits,
        "totalCredits": total_credits,
        "courses": course_items,
    }
