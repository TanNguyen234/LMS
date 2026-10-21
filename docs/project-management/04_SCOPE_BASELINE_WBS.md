> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 04 — Phạm vi Dự án & Cấu trúc Phân chia Công việc (Scope Baseline & WBS)

## 1. Bản cơ sở Phạm vi (Scope Baseline Overview)
Bản cơ sở phạm vi bao gồm:
1. **Scope Statement (Báo cáo Phạm vi sản phẩm & Dự án)**
2. **Work Breakdown Structure (WBS - Cấu trúc phân chia công việc đến Level 3)**
3. **WBS Dictionary (Từ điển WBS)**

### 1.1 Mục tiêu sản phẩm (Product Scope)
Hệ thống University LMS cung cấp nền tảng quản lý học tập trên nền web với các phân hệ:
- **Xác thực và Hồ sơ:** Đăng nhập an toàn, quản lý thông tin tài khoản, RBAC với 3 vai trò: `ADMIN`, `LECTURER`, `STUDENT`.
- **Phân hệ Quản trị (Admin):** Quản lý người dùng, tạo khóa học, phân công giảng viên, ghi danh sinh viên.
- **Phân hệ Giảng viên (Lecturer):** Quản lý cấu trúc bài giảng (Modules/Lessons), tạo bài tập, chấm điểm và phản hồi bài nộp, thiết kế bài kiểm tra trắc nghiệm, quản lý sổ điểm lớp.
- **Phân hệ Sinh viên (Student):** Truy cập khóa học đã ghi danh, học nội dung đã xuất bản, nộp bài tập đúng hạn, làm bài kiểm tra trắc nghiệm trong khung giờ mở, theo dõi điểm số và nhận thông báo học vụ.
- **Dữ liệu & Báo cáo:** CSDL 12 bảng chuẩn hóa trên SQL Server, hỗ trợ Dashboard thống kê theo vai trò.

### 1.2 Phạm vi dự án (Project Scope)
- Triển khai toàn bộ quy trình quản lý dự án theo chuẩn PMI/học phần trong 20 tuần.
- Xây dựng prototype phần mềm hoàn chỉnh chạy được trên kiến trúc FastAPI + React + SQL Server.
- Thiết kế bộ dữ liệu mẫu (Seed Data) tối thiểu 10 bản ghi cho mỗi bảng và tài liệu nghiệm thu UAT.
- Không phát triển các tính năng ngoài luồng (out-of-scope) như SSO, hội nghị truyền hình, thanh toán hay AI.

---

## 2. Cấu trúc Phân chia Công việc (WBS Level 1, 2 & 3)

```text
1. University LMS Project
│
├── 1.0 Khởi tạo dự án (Project Initiation)
│   ├── 1.1 Xác lập và phê duyệt Dự án
│   │   ├── 1.1.1 Xây dựng Project Charter & Business Case
│   │   └── 1.1.2 Trình duyệt và ký kết Điều lệ dự án
│   ├── 1.2 Phân tích bên liên quan (Stakeholder Management)
│   │   ├── 1.2.1 Thu thập danh bạ Stakeholders
│   │   └── 1.2.2 Xây dựng Ma trận Quyền lực - Mức độ quan tâm
│   └── 1.3 Khởi động dự án (Kickoff)
│       └── 1.3.1 Tổ chức cuộc họp Kickoff và thống nhất quy chế làm việc
│
├── 2.0 Quản lý Yêu cầu & Phạm vi (Requirements & Scope)
│   ├── 2.1 Khảo sát và Phân tích nghiệp vụ
│   │   ├── 2.1.1 Phỏng vấn cán bộ đào tạo và giảng viên
│   │   └── 2.1.2 Tổng hợp sơ đồ luồng nghiệp vụ hiện trạng (As-is)
│   ├── 2.2 Đặc tả yêu cầu phần mềm
│   │   ├── 2.2.1 Đặc tả yêu cầu chức năng (FR-01 đến FR-15)
│   │   └── 2.2.2 Đặc tả yêu cầu phi chức năng (NFR-01 đến NFR-10)
│   └── 2.3 Thiết lập Bản cơ sở Phạm vi (Scope Baseline)
│       ├── 2.3.1 Xây dựng WBS chi tiết đến Level 3
│       ├── 2.3.2 Biên soạn WBS Dictionary
│       └── 2.3.3 Phê duyệt Scope Baseline
│
├── 3.0 Lập kế hoạch & Thiết kế (Planning & Design)
│   ├── 3.1 Kế hoạch quản lý dự án (Project Management Plans)
│   │   ├── 3.1.1 Kế hoạch tiến độ & Phân tích đường găng CPM
│   │   ├── 3.1.2 Kế hoạch ngân sách & Phân bổ chi phí (1.2 tỷ VNĐ)
│   │   ├── 3.1.3 Kế hoạch quản lý rủi ro & Ma trận P*I
│   │   ├── 3.1.4 Kế hoạch quản lý chất lượng & Tiêu chí nghiệm thu
│   │   └── 3.1.5 Kế hoạch truyền thông và Quản lý thay đổi
│   ├── 3.2 Thiết kế trải nghiệm người dùng (UI/UX Design)
│   │   ├── 3.2.1 Xây dựng User Flow & Wireframe các phân hệ
│   │   └── 3.2.2 Thiết kế Mockup chi tiết cho 3 vai trò
│   └── 3.3 Thiết kế Kiến trúc & Cơ sở dữ liệu
│       ├── 3.3.1 Thiết kế kiến trúc hệ thống Modular Monolith
│       ├── 3.3.2 Thiết kế CSDL SQL Server (12 bảng) & Ràng buộc toàn vẹn
│       └── 3.3.3 Đặc tả RESTful API (OpenAPI/Swagger Contract)
│
├── 4.0 Phát triển Prototype (Prototype Development)
│   ├── 4.1 Khởi tạo môi trường & Hạ tầng dữ liệu
│   │   ├── 4.1.1 Thiết lập Repo, FastAPI backend & React frontend
│   │   ├── 4.1.2 Cấu hình kết nối SQL Server, Alembic migration
│   │   └── 4.1.3 Nạp dữ liệu mẫu (Seed Data 12 bảng) & Sentinel Hash
│   ├── 4.2 Phân hệ Xác thực & Phân quyền (Auth & RBAC)
│   │   ├── 4.2.1 Hiện thực mã hóa mật khẩu & JWT Token
│   │   ├── 4.2.2 Hiện thực API /auth/login, /auth/me & RBAC middleware
│   │   └── 4.2.3 Xây dựng giao diện Đăng nhập & Điều hướng vai trò
│   ├── 4.3 Phân hệ Quản trị (Admin Module)
│   │   ├── 4.3.1 Hiện thực CRUD User & Quản lý trạng thái Active
│   │   ├── 4.3.2 Hiện thực CRUD Course & Phân công giảng viên
│   │   └── 4.3.3 Hiện thực Ghi danh sinh viên (Enrollments)
│   ├── 4.4 Phân hệ Nội dung học tập (Content Management)
│   │   ├── 4.4.1 Hiện thực CRUD Module và Bài học (Lessons)
│   │   ├── 4.4.2 Cơ chế xuất bản (IsPublished) & Phân quyền truy cập
│   │   └── 4.4.3 Giao diện trình xem bài học cho sinh viên
│   ├── 4.5 Phân hệ Bài tập & Chấm điểm (Assignments & Submissions)
│   │   ├── 4.5.1 Tạo bài tập, cấu hình hạn nộp (DueAt) và AllowLate
│   │   ├── 4.5.2 Sinh viên nộp bài & cập nhật bài nộp
│   │   └── 4.5.3 Giảng viên xem danh sách, chấm điểm và gửi nhận xét
│   ├── 4.6 Phân hệ Thi trắc nghiệm & Chấm tự động (Quizzes)
│   │   ├── 4.6.1 Tạo đề thi, ngân hàng câu hỏi & ẩn đáp án đúng
│   │   ├── 4.6.2 Kiểm soát khung giờ thi và số lượt làm bài (MaxAttempts)
│   │   └── 4.6.3 Sinh viên làm bài & Chấm tự động Single Choice / True False
│   └── 4.7 Phân hệ Bổ trợ (Grades, Notifications & Dashboard)
│       ├── 4.7.1 Sổ điểm giảng viên & Bảng điểm cá nhân sinh viên
│       ├── 4.7.2 Hệ thống thông báo học vụ & Đánh dấu đã đọc
│       └── 4.7.3 Dashboard thống kê chỉ số theo từng vai trò
│
├── 5.0 Kiểm thử & Đảm bảo Chất lượng (Testing & QA)
│   ├── 5.1 Xây dựng tài liệu kiểm thử
│   │   ├── 5.1.1 Lập Test Plan tổng thể & Ma trận truy vết yêu cầu (RTM)
│   │   └── 5.1.2 Thiết kế bộ kịch bản kiểm thử (Test Cases AC-01 đến AC-10)
│   ├── 5.2 Kiểm thử tự động (Automated Testing)
│   │   ├── 5.2.1 Viết kiểm thử đơn vị Pytest cho các quy tắc nghiệp vụ
│   │   └── 5.2.2 Viết kiểm thử tích hợp API (RBAC & Business Flows)
│   └── 5.3 Đánh giá chất lượng & Xử lý khiếm khuyết
│       ├── 5.3.1 Thực thi bộ kiểm thử và ghi nhận lỗi (Defect Log)
│       └── 5.3.2 Triage và đóng toàn bộ lỗi nghiêm trọng P0/P1
│
├── 6.0 Nghiệm thu người dùng & Đào tạo (UAT & Demo Preparation)
│   ├── 6.1 Chuẩn bị Nghiệm thu (UAT Preparation)
│   │   ├── 6.1.1 Soạn thảo kịch bản UAT cho Admin, Lecturer, Student
│   │   └── 6.1.2 Chuẩn bị môi trường UAT và dữ liệu kiểm thử
│   ├── 6.2 Thực thi UAT & Đánh giá
│   │   ├── 6.2.1 Tổ chức phiên UAT giả định với các bên liên quan
│   │   └── 6.2.2 Thu thập bằng chứng, ảnh chụp và ký biên bản nghiệm thu UAT
│   └── 6.3 Đào tạo & Tài liệu chuyển giao
│       └── 6.3.1 Biên soạn tài liệu Hướng dẫn sử dụng cho 3 đối tượng
│
├── 7.0 Triển khai môi trường Demo (Deployment & Demo)
│   ├── 7.1 Cấu hình môi trường Demo cục bộ
│   │   ├── 7.1.1 Đóng gói mã nguồn & file cấu hình môi trường (.env)
│   │   └── 7.1.2 Khởi chạy Backend, Frontend và CSDL SQL Server
│   └── 7.2 Kiểm thử khói (Smoke Test) & Chuẩn bị kịch bản thuyết trình
│       └── 7.2.1 Thực hiện End-to-End Smoke Test theo kịch bản mẫu
│
└── 8.0 Đóng dự án (Project Closure)
    ├── 8.1 Hoàn thiện Báo cáo tổng kết đồ án
    │   ├── 8.1.1 Tổng hợp hồ sơ quản lý dự án (10 chương theo đề cương)
    │   └── 8.1.2 Đóng gói mã nguồn, tài liệu API và các phụ lục
    ├── 8.2 Đánh giá sau dự án
    │   ├── 8.2.1 Phân tích độ lệch tiến độ và chi phí (Variance Analysis)
    │   └── 8.2.2 Tổng kết bài học kinh nghiệm (Lessons Learned)
    └── 8.3 Nghiệm thu chính thức & Bàn giao
        └── 8.3.1 Biên bản nghiệm thu bàn giao và đóng dự án chính thức
```
