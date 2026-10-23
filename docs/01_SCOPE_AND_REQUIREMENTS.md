# 01 — Scope & Requirements

> **Course constraint:** Đây là prototype minh họa cho đồ án cuối kỳ môn Quản lý dự án phần mềm. Scope phải đủ để demo/acceptance nhưng không được mở rộng thành LMS enterprise.

## 1. Problem statement

Trường đại học cần một LMS tập trung để giảng viên cung cấp nội dung học tập, giao bài, tổ chức quiz và chấm điểm; sinh viên có thể truy cập môn học đã đăng ký, nộp bài, làm quiz và theo dõi kết quả.

## 2. Project objective

Trong phạm vi project, xây dựng web LMS đáp ứng các luồng học tập cốt lõi cho 3 role: Admin, Lecturer, Student.

## 3. In scope

### Authentication
- Login bằng email/password.
- Logout phía client bằng việc xóa token.
- `/me` lấy profile hiện tại.
- RBAC theo `ADMIN`, `LECTURER`, `STUDENT`.

### Admin
- Danh sách/tìm kiếm user.
- Tạo user.
- Sửa thông tin và trạng thái active.
- Tạo/sửa/đóng course.
- Gán lecturer phụ trách course.
- Enroll sinh viên vào course.

### Lecturer
- Xem course được phân công.
- Tạo/sửa/publish module.
- Tạo/sửa/publish lesson.
- Tạo assignment và deadline.
- Xem submissions, chấm điểm, feedback.
- Tạo quiz, question và đáp án.
- Xem attempts.
- Nhập điểm manual nếu cần.

### Student
- Xem course đã enroll.
- Xem module/lesson đã publish.
- Xem/nộp assignment.
- Làm quiz trong thời gian mở.
- Xem điểm và feedback.
- Xem notification.

### Shared
- Dashboard cơ bản theo role.
- Pagination + search cho danh sách lớn.
- Audit bằng timestamp ở các entity chính, chưa cần audit-log table riêng.

## 4. Out of scope

- Đăng ký môn học tự phục vụ.
- Payment.
- Live class/video conference.
- Chat/message realtime.
- Plagiarism detection.
- SCORM/LTI.
- AI tutoring.
- Native mobile app.
- SSO enterprise.
- Multi-campus tenancy.

## 5. Functional requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-01 | User login bằng email/password | Must |
| FR-02 | Backend enforce RBAC | Must |
| FR-03 | Admin CRUD user | Must |
| FR-04 | Admin CRUD course | Must |
| FR-05 | Admin enroll student | Must |
| FR-06 | Lecturer quản lý module/lesson | Must |
| FR-07 | Lecturer quản lý assignment | Must |
| FR-08 | Student submit assignment | Must |
| FR-09 | Lecturer grade submission | Must |
| FR-10 | Lecturer tạo quiz/question | Must |
| FR-11 | Student submit quiz attempt | Must |
| FR-12 | Hệ thống auto-score SINGLE_CHOICE/TRUE_FALSE | Must |
| FR-13 | Student xem grades | Must |
| FR-14 | Notification list/mark-read | Should |
| FR-15 | Dashboard summary | Should |

## 6. Non-functional requirements

- NFR-01: API trả lỗi chuẩn ProblemDetails hoặc envelope nhất quán.
- NFR-02: Password phải được hash bằng password hasher an toàn.
- NFR-03: Endpoint protected không được tin role/userId do client truyền lên.
- NFR-04: Query list có pagination mặc định 20, tối đa 100.
- NFR-05: Thời gian phản hồi API CRUD thông thường mục tiêu < 1 giây trong local demo dataset.
- NFR-06: UTC được dùng trong backend/database cho timestamp mới; UI render theo local time.
- NFR-07: Không expose stack trace ở Production.
- NFR-08: CORS cấu hình bằng environment.
- NFR-09: Secrets nằm trong environment/user-secrets, không commit.
- NFR-10: Source build được từ clean checkout theo README.

## 7. Success criteria

Một buổi demo hoàn chỉnh phải thực hiện được:

1. Admin login và tạo/enroll user.
2. Lecturer login, mở course và publish lesson.
3. Lecturer tạo assignment và quiz.
4. Student login, đọc lesson, submit assignment và quiz.
5. Lecturer chấm assignment.
6. Student refresh và xem điểm/feedback.
7. Role trái phép gọi API bị 401/403.


## 8. Quản lý các yêu cầu cải tiến chưa được phê duyệt

Bản cơ sở phạm vi này giữ nguyên **FR-01 đến FR-15**, WBS, mốc 20 tuần và ngân sách kế hoạch 1,2 tỷ VND theo `docs/08_PROJECT_MANAGEMENT.md`. Các chức năng bổ sung đã triển khai thử nghiệm trên nhánh `feat/student-workload-and-dashboard-20261023` **không tự động trở thành yêu cầu bắt buộc hay tiêu chí nghiệm thu dự án**. Xem đề xuất tại `docs/project-management/14_CHANGE_REQUEST_2026-10-23.md` và báo cáo `docs/audit/2026-10-23_PM_SCOPE_REVIEW.md`. Chỉ thay đổi baseline khi có quyết định trong quy trình Change Control và có cập nhật đầy đủ WBS, CPM, ngân sách, yêu cầu, test/UAT tương ứng.
