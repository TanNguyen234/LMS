-- 1. Courses của một sinh viên
SELECT c.CourseCode, c.Title, e.Status
FROM dbo.Enrollments e
JOIN dbo.Courses c ON c.CourseId = e.CourseId
WHERE e.StudentId = '00000000-0000-0000-0000-000000000005';

-- 2. Courses của Lecturer 1
SELECT CourseCode, Title, Semester, AcademicYear
FROM dbo.Courses
WHERE LecturerId = '00000000-0000-0000-0000-000000000002';

-- 3. Published lesson của course CS101
SELECT m.Title AS ModuleTitle, l.Title AS LessonTitle, l.MaterialUrl
FROM dbo.Modules m
JOIN dbo.Lessons l ON l.ModuleId = m.ModuleId
WHERE m.CourseId = '10000000-0000-0000-0000-000000000001'
  AND m.IsPublished = 1 AND l.IsPublished = 1
ORDER BY m.SortOrder, l.SortOrder;

-- 4. Submission pending grading
SELECT a.Title, u.FullName, s.SubmittedAt, s.Status
FROM dbo.Submissions s
JOIN dbo.Assignments a ON a.AssignmentId = s.AssignmentId
JOIN dbo.Users u ON u.UserId = s.StudentId
WHERE s.Status IN ('SUBMITTED','LATE');

-- 5. Grade của Student1
SELECT c.CourseCode, g.SourceType, g.Score, g.MaxScore, g.Feedback
FROM dbo.Grades g
JOIN dbo.Courses c ON c.CourseId = g.CourseId
WHERE g.StudentId = '00000000-0000-0000-0000-000000000005'
ORDER BY g.GradedAt DESC;

-- 6. Unread notifications
SELECT Title, Message, CreatedAt
FROM dbo.Notifications
WHERE UserId = '00000000-0000-0000-0000-000000000005' AND IsRead = 0
ORDER BY CreatedAt DESC;

-- 7. Enrollment count per course
SELECT c.CourseCode, c.Title, COUNT(e.EnrollmentId) AS StudentCount
FROM dbo.Courses c
LEFT JOIN dbo.Enrollments e ON e.CourseId = c.CourseId AND e.Status = 'ACTIVE'
GROUP BY c.CourseCode, c.Title
ORDER BY StudentCount DESC, c.CourseCode;

-- 8. Quiz result
SELECT q.Title, u.FullName, qa.AttemptNo, qa.Score, qa.Status
FROM dbo.QuizAttempts qa
JOIN dbo.Quizzes q ON q.QuizId = qa.QuizId
JOIN dbo.Users u ON u.UserId = qa.StudentId
ORDER BY qa.SubmittedAt DESC;

-- 9. Lecturer gradebook view
SELECT c.CourseCode, s.FullName AS StudentName, g.SourceType, g.Score, g.MaxScore
FROM dbo.Grades g
JOIN dbo.Courses c ON c.CourseId = g.CourseId
JOIN dbo.Users s ON s.UserId = g.StudentId
WHERE c.LecturerId = '00000000-0000-0000-0000-000000000002'
ORDER BY c.CourseCode, s.FullName;

-- 10. Dashboard counts
SELECT
  (SELECT COUNT(*) FROM dbo.Users WHERE Role='STUDENT' AND IsActive=1) AS ActiveStudents,
  (SELECT COUNT(*) FROM dbo.Users WHERE Role='LECTURER' AND IsActive=1) AS ActiveLecturers,
  (SELECT COUNT(*) FROM dbo.Courses WHERE Status='ACTIVE') AS ActiveCourses,
  (SELECT COUNT(*) FROM dbo.Submissions WHERE Status IN ('SUBMITTED','LATE')) AS PendingSubmissions;
