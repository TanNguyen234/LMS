import uuid
from datetime import datetime, timezone
from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


def as_utc_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


# ==========================================
# AUTH & USER SCHEMAS
# ==========================================

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


class UserBase(BaseModel):
    email: EmailStr
    fullName: str
    role: str  # 'ADMIN', 'LECTURER', 'STUDENT'
    isActive: bool = True
    studentCode: Optional[str] = None
    staffCode: Optional[str] = None
    cohort: Optional[str] = None
    major: Optional[str] = None
    className: Optional[str] = None
    department: Optional[str] = None
    isChatEnabled: bool = True


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    fullName: Optional[str] = None
    role: Optional[str] = None
    isActive: Optional[bool] = None
    studentCode: Optional[str] = None
    staffCode: Optional[str] = None
    cohort: Optional[str] = None
    major: Optional[str] = None
    className: Optional[str] = None
    department: Optional[str] = None
    isChatEnabled: Optional[bool] = None
    password: Optional[str] = None


class UserStatusUpdate(BaseModel):
    isActive: bool


class UserResponse(UserBase):
    userId: uuid.UUID
    createdAt: datetime

    class Config:
        from_attributes = True


# ==========================================
# COURSE & ENROLLMENT SCHEMAS
# ==========================================

class CourseBase(BaseModel):
    courseCode: str
    title: str
    description: Optional[str] = None
    lecturerId: uuid.UUID
    semester: str
    academicYear: str
    credits: int
    subjectCode: Optional[str] = None
    sectionCode: Optional[str] = None
    status: str = "ACTIVE"  # 'DRAFT', 'ACTIVE', 'ARCHIVED'


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    lecturerId: Optional[uuid.UUID] = None
    semester: Optional[str] = None
    academicYear: Optional[str] = None
    credits: Optional[int] = None
    subjectCode: Optional[str] = None
    sectionCode: Optional[str] = None
    status: Optional[str] = None


class CourseStatusUpdate(BaseModel):
    status: str  # 'DRAFT', 'ACTIVE', 'ARCHIVED'


class CourseResponse(CourseBase):
    courseId: uuid.UUID
    createdAt: datetime
    lecturerName: Optional[str] = None
    lecturerDepartment: Optional[str] = None
    isDeleted: bool = False
    deletedAt: Optional[datetime] = None

    class Config:
        from_attributes = True


class EnrollmentCreate(BaseModel):
    studentId: uuid.UUID


class EnrollmentResponse(BaseModel):
    enrollmentId: uuid.UUID
    courseId: uuid.UUID
    studentId: uuid.UUID
    enrolledAt: datetime
    status: str
    finalScore: Optional[float] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None
    studentEmail: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# MODULES & LESSONS SCHEMAS
# ==========================================

class LessonBase(BaseModel):
    title: str
    contentHtml: Optional[str] = None
    materialUrl: Optional[str] = None
    sortOrder: int = 1
    isPublished: bool = False
    estimatedMinutes: Optional[int] = None


class LessonCreate(LessonBase):
    pass


class LessonUpdate(BaseModel):
    title: Optional[str] = None
    contentHtml: Optional[str] = None
    materialUrl: Optional[str] = None
    sortOrder: Optional[int] = None
    isPublished: Optional[bool] = None
    estimatedMinutes: Optional[int] = None


class LessonPublish(BaseModel):
    isPublished: bool


class LessonResponse(LessonBase):
    lessonId: uuid.UUID
    moduleId: uuid.UUID
    createdAt: datetime
    isDeleted: bool = False
    deletedAt: Optional[datetime] = None

    class Config:
        from_attributes = True


class ModuleBase(BaseModel):
    title: str
    sortOrder: int = 1
    description: Optional[str] = None
    isPublished: bool = False


class ModuleCreate(ModuleBase):
    pass


class ModuleUpdate(BaseModel):
    title: Optional[str] = None
    sortOrder: Optional[int] = None
    description: Optional[str] = None
    isPublished: Optional[bool] = None


class ModulePublish(BaseModel):
    isPublished: bool


class ModuleResponse(ModuleBase):
    moduleId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime
    isDeleted: bool = False
    deletedAt: Optional[datetime] = None
    lessons: List[LessonResponse] = []

    class Config:
        from_attributes = True


# ==========================================
# ASSIGNMENTS & SUBMISSIONS SCHEMAS
# ==========================================

class AssignmentBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    dueAt: datetime
    maxScore: float = Field(default=10.0, gt=0)
    allowLate: bool = False
    attachmentUrl: Optional[str] = None
    status: Literal["DRAFT", "PUBLISHED", "CLOSED"] = "DRAFT"

    @field_validator("title")
    @classmethod
    def strip_nonempty_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title must not be empty")
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: str) -> str:
        return value.strip().upper() if isinstance(value, str) else value


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    dueAt: Optional[datetime] = None
    maxScore: Optional[float] = Field(default=None, gt=0)
    allowLate: Optional[bool] = None
    attachmentUrl: Optional[str] = None
    status: Optional[Literal["DRAFT", "PUBLISHED", "CLOSED"]] = None

    @field_validator("title")
    @classmethod
    def strip_nonempty_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Title must not be empty")
        return value

    @field_validator("status", mode="before")
    @classmethod
    def normalize_status(cls, value: Optional[str]) -> Optional[str]:
        return value.strip().upper() if isinstance(value, str) else value


class AssignmentResponse(AssignmentBase):
    assignmentId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime
    isDeleted: bool = False
    deletedAt: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubmissionCreate(BaseModel):
    contentText: Optional[str] = None
    fileUrl: Optional[str] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("contentText")
    @classmethod
    def normalize_content(cls, value: Optional[str]) -> Optional[str]:
        return value.strip() if value is not None else None

    @field_validator("fileUrl")
    @classmethod
    def validate_file_url(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        # Reject fake filenames; require valid uploaded URL path
        if not (value.startswith("/submissions/") or value.startswith("http://") or value.startswith("https://")):
            raise ValueError("fileUrl must be a valid uploaded file URL starting with /submissions/")
        return value

    @model_validator(mode="after")
    def require_content_or_file(self):
        if not self.contentText and not self.fileUrl:
            raise ValueError("Either text submission content or an uploaded file is required")
        return self


class SubmissionGrade(BaseModel):
    score: float
    feedback: Optional[str] = None


class SubmissionResponse(BaseModel):
    submissionId: uuid.UUID
    assignmentId: uuid.UUID
    studentId: uuid.UUID
    submittedAt: datetime
    contentText: Optional[str] = None
    fileUrl: Optional[str] = None
    status: str
    score: Optional[float] = None
    feedback: Optional[str] = None
    updatedAt: Optional[datetime] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# QUIZZES, QUESTIONS & ATTEMPTS SCHEMAS
# ==========================================

class QuizQuestionBase(BaseModel):
    questionText: str = Field(..., min_length=1, max_length=1000)
    questionType: str
    optionsJson: Optional[str] = None
    correctAnswer: str = Field(..., min_length=1, max_length=500)
    score: float = Field(default=1.0, gt=0)
    sortOrder: int = 1

    @field_validator("questionText", "correctAnswer")
    @classmethod
    def strip_required_quiz_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question text and correct answer must not be empty")
        return value


class QuizQuestionCreate(QuizQuestionBase):
    pass


class QuizQuestionUpdate(BaseModel):
    questionText: Optional[str] = None
    questionType: Optional[str] = None
    optionsJson: Optional[str] = None
    correctAnswer: Optional[str] = None
    score: Optional[float] = Field(default=None, gt=0)
    sortOrder: Optional[int] = None


class QuizQuestionResponse(BaseModel):
    questionId: uuid.UUID
    quizId: uuid.UUID
    questionText: str
    questionType: str
    optionsJson: Optional[str] = None
    correctAnswer: str  # Visible to Lecturer/Admin
    score: float
    sortOrder: int

    class Config:
        from_attributes = True


class QuizQuestionStudentResponse(BaseModel):
    questionId: uuid.UUID
    quizId: uuid.UUID
    questionText: str
    questionType: str
    optionsJson: Optional[str] = None
    score: float
    sortOrder: int
    # NOTE: Strictly NO correctAnswer field for student!

    class Config:
        from_attributes = True


class QuizBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    startAt: datetime
    endAt: datetime
    timeLimitMinutes: int = Field(default=30, ge=1, le=300)
    maxAttempts: int = Field(default=1, ge=1, le=10)
    passingScore: float = Field(default=5.0, ge=0)
    totalScore: float = Field(default=10.0, ge=0)
    scoreVisibility: str = "IMMEDIATE"  # 'IMMEDIATE', 'AFTER_CLOSED', 'HIDDEN'
    isPublished: bool = False

    @field_validator("title")
    @classmethod
    def strip_quiz_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title must not be empty")
        return value

    @model_validator(mode="after")
    def validate_window(self):
        if as_utc_datetime(self.endAt) <= as_utc_datetime(self.startAt):
            raise ValueError("EndAt must be after StartAt")
        return self


class QuizCreate(QuizBase):
    pass


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    startAt: Optional[datetime] = None
    endAt: Optional[datetime] = None
    timeLimitMinutes: Optional[int] = Field(default=None, ge=1, le=300)
    maxAttempts: Optional[int] = Field(default=None, ge=1, le=10)
    passingScore: Optional[float] = Field(default=None, ge=0)
    totalScore: Optional[float] = Field(default=None, ge=0)
    scoreVisibility: Optional[str] = None
    isPublished: Optional[bool] = None

    @field_validator("title")
    @classmethod
    def strip_optional_quiz_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Title must not be empty")
        return value

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
    createdAt: datetime
    maxScore: float = 0.0
    isDeleted: bool = False
    deletedAt: Optional[datetime] = None
    questions: List[QuizQuestionResponse] = []

    class Config:
        from_attributes = True


class QuizStudentResponse(QuizBase):
    quizId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime
    maxScore: float = 0.0
    questions: List[QuizQuestionStudentResponse] = []
    myAttemptsCount: int = 0
    myHighestScore: Optional[float] = None

    class Config:
        from_attributes = True


class QuizAttemptStartResponse(BaseModel):
    attemptId: uuid.UUID
    quizId: uuid.UUID
    attemptNo: int
    startedAt: datetime
    timeLimitMinutes: int
    maxScore: float
    questions: List[QuizQuestionStudentResponse] = []


class QuizAttemptSubmit(BaseModel):
    answers: dict  # {"questionId": "A", ...}


class QuizAttemptResponse(BaseModel):
    attemptId: uuid.UUID
    quizId: uuid.UUID
    studentId: uuid.UUID
    attemptNo: int
    startedAt: datetime
    submittedAt: Optional[datetime] = None
    score: Optional[float] = None
    status: str
    answersJson: Optional[str] = None
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    class Config:
        from_attributes = True


class BulkImportQuestionsRequest(BaseModel):
    rawText: str
    autoRebalanceScores: bool = True


class BulkImportQuestionsResponse(BaseModel):
    success: bool
    importedCount: int
    totalQuestions: int
    scorePerQuestion: float
    message: str


# ==========================================
# GRADES, NOTIFICATIONS & DASHBOARD
# ==========================================

class ManualGradeCreate(BaseModel):
    studentId: uuid.UUID
    itemTitle: str
    score: float
    maxScore: float = 10.0
    weightPercent: Optional[float] = None
    feedback: Optional[str] = None


class GradeResponse(BaseModel):
    gradeId: uuid.UUID
    courseId: uuid.UUID
    studentId: uuid.UUID
    sourceType: str  # 'ASSIGNMENT', 'QUIZ', 'MANUAL'
    sourceId: Optional[uuid.UUID] = None
    itemTitle: str
    score: float
    maxScore: float
    weightPercent: Optional[float] = None
    feedback: Optional[str] = None
    gradedBy: uuid.UUID
    gradedAt: datetime
    studentName: Optional[str] = None
    studentCode: Optional[str] = None

    class Config:
        from_attributes = True


class StudentGradeMatrix(BaseModel):
    studentId: uuid.UUID
    studentName: str
    studentCode: Optional[str] = None
    email: str
    quizScore: Optional[float] = None
    assignmentScore: Optional[float] = None
    examScore: Optional[float] = None
    weightedTotal: float
    gpa4: float
    letterGrade: str
    status: str
    finalScoreRecorded: Optional[float] = None


class GradeMatrixResponse(BaseModel):
    courseId: uuid.UUID
    courseCode: str
    courseTitle: str
    weights: dict
    students: List[StudentGradeMatrix]


class NotificationResponse(BaseModel):
    notificationId: uuid.UUID
    userId: uuid.UUID
    title: str
    message: str
    type: str
    isRead: bool
    createdAt: datetime
    relatedUrl: Optional[str] = None

    class Config:
        from_attributes = True


class NotificationBroadcastRequest(BaseModel):
    target: str = "ALL"  # 'ALL', 'STUDENTS', 'LECTURERS', 'COURSE_STUDENTS'
    courseId: Optional[uuid.UUID] = None
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=1000)
    type: str = "ANNOUNCEMENT"
    relatedUrl: Optional[str] = None


class NotificationBroadcastResponse(BaseModel):
    success: bool
    recipientCount: int
    message: str


class AdminDashboardResponse(BaseModel):
    totalUsers: int
    totalCourses: int
    totalStudents: int
    totalLecturers: int
    totalEnrollments: int


class LecturerDashboardResponse(BaseModel):
    totalCourses: int
    totalStudents: int
    totalPendingSubmissions: int
    recentCourses: List[CourseResponse] = []


class StudentDashboardResponse(BaseModel):
    totalEnrolledCourses: int
    upcomingAssignments: int
    availableQuizzes: int
    unreadNotifications: int
    enrolledCourses: List[CourseResponse] = []


# ==========================================
# NOTIFICATION BROADCAST & BULK IMPORT SCHEMAS
# ==========================================

class BroadcastNotificationRequest(BaseModel):
    courseId: Optional[uuid.UUID] = None  # None = toàn trường (Admin only), courseId = sinh viên trong lớp
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(..., min_length=1, max_length=1000)
    type: str = "GENERAL"
    relatedUrl: Optional[str] = None


class BulkQuestionImportRequest(BaseModel):
    rawText: str = Field(..., min_length=5)
    autoEqualScore: bool = True


class BulkQuestionImportResponse(BaseModel):
    importedCount: int
    scorePerQuestion: float
    questions: List[QuizQuestionResponse] = []


# ==========================================
# REALTIME CHAT SCHEMAS
# ==========================================

class MessageCreate(BaseModel):
    receiverId: uuid.UUID
    content: Optional[str] = Field(None, max_length=2000)
    attachmentUrl: Optional[str] = Field(None, max_length=500)
    attachmentName: Optional[str] = Field(None, max_length=255)
    attachmentType: Optional[str] = Field(None, max_length=100)
    attachmentSize: Optional[int] = None


class ChatMessageResponse(BaseModel):
    messageId: uuid.UUID
    senderId: uuid.UUID
    receiverId: uuid.UUID
    content: Optional[str] = None
    createdAt: datetime
    isRead: bool
    isRecalled: bool = False
    recalledAt: Optional[datetime] = None
    attachmentUrl: Optional[str] = None
    attachmentName: Optional[str] = None
    attachmentType: Optional[str] = None
    attachmentSize: Optional[int] = None
    senderName: Optional[str] = None

    class Config:
        from_attributes = True


MessageResponse = ChatMessageResponse


class ContactResponse(BaseModel):
    userId: uuid.UUID
    fullName: str
    email: str
    role: str
    department: Optional[str] = None
    courseNames: List[str] = []
    isBlocked: bool = False
    isChatEnabled: bool = True
    unreadCount: int = 0


class BlockedUserResponse(BaseModel):
    blockId: uuid.UUID
    studentId: uuid.UUID
    studentName: Optional[str] = None
    studentEmail: Optional[str] = None
    createdAt: datetime
    reason: Optional[str] = None

    class Config:
        from_attributes = True

