import uuid
from backend.app.api.routes.grades import calculate_student_weighted_matrix
from backend.app.models.models import User, Enrollment, Grade


def test_calculate_student_weighted_matrix():
    student_id = uuid.uuid4()
    student = User(
        UserId=student_id,
        FullName="Test Student",
        StudentCode="SV24001",
        Email="student@test.com",
        Role="STUDENT",
    )
    enrollment = Enrollment(
        EnrollmentId=uuid.uuid4(),
        CourseId=uuid.uuid4(),
        StudentId=student_id,
        FinalScore=None,
    )
    grades = [
        Grade(
            GradeId=uuid.uuid4(),
            StudentId=student_id,
            SourceType="QUIZ",
            Score=8.0,
            MaxScore=10.0,
        ),
        Grade(
            GradeId=uuid.uuid4(),
            StudentId=student_id,
            SourceType="ASSIGNMENT",
            Score=9.0,
            MaxScore=10.0,
        ),
        Grade(
            GradeId=uuid.uuid4(),
            StudentId=student_id,
            SourceType="MANUAL",
            Score=8.5,
            MaxScore=10.0,
        ),
    ]

    # Weights: Quiz 20%, Assignment 30%, Exam 50%
    # Expected: (8.0 * 20 + 9.0 * 30 + 8.5 * 50) / 100 = (160 + 270 + 425) / 100 = 855 / 100 = 8.55
    res = calculate_student_weighted_matrix(
        student=student,
        enrollment=enrollment,
        student_grades=grades,
        w_quiz=20.0,
        w_assign=30.0,
        w_exam=50.0,
    )

    assert res.studentId == student_id
    assert res.quizScore == 8.0
    assert res.assignmentScore == 9.0
    assert res.examScore == 8.5
    assert res.weightedTotal == 8.55
    assert res.letterGrade == "A"
    assert res.gpa4 == 4.0
    assert res.status == "PASSED"
