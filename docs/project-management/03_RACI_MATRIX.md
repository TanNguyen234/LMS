> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 03 — Ma trận Phân công Trách nhiệm (RACI Matrix)

## 1. Định nghĩa các vai trò trong RACI
- **R — Responsible (Người thực hiện):** Người trực tiếp thực hiện công việc để hoàn thành gói bàn giao (mỗi dòng có ít nhất 1 vai trò R).
- **A — Accountable (Người chịu trách nhiệm chính):** Người có quyền quyết định tối hậu và phê duyệt kết quả (chỉ có duy nhất 1 vai trò A cho mỗi gói công việc).
- **C — Consulted (Người được tham vấn):** Chuyên gia hoặc bên liên quan đóng góp ý kiến hai chiều trước khi hoàn thành công việc.
- **I — Informed (Người được thông báo):** Bên liên quan được cập nhật thông tin tiến độ một chiều sau khi công việc hoàn thành.

---

## 2. Các vai trò dự án (Project Roles)
1. **PM:** Project Manager
2. **BA:** Business Analyst
3. **UI/UX:** UI/UX Designer
4. **BE:** Backend Developers (2 phân bổ FTE)
5. **FE:** Frontend Developers (2 phân bổ FTE)
6. **QA:** QA / Test Engineer
7. **DevOps:** DevOps / System Infrastructure (0.5 FTE)
8. **Sponsor / BGH:** Ban Giám hiệu & Phòng Đào tạo (Đại diện khách hàng)

---

## 3. Bảng Ma trận RACI đối chiếu trực tiếp theo WBS Level 2 (`04_SCOPE_BASELINE_WBS.md`)

| Gói công việc (WBS Level 2) | PM | BA | UI/UX | BE | FE | QA | DevOps | Sponsor/BGH |
|---|---|---|---|---|---|---|---|---|
| **1.0 Khởi tạo dự án (Project Initiation)** | | | | | | | | |
| 1.1 Xác lập và phê duyệt Dự án (Project Charter) | **R** | C | I | I | I | I | I | **A** |
| 1.2 Phân tích bên liên quan (Stakeholder Register & Power-Interest) | **A/R** | C | I | I | I | I | I | I |
| 1.3 Khởi động dự án (Kickoff Meeting) | **A/R** | R | R | R | R | R | R | I |
| **2.0 Quản lý Yêu cầu & Phạm vi (Requirements & Scope)** | | | | | | | | |
| 2.1 Khảo sát và Phân tích nghiệp vụ đào tạo | **A** | **R** | C | I | I | I | I | C |
| 2.2 Đặc tả yêu cầu phần mềm (SRS / FR-01..15 & NFR-01..10) | **A** | **R** | C | C | C | C | I | I |
| 2.3 Thiết lập và phê duyệt Bản cơ sở Phạm vi (WBS & WBS Dictionary) | **R** | R | I | C | C | C | I | **A** |
| **3.0 Lập kế hoạch & Thiết kế (Planning & Design)** | | | | | | | | |
| 3.1 Kế hoạch quản lý dự án (CPM, Ngân sách, Rủi ro, Chất lượng, Truyền thông, Thay đổi) | **A/R** | C | I | C | C | C | C | I |
| 3.2 Thiết kế trải nghiệm người dùng (UI/UX Wireframe & Mockup) | **A** | C | **R** | I | C | I | I | I |
| 3.3 Thiết kế Kiến trúc Modular Monolith, CSDL SQL Server & OpenAPI Spec | **A** | C | I | **R** | C | I | C | I |
| **4.0 Phát triển Prototype (Prototype Development)** | | | | | | | | |
| 4.1 Khởi tạo môi trường, Hạ tầng dữ liệu & Seed Data | **A** | I | I | **R** | I | I | R | I |
| 4.2 Phân hệ Xác thực & Phân quyền (Auth & RBAC) | **A** | I | I | **R** | R | C | I | I |
| 4.3 Phân hệ Quản trị (Users, Courses & Enrollments) | **A** | I | I | **R** | R | C | I | I |
| 4.4 Phân hệ Nội dung học tập (Modules & Lessons) | **A** | I | I | **R** | R | C | I | I |
| 4.5 Phân hệ Bài tập & Chấm điểm (Assignments & Submissions) | **A** | I | I | **R** | R | C | I | I |
| 4.6 Phân hệ Thi trắc nghiệm & Chấm tự động (Quizzes) | **A** | I | I | **R** | R | C | I | I |
| 4.7 Phân hệ Bổ trợ (Grades, Notifications & Dashboard) | **A** | I | I | **R** | R | C | I | I |
| **5.0 Kiểm thử & Đảm bảo Chất lượng (Testing & QA)** | | | | | | | | |
| 5.1 Xây dựng tài liệu kiểm thử (Test Plan, RTM & Test Cases) | **A** | C | I | C | C | **R** | I | I |
| 5.2 Kiểm thử tự động (Pytest Unit & API Integration) | **A** | I | I | R | C | **R** | I | I |
| 5.3 Đánh giá chất lượng & Xử lý khiếm khuyết (Defect Log & Triage P0/P1) | **A** | C | I | R | R | **R** | I | I |
| **6.0 Nghiệm thu người dùng & Đào tạo (UAT & Demo Preparation)** | | | | | | | | |
| 6.1 Chuẩn bị Nghiệm thu (Kịch bản & Môi trường UAT) | **A** | **R** | I | I | I | R | C | I |
| 6.2 Thực thi UAT & Ký biên bản nghiệm thu UAT | C | **R** | I | I | I | R | I | **A** |
| 6.3 Đào tạo & Tài liệu chuyển giao hướng dẫn sử dụng | **A** | **R** | R | I | I | C | I | I |
| **7.0 Triển khai môi trường Demo (Deployment & Demo)** | | | | | | | | |
| 7.1 Cấu hình môi trường Demo cục bộ & Đóng gói phát hành | **A** | I | I | R | R | I | **R** | I |
| 7.2 Kiểm thử khói (Smoke Test) & Chuẩn bị kịch bản thuyết trình | **A** | C | I | R | R | **R** | C | I |
| **8.0 Đóng dự án (Project Closure)** | | | | | | | | |
| 8.1 Hoàn thiện Báo cáo tổng kết đồ án & Đóng gói phụ lục | **A/R** | R | C | R | R | R | C | I |
| 8.2 Đánh giá sau dự án (Variance Analysis & Lessons Learned) | **A/R** | R | I | C | C | R | C | I |
| 8.3 Nghiệm thu chính thức, Bàn giao & Đóng dự án | **R** | C | I | I | I | I | I | **A** |
