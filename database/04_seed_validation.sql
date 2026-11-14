SET NOCOUNT ON;

DECLARE @Errors INT = 0;
DECLARE @Count INT = 0;

-- 1. Check Core Row Counts (At least 10 rows per core table)
DECLARE @CoreCounts TABLE (TableName VARCHAR(50), [Count] INT);
INSERT INTO @CoreCounts (TableName, [Count])
SELECT 'Users', COUNT(*) FROM dbo.Users
UNION ALL SELECT 'Courses', COUNT(*) FROM dbo.Courses
UNION ALL SELECT 'Enrollments', COUNT(*) FROM dbo.Enrollments
UNION ALL SELECT 'Modules', COUNT(*) FROM dbo.Modules
UNION ALL SELECT 'Lessons', COUNT(*) FROM dbo.Lessons
UNION ALL SELECT 'Assignments', COUNT(*) FROM dbo.Assignments
UNION ALL SELECT 'Submissions', COUNT(*) FROM dbo.Submissions
UNION ALL SELECT 'Quizzes', COUNT(*) FROM dbo.Quizzes
UNION ALL SELECT 'QuizQuestions', COUNT(*) FROM dbo.QuizQuestions
UNION ALL SELECT 'QuizAttempts', COUNT(*) FROM dbo.QuizAttempts
UNION ALL SELECT 'Grades', COUNT(*) FROM dbo.Grades
UNION ALL SELECT 'Notifications', COUNT(*) FROM dbo.Notifications;

DECLARE @ExtendedCounts TABLE (TableName VARCHAR(50), [Count] INT);
INSERT INTO @ExtendedCounts (TableName, [Count])
SELECT 'Meetings', COUNT(*) FROM dbo.Meetings
UNION ALL SELECT 'MeetingLogs', COUNT(*) FROM dbo.MeetingLogs
UNION ALL SELECT 'CourseMessages', COUNT(*) FROM dbo.CourseMessages
UNION ALL SELECT 'StoredFiles', COUNT(*) FROM dbo.StoredFiles
UNION ALL SELECT 'WhiteboardSnapshots', COUNT(*) FROM dbo.WhiteboardSnapshots
UNION ALL SELECT 'LessonProgress', COUNT(*) FROM dbo.LessonProgress
UNION ALL SELECT 'AiInteractionLogs', COUNT(*) FROM dbo.AiInteractionLogs;

SELECT * FROM @CoreCounts
UNION ALL
SELECT * FROM @ExtendedCounts;

SELECT @Count = COUNT(*) FROM @CoreCounts WHERE [Count] < 10;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: One or more core seed tables have fewer than 10 rows!', 16, 1);
    SET @Errors = @Errors + 1;
END

-- 2. Verify all 19 tables exist
SELECT @Count = COUNT(*)
FROM sys.tables
WHERE schema_id = SCHEMA_ID('dbo')
  AND name IN (
      'Users','Courses','Enrollments','Modules','Lessons',
      'Assignments','Submissions','Quizzes','QuizQuestions','QuizAttempts',
      'Grades','Notifications','Meetings','MeetingLogs','CourseMessages',
      'StoredFiles','WhiteboardSnapshots','LessonProgress','AiInteractionLogs'
  );
IF @Count <> 19
BEGIN
    RAISERROR('ERROR: Expected 19 tables in dbo schema, found %d!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 3. Verify Enrollments target valid STUDENT users
SELECT @Count = COUNT(*)
FROM dbo.Enrollments e
LEFT JOIN dbo.Users u ON u.UserId=e.StudentId
WHERE u.UserId IS NULL OR u.Role <> 'STUDENT';
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d enrollment(s) target non-student or missing users!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 4. Verify Courses target valid LECTURER users
SELECT @Count = COUNT(*)
FROM dbo.Courses c
LEFT JOIN dbo.Users u ON u.UserId=c.LecturerId
WHERE u.UserId IS NULL OR u.Role <> 'LECTURER';
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d course(s) target non-lecturer or missing users!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 5. Verify Submissions belong to enrolled students
SELECT @Count = COUNT(*)
FROM dbo.Submissions s
JOIN dbo.Assignments a ON a.AssignmentId=s.AssignmentId
LEFT JOIN dbo.Enrollments e ON e.CourseId=a.CourseId AND e.StudentId=s.StudentId AND e.Status IN ('ACTIVE','COMPLETED')
WHERE e.EnrollmentId IS NULL;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d submission(s) exist without course enrollment!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 6. Verify Quiz Attempts belong to enrolled students
SELECT @Count = COUNT(*)
FROM dbo.QuizAttempts qa
JOIN dbo.Quizzes q ON q.QuizId=qa.QuizId
LEFT JOIN dbo.Enrollments e ON e.CourseId=q.CourseId AND e.StudentId=qa.StudentId AND e.Status IN ('ACTIVE','COMPLETED')
WHERE e.EnrollmentId IS NULL;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d quiz attempt(s) exist without course enrollment!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

IF @Errors = 0
    PRINT 'SUCCESS: Seed validation passed 19-table schema check, 12 core tables >=10 rows, and referential integrity checks.';
ELSE
    RAISERROR('VALIDATION FAILED with %d error condition(s).', 16, 1, @Errors);
