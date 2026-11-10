# LMS Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Triển khai 8 hạng mục nâng cấp cốt lõi cho University LMS: chuẩn hóa phân cấp Khoa-Môn-Lớp, xóa emoji AI, phân quyền xóa Soft-Delete cho Giảng viên và Admin, chia điểm tự động và nhập nhanh câu hỏi trắc nghiệm, ẩn lịch Admin, hệ thống thông báo động theo sự kiện, tin nhắn realtime WebSocket giữa Giảng viên - Sinh viên, và kiểm soát hiển thị điểm kiểm tra.

**Architecture:** Sử dụng kiến trúc hiện hữu FastAPI + SQLAlchemy + MS SQL Server ở backend và React 19 + TypeScript + Vite + TailwindCSS ở frontend. Bổ sung các cột migration nhẹ nhàng vào SQL Server (Department, IsDeleted, ScoreVisibility, TotalScore...), tích hợp WebSocket native của FastAPI cho realtime chat, và cập nhật giao diện người dùng theo chuẩn không emoji với Lucide icons.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2.0, pyodbc, Microsoft SQL Server, WebSocket, React 19, TypeScript, TailwindCSS v4, Lucide-react.

**Spec:** Đã thống nhất qua phiên Brainstorming & Grill-me ngày 2026-11-10.

## Global Constraints

- Mọi thay đổi database phải an toàn với dữ liệu 115 người dùng hiện có (dùng ALTER TABLE và default constraint, không DROP dữ liệu).
- Không được đưa emoji thô (📚, 📄, 🤖, ✨,...) vào UI hoặc code; thay bằng các biểu tượng SVG tương ứng từ Lucide-react.
- Giảng viên chỉ được xóa tài nguyên thuộc quyền sở hữu của mình; thao tác xóa của Giảng viên là Soft Delete (`IsDeleted = True`), Admin vẫn có thể xem và khôi phục.
- Mật khẩu các tài khoản demo giữ nguyên: `Demo@123`.

## Review Focus

1. **Rò rỉ điểm khi Quiz ở chế độ HIDDEN hoặc AFTER_CLOSED**: Sinh viên không được phép đọc thấy điểm thông qua API nộp bài, chi tiết quiz, hay sổ điểm trước thời hạn.
2. **Quyền riêng tư trong Realtime Chat**: Sinh viên không thể gửi tin nhắn nếu Giảng viên đã tắt nhận tin hoặc nếu sinh viên bị chặn, hoặc nếu sinh viên chưa từng ghi danh lớp của giảng viên đó.
3. **Cú pháp Bulk Import**: Xử lý ngoại lệ chi tiết theo từng dòng khi file/văn bản thô không đúng định dạng Aiken hoặc tiếng Việt.
4. **Tính nhất quán của Soft Delete**: Các API lấy danh sách thông thường của GV và SV phải luôn lọc bỏ các mục đã bị xóa (`IsDeleted == False`).
5. **Đảm bảo không phá vỡ quan hệ dữ liệu cũ**: Bổ sung cột mới có giá trị DEFAULT để tránh lỗi NULL constraint trên MS SQL Server.

---

### Task 1: Database Migration & Schema Updates

**Files:**
- Create: `database/05_enhancements_migration.sql`
- Modify: `backend/app/models/models.py`
- Modify: `backend/app/schemas/schemas.py`
- Test: `backend/tests/test_enhancements_models.py`

- [ ] **Step 1: Viết script SQL migration**
  Tạo `database/05_enhancements_migration.sql` với các lệnh `ALTER TABLE` thêm cột cho `Users`, `Courses`, `Assignments`, `Quizzes`, `Modules`, `Lessons` và `CREATE TABLE Messages`, `BlockedUsers`.
- [ ] **Step 2: Chạy script migration trên SQL Server local**
  Chạy migration qua Python pyodbc/SQLAlchemy script và xác minh các cột mới được tạo thành công.
- [ ] **Step 3: Cập nhật SQLAlchemy Models**
  Cập nhật `backend/app/models/models.py` khai báo các trường mới:
  - `User.Department`, `User.IsChatEnabled`
  - `Course.SubjectCode`, `Course.IsDeleted`, `Course.DeletedAt`, `Course.DeletedBy`
  - `Assignment.IsDeleted`, `Assignment.DeletedAt`, `Assignment.DeletedBy`
  - `Quiz.TotalScore`, `Quiz.ScoreVisibility`, `Quiz.IsDeleted`, `Quiz.DeletedAt`, `Quiz.DeletedBy`
  - `Module.IsDeleted`, `Module.DeletedAt`, `Module.DeletedBy`
  - `Lesson.IsDeleted`, `Lesson.DeletedAt`, `Lesson.DeletedBy`
  - Model `Message` & `BlockedUser`.
- [ ] **Step 4: Cập nhật Pydantic Schemas**
  Cập nhật `backend/app/schemas/schemas.py` tương ứng.
- [ ] **Step 5: Viết và chạy test xác nhận model**
  Tạo `backend/tests/test_enhancements_models.py` kiểm tra schema models hợp lệ.

---

### Task 2: Dọn sạch Emoji AI & Gỡ bỏ Lịch phía Admin

**Files:**
- Modify: `frontend/src/pages/AssignmentsPage.tsx`
- Modify: `frontend/src/pages/CalendarPage.tsx`
- Modify: `frontend/src/pages/CourseDetailPage.tsx`
- Modify: `frontend/src/pages/GradesPage.tsx`
- Modify: `frontend/src/pages/QuizzesPage.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Test: `frontend` build and lint

- [ ] **Step 1: Xóa các emoji thô**
  Thay thế tất cả các emoji (📚, 📄,...) trong `AssignmentsPage.tsx`, `CalendarPage.tsx`, `CourseDetailPage.tsx`, `GradesPage.tsx`, `QuizzesPage.tsx` bằng icon `BookOpen`, `FileText`, v.v. từ `lucide-react`.
- [ ] **Step 2: Bỏ menu Lịch phía Admin**
  Cập nhật `frontend/src/components/layout/AppLayout.tsx` bỏ `'ADMIN'` khỏi `roles: ['LECTURER', 'STUDENT']` của menu `/calendar`.
- [ ] **Step 3: Kiểm tra lint và build frontend**
  Chạy `npm run lint` và `npm run build` trong `frontend` để đảm bảo không có lỗi cú pháp.

---

### Task 3: Chuẩn hóa Khoa – Giảng viên – Môn học – Lớp học phần

**Files:**
- Modify: `backend/app/api/routes/users.py`
- Modify: `backend/app/api/routes/courses.py`
- Modify: `frontend/src/pages/UsersPage.tsx`
- Modify: `frontend/src/pages/CoursesPage.tsx`
- Test: `backend/tests/test_courses_departments.py`

- [ ] **Step 1: Cập nhật API User & Course ở Backend**
  - Trong `users.py`: Cho phép cập nhật `Department` cho Giảng viên.
  - Trong `courses.py`: Cho phép truyền và trả về `SubjectCode`; hiển thị thông tin Khoa của giảng viên phụ trách.
- [ ] **Step 2: Cập nhật giao diện Admin Quản lý Người dùng**
  Cập nhật `UsersPage.tsx` cho phép chọn/nhập Khoa khi tạo hoặc sửa tài khoản Giảng viên; hiển thị cột Khoa trên bảng.
- [ ] **Step 3: Cập nhật giao diện Khóa học**
  Cập nhật `CoursesPage.tsx` hiển thị Mã môn (`SubjectCode`), Lớp (`SectionCode`), và Khoa của giảng viên phụ trách.

---

### Task 4: Phân quyền Xóa (Soft Delete Giảng viên vs Admin)

**Files:**
- Modify: `backend/app/api/routes/courses.py`
- Modify: `backend/app/api/routes/assignments.py`
- Modify: `backend/app/api/routes/quizzes.py`
- Modify: `backend/app/api/routes/content.py`
- Modify: `frontend/src/pages/CourseDetailPage.tsx`
- Modify: `frontend/src/pages/AssignmentsPage.tsx`
- Modify: `frontend/src/pages/QuizzesPage.tsx`
- Modify: `frontend/src/pages/CoursesPage.tsx`
- Test: `backend/tests/test_soft_delete.py`

- [ ] **Step 1: Cài đặt Endpoint Soft Delete & Restore ở Backend**
  - Thêm endpoint `DELETE` và `PATCH .../restore` cho Course, Assignment, Quiz, Module, Lesson.
  - Kiểm tra phân quyền: Giảng viên chỉ xóa được tài nguyên của mình (gán `IsDeleted = True`); Admin có thể chọn hard delete hoặc khôi phục.
  - Thêm bộ lọc `IsDeleted == False` vào tất cả các truy vấn danh sách thông thường.
- [ ] **Step 2: Tích hợp nút Xóa trên Giao diện Giảng viên**
  Thêm nút Xóa (icon `Trash2`) cho Giảng viên kèm modal xác nhận.
- [ ] **Step 3: Giao diện Khôi phục cho Admin**
  Cho phép Admin lọc xem các mục đã bị xóa và bấm nút Khôi phục.

---

### Task 5: Chia điểm tự động, Nhập nhanh câu hỏi Quiz & Kiểm soát hiển thị điểm

**Files:**
- Modify: `backend/app/api/routes/quizzes.py`
- Modify: `frontend/src/pages/QuizzesPage.tsx`
- Test: `backend/tests/test_quiz_features.py`

- [ ] **Step 1: Cài đặt chia điểm tự động & kiểm soát hiển thị điểm ở Backend**
  - Tự động chia đều: `score_per_question = total_score / total_questions` khi thêm/sửa câu hỏi hoặc đổi tổng điểm.
  - Thêm kiểm tra `ScoreVisibility` (`IMMEDIATE`, `AFTER_CLOSED`, `HIDDEN`): Ẩn điểm trong kết quả nộp bài, chi tiết bài làm và bảng điểm của học sinh nếu chưa đến hạn hoặc bị ẩn.
- [ ] **Step 2: Cài đặt Endpoint Bulk Import Câu hỏi**
  Endpoint `POST /api/quizzes/{id}/questions/bulk-import`:
  - Phân tích cú pháp Aiken và dạng tiếng Việt.
  - Bắt lỗi chi tiết từng dòng (thiếu đáp án, ít hơn 2 lựa chọn, sai format) và trả về `400 Bad Request`.
- [ ] **Step 3: Cập nhật giao diện Quiz ở Frontend**
  - Thêm ô nhập "Tổng điểm" và "Chế độ hiển thị điểm" trong form Quiz.
  - Thêm Modal "Nhập nhanh câu hỏi" với khung hướng dẫn cú pháp mẫu, ô paste văn bản thô, nút Preview và bảng câu hỏi được phân tích.

---

### Task 6: Hệ thống Thông báo động (Dynamic Notifications)

**Files:**
- Create: `backend/app/services/notification_service.py`
- Modify: `backend/app/api/routes/assignments.py`
- Modify: `backend/app/api/routes/quizzes.py`
- Modify: `backend/app/api/routes/content.py`
- Modify: `backend/app/api/routes/courses.py`
- Modify: `backend/app/api/routes/notifications.py`
- Modify: `frontend/src/pages/NotificationsPage.tsx`
- Test: `backend/tests/test_dynamic_notifications.py`

- [ ] **Step 1: Xây dựng Service sinh Thông báo tự động**
  Tạo `notification_service.py` cung cấp hàm `notify_users(user_ids, title, message, type, related_url)`.
- [ ] **Step 2: Kích hoạt thông báo tại các sự kiện học tập**
  - Giao bài tập mới / Xuất bản bài tập -> thông báo cho toàn bộ sinh viên đã ghi danh.
  - Xuất bản Quiz mới -> thông báo cho sinh viên trong lớp.
  - Xuất bản bài giảng/chương mới -> thông báo cho sinh viên.
  - Sinh viên nộp bài -> thông báo cho Giảng viên phụ trách.
  - Giảng viên chấm điểm -> thông báo cho Sinh viên.
  - Admin ghi danh sinh viên -> thông báo cho Sinh viên.
- [ ] **Step 3: Thêm Endpoint Broadcast cho Admin & Giảng viên**
  Thêm `POST /api/notifications/broadcast` để gửi thông báo lớp học hoặc toàn trường.
- [ ] **Step 4: Cập nhật giao diện Thông báo ở Frontend**
  Cập nhật `NotificationsPage.tsx` và Header Notification Popover hiển thị các thông báo động với liên kết chuyển hướng.

---

### Task 7: Nhắn tin Realtime Giảng viên – Sinh viên (WebSocket & REST)

**Files:**
- Create: `backend/app/api/routes/chat.py`
- Modify: `backend/app/main.py`
- Create: `frontend/src/pages/MessagesPage.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `backend/tests/test_chat_realtime.py`

- [ ] **Step 1: Xây dựng Backend Chat REST & WebSocket**
  - Tạo `backend/app/api/routes/chat.py` với `ConnectionManager` quản lý kết nối WebSocket.
  - API `GET /api/chat/contacts`: Trả về danh sách liên hệ hợp lệ (Sinh viên học lớp của GV; Giảng viên dạy sinh viên).
  - API `GET /api/chat/messages/{contact_id}`: Lấy lịch sử chat.
  - API `POST /api/chat/toggle-status`: Giảng viên bật/tắt nhận tin.
  - API `POST /api/chat/block/{student_id}` và `unblock`: Giảng viên chặn/bỏ chặn sinh viên.
  - WebSocket `/api/ws/chat/{user_id}`: Nhận tin nhắn, kiểm tra quyền và phát realtime tới người nhận.
- [ ] **Step 2: Đăng ký router Chat vào FastAPI**
  Đăng ký router `chat` trong `backend/app/main.py`.
- [ ] **Step 3: Xây dựng giao diện Trang Tin nhắn (`/messages`)**
  Tạo `frontend/src/pages/MessagesPage.tsx`:
  - Khung danh sách hội thoại bên trái, có tìm kiếm và nhãn môn học.
  - Khung hội thoại bên phải hiển thị bong bóng chat, thời gian, trạng thái gửi/nhận realtime.
  - Phía Giảng viên: Switch "Bật/Tắt nhận tin nhắn", nút "Chặn sinh viên này".
- [ ] **Step 4: Thêm Menu và Badge Tin nhắn trên Header**
  Thêm mục "Tin nhắn" vào Sidebar/Navbar và huy hiệu báo số tin nhắn chưa đọc.

---

### Task 8: Tổng kiểm tra & Đánh giá Chất lượng (Verification & Review)

**Files:**
- All modified files
- Verification commands

- [ ] **Step 1: Chạy toàn bộ test suite Backend**
  Chạy pytest kiểm tra toàn bộ các tính năng mới và các hợp đồng API.
- [ ] **Step 2: Kiểm tra Frontend Build & Lint**
  Chạy `npm run lint` và `npm run build` trong `frontend`.
- [ ] **Step 3: Chạy Code Review**
  Kiểm tra chất lượng mã nguồn, phát hiện và khắc phục các vấn đề còn sót lại.
- [ ] **Step 4: Báo cáo kết quả kiểm thử hoàn tất cho người dùng**
