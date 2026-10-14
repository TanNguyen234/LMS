import uuid
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field


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


class UserCreate(UserBase):
    password: str = Field(..., min_length=6)


class UserUpdate(BaseModel):
    fullName: Optional[str] = None
    role: Optional[str] = None
    isActive: Optional[bool] = None
    studentCode: Optional[str] = None
    staffCode: Optional[str] = None
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
    status: Optional[str] = None


class CourseStatusUpdate(BaseModel):
    status: str  # 'DRAFT', 'ACTIVE', 'ARCHIVED'


class CourseResponse(CourseBase):
    courseId: uuid.UUID
    createdAt: datetime
    lecturerName: Optional[str] = None

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
    lessons: List[LessonResponse] = []

    class Config:
        from_attributes = True


# ==========================================
# ASSIGNMENTS & SUBMISSIONS SCHEMAS
# ==========================================

class AssignmentBase(BaseModel):
    title: str
    description: Optional[str] = None
    dueAt: datetime
    maxScore: float = 10.0
    allowLate: bool = False
    attachmentUrl: Optional[str] = None
    status: str = "DRAFT"  # 'DRAFT', 'PUBLISHED', 'CLOSED'


class AssignmentCreate(AssignmentBase):
    pass


class AssignmentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    dueAt: Optional[datetime] = None
    maxScore: Optional[float] = None
    allowLate: Optional[bool] = None
    attachmentUrl: Optional[str] = None
    status: Optional[str] = None


class AssignmentResponse(AssignmentBase):
    assignmentId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime

    class Config:
        from_attributes = True


class SubmissionCreate(BaseModel):
    contentText: Optional[str] = None
    fileUrl: Optional[str] = None


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
    questionText: str
    questionType: str  # 'SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_TEXT'
    optionsJson: Optional[str] = None
    correctAnswer: str
    score: float = 1.0
    sortOrder: int = 1


class QuizQuestionCreate(QuizQuestionBase):
    pass


class QuizQuestionUpdate(BaseModel):
    questionText: Optional[str] = None
    questionType: Optional[str] = None
    optionsJson: Optional[str] = None
    correctAnswer: Optional[str] = None
    score: Optional[float] = None
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
    title: str
    description: Optional[str] = None
    startAt: datetime
    endAt: datetime
    timeLimitMinutes: int = 30
    maxAttempts: int = 1
    passingScore: float = 5.0
    isPublished: bool = False


class QuizCreate(QuizBase):
    pass


class QuizUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    startAt: Optional[datetime] = None
    endAt: Optional[datetime] = None
    timeLimitMinutes: Optional[int] = None
    maxAttempts: Optional[int] = None
    passingScore: Optional[float] = None
    isPublished: Optional[bool] = None


class QuizPublish(BaseModel):
    isPublished: bool


class QuizResponse(QuizBase):
    quizId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime
    questions: List[QuizQuestionResponse] = []

    class Config:
        from_attributes = True


class QuizStudentResponse(QuizBase):
    quizId: uuid.UUID
    courseId: uuid.UUID
    createdAt: datetime
    questions: List[QuizQuestionStudentResponse] = []

    class Config:
        from_attributes = True


class QuizAttemptStartResponse(BaseModel):
    attemptId: uuid.UUID
    quizId: uuid.UUID
    attemptNo: int
    startedAt: datetime
    timeLimitMinutes: int
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
