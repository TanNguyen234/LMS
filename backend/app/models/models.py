import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Boolean, Integer, Float, DateTime,
    ForeignKey, Text, SmallInteger
)
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from sqlalchemy.orm import relationship
from backend.app.db.base import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "Users"

    UserId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    Email = Column(String(150), unique=True, nullable=False, index=True)
    FullName = Column(String(150), nullable=False)
    PasswordHash = Column(String(500), nullable=False)
    Role = Column(String(20), nullable=False)  # 'ADMIN', 'LECTURER', 'STUDENT'
    IsActive = Column(Boolean, nullable=False, default=True)
    StudentCode = Column(String(30), nullable=True)
    StaffCode = Column(String(30), nullable=True)
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    taught_courses = relationship("Course", back_populates="lecturer", foreign_keys="Course.LecturerId")
    enrollments = relationship("Enrollment", back_populates="student", foreign_keys="Enrollment.StudentId")
    submissions = relationship("Submission", back_populates="student", foreign_keys="Submission.StudentId")
    quiz_attempts = relationship("QuizAttempt", back_populates="student", foreign_keys="QuizAttempt.StudentId")
    grades = relationship("Grade", back_populates="student", foreign_keys="Grade.StudentId")
    notifications = relationship("Notification", back_populates="user", foreign_keys="Notification.UserId")


class Course(Base):
    __tablename__ = "Courses"

    CourseId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseCode = Column(String(30), unique=True, nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    Description = Column(String(1000), nullable=True)
    LecturerId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    Semester = Column(String(20), nullable=False)
    AcademicYear = Column(String(20), nullable=False)
    Credits = Column(SmallInteger, nullable=False)
    Status = Column(String(20), nullable=False, default="ACTIVE")  # 'DRAFT', 'ACTIVE', 'ARCHIVED'
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    lecturer = relationship("User", back_populates="taught_courses", foreign_keys=[LecturerId])
    enrollments = relationship("Enrollment", back_populates="course", cascade="all, delete-orphan")
    modules = relationship("Module", back_populates="course", cascade="all, delete-orphan", order_by="Module.SortOrder")
    assignments = relationship("Assignment", back_populates="course", cascade="all, delete-orphan")
    quizzes = relationship("Quiz", back_populates="course", cascade="all, delete-orphan")
    grades = relationship("Grade", back_populates="course", cascade="all, delete-orphan")


class Enrollment(Base):
    __tablename__ = "Enrollments"

    EnrollmentId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    EnrolledAt = Column(DateTime, nullable=False, default=utcnow)
    Status = Column(String(20), nullable=False, default="ACTIVE")  # 'ACTIVE', 'COMPLETED', 'DROPPED'
    FinalScore = Column(Float, nullable=True)

    # Relationships
    course = relationship("Course", back_populates="enrollments")
    student = relationship("User", back_populates="enrollments")


class Module(Base):
    __tablename__ = "Modules"

    ModuleId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    SortOrder = Column(Integer, nullable=False)
    Description = Column(String(1000), nullable=True)
    IsPublished = Column(Boolean, nullable=False, default=False)
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    course = relationship("Course", back_populates="modules")
    lessons = relationship("Lesson", back_populates="module", cascade="all, delete-orphan", order_by="Lesson.SortOrder")


class Lesson(Base):
    __tablename__ = "Lessons"

    LessonId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    ModuleId = Column(UNIQUEIDENTIFIER, ForeignKey("Modules.ModuleId"), nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    ContentHtml = Column(Text, nullable=True)
    MaterialUrl = Column(String(500), nullable=True)
    SortOrder = Column(Integer, nullable=False)
    IsPublished = Column(Boolean, nullable=False, default=False)
    EstimatedMinutes = Column(Integer, nullable=True)
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    module = relationship("Module", back_populates="lessons")


class Assignment(Base):
    __tablename__ = "Assignments"

    AssignmentId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    Description = Column(Text, nullable=True)
    DueAt = Column(DateTime, nullable=False)
    MaxScore = Column(Float, nullable=False)
    AllowLate = Column(Boolean, nullable=False, default=False)
    AttachmentUrl = Column(String(500), nullable=True)
    Status = Column(String(20), nullable=False, default="DRAFT")  # 'DRAFT', 'PUBLISHED', 'CLOSED'
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    course = relationship("Course", back_populates="assignments")
    submissions = relationship("Submission", back_populates="assignment", cascade="all, delete-orphan")


class Submission(Base):
    __tablename__ = "Submissions"

    SubmissionId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    AssignmentId = Column(UNIQUEIDENTIFIER, ForeignKey("Assignments.AssignmentId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    SubmittedAt = Column(DateTime, nullable=False, default=utcnow)
    ContentText = Column(Text, nullable=True)
    FileUrl = Column(String(500), nullable=True)
    Status = Column(String(20), nullable=False, default="SUBMITTED")  # 'SUBMITTED', 'LATE', 'GRADED'
    Score = Column(Float, nullable=True)
    Feedback = Column(String(2000), nullable=True)
    UpdatedAt = Column(DateTime, nullable=True)

    # Relationships
    assignment = relationship("Assignment", back_populates="submissions")
    student = relationship("User", back_populates="submissions")


class Quiz(Base):
    __tablename__ = "Quizzes"

    QuizId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    Description = Column(String(1000), nullable=True)
    StartAt = Column(DateTime, nullable=False)
    EndAt = Column(DateTime, nullable=False)
    TimeLimitMinutes = Column(Integer, nullable=False)
    MaxAttempts = Column(Integer, nullable=False, default=1)
    PassingScore = Column(Float, nullable=False, default=5.0)
    IsPublished = Column(Boolean, nullable=False, default=False)
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    course = relationship("Course", back_populates="quizzes")
    questions = relationship("QuizQuestion", back_populates="quiz", cascade="all, delete-orphan", order_by="QuizQuestion.SortOrder")
    attempts = relationship("QuizAttempt", back_populates="quiz", cascade="all, delete-orphan")


class QuizQuestion(Base):
    __tablename__ = "QuizQuestions"

    QuestionId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    QuizId = Column(UNIQUEIDENTIFIER, ForeignKey("Quizzes.QuizId"), nullable=False, index=True)
    QuestionText = Column(String(1000), nullable=False)
    QuestionType = Column(String(20), nullable=False)  # 'SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'
    OptionsJson = Column(Text, nullable=True)  # JSON array: [{"key": "A", "text": "Option text"}, ...]
    CorrectAnswer = Column(String(500), nullable=False)
    Score = Column(Float, nullable=False, default=1.0)
    SortOrder = Column(Integer, nullable=False)

    # Relationships
    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "QuizAttempts"

    AttemptId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    QuizId = Column(UNIQUEIDENTIFIER, ForeignKey("Quizzes.QuizId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    StartedAt = Column(DateTime, nullable=False, default=utcnow)
    SubmittedAt = Column(DateTime, nullable=True)
    AttemptNo = Column(Integer, nullable=False)
    AnswersJson = Column(Text, nullable=True)  # JSON map: {"questionId": "A"}
    Score = Column(Float, nullable=True)
    Status = Column(String(20), nullable=False, default="IN_PROGRESS")  # 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED'

    # Relationships
    quiz = relationship("Quiz", back_populates="attempts")
    student = relationship("User", back_populates="quiz_attempts")


class Grade(Base):
    __tablename__ = "Grades"

    GradeId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    CourseId = Column(UNIQUEIDENTIFIER, ForeignKey("Courses.CourseId"), nullable=False)
    StudentId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False)
    SourceType = Column(String(20), nullable=False)  # 'ASSIGNMENT', 'QUIZ', 'MANUAL'
    SourceId = Column(UNIQUEIDENTIFIER, nullable=True)
    Score = Column(Float, nullable=False)
    MaxScore = Column(Float, nullable=False)
    WeightPercent = Column(Float, nullable=True)
    Feedback = Column(String(2000), nullable=True)
    GradedBy = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False)
    GradedAt = Column(DateTime, nullable=False, default=utcnow)

    # Relationships
    course = relationship("Course", back_populates="grades")
    student = relationship("User", back_populates="grades", foreign_keys=[StudentId])
    grader = relationship("User", foreign_keys=[GradedBy])


class Notification(Base):
    __tablename__ = "Notifications"

    NotificationId = Column(UNIQUEIDENTIFIER, primary_key=True, default=uuid.uuid4)
    UserId = Column(UNIQUEIDENTIFIER, ForeignKey("Users.UserId"), nullable=False, index=True)
    Title = Column(String(200), nullable=False)
    Message = Column(String(1000), nullable=False)
    Type = Column(String(30), nullable=False, default="GENERAL")  # 'GENERAL', 'ASSIGNMENT', 'QUIZ', 'GRADE', 'COURSE'
    IsRead = Column(Boolean, nullable=False, default=False)
    CreatedAt = Column(DateTime, nullable=False, default=utcnow)
    RelatedUrl = Column(String(500), nullable=True)

    # Relationships
    user = relationship("User", back_populates="notifications")
