import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.app.db.session import get_db
from backend.app.models.models import Grade, Course, User, Enrollment, Assignment, Quiz, Notification
from backend.app.schemas.schemas import GradeResponse, ManualGradeCreate, StudentGradeMatrix, GradeMatrixResponse
from backend.app.schemas.common import MessageResponse
from backend.app.core.dependencies import (
    get_current_user, require_student, verify_course_access,
    verify_lecturer_course_owner, get_course_or_404
)

router = APIRouter(tags=["Grades & Gradebook"])


def format_grade_response(grade: Grade, db: Session) -> GradeResponse:
    student = db.query(User).filter(User.UserId == grade.StudentId).first()
    if grade.SourceType == "ASSIGNMENT" and grade.SourceId:
        source = db.query(Assignment).filter(Assignment.AssignmentId == grade.SourceId).first()
        title = source.Title if source else "Assignment"
    elif grade.SourceType == "QUIZ" and grade.SourceId:
        source = db.query(Quiz).filter(Quiz.QuizId == grade.SourceId).first()
        title = source.Title if source else "Quiz"
    else:
        title = "Manual grade"
    return GradeResponse(
        gradeId=grade.GradeId,
        courseId=grade.CourseId,
        studentId=grade.StudentId,
        sourceType=grade.SourceType,
        sourceId=grade.SourceId,
        itemTitle=title,
        score=float(grade.Score),
        maxScore=float(grade.MaxScore),
        weightPercent=float(grade.WeightPercent) if grade.WeightPercent is not None else None,
        feedback=grade.Feedback,
        gradedBy=grade.GradedBy,
        gradedAt=grade.GradedAt,
        studentName=student.FullName if student else "Unknown",
        studentCode=student.StudentCode if student else None
    )


@router.get("/courses/{course_id}/gradebook", response_model=List[GradeResponse])
def get_course_gradebook(
    course_id: uuid.UUID,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get complete gradebook of a course (own Lecturer or Admin)."""
    grades = db.query(Grade).filter(Grade.CourseId == course_id).order_by(Grade.GradedAt.desc()).all()
    return [format_grade_response(g, db) for g in grades]


@router.get("/courses/{course_id}/my-grades", response_model=List[GradeResponse])
def get_my_course_grades(
    course_id: uuid.UUID,
    current_user: User = Depends(require_student),
    db: Session = Depends(get_db)
):
    """Get current student's personal grades in the course (BR-10, AC-07)."""
    # Verify enrollment
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.StudentId == current_user.UserId,
        Enrollment.Status == "ACTIVE"
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Student is not enrolled in this course"
        )

    grades = db.query(Grade).filter(
        Grade.CourseId == course_id,
        Grade.StudentId == current_user.UserId
    ).order_by(Grade.GradedAt.desc()).all()

    return [format_grade_response(g, db) for g in grades]


@router.post("/courses/{course_id}/grades/manual", response_model=GradeResponse, status_code=status.HTTP_201_CREATED)
def create_manual_grade(
    course_id: uuid.UUID,
    g_in: ManualGradeCreate,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a manual grade column/entry (own Lecturer or Admin)."""
    student = db.query(User).filter(User.UserId == g_in.studentId).first()
    if not student or student.Role != "STUDENT":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid student target")

    # Enforce student enrollment in this course
    enrollment = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.StudentId == g_in.studentId,
        Enrollment.Status == "ACTIVE"
    ).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Student is not actively enrolled in this course"
        )

    if g_in.score < 0 or g_in.score > g_in.maxScore:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Score must be between 0 and maxScore")

    now = datetime.now(timezone.utc)
    new_grade = Grade(
        GradeId=uuid.uuid4(),
        CourseId=course_id,
        StudentId=g_in.studentId,
        SourceType="MANUAL",
        SourceId=None,
        Score=g_in.score,
        MaxScore=g_in.maxScore,
        WeightPercent=g_in.weightPercent,
        Feedback=f"{g_in.itemTitle}: {g_in.feedback}" if g_in.feedback else g_in.itemTitle,
        GradedBy=current_user.UserId,
        GradedAt=now
    )
    db.add(new_grade)
    db.commit()
    db.refresh(new_grade)

    return format_grade_response(new_grade, db)



def calculate_student_weighted_matrix(
    student: User,
    enrollment: Enrollment,
    student_grades: List[Grade],
    w_quiz: float = 20.0,
    w_assign: float = 30.0,
    w_exam: float = 50.0
) -> StudentGradeMatrix:
    quiz_scores = []
    assign_scores = []
    exam_scores = []

    for g in student_grades:
        scale10 = (float(g.Score) / float(g.MaxScore or 10.0)) * 10.0
        if g.SourceType == "QUIZ":
            quiz_scores.append(scale10)
        elif g.SourceType == "ASSIGNMENT":
            assign_scores.append(scale10)
        elif g.SourceType == "MANUAL":
            exam_scores.append(scale10)

    avg_quiz = sum(quiz_scores) / len(quiz_scores) if quiz_scores else None
    avg_assign = sum(assign_scores) / len(assign_scores) if assign_scores else None
    avg_exam = sum(exam_scores) / len(exam_scores) if exam_scores else None

    # Weighted calculation
    active_weights = 0.0
    weighted_sum = 0.0

    if avg_quiz is not None:
        weighted_sum += avg_quiz * w_quiz
        active_weights += w_quiz
    if avg_assign is not None:
        weighted_sum += avg_assign * w_assign
        active_weights += w_assign
    if avg_exam is not None:
        weighted_sum += avg_exam * w_exam
        active_weights += w_exam

    if active_weights > 0:
        total10 = round(weighted_sum / active_weights, 2)
    elif enrollment.FinalScore is not None:
        total10 = round(float(enrollment.FinalScore), 2)
    else:
        total10 = 0.0

    # Letter grade & GPA 4.0
    if total10 >= 8.5:
        letter = "A"
        gpa = 4.0
    elif total10 >= 7.0:
        letter = "B"
        gpa = 3.0
    elif total10 >= 5.5:
        letter = "C"
        gpa = 2.0
    elif total10 >= 4.0:
        letter = "D"
        gpa = 1.0
    else:
        letter = "F"
        gpa = 0.0

    status_str = "PASSED" if total10 >= 4.0 and active_weights > 0 else ("FAILED" if active_weights > 0 else "IN_PROGRESS")

    return StudentGradeMatrix(
        studentId=student.UserId,
        studentName=student.FullName,
        studentCode=student.StudentCode,
        email=student.Email,
        quizScore=round(avg_quiz, 2) if avg_quiz is not None else None,
        assignmentScore=round(avg_assign, 2) if avg_assign is not None else None,
        examScore=round(avg_exam, 2) if avg_exam is not None else None,
        weightedTotal=total10,
        gpa4=gpa,
        letterGrade=letter,
        status=status_str,
        finalScoreRecorded=float(enrollment.FinalScore) if enrollment.FinalScore is not None else None
    )


@router.get("/courses/{course_id}/gradebook/matrix", response_model=GradeMatrixResponse)
def get_course_grade_matrix(
    course_id: uuid.UUID,
    quizzes_weight: float = 20.0,
    assignments_weight: float = 30.0,
    exam_weight: float = 50.0,
    course: Course = Depends(verify_course_access),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get dynamic weighted grade matrix for the course.
    - Students see only their personal row.
    - Lecturers & Admins see all enrolled students.
    """
    enrollments_query = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.Status == "ACTIVE"
    )
    if current_user.Role == "STUDENT":
        enrollments_query = enrollments_query.filter(Enrollment.StudentId == current_user.UserId)

    enrollments = enrollments_query.all()
    student_ids = [e.StudentId for e in enrollments]

    students = db.query(User).filter(User.UserId.in_(student_ids)).all() if student_ids else []
    student_map = {s.UserId: s for s in students}

    all_grades = db.query(Grade).filter(
        Grade.CourseId == course_id,
        Grade.StudentId.in_(student_ids)
    ).all() if student_ids else []

    grades_by_student = {}
    for g in all_grades:
        grades_by_student.setdefault(g.StudentId, []).append(g)

    matrix_rows = []
    for enr in enrollments:
        st = student_map.get(enr.StudentId)
        if not st:
            continue
        st_grades = grades_by_student.get(enr.StudentId, [])
        row = calculate_student_weighted_matrix(
            student=st,
            enrollment=enr,
            student_grades=st_grades,
            w_quiz=quizzes_weight,
            w_assign=assignments_weight,
            w_exam=exam_weight
        )
        matrix_rows.append(row)

    # Sort alphabetically by student name
    matrix_rows.sort(key=lambda r: r.studentName)

    return GradeMatrixResponse(
        courseId=course.CourseId,
        courseCode=course.CourseCode,
        courseTitle=course.Title,
        weights={
            "quizzes": quizzes_weight,
            "assignments": assignments_weight,
            "exam": exam_weight
        },
        students=matrix_rows
    )


@router.post("/courses/{course_id}/gradebook/finalize", response_model=MessageResponse)
def finalize_course_gradebook(
    course_id: uuid.UUID,
    quizzes_weight: float = 20.0,
    assignments_weight: float = 30.0,
    exam_weight: float = 50.0,
    course: Course = Depends(verify_lecturer_course_owner),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Finalize and record calculated weighted final scores to Enrollments.FinalScore.
    """
    enrollments = db.query(Enrollment).filter(
        Enrollment.CourseId == course_id,
        Enrollment.Status == "ACTIVE"
    ).all()
    if not enrollments:
        return MessageResponse(message="No enrolled students to finalize.")

    student_ids = [e.StudentId for e in enrollments]
    students = db.query(User).filter(User.UserId.in_(student_ids)).all()
    student_map = {s.UserId: s for s in students}

    all_grades = db.query(Grade).filter(
        Grade.CourseId == course_id,
        Grade.StudentId.in_(student_ids)
    ).all()

    grades_by_student = {}
    for g in all_grades:
        grades_by_student.setdefault(g.StudentId, []).append(g)

    updated_count = 0
    now = datetime.now(timezone.utc)

    for enr in enrollments:
        st = student_map.get(enr.StudentId)
        if not st:
            continue
        st_grades = grades_by_student.get(enr.StudentId, [])
        row = calculate_student_weighted_matrix(
            student=st,
            enrollment=enr,
            student_grades=st_grades,
            w_quiz=quizzes_weight,
            w_assign=assignments_weight,
            w_exam=exam_weight
        )
        enr.FinalScore = row.weightedTotal
        updated_count += 1

        # Send notification to student
        db.add(Notification(
            NotificationId=uuid.uuid4(),
            UserId=st.UserId,
            Title=f"Điểm tổng kết môn: {course.CourseCode}",
            Message=f"Giảng viên đã tổng kết điểm học phần {course.Title}. Điểm tổng kết: {row.weightedTotal}/10 (Hệ 4: {row.gpa4}, Điểm chữ: {row.letterGrade}).",
            Type="GRADE",
            RelatedUrl="/grades",
            CreatedAt=now,
            IsRead=False
        ))

    db.commit()
    return MessageResponse(message=f"Đã cập nhật và công bố điểm tổng kết cho {updated_count} sinh viên.")
