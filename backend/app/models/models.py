import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    TypeDecorator,
    Unicode,
    UnicodeText,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mssql import DATETIME2, UNIQUEIDENTIFIER
from sqlalchemy.orm import relationship

from backend.app.db.base import Base


def utcnow() -> datetime:
    """Return naive UTC datetime compatible with SQL Server DATETIME2(0)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class UtcDateTimeColumn(TypeDecorator):
    """Stores DATETIME2(0) in SQL Server and guarantees naive UTC Python datetime values."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "mssql":
            return dialect.type_descriptor(DATETIME2(0))
        return dialect.type_descriptor(DateTime())

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            raw = value.strip()
            if raw.endswith("Z"):
                raw = f"{raw[:-1]}+00:00"
            value = datetime.fromisoformat(raw)
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, str):
            raw = value.strip()
            if raw.endswith("Z"):
                raw = f"{raw[:-1]}+00:00"
            value = datetime.fromisoformat(raw)
        if isinstance(value, datetime) and value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value


class User(Base):
    __tablename__ = "Users"
    __table_args__ = (
        CheckConstraint("Role IN ('ADMIN', 'LECTURER', 'STUDENT')", name="CK_Users_Role"),
    )

    UserId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    Email = Column(Unicode(150), unique=True, nullable=False, index=True)
    FullName = Column(Unicode(150), nullable=False)
    PasswordHash = Column(Unicode(500), nullable=False)
    Role = Column(String(20), nullable=False)  # 'ADMIN', 'LECTURER', 'STUDENT'
    IsActive = Column(Boolean, nullable=False, default=True, server_default=text("1"))
    StudentCode = Column(String(30), nullable=True)
    StaffCode = Column(String(30), nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    taught_courses = relationship("Course", back_populates="lecturer", foreign_keys="Course.LecturerId")
    enrollments = relationship("Enrollment", back_populates="student", foreign_keys="Enrollment.StudentId")
    submissions = relationship("Submission", back_populates="student", foreign_keys="Submission.StudentId")
    quiz_attempts = relationship("QuizAttempt", back_populates="student", foreign_keys="QuizAttempt.StudentId")
    grades = relationship("Grade", back_populates="student", foreign_keys="Grade.StudentId")
    notifications = relationship("Notification", back_populates="user", foreign_keys="Notification.UserId")
    stored_files = relationship("StoredFile", back_populates="owner", foreign_keys="StoredFile.OwnerId")
    lesson_progress = relationship("LessonProgress", back_populates="student", foreign_keys="LessonProgress.StudentId")


class Course(Base):
    __tablename__ = "Courses"
    __table_args__ = (
        CheckConstraint("Credits BETWEEN 1 AND 10", name="CK_Courses_Credits"),
        CheckConstraint("Status IN ('DRAFT', 'ACTIVE', 'ARCHIVED')", name="CK_Courses_Status"),
        CheckConstraint("MaxStudents IS NULL OR MaxStudents > 0", name="CK_Courses_MaxStudents"),
        Index(
            "UQ_Courses_JoinCode",
            "JoinCode",
            unique=True,
            mssql_where=text("JoinCode IS NOT NULL"),
        ),
    )

    CourseId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseCode = Column(String(30), unique=True, nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    Description = Column(Unicode(1000), nullable=True)
    LecturerId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    Semester = Column(String(20), nullable=False)
    AcademicYear = Column(String(20), nullable=False)
    Credits = Column(SmallInteger, nullable=False)
    Status = Column(String(20), nullable=False, default="ACTIVE", server_default=text("'ACTIVE'"))
    JoinCode = Column(String(20), nullable=True)
    AllowSelfEnroll = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    MaxStudents = Column(Integer, nullable=True)
    Category = Column(Unicode(100), nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    lecturer = relationship("User", back_populates="taught_courses", foreign_keys=[LecturerId])
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    modules = relationship("Module", back_populates="course", cascade="all, delete-orphan", order_by="Module.SortOrder")
    assignments = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="course", cascade="all, delete-orphan")
    grades = relationship("Grade", back_populates="course", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "Enrollments"
    __table_args__ = (
        UniqueConstraint("CourseId", "StudentId", name="UQ_Enrollments_Course_Student"),
        CheckConstraint("Status IN ('ACTIVE', 'COMPLETED', 'DROPPED')", name="CK_Enrollments_Status"),
        CheckConstraint("FinalScore IS NULL OR (FinalScore >= 0 AND FinalScore <= 100)", name="CK_Enrollments_FinalScore"),
    )

    EnrollmentId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    EnrolledAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    Status = Column(String(20), nullable=False, default="ACTIVE", server_default=text("'ACTIVE'"))
    FinalScore = Column(Numeric(5, 2, asdecimal=False), nullable=True)

    # Relationships
    course = relationship("Course", back_populates="enrollments")
    student = relationship("User", back_populates="enrollments")


class Module(Base):
    __tablename__ = "Modules"
    __table_args__ = (
        CheckConstraint("SortOrder >= 0", name="CK_Modules_SortOrder"),
    )

    ModuleId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    SortOrder = Column(Integer, nullable=False)
    Description = Column(Unicode(1000), nullable=True)
    IsPublished = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", back_populates="modules")
    lessons = relationship("Lesson", back_populates="module", cascade="all, delete-orphan", order_by="Lesson.SortOrder")


class Lesson(Base):
    __tablename__ = "Lessons"
    __table_args__ = (
        CheckConstraint("SortOrder >= 0", name="CK_Lessons_SortOrder"),
        CheckConstraint("EstimatedMinutes IS NULL OR EstimatedMinutes >= 0", name="CK_Lessons_EstimatedMinutes"),
        CheckConstraint("ContentType IN ('TEXT', 'PDF', 'VIDEO', 'SLIDE')", name="CK_Lessons_ContentType"),
    )

    LessonId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    ModuleId = Column(UNIQUEIDENTIFIER, ForeignKey("Modules.ModuleId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    ContentHtml = Column(UnicodeText, nullable=True)
    MaterialUrl = Column(Unicode(500), nullable=True)
    ContentType = Column(String(20), nullable=False, default="TEXT", server_default=text("'TEXT'"))
    AttachmentFileId = Column(UNIQUEIDENTIFIER, ForeignKey("StoredFiles.FileId"), nullable=True)
    SortOrder = Column(Integer, nullable=False)
    IsPublished = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    EstimatedMinutes = Column(Integer, nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    module = relationship("Module", back_populates="lessons")
    attachment_file = relationship("StoredFile", foreign_keys=[AttachmentFileId])
    progress_entries = relationship("LessonProgress", back_populates="lesson", cascade="all, delete-orphan")


class Assignment(Base):
    __tablename__ = "Assignments"
    __table_args__ = (
        CheckConstraint("MaxScore > 0", name="CK_Assignments_MaxScore"),
        CheckConstraint("Status IN ('DRAFT', 'PUBLISHED', 'CLOSED')", name="CK_Assignments_Status"),
        CheckConstraint("WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)", name="CK_Assignments_WeightPercent"),
    )

    AssignmentId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    Description = Column(UnicodeText, nullable=True)
    DueAt = Column(UtcDateTimeColumn, nullable=False)
    MaxScore = Column(Numeric(6, 2, asdecimal=False), nullable=False)
    AllowLate = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    AttachmentUrl = Column(Unicode(500), nullable=True)
    AttachmentFileId = Column(UNIQUEIDENTIFIER, ForeignKey("StoredFiles.FileId"), nullable=True)
    WeightPercent = Column(Numeric(5, 2, asdecimal=False), nullable=True)
    RubricJson = Column(UnicodeText, nullable=True)
    Status = Column(String(20), nullable=False, default="DRAFT", server_default=text("'DRAFT'"))
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")
    attachment_file = relationship("StoredFile", foreign_keys=[AttachmentFileId])


class Submission(Base):
    __tablename__ = "Submissions"
    __table_args__ = (
        UniqueConstraint("AssignmentId", "StudentId", name="UQ_Submissions_Assignment_Student"),
        CheckConstraint("Status IN ('SUBMITTED', 'LATE', 'GRADED')", name="CK_Submissions_Status"),
        CheckConstraint("Score IS NULL OR Score >= 0", name="CK_Submissions_Score"),
    )

    SubmissionId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    AssignmentId = Column(UNIQUEIDENTIFIER, ForeignKey("Assignments.AssignmentId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    SubmittedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    ContentText = Column(UnicodeText, nullable=True)
    FileUrl = Column(Unicode(500), nullable=True)
    FileId = Column(UNIQUEIDENTIFIER, ForeignKey("StoredFiles.FileId"), nullable=True)
    RubricScoresJson = Column(UnicodeText, nullable=True)
    Status = Column(String(20), nullable=False, default="SUBMITTED", server_default=text("'SUBMITTED'"))
    Score = Column(Numeric(6, 2, asdecimal=False), nullable=True)
    Feedback = Column(Unicode(2000), nullable=True)
    UpdatedAt = Column(UtcDateTimeColumn, nullable=True)

    # Relationships
    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("User", back_populates="submissions")
    file = relationship("StoredFile", foreign_keys=[FileId])


class Quiz(Base):
    __tablename__ = "Quizzes"
    __table_args__ = (
        CheckConstraint("EndAt > StartAt", name="CK_Quizzes_TimeWindow"),
        CheckConstraint("TimeLimitMinutes BETWEEN 1 AND 300", name="CK_Quizzes_TimeLimit"),
        CheckConstraint("MaxAttempts BETWEEN 1 AND 10", name="CK_Quizzes_MaxAttempts"),
        CheckConstraint("PassingScore >= 0", name="CK_Quizzes_PassingScore"),
        CheckConstraint("WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)", name="CK_Quizzes_WeightPercent"),
        CheckConstraint("ScoreVisibility IN ('SCORE_ONLY', 'AFTER_ATTEMPT', 'AFTER_CLOSE')", name="CK_Quizzes_ScoreVisibility"),
    )

    QuizId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    Description = Column(Unicode(1000), nullable=True)
    StartAt = Column(UtcDateTimeColumn, nullable=False)
    EndAt = Column(UtcDateTimeColumn, nullable=False)
    TimeLimitMinutes = Column(Integer, nullable=False)
    MaxAttempts = Column(Integer, nullable=False, default=1, server_default=text("1"))
    PassingScore = Column(Numeric(6, 2, asdecimal=False), nullable=False, default=5.0, server_default=text("5.0"))
    WeightPercent = Column(Numeric(5, 2, asdecimal=False), nullable=True)
    ScoreVisibility = Column(String(30), nullable=False, default="AFTER_CLOSE", server_default=text("'AFTER_CLOSE'"))
    IsPublished = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan", order_by="QuizQuestion.SortOrder")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")


class QuizQuestion(Base):
    __tablename__ = "QuizQuestions"
    __table_args__ = (
        CheckConstraint("QuestionType IN ('SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT')", name="CK_QuizQuestions_Type"),
        CheckConstraint("Score > 0", name="CK_QuizQuestions_Score"),
        CheckConstraint("SortOrder >= 0", name="CK_QuizQuestions_SortOrder"),
    )

    QuestionId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    QuizId = Column(UNIQUEIDENTIFIER, ForeignKey("Quizzes.QuizId"), nullable=False, index=True)
    QuestionText = Column(Unicode(1000), nullable=False)
    QuestionType = Column(String(20), nullable=False)  # 'SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'
    OptionsJson = Column(UnicodeText, nullable=True)
    CorrectAnswer = Column(Unicode(500), nullable=False)
    Score = Column(Numeric(6, 2, asdecimal=False), nullable=False, default=1.0, server_default=text("1.0"))
    SortOrder = Column(Integer, nullable=False)

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "QuizAttempts"
    __table_args__ = (
        UniqueConstraint("QuizId", "StudentId", "AttemptNo", name="UQ_QuizAttempts_Quiz_Student_No"),
        CheckConstraint("AttemptNo >= 1", name="CK_QuizAttempts_AttemptNo"),
        CheckConstraint("Score IS NULL OR Score >= 0", name="CK_QuizAttempts_Score"),
        CheckConstraint("Status IN ('IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'PENDING_REVIEW')", name="CK_QuizAttempts_Status"),
    )

    AttemptId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    QuizId = Column(UNIQUEIDENTIFIER, ForeignKey("Quizzes.QuizId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    StartedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    SubmittedAt = Column(UtcDateTimeColumn, nullable=True)
    AttemptNo = Column(Integer, nullable=False)
    AnswersJson = Column(UnicodeText, nullable=True)
    QuestionResultsJson = Column(UnicodeText, nullable=True)
    Score = Column(Numeric(6, 2, asdecimal=False), nullable=True)
    Status = Column(String(20), nullable=False, default="IN_PROGRESS", server_default=text("'IN_PROGRESS'"))

    # Relationships
    quiz = relationship("Quiz", back_populates="attempts")
    student = relationship("User", back_populates="quiz_attempts")


class Grade(Base):
    __tablename__ = "Grades"
    __table_args__ = (
        Index(
            "UQ_Grades_Source_Learner",
            "CourseId",
            "StudentId",
            "SourceType",
            "SourceId",
            unique=True,
            mssql_where=text("SourceId IS NOT NULL"),
        ),
        Index("IX_Grades_Course_Student", "CourseId", "StudentId"),
        CheckConstraint("SourceType IN ('ASSIGNMENT', 'QUIZ', 'MIDTERM', 'FINAL', 'MANUAL')", name="CK_Grades_SourceType"),
        CheckConstraint("Score >= 0 AND MaxScore > 0 AND Score <= MaxScore", name="CK_Grades_ScoreRange"),
        CheckConstraint("WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)", name="CK_Grades_WeightPercent"),
    )

    GradeId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False)
    SourceType = Column(String(20), nullable=False)  # 'ASSIGNMENT', 'QUIZ', 'MIDTERM', 'FINAL', 'MANUAL'
    SourceId = Column(UNIQUEIDENTIFIER, nullable=True)
    ItemTitle = Column(Unicode(200), nullable=True)
    Score = Column(Numeric(6, 2, asdecimal=False), nullable=False)
    MaxScore = Column(Numeric(6, 2, asdecimal=False), nullable=False)
    WeightPercent = Column(Numeric(5, 2, asdecimal=False), nullable=True)
    Feedback = Column(Unicode(2000), nullable=True)
    GradedBy = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False)
    GradedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", back_populates="grades")
    student = relationship("User", back_populates="grades", foreign_keys=[StudentId])
    grader = relationship("User", foreign_keys=[GradedBy])


class Notification(Base):
    __tablename__ = "Notifications"
    __table_args__ = (
        Index("IX_Notifications_User_Read", "UserId", "IsRead", "CreatedAt"),
        CheckConstraint("Type IN ('GENERAL', 'ASSIGNMENT', 'QUIZ', 'GRADE', 'COURSE')", name="CK_Notifications_Type"),
    )

    NotificationId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    UserId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    Message = Column(Unicode(1000), nullable=False)
    Type = Column(String(30), nullable=False, default="GENERAL", server_default=text("'GENERAL'"))
    IsRead = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    RelatedUrl = Column(Unicode(500), nullable=True)

    # Relationships
    user = relationship("User", back_populates="notifications")


class Meeting(Base):
    __tablename__ = "Meetings"
    __table_args__ = (
        CheckConstraint("Status IN ('SCHEDULED', 'LIVE', 'ENDED')", name="CK_Meetings_Status"),
    )

    MeetingId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    HostId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    Title = Column(Unicode(200), nullable=False)
    RoomCode = Column(String(100), nullable=False, index=True)
    Status = Column(String(20), nullable=False, default="LIVE", server_default=text("'LIVE'"))
    StartedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    EndedAt = Column(UtcDateTimeColumn, nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", backref="meetings")
    host = relationship("User", foreign_keys=[HostId])
    logs = relationship("MeetingLog", back_populates="meeting", cascade="all, delete-orphan")


class MeetingLog(Base):
    __tablename__ = "MeetingLogs"
    __table_args__ = (
        CheckConstraint("DurationSeconds >= 0 AND ChatCount >= 0 AND HandRaisesCount >= 0", name="CK_MeetingLogs_NonNegative"),
    )

    LogId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    MeetingId = Column(UNIQUEIDENTIFIER, ForeignKey("Meetings.MeetingId"), nullable=False, index=True)
    UserId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    JoinedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    LeftAt = Column(UtcDateTimeColumn, nullable=True)
    DurationSeconds = Column(Integer, nullable=False, default=0, server_default=text("0"))
    ChatCount = Column(Integer, nullable=False, default=0, server_default=text("0"))
    HandRaisesCount = Column(Integer, nullable=False, default=0, server_default=text("0"))
    ActivitySummary = Column(Unicode(500), nullable=True)

    # Relationships
    meeting = relationship("Meeting", back_populates="logs")
    user = relationship("User", foreign_keys=[UserId])


class CourseMessage(Base):
    __tablename__ = "CourseMessages"
    __table_args__ = (
        CheckConstraint("MessageType IN ('TEXT', 'SYSTEM', 'FILE')", name="CK_CourseMessages_MessageType"),
    )

    MessageId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    MeetingId = Column(UNIQUEIDENTIFIER, ForeignKey("Meetings.MeetingId"), nullable=True, index=True)
    SenderId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    MessageType = Column(String(20), nullable=False, default="TEXT", server_default=text("'TEXT'"))
    Content = Column(UnicodeText, nullable=False)
    AttachmentUrl = Column(Unicode(500), nullable=True)
    AttachmentFileId = Column(UNIQUEIDENTIFIER, ForeignKey("StoredFiles.FileId"), nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", backref="messages")
    meeting = relationship("Meeting", foreign_keys=[MeetingId])
    sender = relationship("User", foreign_keys=[SenderId])
    attachment_file = relationship("StoredFile", foreign_keys=[AttachmentFileId])


class StoredFile(Base):
    __tablename__ = "StoredFiles"
    __table_args__ = (
        CheckConstraint("Scope IN ('LESSON', 'ASSIGNMENT', 'SUBMISSION', 'CHAT', 'SEED')", name="CK_StoredFiles_Scope"),
        CheckConstraint("SizeBytes > 0", name="CK_StoredFiles_SizeBytes"),
    )

    FileId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    OwnerId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=True, index=True)
    Scope = Column(String(30), nullable=False)  # 'LESSON', 'ASSIGNMENT', 'SUBMISSION', 'CHAT', 'SEED'
    OriginalName = Column(Unicode(255), nullable=False)
    StoredPath = Column(Unicode(500), nullable=False)
    MimeType = Column(String(120), nullable=False)
    SizeBytes = Column(BigInteger, nullable=False)
    Sha256 = Column(String(64), nullable=False)
    ExtractedText = Column(UnicodeText, nullable=True)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    owner = relationship("User", back_populates="stored_files", foreign_keys=[OwnerId])
    course = relationship("Course", foreign_keys=[CourseId])


class WhiteboardSnapshot(Base):
    __tablename__ = "WhiteboardSnapshots"

    SnapshotId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    MeetingId = Column(UNIQUEIDENTIFIER, ForeignKey("Meetings.MeetingId"), nullable=True, index=True)
    StrokesJson = Column(UnicodeText, nullable=False, default="[]", server_default=text("'[]'"))
    UpdatedBy = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False)
    UpdatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    course = relationship("Course", foreign_keys=[CourseId])
    meeting = relationship("Meeting", foreign_keys=[MeetingId])
    updater = relationship("User", foreign_keys=[UpdatedBy])


class LessonProgress(Base):
    __tablename__ = "LessonProgress"
    __table_args__ = (
        UniqueConstraint("LessonId", "StudentId", name="UQ_LessonProgress_Lesson_Student"),
        CheckConstraint("TimeSpentSeconds >= 0", name="CK_LessonProgress_TimeSpent"),
    )

    ProgressId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    LessonId = Column(UNIQUEIDENTIFIER, ForeignKey("Lessons.LessonId"), nullable=False, index=True)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    IsCompleted = Column(Boolean, nullable=False, default=False, server_default=text("0"))
    CompletedAt = Column(UtcDateTimeColumn, nullable=True)
    LastViewedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))
    TimeSpentSeconds = Column(Integer, nullable=False, default=0, server_default=text("0"))

    # Relationships
    lesson = relationship("Lesson", back_populates="progress_entries")
    student = relationship("User", back_populates="lesson_progress", foreign_keys=[StudentId])


class AiInteractionLog(Base):
    __tablename__ = "AiInteractionLogs"
    __table_args__ = (
        CheckConstraint("Feature IN ('LESSON_TUTOR', 'QUIZ_GENERATOR', 'GRADING_FEEDBACK')", name="CK_AiInteractionLogs_Feature"),
        CheckConstraint("ProviderMode IN ('GEMINI', 'LOCAL_FALLBACK')", name="CK_AiInteractionLogs_Provider"),
    )

    LogId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    UserId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=True, index=True)
    Feature = Column(String(40), nullable=False)
    ProviderMode = Column(String(30), nullable=False)
    PromptSummary = Column(Unicode(500), nullable=False)
    CreatedAt = Column(UtcDateTimeColumn, nullable=False, default=utcnow, server_default=text("SYSUTCDATETIME()"))

    # Relationships
    user = relationship("User", foreign_keys=[UserId])
    course = relationship("Course", foreign_keys=[CourseId])
