import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock
from backend.app.models.models import User, Course
from backend.app.api.routes.courses import format_course_response


def test_course_department_association():
    lec_id = uuid.uuid4()
    mock_lecturer = User(
        UserId=lec_id,
        Email="lec@university.edu.vn",
        FullName="TS. Nguyễn Văn A",
        PasswordHash="hash",
        Role="LECTURER",
        Department="Khoa Công nghệ Thông tin",
        IsChatEnabled=True,
        IsActive=True
    )

    mock_course = Course(
        CourseId=uuid.uuid4(),
        CourseCode="CS101-01",
        Title="Nhập môn lập trình",
        LecturerId=lec_id,
        Semester="HK1",
        AcademicYear="2026-2027",
        Credits=3,
        SubjectCode="CS101",
        SectionCode="L01",
        Status="ACTIVE",
        IsDeleted=False,
        CreatedAt=datetime.now(timezone.utc)
    )

    mock_db = MagicMock()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_lecturer

    resp = format_course_response(mock_course, mock_db)
    assert resp.lecturerDepartment == "Khoa Công nghệ Thông tin"
    assert resp.subjectCode == "CS101"
    assert resp.sectionCode == "L01"
    assert resp.lecturerName == "TS. Nguyễn Văn A"
    assert resp.isDeleted is False
