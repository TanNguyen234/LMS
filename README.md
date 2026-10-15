# University Learning Management System (LMS)
## Đồ án Quản lý Dự án Phần mềm (Software Project Management)

Dự án Hệ thống Quản lý Học tập Đại học (University LMS) được triển khai theo mô hình **Dual-Track Delivery** hoàn chỉnh:
- **Track A (Hồ sơ Quản lý Dự án Chuẩn mực):** Bộ 13 tài liệu quản lý dự án học thuật đáp ứng đầy đủ tiêu chuẩn PMI/PMBOK (Charter, WBS L3, CPM/Gantt, Dự toán 1.2 tỷ VND, Quản trị rủi ro, Kế hoạch chất lượng, UAT và Đóng dự án).
- **Track B (Nguyên mẫu Kỹ thuật Thực thi - Working Prototype):** Kiến trúc Modular Monolith chạy trên nền tảng **FastAPI (Python 3.12)**, **Microsoft SQL Server (localhost\SQLEXPRESS)**, **SQLAlchemy 2.x & Alembic**, và giao diện web SPA hiện đại **React 19 + TypeScript + Vite + Tailwind CSS**.

---

## 1. Cấu trúc Dự án

```text
D:\Download\LMS\
├── docs/
│   └── project-management/            # 13 Tài liệu Quản lý Dự án Chuẩn PMBOK
│       ├── 01_PROJECT_CHARTER.md
│       ├── 02_STAKEHOLDER_REGISTER.md
│       ├── 03_RACI_MATRIX.md
│       ├── 04_SCOPE_BASELINE_WBS.md
│       ├── 05_WBS_DICTIONARY.md
│       ├── 06_SCHEDULE_CPM_GANTT.md
│       ├── 07_RESOURCE_AND_BUDGET_BASELINE.md
│       ├── 08_RISK_REGISTER.md
│       ├── 09_QUALITY_PLAN_AND_GATES.md
│       ├── 10_COMMUNICATION_PLAN.md
│       ├── 11_CHANGE_MANAGEMENT_PLAN.md
│       ├── 12_UAT_AND_ACCEPTANCE_EVIDENCE.md
│       └── 13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md
├── database/                          # T-SQL Scripts cho Microsoft SQL Server
│   ├── 01_schema.sql                  # Định nghĩa 12 bảng cốt lõi và quan hệ FK/Index
│   ├── 02_seed.sql                    # Dữ liệu mẫu chuẩn (12 bảng x 10 bản ghi = 120 dòng)
│   ├── 03_reset.sql                   # Kịch bản xóa sạch và làm mới CSDL
│   └── 04_seed_validation.sql         # Kịch bản xác thực tính toàn vẹn dữ liệu
├── backend/                           # API Server (FastAPI + SQLAlchemy 2.x)
│   ├── app/
│   │   ├── api/routes/                # Router phân hệ: auth, users, courses, content, ...
│   │   ├── core/                      # Config, JWT Security, RBAC Dependencies
│   │   ├── db/                        # Engine, SessionLocal, Seed initializer
│   │   ├── models/                    # Khai báo ORM Models cho 12 bảng CSDL
│   │   ├── schemas/                   # Khai báo Pydantic schemas (Request / Response)
│   │   └── main.py                    # Khởi tạo FastAPI App, CORS, Static SPA serving
│   ├── alembic/                       # Migration scripts tự động
│   ├── tests/                         # Bộ kiểm thử chấp nhận (Acceptance Tests AC-01 -> AC-10)
│   ├── requirements.txt               # Danh sách thư viện Python
│   └── .env                           # Biến môi trường kết nối CSDL và JWT Secret
└── frontend/                          # Giao diện người dùng Web SPA (React + Vite + TS)
    ├── src/
    │   ├── api/client.ts              # API client gọi FastAPI với Bearer token tự động
    │   ├── auth/AuthContext.tsx       # Quản lý phiên đăng nhập và phân quyền RBAC
    │   ├── components/layout/         # Header, Responsive Sidebar, Notifications menu
    │   ├── pages/                     # Giao diện các phân hệ theo vai trò
    │   ├── routes/AppRoutes.tsx       # Cấu hình định tuyến và bộ bảo vệ ProtectedRoute
    │   └── types/index.ts             # Hợp đồng kiểu dữ liệu TypeScript
    └── vite.config.ts                 # Cấu hình proxy /api và Tailwind CSS
```

---

## 2. Tài khoản Demo Kiểm thử Hệ thống

## 2. Tài khoản Demo Kiểm thử Hệ thống

Hệ thống đã nạp sẵn dữ liệu mẫu chuẩn theo `database/02_seed.sql` phục vụ hội đồng chấm và đánh giá:
Mật khẩu mặc định cho môi trường phát triển (`APP_ENV=development`) là: `Demo@123`

| Vai trò | Email đăng nhập | Tên hiển thị | Quyền hạn tiêu biểu |
| :--- | :--- | :--- | :--- |
| **Quản trị viên (Admin)** | `admin@university.edu.vn` | Nguyễn Minh Admin | Quản lý người dùng, tạo khóa học, phân công giảng viên, xem báo cáo toàn hệ thống. |
| **Giảng viên (Lecturer)** | `lecturer1@university.edu.vn` | TS. Trần Hoàng Nam | Quản lý khóa học được giao, tạo chương/bài giảng, giao bài tập, chấm điểm, tạo Quiz. |
| **Sinh viên (Student)** | `student1@university.edu.vn` | Nguyễn An | Xem bài giảng, tải tài liệu, nộp bài tập trực tuyến, thi trắc nghiệm tính giờ, tra cứu điểm. |

---

## 3. Hướng dẫn Khởi chạy Nhanh

### Bước 1: Khởi tạo Cơ sở dữ liệu Microsoft SQL Server
1. Mở SSMS hoặc `sqlcmd` kết nối tới `localhost\SQLEXPRESS`.
2. Tạo cơ sở dữ liệu `UniversityLms`.
3. Lần lượt thực thi các kịch bản:
   - `database/01_schema.sql` (Tạo 12 bảng và ràng buộc)
   - `database/02_seed.sql` (Nạp 120 dòng dữ liệu ban đầu)
   - `database/04_seed_validation.sql` (Kiểm tra xác nhận: 12 bảng, mỗi bảng đúng 10 dòng)

### Bước 2: Khởi chạy Backend FastAPI
```powershell
# Từ thư mục gốc dự án:
python -m pip install -r backend/requirements.txt

# Khởi chạy server FastAPI
python -m uvicorn backend.app.main:app --reload --port 8000
```
- API Docs tương tác: `http://127.0.0.1:8000/docs`
- Kiểm tra sức khỏe hệ thống: `http://127.0.0.1:8000/health`

### Bước 3: Khởi chạy Frontend React
Mở một cửa sổ dòng lệnh thứ hai:
```powershell
cd frontend
npm ci
npm run dev
```
- Truy cập trình duyệt tại: `http://localhost:5173`
- *Lưu ý:* Khi đã chạy lệnh `npm run build`, backend FastAPI tại `http://127.0.0.1:8000` cũng tự động phục vụ trực tiếp toàn bộ giao diện Frontend.

---

## 4. Chạy Kiểm thử Tự động (Acceptance Test Suite)

Dự án tích hợp bộ kiểm thử `pytest` tự động xác thực toàn bộ 10 tiêu chí chấp nhận kỹ thuật (AC-01 đến AC-10) theo đặc tả:

```powershell
python -m pytest backend/tests -v
```

Kết quả thực nghiệm:
```text
backend/tests/test_acceptance.py::test_ac01_authentication PASSED        [ 10%]
backend/tests/test_acceptance.py::test_ac02_authorization PASSED         [ 20%]
backend/tests/test_acceptance.py::test_ac03_course_isolation PASSED      [ 30%]
backend/tests/test_acceptance.py::test_ac04_enrollment_uniqueness PASSED [ 40%]
backend/tests/test_acceptance.py::test_ac05_published_content PASSED     [ 50%]
backend/tests/test_acceptance.py::test_ac06_assignment_deadline PASSED   [ 60%]
backend/tests/test_acceptance.py::test_ac07_grading_sync PASSED          [ 70%]
backend/tests/test_acceptance.py::test_ac08_quiz_max_attempts PASSED     [ 80%]
backend/tests/test_acceptance.py::test_ac09_quiz_secret_protection PASSED [ 90%]
backend/tests/test_acceptance.py::test_ac10_notification_ownership PASSED [100%]

======================= 10 passed, 0 failed =======================
```

---

## 5. Danh mục 13 Hồ sơ Quản lý Dự án (Track A)

1. [01_PROJECT_CHARTER.md](docs/project-management/01_PROJECT_CHARTER.md) - Điều lệ dự án, mục tiêu SMART, ngân sách 1.2 tỷ VND, 20 tuần thực hiện.
2. [02_STAKEHOLDER_REGISTER.md](docs/project-management/02_STAKEHOLDER_REGISTER.md) - Sổ đăng ký các bên liên quan, ma trận Quyền lực - Mức độ quan tâm.
3. [03_RACI_MATRIX.md](docs/project-management/03_RACI_MATRIX.md) - Ma trận phân định trách nhiệm RACI cho 8 vai trò nhân sự.
4. [04_SCOPE_BASELINE_WBS.md](docs/project-management/04_SCOPE_BASELINE_WBS.md) - Đường cơ sở phạm vi và cấu trúc phân rã công việc WBS cấp 3.
5. [05_WBS_DICTIONARY.md](docs/project-management/05_WBS_DICTIONARY.md) - Từ điển WBS chi tiết cho từng gói công việc.
6. [06_SCHEDULE_CPM_GANTT.md](docs/project-management/06_SCHEDULE_CPM_GANTT.md) - Tiến độ đường găng CPM, tính toán ES/EF/LS/LF, Float và biểu đồ Gantt.
7. [07_RESOURCE_AND_BUDGET_BASELINE.md](docs/project-management/07_RESOURCE_AND_BUDGET_BASELINE.md) - Dự toán chi tiết 8.5 FTEs, phân bổ chi phí nhân sự và hạ tầng.
8. [08_RISK_REGISTER.md](docs/project-management/08_RISK_REGISTER.md) - Sổ theo dõi rủi ro định lượng P*I, biện pháp phòng ngừa và ứng phó.
9. [09_QUALITY_PLAN_AND_GATES.md](docs/project-management/09_QUALITY_PLAN_AND_GATES.md) - Cổng kiểm soát chất lượng QG1-QG5, phân cấp lỗi và tiêu chuẩn DoD.
10. [10_COMMUNICATION_PLAN.md](docs/project-management/10_COMMUNICATION_PLAN.md) - Kế hoạch truyền thông, ma trận báo cáo và quy trình báo động 3 cấp.
11. [11_CHANGE_MANAGEMENT_PLAN.md](docs/project-management/11_CHANGE_MANAGEMENT_PLAN.md) - Quy trình kiểm soát thay đổi, hội đồng CCB và biểu mẫu CR.
12. [12_UAT_AND_ACCEPTANCE_EVIDENCE.md](docs/project-management/12_UAT_AND_ACCEPTANCE_EVIDENCE.md) - Bằng chứng nghiệm thu UAT cho 10 kịch bản kiểm thử AC-01 -> AC-10.
13. [13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md](docs/project-management/13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md) - Biên bản đóng dự án, phân tích EVM và bài học kinh nghiệm.
