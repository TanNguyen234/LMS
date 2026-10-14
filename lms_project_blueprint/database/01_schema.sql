SET NOCOUNT ON;
GO

CREATE TABLE dbo.Users (
    UserId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Users PRIMARY KEY,
    Email NVARCHAR(150) NOT NULL,
    FullName NVARCHAR(150) NOT NULL,
    PasswordHash NVARCHAR(500) NOT NULL,
    Role VARCHAR(20) NOT NULL,
    IsActive BIT NOT NULL CONSTRAINT DF_Users_IsActive DEFAULT 1,
    StudentCode VARCHAR(30) NULL,
    StaffCode VARCHAR(30) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Users_Email UNIQUE (Email),
    CONSTRAINT CK_Users_Role CHECK (Role IN ('ADMIN','LECTURER','STUDENT'))
);
GO

CREATE TABLE dbo.Courses (
    CourseId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Courses PRIMARY KEY,
    CourseCode VARCHAR(30) NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(1000) NULL,
    LecturerId UNIQUEIDENTIFIER NOT NULL,
    Semester VARCHAR(20) NOT NULL,
    AcademicYear VARCHAR(20) NOT NULL,
    Credits TINYINT NOT NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Courses_Status DEFAULT 'ACTIVE',
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Courses_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Courses_CourseCode UNIQUE (CourseCode),
    CONSTRAINT CK_Courses_Credits CHECK (Credits BETWEEN 1 AND 10),
    CONSTRAINT CK_Courses_Status CHECK (Status IN ('DRAFT','ACTIVE','ARCHIVED')),
    CONSTRAINT FK_Courses_Lecturer FOREIGN KEY (LecturerId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.Enrollments (
    EnrollmentId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Enrollments PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    EnrolledAt DATETIME2(0) NOT NULL CONSTRAINT DF_Enrollments_EnrolledAt DEFAULT SYSUTCDATETIME(),
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Enrollments_Status DEFAULT 'ACTIVE',
    FinalScore DECIMAL(5,2) NULL,
    CONSTRAINT UQ_Enrollments_Course_Student UNIQUE (CourseId, StudentId),
    CONSTRAINT CK_Enrollments_Status CHECK (Status IN ('ACTIVE','COMPLETED','DROPPED')),
    CONSTRAINT CK_Enrollments_FinalScore CHECK (FinalScore IS NULL OR (FinalScore >= 0 AND FinalScore <= 100)),
    CONSTRAINT FK_Enrollments_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_Enrollments_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.Modules (
    ModuleId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Modules PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    SortOrder INT NOT NULL,
    Description NVARCHAR(1000) NULL,
    IsPublished BIT NOT NULL CONSTRAINT DF_Modules_IsPublished DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Modules_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Modules_SortOrder CHECK (SortOrder > 0),
    CONSTRAINT FK_Modules_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE TABLE dbo.Lessons (
    LessonId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Lessons PRIMARY KEY,
    ModuleId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    ContentHtml NVARCHAR(MAX) NULL,
    MaterialUrl NVARCHAR(500) NULL,
    SortOrder INT NOT NULL,
    IsPublished BIT NOT NULL CONSTRAINT DF_Lessons_IsPublished DEFAULT 0,
    EstimatedMinutes INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Lessons_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Lessons_SortOrder CHECK (SortOrder > 0),
    CONSTRAINT CK_Lessons_EstimatedMinutes CHECK (EstimatedMinutes IS NULL OR EstimatedMinutes > 0),
    CONSTRAINT FK_Lessons_Module FOREIGN KEY (ModuleId) REFERENCES dbo.Modules(ModuleId)
);
GO

CREATE TABLE dbo.Assignments (
    AssignmentId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Assignments PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    DueAt DATETIME2(0) NOT NULL,
    MaxScore DECIMAL(6,2) NOT NULL,
    AllowLate BIT NOT NULL CONSTRAINT DF_Assignments_AllowLate DEFAULT 0,
    AttachmentUrl NVARCHAR(500) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Assignments_Status DEFAULT 'DRAFT',
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Assignments_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Assignments_MaxScore CHECK (MaxScore > 0),
    CONSTRAINT CK_Assignments_Status CHECK (Status IN ('DRAFT','PUBLISHED','CLOSED')),
    CONSTRAINT FK_Assignments_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE TABLE dbo.Submissions (
    SubmissionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Submissions PRIMARY KEY,
    AssignmentId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    SubmittedAt DATETIME2(0) NOT NULL,
    ContentText NVARCHAR(MAX) NULL,
    FileUrl NVARCHAR(500) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Submissions_Status DEFAULT 'SUBMITTED',
    Score DECIMAL(6,2) NULL,
    Feedback NVARCHAR(2000) NULL,
    UpdatedAt DATETIME2(0) NULL,
    CONSTRAINT UQ_Submissions_Assignment_Student UNIQUE (AssignmentId, StudentId),
    CONSTRAINT CK_Submissions_Status CHECK (Status IN ('SUBMITTED','LATE','GRADED')),
    CONSTRAINT CK_Submissions_Score CHECK (Score IS NULL OR Score >= 0),
    CONSTRAINT FK_Submissions_Assignment FOREIGN KEY (AssignmentId) REFERENCES dbo.Assignments(AssignmentId),
    CONSTRAINT FK_Submissions_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.Quizzes (
    QuizId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Quizzes PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(1000) NULL,
    StartAt DATETIME2(0) NOT NULL,
    EndAt DATETIME2(0) NOT NULL,
    TimeLimitMinutes INT NOT NULL,
    MaxAttempts INT NOT NULL,
    PassingScore DECIMAL(6,2) NOT NULL,
    IsPublished BIT NOT NULL CONSTRAINT DF_Quizzes_IsPublished DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Quizzes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Quizzes_Time CHECK (EndAt > StartAt),
    CONSTRAINT CK_Quizzes_TimeLimit CHECK (TimeLimitMinutes BETWEEN 1 AND 300),
    CONSTRAINT CK_Quizzes_MaxAttempts CHECK (MaxAttempts BETWEEN 1 AND 10),
    CONSTRAINT CK_Quizzes_PassingScore CHECK (PassingScore >= 0),
    CONSTRAINT FK_Quizzes_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE TABLE dbo.QuizQuestions (
    QuestionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_QuizQuestions PRIMARY KEY,
    QuizId UNIQUEIDENTIFIER NOT NULL,
    QuestionText NVARCHAR(1000) NOT NULL,
    QuestionType VARCHAR(20) NOT NULL,
    OptionsJson NVARCHAR(MAX) NULL,
    CorrectAnswer NVARCHAR(500) NOT NULL,
    Score DECIMAL(6,2) NOT NULL,
    SortOrder INT NOT NULL,
    CONSTRAINT CK_QuizQuestions_Type CHECK (QuestionType IN ('SINGLE_CHOICE','TRUE_FALSE','SHORT_TEXT')),
    CONSTRAINT CK_QuizQuestions_Score CHECK (Score > 0),
    CONSTRAINT CK_QuizQuestions_SortOrder CHECK (SortOrder > 0),
    CONSTRAINT FK_QuizQuestions_Quiz FOREIGN KEY (QuizId) REFERENCES dbo.Quizzes(QuizId)
);
GO

CREATE TABLE dbo.QuizAttempts (
    AttemptId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_QuizAttempts PRIMARY KEY,
    QuizId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    StartedAt DATETIME2(0) NOT NULL,
    SubmittedAt DATETIME2(0) NULL,
    AttemptNo INT NOT NULL,
    AnswersJson NVARCHAR(MAX) NULL,
    Score DECIMAL(6,2) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_QuizAttempts_Status DEFAULT 'IN_PROGRESS',
    CONSTRAINT UQ_QuizAttempts_Quiz_Student_No UNIQUE (QuizId, StudentId, AttemptNo),
    CONSTRAINT CK_QuizAttempts_AttemptNo CHECK (AttemptNo > 0),
    CONSTRAINT CK_QuizAttempts_Score CHECK (Score IS NULL OR Score >= 0),
    CONSTRAINT CK_QuizAttempts_Status CHECK (Status IN ('IN_PROGRESS','SUBMITTED','EXPIRED')),
    CONSTRAINT FK_QuizAttempts_Quiz FOREIGN KEY (QuizId) REFERENCES dbo.Quizzes(QuizId),
    CONSTRAINT FK_QuizAttempts_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.Grades (
    GradeId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Grades PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    SourceType VARCHAR(20) NOT NULL,
    SourceId UNIQUEIDENTIFIER NULL,
    Score DECIMAL(6,2) NOT NULL,
    MaxScore DECIMAL(6,2) NOT NULL,
    WeightPercent DECIMAL(5,2) NULL,
    Feedback NVARCHAR(2000) NULL,
    GradedBy UNIQUEIDENTIFIER NOT NULL,
    GradedAt DATETIME2(0) NOT NULL,
    CONSTRAINT CK_Grades_SourceType CHECK (SourceType IN ('ASSIGNMENT','QUIZ','MANUAL')),
    CONSTRAINT CK_Grades_Score CHECK (Score >= 0 AND MaxScore > 0 AND Score <= MaxScore),
    CONSTRAINT CK_Grades_Weight CHECK (WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)),
    CONSTRAINT FK_Grades_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_Grades_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Grades_Grader FOREIGN KEY (GradedBy) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.Notifications (
    NotificationId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Notifications PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    Message NVARCHAR(1000) NOT NULL,
    Type VARCHAR(30) NOT NULL,
    IsRead BIT NOT NULL CONSTRAINT DF_Notifications_IsRead DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Notifications_CreatedAt DEFAULT SYSUTCDATETIME(),
    RelatedUrl NVARCHAR(500) NULL,
    CONSTRAINT CK_Notifications_Type CHECK (Type IN ('GENERAL','ASSIGNMENT','QUIZ','GRADE','COURSE')),
    CONSTRAINT FK_Notifications_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
);
GO

CREATE INDEX IX_Courses_LecturerId ON dbo.Courses(LecturerId);
CREATE INDEX IX_Enrollments_StudentId ON dbo.Enrollments(StudentId);
CREATE INDEX IX_Modules_CourseId ON dbo.Modules(CourseId);
CREATE INDEX IX_Lessons_ModuleId ON dbo.Lessons(ModuleId);
CREATE INDEX IX_Assignments_CourseId ON dbo.Assignments(CourseId);
CREATE INDEX IX_Submissions_StudentId ON dbo.Submissions(StudentId);
CREATE INDEX IX_Quizzes_CourseId ON dbo.Quizzes(CourseId);
CREATE INDEX IX_QuizQuestions_QuizId ON dbo.QuizQuestions(QuizId);
CREATE INDEX IX_QuizAttempts_StudentId ON dbo.QuizAttempts(StudentId);
CREATE INDEX IX_Grades_Course_Student ON dbo.Grades(CourseId, StudentId);
CREATE INDEX IX_Notifications_User_Read ON dbo.Notifications(UserId, IsRead);
GO
