> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 05 — Từ điển Cấu trúc Phân chia Công việc (WBS Dictionary)

> Tài liệu này chi tiết hóa các gói công việc chính (Work Packages) ở cấp độ 2 và cấp độ 3 theo đúng chuẩn quản lý dự án học thuật, làm cơ sở phân công tài nguyên, dự toán chi phí và nghiệm thu sản phẩm.

---

### Gói công việc: WBS 1.1 — Xác lập và phê duyệt Dự án
- **WBS ID:** 1.1
- **Tên gói công việc:** Xác lập và phê duyệt Dự án (Project Chartering)
- **Mô tả:** Soạn thảo điều lệ dự án, xác định bài toán nghiệp vụ, mục tiêu SMART, ngân sách trần 1,2 tỷ VNĐ, thời hạn 20 tuần và trình duyệt Ban Giám hiệu.
- **Người phụ trách (Owner):** Project Manager (PM)
- **Đầu vào (Inputs):** Định hướng đào tạo của nhà trường, đề cương môn học Quản lý dự án phần mềm.
- **Đầu ra / Kết quả bàn giao (Outputs):** Bản Project Charter có chữ ký phê duyệt.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Đầy đủ mục tiêu, ngân sách 1,2 tỷ VNĐ, 20 tuần, được Sponsor ký duyệt tại mốc M1 (Cuối Tuần 2).
- **Thời lượng & Công số (Duration/Effort):** 2 tuần / 80 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Không có (Bắt đầu dự án).
- **Rủi ro & Ghi chú:** Rủi ro kỳ vọng của các phòng ban không thống nhất; giải quyết bằng họp tham vấn sớm.

---

### Gói công việc: WBS 2.2 — Đặc tả Yêu cầu phần mềm
- **WBS ID:** 2.2
- **Tên gói công việc:** Đặc tả Yêu cầu phần mềm (SRS & Use Cases)
- **Mô tả:** Khảo sát chi tiết nhu cầu học vụ, xây dựng tài liệu đặc tả 15 yêu cầu chức năng (FR-01 đến FR-15) và 10 yêu cầu phi chức năng (NFR-01 đến NFR-10).
- **Người phụ trách (Owner):** Business Analyst (BA)
- **Đầu vào (Inputs):** Project Charter, biên bản phỏng vấn cán bộ đào tạo và giảng viên.
- **Đầu ra / Kết quả bàn giao (Outputs):** Tài liệu SRS, Danh sách Use Cases, Bảng ma trận truy vết yêu cầu (RTM).
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Phân định ranh giới In-scope / Out-of-scope rõ ràng, tiêu chí nghiệm thu kiểm thử được, không có yêu cầu mâu thuẫn.
- **Thời lượng & Công số (Duration/Effort):** 2 tuần (Tuần 3-4) / 80 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 1.1 (Charter phê duyệt).
- **Rủi ro & Ghi chú:** Phạm vi phình to (Scope creep); cần bám sát quy tắc Stop Rule của đồ án.

---

### Gói công việc: WBS 3.1 — Kế hoạch Quản lý Dự án Tổng thể
- **WBS ID:** 3.1
- **Tên gói công việc:** Kế hoạch Quản lý Dự án (PM Plans & Baselines)
- **Mô tả:** Xây dựng các bản cơ sở: Tiến độ (Schedule baseline & CPM), Chi phí (Budget baseline 1,2 tỷ VNĐ), Rủi ro (Risk Register), Chất lượng (Quality Plan), Truyền thông và Quản lý thay đổi.
- **Người phụ trách (Owner):** Project Manager (PM)
- **Đầu vào (Inputs):** Scope Baseline (WBS), định mức tiền lương, phân bổ nguồn lực.
- **Đầu ra / Kết quả bàn giao (Outputs):** Hồ sơ Kế hoạch Quản lý Dự án tích hợp đầy đủ các kế hoạch thành phần.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Mọi số liệu (20 tuần, 1,2 tỷ VNĐ, 8 nhân sự/8.5 FTE) phải đối soát khớp nhau 100%, đường găng CPM được tính toán bằng công thức toán học.
- **Thời lượng & Công số (Duration/Effort):** 2 tuần (Tuần 5-6) / 80 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 2.2 và WBS 2.3 (Scope baseline).
- **Rủi ro & Ghi chú:** Số liệu không nhất quán giữa các chương; cần dùng 1 baseline duy nhất.

---

### Gói công việc: WBS 3.3 — Thiết kế Kiến trúc & Cơ sở dữ liệu
- **WBS ID:** 3.3
- **Tên gói công việc:** Thiết kế Kiến trúc & CSDL SQL Server (Architecture & DB Design)
- **Mô tả:** Thiết kế kiến trúc Modular Monolith trên FastAPI, mô hình quan hệ CSDL 12 bảng trên SQL Server, đặc tả RESTful API theo chuẩn OpenAPI/Swagger.
- **Người phụ trách (Owner):** Backend Lead Developer
- **Đầu vào (Inputs):** SRS, Use Cases, quy tắc nghiệp vụ BR-01 đến BR-12.
- **Đầu ra / Kết quả bàn giao (Outputs):** Tài liệu Kiến trúc, Sơ đồ ERD, Script DDL `01_schema.sql`, Đặc tả API `05_API_SPEC.md`.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** 12 bảng chuẩn hóa, khóa chính GUID, khóa ngoại có ràng buộc toàn vẹn, API spec bao phủ toàn bộ use case core.
- **Thời lượng & Công số (Duration/Effort):** 2 tuần (Tuần 5-6) / 80 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 2.2.
- **Rủi ro & Ghi chú:** Lạm dụng thiết kế phức tạp (over-engineering); tuân thủ nguyên tắc Modular Monolith.

---

### Gói công việc: WBS 4.1 — Khởi tạo môi trường & Dữ liệu mẫu
- **WBS ID:** 4.1
- **Tên gói công việc:** Khởi tạo Môi trường & Hạ tầng CSDL (Bootstrap & Seed Data)
- **Mô tả:** Thiết lập cấu trúc dự án backend (FastAPI, SQLAlchemy, Alembic) và frontend (React, Vite, TS), kết nối SQL Server, nạp dữ liệu mẫu 10 dòng/bảng và cơ chế khởi tạo mật khẩu phát triển `Demo@123`.
- **Người phụ trách (Owner):** Backend Developer & DevOps
- **Đầu vào (Inputs):** `01_schema.sql`, `02_seed.sql`, cấu hình môi trường `.env`.
- **Đầu ra / Kết quả bàn giao (Outputs):** Hệ thống khởi động sạch, endpoint `/health` trả về 200, CSDL đủ 12 bảng và 120 dòng seed data.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** `04_seed_validation.sql` kiểm tra pass 100%, không bản ghi mồ côi, mật khẩu sentinel được hash chuẩn.
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 7) / 40 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 3.3.
- **Rủi ro & Ghi chú:** Lỗi driver ODBC; sử dụng SQL Server driver thích hợp trên Windows.

---

### Gói công việc: WBS 4.2 — Phân hệ Xác thực & Phân quyền (Auth & RBAC)
- **WBS ID:** 4.2
- **Tên gói công việc:** Xác thực & Phân quyền (Authentication & Authorization)
- **Mô tả:** Hiện thực cơ chế đăng nhập email/mật khẩu, sinh JWT token, dependency giải mã profile `/auth/me` và RBAC middleware bảo vệ tài nguyên theo 3 vai trò (ADMIN, LECTURER, STUDENT).
- **Người phụ trách (Owner):** Backend Developer & Frontend Developer
- **Đầu vào (Inputs):** Bảng `Users`, API Spec, JWT Secret.
- **Đầu ra / Kết quả bàn giao (Outputs):** API `/auth/login`, `/auth/me`, UI form đăng nhập, PrivateRoute và phân quyền điều hướng trang.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Người dùng không active không thể đăng nhập; gọi trái quyền trả về HTTP 403; mật khẩu lưu dạng hash an toàn.
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 8) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.1.
- **Rủi ro & Ghi chú:** Lỗ hổng tin cậy role phía client; toàn bộ kiểm tra quyền hạn phải bắt buộc tại server-side.

---

### Gói công việc: WBS 4.3 — Phân hệ Quản trị (Admin Module)
- **WBS ID:** 4.3
- **Tên gói công việc:** Quản lý Người dùng, Khóa học & Ghi danh (Admin Operations)
- **Mô tả:** Xây dựng chức năng quản trị viên: CRUD tài khoản người dùng, phân vai trò, tạo khóa học, phân công giảng viên và ghi danh sinh viên vào lớp.
- **Người phụ trách (Owner):** Backend Developer & Frontend Developer
- **Đầu vào (Inputs):** Bảng `Users`, `Courses`, `Enrollments`.
- **Đầu ra / Kết quả bàn giao (Outputs):** Giao diện & API quản lý User, Course, Enrollment kèm tìm kiếm và phân trang.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Không thể tạo trùng email hay CourseCode; ghi danh sinh viên trùng lặp trong một khóa bị từ chối; chỉ user LECTURER mới được gán giảng dạy.
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 9) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.2.
- **Rủi ro & Ghi chú:** Ghi danh nhầm đối tượng không phải sinh viên; bắt buộc ràng buộc role phía service.

---

### Gói công việc: WBS 4.4 — Phân hệ Nội dung học tập (Content Management)
- **WBS ID:** 4.4
- **Tên gói công việc:** Quản lý Bài giảng & Tài liệu (Modules & Lessons)
- **Mô tả:** Cho phép giảng viên tạo cây thư mục bài giảng (Modules), các bài học (Lessons), biên soạn nội dung HTML, đính kèm link tài liệu và bật/tắt trạng thái xuất bản (IsPublished).
- **Người phụ trách (Owner):** Backend Developer & Frontend Developer
- **Đầu vào (Inputs):** Bảng `Modules`, `Lessons`, thông tin quyền sở hữu khóa học.
- **Đầu ra / Kết quả bàn giao (Outputs):** Giao diện quản lý nội dung cho giảng viên, giao diện học tập cho sinh viên.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Giảng viên khác không sửa được nội dung khóa học; sinh viên tuyệt đối không nhìn thấy module/bài học ở trạng thái bản nháp (Draft / IsPublished=0).
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 10) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.3.
- **Rủi ro & Ghi chú:** Lộ nội dung chưa công bố cho sinh viên; bắt buộc lọc `IsPublished=1` khi sinh viên truy vấn.

---

### Gói công việc: WBS 4.5 — Phân hệ Bài tập & Chấm điểm (Assignments & Submissions)
- **WBS ID:** 4.5
- **Tên gói công việc:** Quản lý Bài tập, Nộp bài & Chấm bài (Assignments & Grading)
- **Mô tả:** Giảng viên tạo bài tập với hạn chót (DueAt) và tùy chọn nộp trễ (AllowLate). Sinh viên nộp bài/cập nhật bài nộp. Giảng viên chấm điểm và nhập nhận xét (Feedback), điểm tự động đồng bộ vào bảng điểm.
- **Người phụ trách (Owner):** Backend Developer & Frontend Developer
- **Đầu vào (Inputs):** Bảng `Assignments`, `Submissions`, `Grades`.
- **Đầu ra / Kết quả bàn giao (Outputs):** Giao diện giao bài, nộp bài, chấm bài kèm thông báo kết quả.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Hết hạn không được nộp trừ khi `AllowLate=1`; điểm chấm trong khoảng 0 đến MaxScore; chấm xong sinh viên thấy ngay điểm và trạng thái GRADED.
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 11) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.4.
- **Rủi ro & Ghi chú:** Sai lệch múi giờ khi kiểm tra hạn nộp; toàn bộ so sánh thời gian dùng chuẩn UTC tại server.

---

### Gói công việc: WBS 4.6 — Phân hệ Thi trắc nghiệm & Chấm tự động (Quizzes)
- **WBS ID:** 4.6
- **Tên gói công việc:** Thi trắc nghiệm & Tự động chấm điểm (Quizzes & Auto-scoring)
- **Mô tả:** Giảng viên tạo bài trắc nghiệm với thời gian mở/đóng, giới hạn làm bài (MaxAttempts) và danh sách câu hỏi trắc nghiệm (Single Choice, True/False). Sinh viên bắt đầu làm bài, gửi đáp án và hệ thống tự động tính điểm ngay lập tức.
- **Người phụ trách (Owner):** Backend Developer & Frontend Developer
- **Đầu vào (Inputs):** Bảng `Quizzes`, `QuizQuestions`, `QuizAttempts`, `Grades`.
- **Đầu ra / Kết quả bàn giao (Outputs):** Giao diện tạo đề thi, làm bài trắc nghiệm sinh viên, hiển thị điểm số tức thì.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** API trả về cho sinh viên không được chứa trường `CorrectAnswer`; sinh viên vượt quá `MaxAttempts` bị chặn không thể tạo attempt mới; tự động chấm điểm chính xác 100%.
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 12) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.5.
- **Rủi ro & Ghi chú:** Lộ đáp án đúng trên Network payload; bảo vệ trường `CorrectAnswer` thông qua Pydantic DTO riêng cho sinh viên.

---

### Gói công việc: WBS 5.2 — Kiểm thử tự động (Automated Testing với Pytest)
- **WBS ID:** 5.2
- **Tên gói công việc:** Kiểm thử tự động Backend (Pytest Suite)
- **Mô tả:** Xây dựng bộ test case tự động bao phủ toàn bộ 10 kịch bản chấp nhận quan trọng (AC-01 đến AC-10) và các quy tắc nghiệp vụ cốt lõi (BR-01 đến BR-12).
- **Người phụ trách (Owner):** QA Engineer & Backend Developer
- **Đầu vào (Inputs):** Test Plan, API Endpoints, Fixtures CSDL kiểm thử.
- **Đầu ra / Kết quả bàn giao (Outputs):** Thư mục `tests/` chứa các file test pytest chạy độc lập, báo cáo kết quả kiểm thử.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** 100% test cases pass, thời gian chạy < 30 giây, kiểm tra chặt chẽ các trường hợp chặn quyền (Forbidden/Unauthorized).
- **Thời lượng & Công số (Duration/Effort):** 2 tuần (Tuần 13-14) / 60 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 4.6 (Mốc M4 Feature Complete).
- **Rủi ro & Ghi chú:** Dữ liệu test làm bẩn CSDL chính; sử dụng transaction rollback hoặc test database tách biệt.

---

### Gói công việc: WBS 6.2 — Thực thi Nghiệm thu người dùng (UAT)
- **WBS ID:** 6.2
- **Tên gói công việc:** Nghiệm thu Người dùng (User Acceptance Testing)
- **Mô tả:** Tổ chức buổi kiểm thử chấp nhận với đại diện 3 bên (Admin, Giảng viên, Sinh viên), thực hiện các kịch bản thực tế end-to-end từ đăng nhập, tạo khóa, giảng dạy, nộp bài đến chấm điểm.
- **Người phụ trách (Owner):** Business Analyst (BA) & QA Engineer
- **Đầu vào (Inputs):** Bộ kịch bản UAT, hệ thống chạy demo trên seed data chuẩn.
- **Đầu ra / Kết quả bàn giao (Outputs):** Biên bản UAT có chữ ký đại diện, nhật ký lỗi UAT (nếu có).
- **Tiêu chí nghiệm thu (Acceptance Criteria):** 100% kịch bản UAT thành công, 0 lỗi P0/P1 còn tồn tại, được Business Owner ký phê duyệt tại mốc M6 (Tuần 16).
- **Thời lượng & Công số (Duration/Effort):** 1 tuần (Tuần 16) / 40 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 5.3 (System Testing đạt Quality Gate 4).
- **Rủi ro & Ghi chú:** Người dùng phát hiện tính năng thiếu ngoài phạm vi; giải thích rõ scope baseline và ghi nhận vào Future Enhancements.

---

### Gói công việc: WBS 8.1 — Hoàn thiện Báo cáo & Đóng dự án (Project Closure)
- **WBS ID:** 8.1
- **Tên gói công việc:** Tổng kết Dự án & Hồ sơ Quản lý (Project Closure & Final Report)
- **Mô tả:** Tổng hợp toàn bộ hồ sơ quản lý dự án thành báo cáo chính thức theo 10 chương chuẩn mực, phân tích độ lệch chi phí/tiến độ, rút ra bài học kinh nghiệm và tổ chức bàn giao.
- **Người phụ trách (Owner):** Project Manager (PM)
- **Đầu vào (Inputs):** Bằng chứng nghiệm thu UAT, số liệu thực tế tiến độ và chi phí, mã nguồn và tài liệu kỹ thuật.
- **Đầu ra / Kết quả bàn giao (Outputs):** Báo cáo đồ án môn học hoàn chỉnh, Slide thuyết trình, Bảng kiểm đóng dự án (Closure Checklist), Biên bản bàn giao.
- **Tiêu chí nghiệm thu (Acceptance Criteria):** Báo cáo đầy đủ 10 chương và phụ lục, số liệu nhất quán 100%, sẵn sàng bảo vệ trước hội đồng.
- **Thời lượng & Công số (Duration/Effort):** 2 tuần (Tuần 19-20) / 80 giờ công.
- **Ràng buộc phụ thuộc (Dependencies):** Hoàn thành WBS 7.2 (Demo Release).
- **Rủi ro & Ghi chú:** Thiếu bằng chứng thực thi; đính kèm log kiểm thử, kết quả seed validation và ảnh chụp màn hình các luồng nghiệp vụ.
