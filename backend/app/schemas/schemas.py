import uuid
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from backend.app.core.security import validate_password_bytes
from backend.app.schemas.common import UtcDateTime, as_utc_datetime


def _strip_optional_upper(value: Optional[str]) -> Optional[str]:
    if isinstance(value, str):
        return value.strip().upper()
    return value


def _strip_required_text(value: str, field_label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_label} must not be empty")
    return cleaned


def _strip_optional_text(value: Optional[str], field_label: str) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        raise ValueError(f"{field_label} must not be empty")
    return cleaned


# ==========================================
# AUTH & USER SCHEMAS
# ==========================================


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=150)
    password: str = Field(..., min_length=1)

    @field_validator("email")
    @classmethod
    def strip_login_identifier(cls, value: str) -> str:
        return _strip_required_text(value, "Email or code")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserBase(BaseModel):
    email: EmailStr
    fullName: str = Field(..., min_length=1, max_length=150)
    role: Literal["ADMIN", "LECTURER", "STUDENT"]
    isActive: bool = True
    studentCode: Optional[str] = Field(default=None, max_length=30)
    staffCode: Optional[str] = Field(default=None, max_length=30)

    @field_validator("fullName")
    @classmethod
    def strip_full_name(cls, value: str) -> str:
        return _strip_required_text(value, "Full name")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_role(cls, value: str) -> str:
        return _strip_optional_upper(value) or value


class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def check_password_bytes(cls, value: str) -> str:
        return validate_password_bytes(value)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    fullName: Optional[str] = Field(default=None, min_length=1, max_length=150)
    role: Optional[Literal["ADMIN", "LECTURER", "STUDENT"]] = None
    isActive: Optional[bool] = None
    studentCode: Optional[str] = Field(default=None, max_length=30)
    staffCode: Optional[str] = Field(default=None, max_length=30)
    password: Optional[str] = None

    @field_validator("fullName")
    @classmethod
    def strip_optional_full_name(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Full name")

    @field_validator("role", mode="before")
    @classmethod
    def normalize_optional_role(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)

    @field_validator("password")
    @classmethod
    def check_optional_password_bytes(cls, value: Optional[str]) -> Optional[str]:
        if value is None or value == "":
            return None
        return validate_password_bytes(value)


class UserStatusUpdate(BaseModel):
    isActive: bool


class ProfileUpdateRequest(BaseModel):
    fullName: str = Field(..., min_length=1, max_length=150)

    @field_validator("fullName")
    @classmethod
    def strip_profile_name(cls, value: str) -> str:
        return _strip_required_text(value, "Full name")


class ChangePasswordRequest(BaseModel):
    currentPassword: str = Field(..., min_length=1)
    newPassword: str

    @field_validator("newPassword")
    @classmethod
    def check_new_password_bytes(cls, value: str) -> str:
        return validate_password_bytes(value)


class UserResponse(UserBase):
    userId: uuid.UUID
    createdAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# COURSE & ENROLLMENT SCHEMAS
# ==========================================


class CourseBase(BaseModel):
    courseCode: str = Field(..., min_length=1, max_length=30)
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    lecturerId: uuid.UUID
    semester: str = Field(..., min_length=1, max_length=20)
    academicYear: str = Field(..., min_length=1, max_length=20)
    credits: int = Field(..., ge=1, le=10)
    status: Literal["DRAFT", "ACTIVE", "ARCHIVED"] = "ACTIVE"
    joinCode: Optional[str] = Field(default=None, max_length=20)
    allowSelfEnroll: bool = False
    maxStudents: Optional[int] = Field(default=None, ge=1)
    category: Optional[str] = Field(default=None, max_length=100)

    @field_validator("courseCode", "title", "semester", "academicYear")
    @classmethod
    def strip_required_course_fields(cls, value: str) -> str:
        return _strip_required_text(value, "Course field")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_course_status(cls, value: str) -> str:
        return _strip_optional_upper(value) or value

    @field_validator("joinCode")
    @classmethod
    def normalize_join_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    lecturerId: Optional[uuid.UUID] = None
    semester: Optional[str] = Field(default=None, min_length=1, max_length=20)
    academicYear: Optional[str] = Field(default=None, min_length=1, max_length=20)
    credits: Optional[int] = Field(default=None, ge=1, le=10)
    status: Optional[Literal["DRAFT", "ACTIVE", "ARCHIVED"]] = None
    joinCode: Optional[str] = Field(default=None, max_length=20)
    allowSelfEnroll: Optional[bool] = None
    maxStudents: Optional[int] = Field(default=None, ge=1)
    category: Optional[str] = Field(default=None, max_length=100)

    @field_validator("title", "semester", "academicYear")
    @classmethod
    def strip_optional_course_fields(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Course field")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_optional_course_status(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)

    @field_validator("joinCode")
    @classmethod
    def normalize_optional_join_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None


class CourseStatusUpdate(BaseModel):
    status: Literal["DRAFT", "ACTIVE", "ARCHIVED"]

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return _strip_optional_upper(value) or value


class CourseResponse(CourseBase):
    courseId: uuid.UUID
    createdAt: UtcDateTime
    lecturerName: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CourseCatalogItemResponse(CourseResponse):
    enrolledCount: int = 0
    isEnrolled: bool = False
    enrollmentStatus: Optional[str] = None


class JoinByCodeRequest(BaseModel):
    joinCode: str = Field(..., min_length=1, max_length=20)

    @field_validator("joinCode")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return _strip_required_text(value, "Join code").upper()


class EnrollmentSettingsUpdate(BaseModel):
    allowSelfEnroll: bool
    joinCode: Optional[str] = Field(default=None, max_length=20)
    maxStudents: Optional[int] = Field(default=None, ge=1)

    @field_validator("joinCode")
    @classmethod
    def normalize_settings_join_code(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        cleaned = value.strip().upper()
        return cleaned or None


class EnrollmentCreate(BaseModel):
    studentId: uuid.UUID


class EnrollmentResponse(BaseModel):
    enrollmentId: uuid.UUID
    courseId: uuid.UUID
    studentId: uuid.UUID
    enrolledAt: UtcDateTime
    status: str
    finalScore: Optional[float] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None
    studentEmail: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# MODULES, LESSONS & PROGRESS SCHEMAS
# ==========================================


class LessonBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    contentHtml: Optional[str] = None
    materialUrl: Optional[str] = Field(default=None, max_length=500)
    contentType: Literal["TEXT", "PDF", "VIDEO", "SLIDE"] = "TEXT"
    attachmentFileId: Optional[uuid.UUID] = None
    sortOrder: int = Field(default=1, ge=0)
    isPublished: bool = False
    estimatedMinutes: Optional[int] = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def strip_lesson_title(cls, value: str) -> str:
        return _strip_required_text(value, "Lesson title")

    @field_validator("contentType", mode="before")
    @classmethod
    def normalize_content_type(cls, value: str) -> str:
        return _strip_optional_upper(value) or value


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    contentHtml: Optional[str] = None
    materialUrl: Optional[str] = Field(default=None, max_length=500)
    contentType: Optional[Literal["TEXT", "PDF", "VIDEO", "SLIDE"]] = None
    attachmentFileId: Optional[uuid.UUID] = None
    sortOrder: Optional[int] = Field(default=None, ge=0)
    isPublished: Optional[bool] = None
    estimatedMinutes: Optional[int] = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def strip_optional_lesson_title(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Lesson title")

    @field_validator("contentType", mode="before")
    @classmethod
    def normalize_optional_content_type(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)


class LessonPublish(BaseModel):
    isPublished: bool


class LessonResponse(LessonBase):
    lessonId: uuid.UUID
    moduleId: uuid.UUID
    createdAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


class ModuleBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    sortOrder: int = Field(default=1, ge=0)
    description: Optional[str] = Field(default=None, max_length=1000)
    isPublished: bool = False

    @field_validator("title")
    @classmethod
    def strip_module_title(cls, value: str) -> str:
        return _strip_required_text(value, "Module title")


class ModuleCreate(ModuleBase):
    pass


class ModuleUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sortOrder: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = Field(default=None, max_length=1000)
    isPublished: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def strip_optional_module_title(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Module title")


class ModulePublish(BaseModel):
    isPublished: bool


class ModuleResponse(ModuleBase):
    moduleId: uuid.UUID
    courseId: uuid.UUID
    createdAt: UtcDateTime
    lessons: List[LessonResponse] = []

    model_config = ConfigDict(from_attributes=True)


class LessonProgressUpdate(BaseModel):
    isCompleted: Optional[bool] = None
    timeSpentDeltaSeconds: int = Field(default=0, ge=0, le=7200)


class LessonProgressItemResponse(BaseModel):
    lessonId: uuid.UUID
    isCompleted: bool
    completedAt: Optional[UtcDateTime] = None
    lastViewedAt: UtcDateTime
    timeSpentSeconds: int = 0

    model_config = ConfigDict(from_attributes=True)


class CourseProgressSummaryResponse(BaseModel):
    courseId: uuid.UUID
    totalLessons: int
    completedLessons: int
    completionPercent: float
    items: List[LessonProgressItemResponse] = []


# ==========================================
# ASSIGNMENTS & SUBMISSIONS SCHEMAS
# ==========================================


class AssignmentBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    dueAt: UtcDateTime
    maxScore: float = Field(default=10.0, gt=0)
    allowLate: bool = False
    attachmentUrl: Optional[str] = Field(default=None, max_length=500)
    attachmentFileId: Optional[uuid.UUID] = None
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    rubricJson: Optional[str] = None
    status: Literal["DRAFT", "PUBLISHED", "CLOSED"] = "DRAFT"

    @field_validator("title")
    @classmethod
    def strip_nonempty_title(cls, value: str) -> str:
        return _strip_required_text(value, "Title")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return _strip_optional_upper(value) or value


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    dueAt: Optional[UtcDateTime] = None
    maxScore: Optional[float] = Field(default=None, gt=0)
    allowLate: Optional[bool] = None
    attachmentUrl: Optional[str] = Field(default=None, max_length=500)
    attachmentFileId: Optional[uuid.UUID] = None
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    rubricJson: Optional[str] = None
    status: Optional[Literal["DRAFT", "PUBLISHED", "CLOSED"]] = None

    @field_validator("title")
    @classmethod
    def strip_nonempty_title(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Title")

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)


class AssignmentResponse(AssignmentBase):
    assignmentId: uuid.UUID
    courseId: uuid.UUID
    createdAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


class SubmissionCreate(BaseModel):
    contentText: Optional[str] = None
    fileId: Optional[uuid.UUID] = None
    rubricScoresJson: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("contentText")
    @classmethod
    def normalize_content(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def require_text_or_file(self):
        if not self.contentText and self.fileId is None:
            raise ValueError("Submission requires text content or an uploaded file")
        return self


class SubmissionGrade(BaseModel):
    score: float = Field(..., ge=0)
    feedback: Optional[str] = Field(default=None, max_length=2000)
    rubricScoresJson: Optional[str] = None


class SubmissionResponse(BaseModel):
    submissionId: uuid.UUID
    assignmentId: uuid.UUID
    studentId: uuid.UUID
    submittedAt: UtcDateTime
    contentText: Optional[str] = None
    fileUrl: Optional[str] = None
    fileId: Optional[uuid.UUID] = None
    rubricScoresJson: Optional[str] = None
    status: str
    score: Optional[float] = None
    feedback: Optional[str] = None
    updatedAt: Optional[UtcDateTime] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class SubmissionGradeResponse(SubmissionResponse):
    gradeId: Optional[uuid.UUID] = None
    weightPercent: Optional[float] = None


# ==========================================
# QUIZZES, QUESTIONS & ATTEMPTS SCHEMAS
# ==========================================


class QuizQuestionBase(BaseModel):
    questionText: str = Field(..., min_length=1, max_length=1000)
    questionType: str
    optionsJson: Optional[str] = None
    correctAnswer: str = Field(..., min_length=1, max_length=500)
    score: float = Field(default=1.0, gt=0)
    sortOrder: int = Field(default=1, ge=0)

    @field_validator("questionText", "correctAnswer")
    @classmethod
    def strip_required_quiz_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Question text and correct answer must not be empty")
        return cleaned

    @field_validator("questionType", mode="before")
    @classmethod
    def normalize_question_type(cls, value: str) -> str:
        return _strip_optional_upper(value) or value


class QuizQuestionCreate(QuizQuestionBase):
    pass


class QuizQuestionUpdate(BaseModel):
    questionText: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    questionType: Optional[str] = None
    optionsJson: Optional[str] = None
    correctAnswer: Optional[str] = Field(default=None, min_length=1, max_length=500)
    score: Optional[float] = Field(default=None, gt=0)
    sortOrder: Optional[int] = Field(default=None, ge=0)

    @field_validator("questionText", "correctAnswer")
    @classmethod
    def strip_optional_quiz_text(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Question field")

    @field_validator("questionType", mode="before")
    @classmethod
    def normalize_optional_question_type(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)


class QuizQuestionResponse(BaseModel):
    questionId: uuid.UUID
    quizId: uuid.UUID
    questionText: str
    questionType: str
    optionsJson: Optional[str] = None
    correctAnswer: str  # Visible to Lecturer/Admin
    score: float
    sortOrder: int

    model_config = ConfigDict(from_attributes=True)


class QuizQuestionStudentResponse(BaseModel):
    questionId: uuid.UUID
    quizId: uuid.UUID
    questionText: str
    questionType: str
    optionsJson: Optional[str] = None
    score: float
    sortOrder: int
    # Strictly NO correctAnswer field for student attempts!

    model_config = ConfigDict(from_attributes=True)


class QuizBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    startAt: UtcDateTime
    endAt: UtcDateTime
    timeLimitMinutes: int = Field(default=30, ge=1, le=300)
    maxAttempts: int = Field(default=1, ge=1, le=10)
    passingScore: float = Field(default=5.0, ge=0)
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    scoreVisibility: Literal["SCORE_ONLY", "AFTER_ATTEMPT", "AFTER_CLOSE"] = "AFTER_CLOSE"
    isPublished: bool = False

    @field_validator("title")
    @classmethod
    def strip_quiz_title(cls, value: str) -> str:
        return _strip_required_text(value, "Title")

    @field_validator("scoreVisibility", mode="before")
    @classmethod
    def normalize_score_visibility(cls, value: str) -> str:
        normalized = _strip_optional_upper(value) or "AFTER_CLOSE"
        if normalized == "IMMEDIATE":
            return "AFTER_ATTEMPT"
        return normalized

    @model_validator(mode="after")
    def validate_window(self):
        if as_utc_datetime(self.endAt) <= as_utc_datetime(self.startAt):
            raise ValueError("EndAt must be after StartAt")
        return self


class QuizCreate(QuizBase):
    pass


class QuizUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=1000)
    startAt: Optional[UtcDateTime] = None
    endAt: Optional[UtcDateTime] = None
    timeLimitMinutes: Optional[int] = Field(default=None, ge=1, le=300)
    maxAttempts: Optional[int] = Field(default=None, ge=1, le=10)
    passingScore: Optional[float] = Field(default=None, ge=0)
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    scoreVisibility: Optional[Literal["SCORE_ONLY", "AFTER_ATTEMPT", "AFTER_CLOSE"]] = None
    isPublished: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def strip_optional_quiz_title(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Title")

    @field_validator("scoreVisibility", mode="before")
    @classmethod
    def normalize_optional_score_visibility(cls, value: Optional[str]) -> Optional[str]:
        normalized = _strip_optional_upper(value)
        if normalized == "IMMEDIATE":
            return "AFTER_ATTEMPT"
        return normalized

    @model_validator(mode="after")
    def validate_optional_window(self):
        if (
            self.startAt is not None
            and self.endAt is not None
            and as_utc_datetime(self.endAt) <= as_utc_datetime(self.startAt)
        ):
            raise ValueError("EndAt must be after StartAt")
        return self


class QuizPublish(BaseModel):
    isPublished: bool


class QuizResponse(QuizBase):
    quizId: uuid.UUID
    courseId: uuid.UUID
    createdAt: UtcDateTime
    maxScore: float = 0.0
    questions: List[QuizQuestionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class QuizStudentResponse(QuizBase):
    quizId: uuid.UUID
    courseId: uuid.UUID
    createdAt: UtcDateTime
    maxScore: float = 0.0
    questions: List[QuizQuestionStudentResponse] = []

    model_config = ConfigDict(from_attributes=True)


class QuizAttemptStartResponse(BaseModel):
    attemptId: uuid.UUID
    quizId: uuid.UUID
    attemptNo: int
    startedAt: UtcDateTime
    deadlineAt: Optional[UtcDateTime] = None
    timeLimitMinutes: int
    maxScore: float
    savedAnswers: Dict[str, Any] = {}
    questions: List[QuizQuestionStudentResponse] = []


class QuizDraftSave(BaseModel):
    answers: Dict[str, Any]


class QuizAttemptSubmit(BaseModel):
    answers: Dict[str, Any]


class QuizAttemptManualGrade(BaseModel):
    questionScores: Dict[str, float]
    feedback: Optional[str] = Field(default=None, max_length=2000)


class QuizAttemptResponse(BaseModel):
    attemptId: uuid.UUID
    quizId: uuid.UUID
    studentId: uuid.UUID
    attemptNo: int
    startedAt: UtcDateTime
    submittedAt: Optional[UtcDateTime] = None
    score: Optional[float] = None
    status: str
    answersJson: Optional[str] = None
    questionResultsJson: Optional[str] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# GRADES, NOTIFICATIONS & DASHBOARD
# ==========================================


class ManualGradeCreate(BaseModel):
    studentId: uuid.UUID
    itemTitle: str = Field(..., min_length=1, max_length=200)
    sourceType: Literal["MANUAL", "MIDTERM", "FINAL"] = "MANUAL"
    score: float = Field(..., ge=0)
    maxScore: float = Field(default=10.0, gt=0)
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    feedback: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("itemTitle")
    @classmethod
    def strip_item_title(cls, value: str) -> str:
        return _strip_required_text(value, "Item title")

    @field_validator("sourceType", mode="before")
    @classmethod
    def normalize_source_type(cls, value: str) -> str:
        return _strip_optional_upper(value) or "MANUAL"

    @model_validator(mode="after")
    def validate_score_bound(self):
        if self.score > self.maxScore:
            raise ValueError("Score cannot exceed maxScore")
        return self


class ManualGradeUpdate(BaseModel):
    itemTitle: Optional[str] = Field(default=None, min_length=1, max_length=200)
    sourceType: Optional[Literal["MANUAL", "MIDTERM", "FINAL"]] = None
    score: Optional[float] = Field(default=None, ge=0)
    maxScore: Optional[float] = Field(default=None, gt=0)
    weightPercent: Optional[float] = Field(default=None, ge=0, le=100)
    feedback: Optional[str] = Field(default=None, max_length=2000)

    @field_validator("itemTitle")
    @classmethod
    def strip_optional_item_title(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_text(value, "Item title")

    @field_validator("sourceType", mode="before")
    @classmethod
    def normalize_optional_source_type(cls, value: Optional[str]) -> Optional[str]:
        return _strip_optional_upper(value)

    @model_validator(mode="after")
    def validate_optional_score_bound(self):
        if self.score is not None and self.maxScore is not None and self.score > self.maxScore:
            raise ValueError("Score cannot exceed maxScore")
        return self


class GradeResponse(BaseModel):
    gradeId: uuid.UUID
    courseId: uuid.UUID
    studentId: uuid.UUID
    sourceType: str
    sourceId: Optional[uuid.UUID] = None
    itemTitle: str = ""
    score: float
    maxScore: float
    weightPercent: Optional[float] = None
    feedback: Optional[str] = None
    gradedBy: uuid.UUID
    gradedAt: UtcDateTime
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class NotificationResponse(BaseModel):
    notificationId: uuid.UUID
    userId: uuid.UUID
    title: str
    message: str
    type: str
    isRead: bool
    createdAt: UtcDateTime
    relatedUrl: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AdminDashboardResponse(BaseModel):
    totalUsers: int
    totalCourses: int
    totalStudents: int
    totalLecturers: int
    totalEnrollments: int
    activeCourses: int = 0
    draftCourses: int = 0
    archivedCourses: int = 0
    activeMeetings: int = 0


class LecturerDashboardResponse(BaseModel):
    totalCourses: int
    totalStudents: int
    totalPendingSubmissions: int
    totalQuizzes: int = 0
    activeMeetings: int = 0
    recentCourses: List[CourseResponse] = []


class StudentDashboardResponse(BaseModel):
    totalEnrolledCourses: int
    upcomingAssignments: int
    availableQuizzes: int
    unreadNotifications: int
    gpa: Optional[float] = None
    gpaScale4: Optional[float] = None
    completedLessons: int = 0
    totalLessons: int = 0
    enrolledCourses: List[CourseResponse] = []


class CalendarEventItem(BaseModel):
    id: uuid.UUID
    courseId: uuid.UUID
    courseCode: str
    courseTitle: str
    kind: Literal["ASSIGNMENT", "QUIZ", "MEETING"]
    title: str
    startAt: Optional[UtcDateTime] = None
    endAt: UtcDateTime
    status: str
    relatedUrl: str


# ==========================================
# FILES, REALTIME, MEETING & TEAMS SCHEMAS
# ==========================================


class StoredFileResponse(BaseModel):
    fileId: uuid.UUID
    ownerId: uuid.UUID
    courseId: Optional[uuid.UUID] = None
    scope: str
    originalName: str
    mimeType: str
    sizeBytes: int
    extractedTextPreview: Optional[str] = None
    downloadUrl: str
    createdAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


class WsTicketResponse(BaseModel):
    ticket: str
    expiresInSeconds: int = 30


class WhiteboardSnapshotUpdate(BaseModel):
    meetingId: Optional[uuid.UUID] = None
    strokesJson: str = Field(..., min_length=2)


class WhiteboardSnapshotResponse(BaseModel):
    snapshotId: uuid.UUID
    courseId: uuid.UUID
    meetingId: Optional[uuid.UUID] = None
    strokesJson: str
    updatedBy: uuid.UUID
    updatedAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


class MeetingCreate(BaseModel):
    courseId: uuid.UUID
    title: str = Field(..., min_length=1, max_length=200)
    roomCode: Optional[str] = Field(default=None, max_length=100)
    replaceActive: bool = False

    @field_validator("title")
    @classmethod
    def strip_meeting_title(cls, value: str) -> str:
        return _strip_required_text(value, "Meeting title")


class MeetingLogCreate(BaseModel):
    activitySummary: Optional[str] = Field(default=None, max_length=500)
    chatCount: int = Field(default=0, ge=0)
    handRaisesCount: int = Field(default=0, ge=0)


class MeetingLogResponse(BaseModel):
    logId: uuid.UUID
    meetingId: uuid.UUID
    userId: uuid.UUID
    userName: Optional[str] = None
    userEmail: Optional[str] = None
    userRole: Optional[str] = None
    studentCode: Optional[str] = None
    joinedAt: UtcDateTime
    leftAt: Optional[UtcDateTime] = None
    durationSeconds: int
    chatCount: int
    handRaisesCount: int
    activitySummary: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class MeetingResponse(BaseModel):
    meetingId: uuid.UUID
    courseId: uuid.UUID
    courseTitle: Optional[str] = None
    courseCode: Optional[str] = None
    hostId: uuid.UUID
    hostName: Optional[str] = None
    title: str
    roomCode: str
    status: str
    startedAt: UtcDateTime
    endedAt: Optional[UtcDateTime] = None
    createdAt: UtcDateTime
    participantCount: int = 0
    activeLogs: List[MeetingLogResponse] = []

    model_config = ConfigDict(from_attributes=True)


class CourseMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=4000)
    attachmentUrl: Optional[str] = Field(default=None, max_length=500)
    meetingId: Optional[uuid.UUID] = None
    messageType: Literal["TEXT", "SYSTEM", "FILE"] = "TEXT"
    attachmentFileId: Optional[uuid.UUID] = None

    @field_validator("content")
    @classmethod
    def strip_message_content(cls, value: str) -> str:
        return _strip_required_text(value, "Message content")

    @field_validator("messageType", mode="before")
    @classmethod
    def normalize_message_type(cls, value: str) -> str:
        return _strip_optional_upper(value) or "TEXT"


class CourseMessageResponse(BaseModel):
    messageId: uuid.UUID
    courseId: uuid.UUID
    meetingId: Optional[uuid.UUID] = None
    senderId: uuid.UUID
    senderName: str
    senderRole: str
    senderEmail: str
    messageType: str = "TEXT"
    content: str
    attachmentUrl: Optional[str] = None
    attachmentFileId: Optional[uuid.UUID] = None
    createdAt: UtcDateTime

    model_config = ConfigDict(from_attributes=True)


# ==========================================
# AI ASSISTANT & DEMO SCHEMAS
# ==========================================


class AiTutorRequest(BaseModel):
    lessonId: uuid.UUID
    mode: Literal["SUMMARY", "EXPLAIN", "PRACTICE_QUESTIONS", "QA"] = "QA"
    question: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("mode", mode="before")
    @classmethod
    def normalize_tutor_mode(cls, value: str) -> str:
        return _strip_optional_upper(value) or "QA"


class AiTutorResponse(BaseModel):
    answer: str
    providerMode: Literal["GEMINI", "LOCAL_FALLBACK"]
    insufficientText: bool = False
    citations: List[str] = []


class AiQuizGenerateRequest(BaseModel):
    courseId: uuid.UUID
    lessonIds: List[uuid.UUID] = Field(..., min_length=1)
    count: int = Field(default=5, ge=1, le=20)
    questionTypes: List[Literal["SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"]] = [
        "SINGLE_CHOICE",
        "TRUE_FALSE",
    ]


class AiQuizDraftQuestion(BaseModel):
    questionText: str
    questionType: Literal["SINGLE_CHOICE", "TRUE_FALSE", "SHORT_TEXT"]
    optionsJson: Optional[str] = None
    correctAnswer: str
    score: float = 1.0


class AiQuizGenerateResponse(BaseModel):
    questions: List[AiQuizDraftQuestion] = []
    providerMode: Literal["GEMINI", "LOCAL_FALLBACK"]
    insufficientText: bool = False


class AiFeedbackSuggestRequest(BaseModel):
    submissionId: uuid.UUID
    score: Optional[float] = Field(default=None, ge=0)


class AiFeedbackSuggestResponse(BaseModel):
    suggestedFeedback: str
    providerMode: Literal["GEMINI", "LOCAL_FALLBACK"]


class DemoAccountItem(BaseModel):
    userId: uuid.UUID
    email: str
    fullName: str
    role: str
    studentCode: Optional[str] = None
    staffCode: Optional[str] = None


class DemoSwitchRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=150)

    @field_validator("email")
    @classmethod
    def strip_demo_email(cls, value: str) -> str:
        return _strip_required_text(value, "Email")
