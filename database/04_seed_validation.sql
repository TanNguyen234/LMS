SET NOCOUNT ON;

DECLARE @Errors INT = 0;
DECLARE @Count INT = 0;

-- 1. Check Row Counts (At least 10 rows per table)
DECLARE @tbl VARCHAR(50);
DECLARE @TableCounts TABLE (TableName VARCHAR(50), [Count] INT);

INSERT INTO @TableCounts (TableName, [Count])
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

SELECT * FROM @TableCounts;

SELECT @Count = COUNT(*) FROM @TableCounts WHERE [Count] < 10;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: One or more seed tables have fewer than 10 rows!', 16, 1);
    SET @Errors = @Errors + 1;
END

-- 2. Verify Enrollments target valid STUDENT users
SELECT @Count = COUNT(*)
FROM dbo.Enrollments e
LEFT JOIN dbo.Users u ON u.UserId=e.StudentId
WHERE u.UserId IS NULL OR u.Role <> 'STUDENT';
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d enrollment(s) target non-student or missing users!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 3. Verify Courses target valid LECTURER users
SELECT @Count = COUNT(*)
FROM dbo.Courses c
LEFT JOIN dbo.Users u ON u.UserId=c.LecturerId
WHERE u.UserId IS NULL OR u.Role <> 'LECTURER';
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d course(s) target non-lecturer or missing users!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 4. Verify Submissions are by enrolled students
SELECT @Count = COUNT(*)
FROM dbo.Submissions s
JOIN dbo.Assignments a ON a.AssignmentId=s.AssignmentId
LEFT JOIN dbo.Enrollments e ON e.CourseId=a.CourseId AND e.StudentId=s.StudentId AND e.Status='ACTIVE'
WHERE e.EnrollmentId IS NULL;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d submission(s) exist without active course enrollment!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

-- 5. Verify Quiz Attempts are by enrolled students
SELECT @Count = COUNT(*)
FROM dbo.QuizAttempts qa
JOIN dbo.Quizzes q ON q.QuizId=qa.QuizId
LEFT JOIN dbo.Enrollments e ON e.CourseId=q.CourseId AND e.StudentId=qa.StudentId AND e.Status='ACTIVE'
WHERE e.EnrollmentId IS NULL;
IF @Count > 0
BEGIN
    RAISERROR('ERROR: %d quiz attempt(s) exist without active course enrollment!', 16, 1, @Count);
    SET @Errors = @Errors + 1;
END

IF @Errors = 0
    PRINT 'SUCCESS: Seed validation passed 12 tables x 10 rows and referential integrity checks.';
ELSE
    RAISERROR('VALIDATION FAILED with %d error condition(s).', 16, 1, @Errors);

