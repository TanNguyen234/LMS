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
    JoinCode VARCHAR(20) NULL,
    AllowSelfEnroll BIT NOT NULL CONSTRAINT DF_Courses_AllowSelfEnroll DEFAULT 0,
    MaxStudents INT NULL,
    Category NVARCHAR(100) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Courses_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_Courses_CourseCode UNIQUE (CourseCode),
    CONSTRAINT CK_Courses_Credits CHECK (Credits BETWEEN 1 AND 10),
    CONSTRAINT CK_Courses_Status CHECK (Status IN ('DRAFT','ACTIVE','ARCHIVED')),
    CONSTRAINT CK_Courses_MaxStudents CHECK (MaxStudents IS NULL OR MaxStudents > 0),
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
    CONSTRAINT CK_Modules_SortOrder CHECK (SortOrder >= 0),
    CONSTRAINT FK_Modules_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE TABLE dbo.Meetings (
    MeetingId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Meetings PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    HostId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    RoomCode VARCHAR(100) NOT NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Meetings_Status DEFAULT 'LIVE',
    StartedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Meetings_StartedAt DEFAULT SYSUTCDATETIME(),
    EndedAt DATETIME2(0) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Meetings_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Meetings_Status CHECK (Status IN ('SCHEDULED','LIVE','ENDED')),
    CONSTRAINT FK_Meetings_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_Meetings_Host FOREIGN KEY (HostId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.MeetingLogs (
    LogId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_MeetingLogs PRIMARY KEY,
    MeetingId UNIQUEIDENTIFIER NOT NULL,
    UserId UNIQUEIDENTIFIER NOT NULL,
    JoinedAt DATETIME2(0) NOT NULL CONSTRAINT DF_MeetingLogs_JoinedAt DEFAULT SYSUTCDATETIME(),
    LeftAt DATETIME2(0) NULL,
    DurationSeconds INT NOT NULL CONSTRAINT DF_MeetingLogs_DurationSeconds DEFAULT 0,
    ChatCount INT NOT NULL CONSTRAINT DF_MeetingLogs_ChatCount DEFAULT 0,
    HandRaisesCount INT NOT NULL CONSTRAINT DF_MeetingLogs_HandRaisesCount DEFAULT 0,
    ActivitySummary NVARCHAR(500) NULL,
    CONSTRAINT CK_MeetingLogs_NonNegative CHECK (DurationSeconds >= 0 AND ChatCount >= 0 AND HandRaisesCount >= 0),
    CONSTRAINT FK_MeetingLogs_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId),
    CONSTRAINT FK_MeetingLogs_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.StoredFiles (
    FileId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_StoredFiles PRIMARY KEY,
    OwnerId UNIQUEIDENTIFIER NOT NULL,
    CourseId UNIQUEIDENTIFIER NULL,
    Scope VARCHAR(30) NOT NULL,
    OriginalName NVARCHAR(255) NOT NULL,
    StoredPath NVARCHAR(500) NOT NULL,
    MimeType VARCHAR(120) NOT NULL,
    SizeBytes BIGINT NOT NULL,
    Sha256 VARCHAR(64) NOT NULL,
    ExtractedText NVARCHAR(MAX) NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_StoredFiles_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_StoredFiles_Scope CHECK (Scope IN ('LESSON','ASSIGNMENT','SUBMISSION','CHAT','SEED')),
    CONSTRAINT CK_StoredFiles_SizeBytes CHECK (SizeBytes > 0),
    CONSTRAINT FK_StoredFiles_Owner FOREIGN KEY (OwnerId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_StoredFiles_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE TABLE dbo.Lessons (
    LessonId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Lessons PRIMARY KEY,
    ModuleId UNIQUEIDENTIFIER NOT NULL,
    Title NVARCHAR(200) NOT NULL,
    ContentHtml NVARCHAR(MAX) NULL,
    MaterialUrl NVARCHAR(500) NULL,
    ContentType VARCHAR(20) NOT NULL CONSTRAINT DF_Lessons_ContentType DEFAULT 'TEXT',
    AttachmentFileId UNIQUEIDENTIFIER NULL,
    SortOrder INT NOT NULL,
    IsPublished BIT NOT NULL CONSTRAINT DF_Lessons_IsPublished DEFAULT 0,
    EstimatedMinutes INT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Lessons_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Lessons_SortOrder CHECK (SortOrder >= 0),
    CONSTRAINT CK_Lessons_EstimatedMinutes CHECK (EstimatedMinutes IS NULL OR EstimatedMinutes >= 0),
    CONSTRAINT CK_Lessons_ContentType CHECK (ContentType IN ('TEXT','PDF','VIDEO','SLIDE')),
    CONSTRAINT FK_Lessons_Module FOREIGN KEY (ModuleId) REFERENCES dbo.Modules(ModuleId),
    CONSTRAINT FK_Lessons_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId)
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
    AttachmentFileId UNIQUEIDENTIFIER NULL,
    WeightPercent DECIMAL(5,2) NULL,
    RubricJson NVARCHAR(MAX) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Assignments_Status DEFAULT 'DRAFT',
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Assignments_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Assignments_MaxScore CHECK (MaxScore > 0),
    CONSTRAINT CK_Assignments_WeightPercent CHECK (WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)),
    CONSTRAINT CK_Assignments_Status CHECK (Status IN ('DRAFT','PUBLISHED','CLOSED')),
    CONSTRAINT FK_Assignments_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_Assignments_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId)
);
GO

CREATE TABLE dbo.Submissions (
    SubmissionId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Submissions PRIMARY KEY,
    AssignmentId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    SubmittedAt DATETIME2(0) NOT NULL,
    ContentText NVARCHAR(MAX) NULL,
    FileUrl NVARCHAR(500) NULL,
    FileId UNIQUEIDENTIFIER NULL,
    RubricScoresJson NVARCHAR(MAX) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_Submissions_Status DEFAULT 'SUBMITTED',
    Score DECIMAL(6,2) NULL,
    Feedback NVARCHAR(2000) NULL,
    UpdatedAt DATETIME2(0) NULL,
    CONSTRAINT UQ_Submissions_Assignment_Student UNIQUE (AssignmentId, StudentId),
    CONSTRAINT CK_Submissions_Status CHECK (Status IN ('SUBMITTED','LATE','GRADED')),
    CONSTRAINT CK_Submissions_Score CHECK (Score IS NULL OR Score >= 0),
    CONSTRAINT FK_Submissions_Assignment FOREIGN KEY (AssignmentId) REFERENCES dbo.Assignments(AssignmentId),
    CONSTRAINT FK_Submissions_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_Submissions_File FOREIGN KEY (FileId) REFERENCES dbo.StoredFiles(FileId)
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
    WeightPercent DECIMAL(5,2) NULL,
    ScoreVisibility VARCHAR(30) NOT NULL CONSTRAINT DF_Quizzes_ScoreVisibility DEFAULT 'AFTER_CLOSE',
    IsPublished BIT NOT NULL CONSTRAINT DF_Quizzes_IsPublished DEFAULT 0,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Quizzes_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_Quizzes_Time CHECK (EndAt > StartAt),
    CONSTRAINT CK_Quizzes_TimeLimit CHECK (TimeLimitMinutes BETWEEN 1 AND 300),
    CONSTRAINT CK_Quizzes_MaxAttempts CHECK (MaxAttempts BETWEEN 1 AND 10),
    CONSTRAINT CK_Quizzes_PassingScore CHECK (PassingScore >= 0),
    CONSTRAINT CK_Quizzes_WeightPercent CHECK (WeightPercent IS NULL OR (WeightPercent >= 0 AND WeightPercent <= 100)),
    CONSTRAINT CK_Quizzes_ScoreVisibility CHECK (ScoreVisibility IN ('SCORE_ONLY','AFTER_ATTEMPT','AFTER_CLOSE')),
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
    CONSTRAINT CK_QuizQuestions_SortOrder CHECK (SortOrder >= 0),
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
    QuestionResultsJson NVARCHAR(MAX) NULL,
    Score DECIMAL(6,2) NULL,
    Status VARCHAR(20) NOT NULL CONSTRAINT DF_QuizAttempts_Status DEFAULT 'IN_PROGRESS',
    CONSTRAINT UQ_QuizAttempts_Quiz_Student_No UNIQUE (QuizId, StudentId, AttemptNo),
    CONSTRAINT CK_QuizAttempts_AttemptNo CHECK (AttemptNo > 0),
    CONSTRAINT CK_QuizAttempts_Score CHECK (Score IS NULL OR Score >= 0),
    CONSTRAINT CK_QuizAttempts_Status CHECK (Status IN ('IN_PROGRESS','SUBMITTED','EXPIRED','PENDING_REVIEW')),
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
    ItemTitle NVARCHAR(200) NULL,
    Score DECIMAL(6,2) NOT NULL,
    MaxScore DECIMAL(6,2) NOT NULL,
    WeightPercent DECIMAL(5,2) NULL,
    Feedback NVARCHAR(2000) NULL,
    GradedBy UNIQUEIDENTIFIER NOT NULL,
    GradedAt DATETIME2(0) NOT NULL,
    CONSTRAINT CK_Grades_SourceType CHECK (SourceType IN ('ASSIGNMENT','QUIZ','MIDTERM','FINAL','MANUAL')),
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

CREATE TABLE dbo.CourseMessages (
    MessageId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_CourseMessages PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    MeetingId UNIQUEIDENTIFIER NULL,
    SenderId UNIQUEIDENTIFIER NOT NULL,
    MessageType VARCHAR(20) NOT NULL CONSTRAINT DF_CourseMessages_MessageType DEFAULT 'TEXT',
    Content NVARCHAR(MAX) NOT NULL,
    AttachmentUrl NVARCHAR(500) NULL,
    AttachmentFileId UNIQUEIDENTIFIER NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_CourseMessages_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_CourseMessages_MessageType CHECK (MessageType IN ('TEXT','SYSTEM','FILE')),
    CONSTRAINT FK_CourseMessages_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_CourseMessages_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId),
    CONSTRAINT FK_CourseMessages_Sender FOREIGN KEY (SenderId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_CourseMessages_AttachmentFile FOREIGN KEY (AttachmentFileId) REFERENCES dbo.StoredFiles(FileId)
);
GO

CREATE TABLE dbo.WhiteboardSnapshots (
    SnapshotId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_WhiteboardSnapshots PRIMARY KEY,
    CourseId UNIQUEIDENTIFIER NOT NULL,
    MeetingId UNIQUEIDENTIFIER NULL,
    StrokesJson NVARCHAR(MAX) NOT NULL CONSTRAINT DF_WhiteboardSnapshots_StrokesJson DEFAULT N'[]',
    UpdatedBy UNIQUEIDENTIFIER NOT NULL,
    UpdatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_WhiteboardSnapshots_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_WhiteboardSnapshots_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId),
    CONSTRAINT FK_WhiteboardSnapshots_Meeting FOREIGN KEY (MeetingId) REFERENCES dbo.Meetings(MeetingId),
    CONSTRAINT FK_WhiteboardSnapshots_Updater FOREIGN KEY (UpdatedBy) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.LessonProgress (
    ProgressId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_LessonProgress PRIMARY KEY,
    LessonId UNIQUEIDENTIFIER NOT NULL,
    StudentId UNIQUEIDENTIFIER NOT NULL,
    IsCompleted BIT NOT NULL CONSTRAINT DF_LessonProgress_IsCompleted DEFAULT 0,
    CompletedAt DATETIME2(0) NULL,
    LastViewedAt DATETIME2(0) NOT NULL CONSTRAINT DF_LessonProgress_LastViewedAt DEFAULT SYSUTCDATETIME(),
    TimeSpentSeconds INT NOT NULL CONSTRAINT DF_LessonProgress_TimeSpent DEFAULT 0,
    CONSTRAINT UQ_LessonProgress_Lesson_Student UNIQUE (LessonId, StudentId),
    CONSTRAINT CK_LessonProgress_TimeSpent CHECK (TimeSpentSeconds >= 0),
    CONSTRAINT FK_LessonProgress_Lesson FOREIGN KEY (LessonId) REFERENCES dbo.Lessons(LessonId),
    CONSTRAINT FK_LessonProgress_Student FOREIGN KEY (StudentId) REFERENCES dbo.Users(UserId)
);
GO

CREATE TABLE dbo.AiInteractionLogs (
    LogId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_AiInteractionLogs PRIMARY KEY,
    UserId UNIQUEIDENTIFIER NOT NULL,
    CourseId UNIQUEIDENTIFIER NULL,
    Feature VARCHAR(40) NOT NULL,
    ProviderMode VARCHAR(30) NOT NULL,
    PromptSummary NVARCHAR(500) NOT NULL,
    CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_AiInteractionLogs_CreatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_AiInteractionLogs_Feature CHECK (Feature IN ('LESSON_TUTOR','QUIZ_GENERATOR','GRADING_FEEDBACK')),
    CONSTRAINT CK_AiInteractionLogs_Provider CHECK (ProviderMode IN ('GEMINI','LOCAL_FALLBACK')),
    CONSTRAINT FK_AiInteractionLogs_User FOREIGN KEY (UserId) REFERENCES dbo.Users(UserId),
    CONSTRAINT FK_AiInteractionLogs_Course FOREIGN KEY (CourseId) REFERENCES dbo.Courses(CourseId)
);
GO

CREATE INDEX IX_Courses_LecturerId ON dbo.Courses(LecturerId);
CREATE UNIQUE INDEX UQ_Courses_JoinCode ON dbo.Courses(JoinCode) WHERE JoinCode IS NOT NULL;
CREATE INDEX IX_Enrollments_StudentId ON dbo.Enrollments(StudentId);
CREATE INDEX IX_Modules_CourseId ON dbo.Modules(CourseId);
CREATE INDEX IX_Lessons_ModuleId ON dbo.Lessons(ModuleId);
CREATE INDEX IX_Assignments_CourseId ON dbo.Assignments(CourseId);
CREATE INDEX IX_Submissions_StudentId ON dbo.Submissions(StudentId);
CREATE INDEX IX_Quizzes_CourseId ON dbo.Quizzes(CourseId);
CREATE INDEX IX_QuizQuestions_QuizId ON dbo.QuizQuestions(QuizId);
CREATE INDEX IX_QuizAttempts_StudentId ON dbo.QuizAttempts(StudentId);
CREATE INDEX IX_Grades_Course_Student ON dbo.Grades(CourseId, StudentId);
CREATE UNIQUE INDEX UQ_Grades_Source_Learner
    ON dbo.Grades(CourseId, StudentId, SourceType, SourceId)
    WHERE SourceId IS NOT NULL;
CREATE INDEX IX_Notifications_User_Read ON dbo.Notifications(UserId, IsRead, CreatedAt);
CREATE INDEX IX_Meetings_CourseId ON dbo.Meetings(CourseId);
CREATE INDEX IX_Meetings_HostId ON dbo.Meetings(HostId);
CREATE INDEX IX_Meetings_RoomCode ON dbo.Meetings(RoomCode);
CREATE INDEX IX_MeetingLogs_MeetingId ON dbo.MeetingLogs(MeetingId);
CREATE INDEX IX_MeetingLogs_UserId ON dbo.MeetingLogs(UserId);
CREATE INDEX IX_CourseMessages_CourseId ON dbo.CourseMessages(CourseId);
CREATE INDEX IX_CourseMessages_MeetingId ON dbo.CourseMessages(MeetingId);
CREATE INDEX IX_CourseMessages_SenderId ON dbo.CourseMessages(SenderId);
CREATE INDEX IX_StoredFiles_OwnerId ON dbo.StoredFiles(OwnerId);
CREATE INDEX IX_StoredFiles_CourseId ON dbo.StoredFiles(CourseId);
CREATE INDEX IX_WhiteboardSnapshots_CourseId ON dbo.WhiteboardSnapshots(CourseId);
CREATE INDEX IX_WhiteboardSnapshots_MeetingId ON dbo.WhiteboardSnapshots(MeetingId);
CREATE INDEX IX_LessonProgress_LessonId ON dbo.LessonProgress(LessonId);
CREATE INDEX IX_LessonProgress_StudentId ON dbo.LessonProgress(StudentId);
CREATE INDEX IX_AiInteractionLogs_UserId ON dbo.AiInteractionLogs(UserId);
CREATE INDEX IX_AiInteractionLogs_CourseId ON dbo.AiInteractionLogs(CourseId);
GO
