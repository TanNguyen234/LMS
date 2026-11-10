-- Migration Script: LMS Enhancements
-- Idempotent script for MS SQL Server

SET NOCOUNT ON;

-- 1. Users table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'Department')
BEGIN
    ALTER TABLE dbo.Users ADD Department NVARCHAR(100) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Users') AND name = 'IsChatEnabled')
BEGIN
    ALTER TABLE dbo.Users ADD IsChatEnabled BIT NOT NULL CONSTRAINT DF_Users_IsChatEnabled DEFAULT 1;
END;

-- 2. Courses table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Courses') AND name = 'SubjectCode')
BEGIN
    ALTER TABLE dbo.Courses ADD SubjectCode VARCHAR(30) NULL;
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Courses') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.Courses ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Courses_IsDeleted DEFAULT 0;
    ALTER TABLE dbo.Courses ADD DeletedAt DATETIME2(0) NULL;
    ALTER TABLE dbo.Courses ADD DeletedBy UNIQUEIDENTIFIER NULL;
END;

-- 3. Assignments table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Assignments') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.Assignments ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Assignments_IsDeleted DEFAULT 0;
    ALTER TABLE dbo.Assignments ADD DeletedAt DATETIME2(0) NULL;
    ALTER TABLE dbo.Assignments ADD DeletedBy UNIQUEIDENTIFIER NULL;
END;

-- 4. Quizzes table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quizzes') AND name = 'TotalScore')
BEGIN
    ALTER TABLE dbo.Quizzes ADD TotalScore FLOAT NOT NULL CONSTRAINT DF_Quizzes_TotalScore DEFAULT 10.0;
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quizzes') AND name = 'ScoreVisibility')
BEGIN
    ALTER TABLE dbo.Quizzes ADD ScoreVisibility VARCHAR(20) NOT NULL CONSTRAINT DF_Quizzes_ScoreVisibility DEFAULT 'IMMEDIATE';
END;

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Quizzes') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.Quizzes ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Quizzes_IsDeleted DEFAULT 0;
    ALTER TABLE dbo.Quizzes ADD DeletedAt DATETIME2(0) NULL;
    ALTER TABLE dbo.Quizzes ADD DeletedBy UNIQUEIDENTIFIER NULL;
END;

-- 5. Modules table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Modules') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.Modules ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Modules_IsDeleted DEFAULT 0;
    ALTER TABLE dbo.Modules ADD DeletedAt DATETIME2(0) NULL;
    ALTER TABLE dbo.Modules ADD DeletedBy UNIQUEIDENTIFIER NULL;
END;

-- 6. Lessons table additions
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Lessons') AND name = 'IsDeleted')
BEGIN
    ALTER TABLE dbo.Lessons ADD IsDeleted BIT NOT NULL CONSTRAINT DF_Lessons_IsDeleted DEFAULT 0;
    ALTER TABLE dbo.Lessons ADD DeletedAt DATETIME2(0) NULL;
    ALTER TABLE dbo.Lessons ADD DeletedBy UNIQUEIDENTIFIER NULL;
END;

-- 7. Messages table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Messages')
BEGIN
    CREATE TABLE dbo.Messages (
        MessageId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_Messages PRIMARY KEY,
        SenderId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Messages_Sender FOREIGN KEY REFERENCES dbo.Users(UserId),
        ReceiverId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_Messages_Receiver FOREIGN KEY REFERENCES dbo.Users(UserId),
        Content NVARCHAR(2000) NOT NULL,
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_Messages_CreatedAt DEFAULT SYSUTCDATETIME(),
        IsRead BIT NOT NULL CONSTRAINT DF_Messages_IsRead DEFAULT 0
    );
    CREATE INDEX IX_Messages_Sender_Receiver ON dbo.Messages (SenderId, ReceiverId, CreatedAt);
END;

-- 8. BlockedUsers table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BlockedUsers')
BEGIN
    CREATE TABLE dbo.BlockedUsers (
        BlockId UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_BlockedUsers PRIMARY KEY,
        LecturerId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_BlockedUsers_Lecturer FOREIGN KEY REFERENCES dbo.Users(UserId),
        StudentId UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_BlockedUsers_Student FOREIGN KEY REFERENCES dbo.Users(UserId),
        CreatedAt DATETIME2(0) NOT NULL CONSTRAINT DF_BlockedUsers_CreatedAt DEFAULT SYSUTCDATETIME(),
        Reason NVARCHAR(500) NULL,
        CONSTRAINT UQ_BlockedUsers_Lecturer_Student UNIQUE (LecturerId, StudentId)
    );
END;

-- 9. Backfill SubjectCode for existing Courses if null
UPDATE dbo.Courses
SET SubjectCode = SUBSTRING(CourseCode, 1, CHARINDEX('-', CourseCode + '-') - 1)
WHERE SubjectCode IS NULL AND CourseCode IS NOT NULL;

-- 10. Backfill Department for Lecturers
UPDATE dbo.Users
SET Department = N'Khoa Công nghệ Thông tin'
WHERE Role = 'LECTURER' AND (Department IS NULL OR Department = '');
