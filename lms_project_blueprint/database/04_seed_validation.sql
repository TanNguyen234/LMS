SET NOCOUNT ON;

-- Mỗi bảng seed phải có ít nhất 10 dòng.
SELECT 'Users' AS TableName, COUNT(*) AS RowCount FROM dbo.Users
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

-- Expected: no rows
SELECT e.*
FROM dbo.Enrollments e
LEFT JOIN dbo.Users u ON u.UserId=e.StudentId
WHERE u.UserId IS NULL OR u.Role <> 'STUDENT';

-- Expected: no rows
SELECT c.*
FROM dbo.Courses c
LEFT JOIN dbo.Users u ON u.UserId=c.LecturerId
WHERE u.UserId IS NULL OR u.Role <> 'LECTURER';

-- Expected: no rows
SELECT s.*
FROM dbo.Submissions s
JOIN dbo.Assignments a ON a.AssignmentId=s.AssignmentId
LEFT JOIN dbo.Enrollments e ON e.CourseId=a.CourseId AND e.StudentId=s.StudentId AND e.Status='ACTIVE'
WHERE e.EnrollmentId IS NULL;

-- Expected: no rows
SELECT qa.*
FROM dbo.QuizAttempts qa
JOIN dbo.Quizzes q ON q.QuizId=qa.QuizId
LEFT JOIN dbo.Enrollments e ON e.CourseId=q.CourseId AND e.StudentId=qa.StudentId AND e.Status='ACTIVE'
WHERE e.EnrollmentId IS NULL;

-- Expected: 10 demo accounts before app initializes passwords.
SELECT COUNT(*) AS SentinelPasswordCount
FROM dbo.Users
WHERE PasswordHash='__SET_ON_FIRST_RUN__';
