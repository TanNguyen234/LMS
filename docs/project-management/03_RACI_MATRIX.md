> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 03 — Ma trận Phân công Trách nhiệm (RACI Matrix)

## 1. Định nghĩa các vai trò trong RACI
- **R — Responsible (Người thực hiện):** Người trực tiếp làm công việc để hoàn thành mục tiêu.
- **A — Accountable (Người chịu trách nhiệm chính):** Người có quyền quyết định tối hậu và phê duyệt kết quả (chỉ có duy nhất 1 vai trò A cho mỗi gói công việc).
- **C — Consulted (Người được tham vấn):** Chuyên gia hoặc bên liên quan có ý kiến đóng góp hai chiều trước khi hoàn thành công việc.
- **I — Informed (Người được thông báo):** Bên liên quan được cập nhật thông tin tiến độ một chiều sau khi công việc hoàn thành.

---

## 2. Các vai trò dự án (Project Roles)
1. **PM:** Project Manager
2. **BA:** Business Analyst
3. **UI/UX:** UI/UX Designer
4. **BE:** Backend Developers (2 nhân sự)
5. **FE:** Frontend Developers (2 nhân sự)
6. **QA:** QA / Test Engineer
7. **DevOps:** DevOps / System Infrastructure
8. **Sponsor / BGH:** Ban Giám hiệu & Phòng Đào tạo (Đại diện khách hàng)

---

## 3. Bảng Ma trận RACI theo các gói công việc chính

| Gói công việc (WBS Level 2 / Key Deliverable) | PM | BA | UI/UX | BE | FE | QA | DevOps | Sponsor/BGH |
|---|---|---|---|---|---|---|---|---|
| **1. Khởi tạo dự án (Project Initiation)** | | | | | | | | |
| 1.1 Soạn thảo Project Charter & Business Case | **A/R** | C | I | I | I | I | I | C |
| 1.2 Phê duyệt Project Charter | C | I | I | I | I | I | I | **A** |
| 1.3 Xác định danh bạ Stakeholders & Power-Interest | **A/R** | C | I | I | I | I | I | I |
| 1.4 Họp Kickoff dự án | **A/R** | R | R | R | R | R | R | I |
| **2. Quản lý Yêu cầu & Phạm vi (Requirements & Scope)** | | | | | | | | |
| 2.1 Khảo sát quy trình nghiệp vụ đào tạo | A | **R** | C | I | I | I | I | C |
| 2.2 Đặc tả yêu cầu phần mềm (SRS / Use Cases) | A | **R** | C | C | C | C | I | I |
| 2.3 Xây dựng Scope Baseline & WBS Level 3 | **A** | R | I | C | C | C | I | I |
| 2.4 Phê duyệt Scope Baseline | C | C | I | I | I | I | I | **A** |
| **3. Thiết kế & Lập kế hoạch (Planning & Design)** | | | | | | | | |
| 3.1 Lập kế hoạch tiến độ, CPM, ngân sách & rủi ro | **A/R** | C | I | C | C | C | C | I |
| 3.2 Thiết kế UI/UX Wireframe & Mockup | A | C | **R** | I | C | I | I | I |
| 3.3 Thiết kế kiến trúc Modular Monolith & API Spec | A | C | I | **R** | C | I | C | I |
| 3.4 Thiết kế CSDL SQL Server (12 Tables) | A | C | I | **R** | I | I | C | I |
| **4. Phát triển Prototype (Prototype Development)** | | | | | | | | |
| 4.1 Thiết lập môi trường, DB Schema & Seed Data | A | I | I | **R** | I | I | R | I |
| 4.2 Module Xác thực & Phân quyền (Auth & RBAC) | A | I | I | **R** | R | C | I | I |
| 4.3 Quản lý Khóa học & Ghi danh (Courses & Enrollments)| A | I | I | **R** | R | C | I | I |
| 4.4 Quản lý Nội dung bài học (Modules & Lessons) | A | I | I | **R** | R | C | I | I |
| 4.5 Quản lý Bài tập & Nộp bài (Assignments & Submissions)| A | I | I | **R** | R | C | I | I |
| 4.6 Quản lý Thi trắc nghiệm & Tự động chấm (Quizzes) | A | I | I | **R** | R | C | I | I |
| 4.7 Sổ điểm, Thông báo & Dashboard | A | I | I | **R** | R | C | I | I |
| **5. Kiểm thử & Đảm bảo chất lượng (Testing & QA)** | | | | | | | | |
| 5.1 Lập Test Plan & Kịch bản kiểm thử (Test Cases) | A | C | I | C | C | **R** | I | I |
| 5.2 Kiểm thử tự động Backend (Pytest Unit & API) | A | I | I | R | I | **R** | I | I |
| 5.3 Kiểm thử tích hợp hệ thống (System & Security RBAC)| A | I | I | C | C | **R** | C | I |
| 5.4 Báo cáo lỗi & Triage xử lý khiếm khuyết | **A** | C | I | R | R | R | I | I |
| **6. UAT & Đào tạo người dùng (UAT & Demo)** | | | | | | | | |
| 6.1 Xây dựng kịch bản UAT (Admin, Lecturer, Student) | A | **R** | I | I | I | C | I | I |
| 6.2 Thực hiện phiên UAT với đại diện người dùng | A | **R** | I | I | I | R | I | C |
| 6.3 Nghiệm thu UAT Sign-off | C | C | I | I | I | I | I | **A** |
| **7. Triển khai & Demo Environment** | | | | | | | | |
| 7.1 Cấu hình Demo Server & CSDL SQL Server | A | I | I | C | C | I | **R** | I |
| 7.2 Đóng gói mã nguồn & Swagger OpenAPI | A | I | I | **R** | R | I | I | I |
| **8. Đóng dự án (Project Closure)** | | | | | | | | |
| 8.1 Hoàn thiện Báo cáo tổng kết & Hồ sơ QLDA | **A/R** | R | R | R | R | R | R | I |
| 8.2 Đánh giá bài học kinh nghiệm (Lessons Learned) | **A/R** | R | R | R | R | R | R | I |
| 8.3 Bàn giao sản phẩm & Ký biên bản đóng dự án | C | I | I | I | I | I | I | **A** |
