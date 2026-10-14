# Ghi chú Triển khai Kỹ thuật (Implementation Notes)
## Dự án: University Learning Management System (LMS)

Tài liệu này ghi lại các quyết định thiết kế kỹ thuật, kiến trúc hệ thống, giải pháp khắc phục sự cố môi trường và kết quả kiểm thử thực nghiệm trong quá trình xây dựng sản phẩm.

---

## 1. Quyết định Kiến trúc Cốt lõi (Architecture Decisions)

### 1.1. Lựa chọn Kiến trúc Modular Monolith
- **Bối cảnh:** Dự án có quy mô thời gian 20 tuần và ngân sách 1.2 tỷ VND cho môi trường trường đại học.
- **Quyết định:** Triển khai theo mô hình **Modular Monolith** thay vì Microservices hoặc Event-Driven Architecture (Kafka/RabbitMQ/Redis).
- **Lý do:**
  1. Loại bỏ chi phí vận hành mạng và độ trễ phân tán (network latency).
  2. Đảm bảo tính toàn vẹn giao dịch ACID trên Microsoft SQL Server trong cùng một phiên kết nối.
  3. Dễ dàng triển khai, đóng gói và kiểm thử nghiệm thu trên máy cục bộ hoặc máy chủ đơn lẻ của trường đại học.

### 1.2. Chuẩn hóa Định dạng Thời gian UTC
- Toàn bộ các mốc thời gian (`created_at`, `updated_at`, `due_date`, `started_at`, `submitted_at`, `graded_at`) được lưu trữ và xử lý theo chuẩn UTC (`datetime.now(timezone.utc)`).
- Chuyển đổi định dạng giờ địa phương (Việt Nam `GMT+7`) được thực hiện đồng nhất tại tầng Presentation (Frontend).

---

## 2. Giải pháp Kỹ thuật & Khắc phục Sự cố Môi trường (Engineering Workarounds)

### 2.1. Lỗi Precision Driver ODBC SQL Server (`HY104` / `24000`)
- **Vấn đề:** Khi sử dụng driver mặc định `[Microsoft][ODBC SQL Server Driver]` với SQLAlchemy 2.x, SQLAlchemy kích hoạt cơ chế `use_setinputsizes=True` để bind tham số kiểu `Numeric(5, 2)` hoặc `Decimal`. Điều này gây ra lỗi ODBC:
  `[Microsoft][ODBC SQL Server Driver]Invalid precision value (0) (SQLBindParameter)`
- **Giải pháp:**
  1. Trong `backend/app/db/session.py`, thiết lập cờ `use_setinputsizes=False` trong hàm `create_engine`:
     ```python
     engine = create_engine(
         settings.SQLALCHEMY_DATABASE_URI,
         pool_pre_ping=True,
         use_setinputsizes=False,
     )
     ```
  2. Tại tầng ORM Model `models.py`, ánh xạ các trường điểm số dưới dạng `Float` thay cho `Numeric` để tương thích hoàn toàn với kiểu `DECIMAL(5, 2)` của SQL Server.

### 2.2. Khởi tạo Mật khẩu Môi trường Phát triển (Development Password Seeder)
- Trong kịch bản mẫu ban đầu `02_seed.sql`, trường mật khẩu của 10 tài khoản người dùng được lưu trữ dưới dạng placeholder `__SET_ON_FIRST_RUN__`.
- Nhóm phát triển đã tích hợp hàm `init_development_passwords` trong `backend/app/db/init_db.py`. Khi backend khởi động, hàm này tự động phát hiện placeholder và băm mật khẩu thành chuỗi Bcrypt tương ứng với mật khẩu `Demo@123`, đảm bảo tính an toàn và tiện lợi cho việc kiểm thử ngay lập tức.

### 2.3. Cung cấp Giao diện SPA trực tiếp từ FastAPI
- Để tối ưu hóa quy trình bàn giao, file `backend/app/main.py` được tích hợp cơ chế phát hiện thư mục `frontend/dist/`.
- Khi bản build tĩnh sẵn sàng, FastAPI tự động mount `/assets` và định tuyến toàn bộ các request không thuộc `/api`, `/docs`, `/health` về `index.html`. Nhờ đó, người vận hành chỉ cần khởi động backend là có thể truy cập toàn bộ hệ sinh thái LMS qua trình duyệt tại cổng `8000`.

---

## 3. Cơ chế Bảo mật và Phân quyền (Security & Isolation)

1. **Phân quyền dựa trên vai trò (Role-Based Access Control - RBAC):**
   - Bộ giải mã JWT kiểm tra trường `role` trong payload (`ADMIN`, `LECTURER`, `STUDENT`).
   - Sử dụng FastAPI Dependency `require_role([...])` bảo vệ các endpoint nhạy cảm (quản lý người dùng, tạo khóa học, chấm điểm).
2. **Cô lập dữ liệu khóa học (Course Isolation):**
   - Giảng viên chỉ được phép chỉnh sửa bài giảng, bài tập, câu hỏi quiz của các khóa học được phân công (`lecturer_id == current_user.id`).
   - Admin có quyền can thiệp toàn cục.
3. **Bảo vệ Đáp án Bí mật của Quiz (Quiz Answer Protection):**
   - Khi sinh viên tải thông tin đề thi Quiz (`GET /api/quizzes/{id}`), hệ thống sử dụng schema `QuizStudentResponse` tự động lược bỏ trường `correct_option_id`.
   - Sinh viên chỉ nhận được điểm số sau khi đã hoàn thành và nộp toàn bộ bài làm lên server để hệ thống chấm điểm tự động.
4. **Kiểm tra Hạn chót Nộp bài (Deadline Enforcement):**
   - Khi sinh viên nộp bài tập, hệ thống kiểm tra thời điểm nộp với trường `due_date`. Nếu đã quá hạn, hệ thống trả về mã lỗi `400 Bad Request: Assignment deadline has passed`.

---

## 4. Bằng chứng Kiểm thử Chấp nhận (Acceptance Test Verification)

Toàn bộ 10 tiêu chí nghiệm thu được kiểm thử độc lập thông qua `pytest` với thư viện `TestClient` kết nối tới CSDL SQL Server thực:

| Mã AC | Tên Tiêu chí Chấp nhận | Kết quả Thực nghiệm | Thời gian Thực thi |
| :--- | :--- | :--- | :--- |
| **AC-01** | Xác thực đăng nhập thành công và cấp JWT Token | **PASSED** | 0.82s |
| **AC-02** | Phân quyền RBAC chặn sinh viên truy cập tài nguyên Admin (403) | **PASSED** | 0.54s |
| **AC-03** | Giảng viên không thể chỉnh sửa khóa học của giảng viên khác (403) | **PASSED** | 0.56s |
| **AC-04** | Ngăn chặn sinh viên ghi danh trùng lặp vào cùng 1 khóa học (400) | **PASSED** | 0.49s |
| **AC-05** | Sinh viên không thể xem bài giảng đang ở trạng thái Draft (404) | **PASSED** | 0.51s |
| **AC-06** | Từ chối nhận bài tập sau khi đã hết hạn nộp (400) | **PASSED** | 0.48s |
| **AC-07** | Chấm điểm bài nộp đồng bộ chính xác vào Sổ điểm (Grades table) | **PASSED** | 0.65s |
| **AC-08** | Giới hạn số lần làm bài Quiz của sinh viên (400 khi vượt quá) | **PASSED** | 0.58s |
| **AC-09** | Ẩn hoàn toàn đáp án trắc nghiệm khi sinh viên lấy đề thi Quiz | **PASSED** | 0.45s |
| **AC-10** | Sinh viên chỉ được xem và đánh dấu thông báo của chính mình (403) | **PASSED** | 0.52s |

**Tổng kết:** 10/10 kiểm thử đạt yêu cầu (100% Passed).
