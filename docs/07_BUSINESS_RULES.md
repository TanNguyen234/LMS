# 07 — Business Rules

## BR-01 Account
- Chỉ `IsActive = 1` được login.
- Email normalize lowercase trước khi query/create.

## BR-02 Role integrity
- LecturerId của course phải là active LECTURER.
- Enrollment/Submission/QuizAttempt student phải là STUDENT.

## BR-03 Course access
- Admin: quản trị metadata/enrollment.
- Lecturer: chỉ content của own course.
- Student: chỉ course có ACTIVE enrollment.

## BR-04 Publication
- Student không thấy module/lesson/quiz chưa publish.
- Lecturer vẫn thấy draft.

## BR-05 Assignment submission
- Student phải enrolled.
- Trước deadline: được submit/update.
- Sau deadline: chỉ nếu `AllowLate = 1`.
- Mỗi student/assignment có tối đa một submission row; resubmit là update row.

## BR-06 Assignment grading
- `0 <= Score <= MaxScore`.
- Chấm xong `Submission.Status = GRADED`.
- Upsert một `Grades` row tương ứng.

## BR-07 Quiz availability
Quiz chỉ start khi:
- `IsPublished = 1`
- current time >= StartAt
- current time <= EndAt
- student enrolled
- số attempt đã submit/start chưa vượt MaxAttempts

## BR-08 Quiz scoring
- `SINGLE_CHOICE`: exact match key/string normalized.
- `TRUE_FALSE`: normalized boolean/string.
- `SHORT_TEXT`: chưa được hỗ trợ trong MVP hiện tại; API từ chối loại này vì UI không có luồng trả lời dạng văn bản. Nếu mở rộng sau này, phải có quy trình chấm tay rõ ràng và không được so chuỗi để auto-score. Seed chỉ dùng SINGLE_CHOICE/TRUE_FALSE.

## BR-09 Quiz attempt
- AttemptNo do server tính.
- Student không được submit attempt của người khác.
- Attempt submitted không sửa lại.
- Score không vượt tổng Score của questions.

## BR-10 Grades
- Student chỉ xem grade của mình.
- Lecturer chỉ xem/edit grade của own course.
- `WeightPercent` là optional; nếu tổng weight không bằng 100 vẫn cho tồn tại trong MVP nhưng dashboard phải ghi là unweighted/incomplete.

## BR-11 Notifications
- User chỉ đọc/update notification của chính mình.

## BR-12 Data deletion
- Không hard-delete submission, attempt, grade trong UI.
- Course/user ưu tiên status inactive/archived.
