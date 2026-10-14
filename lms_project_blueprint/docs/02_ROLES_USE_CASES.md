# 02 — Roles, Use Cases & Permissions

## 1. Roles

### ADMIN
Quản trị tài khoản, khóa học và enrollment. Không mặc định được chỉnh nội dung giảng dạy thay Lecturer.

### LECTURER
Chỉ quản lý course mà `Courses.LecturerId == currentUserId`.

### STUDENT
Chỉ truy cập nội dung của course mà sinh viên có enrollment trạng thái `ACTIVE`.

## 2. Permission matrix

| Action | Admin | Lecturer | Student |
|---|---:|---:|---:|
| Manage users | ✅ | ❌ | ❌ |
| Manage course metadata | ✅ | View assigned | View enrolled |
| Enroll student | ✅ | ❌ | ❌ |
| Manage modules/lessons | ❌ | ✅ own course | ❌ |
| View published lessons | Optional | ✅ own | ✅ enrolled |
| Manage assignments | ❌ | ✅ own | ❌ |
| Submit assignment | ❌ | ❌ | ✅ enrolled |
| Grade submission | ❌ | ✅ own | ❌ |
| Manage quizzes/questions | ❌ | ✅ own | ❌ |
| Attempt quiz | ❌ | ❌ | ✅ enrolled |
| View own grades | ❌ | ❌ | ✅ |
| View course gradebook | ❌ | ✅ own | ❌ |
| Read own notifications | ✅ | ✅ | ✅ |

## 3. Main use cases

### UC-01 Login
Actor: All users.

Happy path:
1. Nhập email/password.
2. Server validate active account và password.
3. Server trả access token + user profile.
4. Client route theo role.

### UC-02 Create course
Actor: Admin.

Admin nhập course code, title, semester, year, credits, lecturer. Course code phải unique.

### UC-03 Enroll student
Actor: Admin.

Không được enroll cùng student vào cùng course hai lần.

### UC-04 Publish learning content
Actor: Lecturer.

Lecturer tạo module -> lesson -> publish. Student chỉ thấy các record `IsPublished = 1`.

### UC-05 Submit assignment
Actor: Student.

Student đã enroll, assignment đang mở. Một assignment chỉ có một submission hiện hành cho mỗi student. Cho phép cập nhật/resubmit trước deadline; sau deadline chỉ nếu `AllowLate = 1`.

### UC-06 Grade assignment
Actor: Lecturer.

Lecturer nhập score từ 0 đến MaxScore + feedback. Submission chuyển `GRADED`; grade entry được insert/update.

### UC-07 Attempt quiz
Actor: Student.

Kiểm tra quiz published, thời gian mở, enrollment, MaxAttempts. Server chấm question `SINGLE_CHOICE` và `TRUE_FALSE`.

### UC-08 View grades
Actor: Student.

Chỉ xem grade của chính mình.

## 4. Authorization rule quan trọng

Frontend có thể ẩn button nhưng **backend là nơi quyết định cuối cùng**. Không endpoint nào được authorization chỉ bằng việc client giấu UI.
