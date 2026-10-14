from backend.app.schemas.common import PaginatedResponse, MessageResponse
from backend.app.schemas.schemas import (
    LoginRequest, TokenResponse, UserCreate, UserUpdate, UserStatusUpdate, UserResponse,
    CourseCreate, CourseUpdate, CourseStatusUpdate, CourseResponse,
    EnrollmentCreate, EnrollmentResponse,
    ModuleCreate, ModuleUpdate, ModulePublish, ModuleResponse,
    LessonCreate, LessonUpdate, LessonPublish, LessonResponse,
    AssignmentCreate, AssignmentUpdate, AssignmentResponse,
    SubmissionCreate, SubmissionGrade, SubmissionResponse,
    QuizCreate, QuizUpdate, QuizPublish, QuizResponse, QuizStudentResponse,
    QuizQuestionCreate, QuizQuestionUpdate, QuizQuestionResponse, QuizQuestionStudentResponse,
    QuizAttemptStartResponse, QuizAttemptSubmit, QuizAttemptResponse,
    ManualGradeCreate, GradeResponse,
    NotificationResponse,
    AdminDashboardResponse, LecturerDashboardResponse, StudentDashboardResponse
)

__all__ = [
    "PaginatedResponse", "MessageResponse",
    "LoginRequest", "TokenResponse", "UserCreate", "UserUpdate", "UserStatusUpdate", "UserResponse",
    "CourseCreate", "CourseUpdate", "CourseStatusUpdate", "CourseResponse",
    "EnrollmentCreate", "EnrollmentResponse",
    "ModuleCreate", "ModuleUpdate", "ModulePublish", "ModuleResponse",
    "LessonCreate", "LessonUpdate", "LessonPublish", "LessonResponse",
    "AssignmentCreate", "AssignmentUpdate", "AssignmentResponse",
    "SubmissionCreate", "SubmissionGrade", "SubmissionResponse",
    "QuizCreate", "QuizUpdate", "QuizPublish", "QuizResponse", "QuizStudentResponse",
    "QuizQuestionCreate", "QuizQuestionUpdate", "QuizQuestionResponse", "QuizQuestionStudentResponse",
    "QuizAttemptStartResponse", "QuizAttemptSubmit", "QuizAttemptResponse",
    "ManualGradeCreate", "GradeResponse",
    "NotificationResponse",
    "AdminDashboardResponse", "LecturerDashboardResponse", "StudentDashboardResponse"
]
