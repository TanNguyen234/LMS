# Ghi chú Triển khai Kỹ thuật (Implementation Notes)
## Dự án: University Learning Management System (LMS)

Tài liệu này ghi lại các quyết định thiết kế kỹ thuật, kiến trúc hệ thống, giải pháp tương thích môi trường Windows / SQL Server và cơ chế bảo mật thực tế trong mã nguồn hiện hành.

---

## 1. Quyết định Kiến trúc Cốt lõi (Architecture Decisions)

### 1.1. Kiến trúc Modular Monolith tích hợp Realtime Hub
- **Bối cảnh:** Đồ án môn Quản lý dự án phần mềm với baseline 20 tuần / 1,2 tỷ VNĐ, sau đó mở rộng thêm các phân hệ Học kỳ, Thời khóa biểu thông minh, Kho tệp an toàn (File Vault), Lớp học trực tuyến (WebRTC/WebSocket) và Trợ lý học thuật AI.
- **Quyết định:** Triển khai theo mô hình **Modular Monolith** trên một tiến trình FastAPI kết hợp `RealtimeHub` nội bộ (`backend/app/realtime/manager.py`) thay vì tách Microservices hay phụ thuộc bắt buộc vào Kafka/RabbitMQ/Redis.
- **Lý do:**
  1. Đảm bảo toàn vẹn giao dịch ACID trên 21 bảng Microsoft SQL Server trong cùng phiên kết nối.
  2. Triển khai, đóng gói và chạy nghiệm thu một chạm trên máy Windows cục bộ thông qua `START_SYSTEM.bat` mà không cần hạ tầng container phức tạp.
  3. Cho phép Trợ lý AI hoạt động ở chế độ kép: kết nối Google Gemini khi có `GEMINI_API_KEY` hoặc tự động chuyển sang bộ trích xuất cục bộ tất định (`LOCAL_FALLBACK`).

### 1.2. Chuẩn hóa Thời gian UTC (`DATETIME2(0)`)
- Toàn bộ cột thời gian trong ORM và SQL Server sử dụng định danh **PascalCase** (`CreatedAt`, `UpdatedAt`, `DueAt`, `StartedAt`, `SubmittedAt`, `GradedAt`, `StartDate`, `EndDate`, `StartAt`, `EndAt`) với kiểu `DATETIME2(0)` lưu trữ theo chuẩn **UTC naive** thông qua hàm `utcnow()` (`datetime.now(timezone.utc).replace(tzinfo=None)` trong `backend/app/models/models.py` và `UtcDateTimeColumn`).
- Tầng API chuẩn hóa chuỗi ISO-8601 UTC khi trả dữ liệu và tầng Presentation (Frontend) định dạng sang múi giờ người dùng (`Asia/Ho_Chi_Minh`, `GMT+7`).

---

## 2. Giải pháp Kỹ thuật & Tương thích Môi trường (Engineering Workarounds)

### 2.1. Khắc phục Lỗi Precision Driver ODBC SQL Server (`HY104`) & Tự động chọn Driver
- **Vấn đề:** Driver mặc định trên Windows (`SQL Server` / ODBC Driver 17/18) khi kết hợp với SQLAlchemy 2.x và kiểu `DECIMAL` / `NVARCHAR(MAX)` có thể phát sinh lỗi `Invalid precision value (0) (SQLBindParameter - HY104)` nếu bật `use_setinputsizes=True`.
- **Giải pháp thực tế trong mã nguồn:**
  1. Trong `backend/app/core/config.py`, hàm `resolve_database_url` tự động dò danh sách `pyodbc.drivers()` trên máy Windows (ưu tiên `ODBC Driver 18 for SQL Server` -> `ODBC Driver 17` -> `SQL Server`) và hỗ trợ biến môi trường `LMS_E2E_TEST_DATABASE` để cô lập CSDL kiểm thử `UniversityLms_Test_<id>`.
  2. Trong `backend/app/db/session.py` (và `backend/alembic/env.py`), cấu hình `engine` tắt `use_setinputsizes`:
     ```python
     engine = create_engine(
         settings.DATABASE_URL,
         pool_pre_ping=True,
         pool_recycle=3600,
         use_setinputsizes=False,
         echo=False,
     )
     ```
  3. Tại tầng ORM `backend/app/models/models.py`, các trường điểm và trọng số (`MaxScore`, `Score`, `PassingScore`, `FinalScore`, `WeightPercent`) được khai báo bằng `Numeric(6, 2, asdecimal=False)` / `Numeric(5, 2, asdecimal=False)` để khớp chính xác với cột `DECIMAL(6,2)` / `DECIMAL(5,2)` trong `database/01_schema.sql` đồng thời trả về `float` thuận tiện cho tầng dịch vụ Python.

### 2.2. Khởi tạo Mật khẩu Sentinel & Đồng bộ Dữ liệu Demo Tương đối
- Trong `database/02_seed.sql`, 10 tài khoản mẫu sử dụng giá trị sentinel `PasswordHash = '__SET_ON_FIRST_RUN__'`.
- Khi ứng dụng khởi động trong môi trường `APP_ENV=development` (`backend/app/main.py` lifespan), hàm `init_development_passwords` (`backend/app/db/init_db.py`) băm mật khẩu `Demo@123` bằng `bcrypt` cho các tài khoản sentinel, sau đó gọi `ensure_demo_seed` (`backend/app/db/seed_demo.py`) để cập nhật mốc hạn nộp tương đối (`utcnow + N days`), khởi tạo tệp PDF/Markdown mẫu trong `backend/storage/vault/seed/`, đồng bộ học kỳ `AcademicSemesters` và lịch học `CourseSessions`.
- Lifespan đồng thời dọn dẹp các phòng học `LIVE` mồ côi từ phiên chạy trước (`cleanup_stale_live_meetings`) và tự động lưu trữ các học kỳ đã quá hạn ân hạn (`sync_expired_semesters_and_courses`).

### 2.3. Phục vụ Giao diện SPA An toàn trực tiếp từ FastAPI
- Trong `backend/app/main.py`, khi thư mục `frontend/dist/` tồn tại, FastAPI mount `/assets` và đăng ký route SPA fallback kèm cơ chế bảo vệ kép:
  1. `resolve_spa_file` kiểm tra `candidate.relative_to(resolved_root)` nhằm chặn tấn công leo thang thư mục (path traversal).
  2. Các tiền tố dành riêng (`/api`, `/uploads`, `/assets`, `/docs`), đường dẫn hệ thống (`/openapi.json`, `/health`), và mọi đường dẫn mang phần mở rộng tài nguyên tĩnh không tồn tại (`.pdf`, `.png`, `.jpg`, `.svg`, `.js`, `.css`, `.ico`, `.map`, `.woff2`, `.json`) đều trả về `404 JSONResponse` thay vì trả nhầm `index.html`.

---

## 3. Cơ chế Bảo mật và Phân quyền (Security & Isolation)

1. **Xác thực & Phân quyền Server-side (RBAC):**
   - Dependency `get_current_user` (`backend/app/core/dependencies.py`) giải mã JWT lấy `sub` (`UserId`), truy vấn trực tiếp bảng `Users` trong SQL Server để kiểm tra `IsActive == True` và đọc `user.Role` thực tế từ CSDL (không tin cậy mù quáng payload phía client).
   - Hàm `require_roles(allowed_roles)` cùng các dependency chuyên biệt (`require_admin`, `require_lecturer`, `require_student`, `require_admin_or_lecturer`) bảo vệ chặt chẽ từng nhóm endpoint.
2. **Cô lập Khóa học & Bảo vệ Học kỳ Lưu trữ (Course & Semester Isolation):**
   - `verify_lecturer_course_owner` và `verify_course_write_access` đảm bảo giảng viên chỉ thao tác trên học phần được phân công (`course.LecturerId == current_user.UserId`), sinh viên phải có bản ghi `Enrollments.Status == 'ACTIVE'`, và các khóa học/học kỳ ở trạng thái `ARCHIVED` được chuyển sang chế độ chỉ đọc (read-only).
3. **Bảo vệ Kho tệp (Secure File Vault):**
   - Tệp tải lên qua `POST /api/files/upload` (`backend/app/api/routes/files.py`) được lưu bên ngoài webroot (`backend/storage/vault`), kiểm tra kích thước/MIME, băm `SHA-256`, và chỉ phát trực tuyến qua `GET /api/files/{file_id}/content` (hỗ trợ HTTP 206 Partial Content + `X-Content-Type-Options: nosniff`) sau khi xác thực quyền đọc theo từng `Scope` (`LESSON`, `ASSIGNMENT`, `SUBMISSION`, `CHAT`, `SEED`).
4. **Bảo vệ Đáp án Bí mật của Quiz (Quiz Answer Protection):**
   - Các schema dành cho sinh viên (`QuizStudentResponse`, `QuizQuestionStudentResponse`, `QuizAttemptStartResponse`) và bộ lọc `STUDENT_OPTION_FIELDS` trong `backend/app/api/routes/quizzes.py` loại bỏ hoàn toàn trường `CorrectAnswer` (`correctAnswer`) cùng mọi metadata đáp án khỏi JSON trả về.
5. **Kiểm soát Hạn nộp & Chính sách Nộp trễ (`AllowLate`):**
   - Trong `backend/app/api/routes/assignments.py`, khi thời điểm nộp vượt quá `DueAt`: nếu `AllowLate == False`, server từ chối với `400 Bad Request: "Assignment deadline has passed and late submissions are not allowed"`; nếu `AllowLate == True`, bài nộp được chấp nhận và gắn trạng thái `Status = "LATE"`. Bài đã chấm (`GRADED`) không thể bị ghi đè bởi sinh viên.

---

## 4. Tổ chức Kiểm thử Tự động (Automated Verification Suite)

Thư mục `backend/tests/` bao gồm **16 module kiểm thử (`pytest`)** với cơ chế bảo vệ an toàn trong `backend/tests/conftest.py` (từ chối chạy kiểm thử tích hợp nếu tên CSDL không bắt đầu bằng `UniversityLms_Test_`):

| Nhóm Kiểm thử | Các Module Tiêu biểu trong `backend/tests/` | Phạm vi Kiểm chứng |
| :--- | :--- | :--- |
| **Nghiệp vụ cốt lõi (AC-01..AC-10)** | `test_acceptance.py`, `test_foundation_contracts.py`, `test_forensic_contracts.py` | Đăng nhập JWT, RBAC 403, cô lập khóa học, ghi danh duy nhất, ẩn bài nháp, hạn nộp `AllowLate`, đồng bộ `Grades`, giới hạn lượt Quiz, ẩn `CorrectAnswer`, quyền sở hữu thông báo |
| **Luồng học tập mở rộng & QA** | `test_learning_flows.py`, `test_live_qa_regressions.py`, `test_challenger_recon.py`, `test_recon2_challenger.py` | Tự ghi danh / JoinCode, lưu nháp & chấm tự luận `SHORT_TEXT`, bảng điểm trọng số & Transcript, xử lý đồng thời (concurrency) và hết hạn phiên thi |
| **Kho tệp & Nội dung bài học** | `test_files_and_content.py`, `test_auth_users_demo.py`, `test_wave2_main.py` | Tải tệp File Vault, trích xuất PDF, HTTP 206 Range streaming, nhập CSV người dùng, Demo Switcher, SPA fallback 404 guards |
| **Học kỳ, Thời khóa biểu & Quy mô lớn** | `test_semesters_and_scale.py`, `test_schedules_and_conflicts.py` | Vòng đời `AcademicSemesters`, tự động lưu trữ quá hạn, nhập hàng loạt & nhân bản khóa học sang kỳ mới, phát hiện trùng lịch giảng viên/sinh viên/phòng học |
| **Lớp học trực tuyến & Trợ lý AI** | `test_meetings_and_teams.py`, `test_meeting_lifecycle.py`, `test_realtime_classroom.py`, `test_ai_assistant.py` | Phòng họp trực tuyến, WebSocket điều phối/biểu quyết/bảng trắng/chat, nhật ký chuyên cần, AI Lesson Tutor / Quiz Generator / Feedback Suggest |
