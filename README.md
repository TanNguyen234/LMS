# University LMS

University LMS là ứng dụng quản lý học tập dành cho môi trường đại học. Hệ thống hỗ trợ quản lý tài khoản, khóa học, nội dung giảng dạy, bài tập, bài kiểm tra, điểm số và thông báo.

Đây là dự án mẫu phục vụ học tập và trình diễn. Cấu hình mặc định cùng tài khoản seed chỉ dành cho môi trường local.

## Công nghệ

- Backend: Python 3.12, FastAPI, SQLAlchemy, Alembic và pyodbc.
- Cơ sở dữ liệu: Microsoft SQL Server.
- Frontend: React, TypeScript, Vite và React Router.
- Xác thực: JWT với phân quyền theo vai trò ở backend.

## Yêu cầu

- Git.
- Python 3.12.
- Node.js và npm.
- Microsoft SQL Server cùng ODBC Driver tương ứng với cấu hình máy.

## Cài đặt và chạy local

### 1. Clone mã nguồn

```powershell
git clone https://github.com/TanNguyen234/LMS.git
Set-Location LMS
```

### 2. Tạo cơ sở dữ liệu và nạp dữ liệu mẫu

Tạo một database local, chẳng hạn `UniversityLms_Dev`, trên SQL Server. Trong SSMS hoặc công cụ tương đương, chọn database vừa tạo rồi chạy lần lượt:

1. [`database/01_schema.sql`](database/01_schema.sql) — tạo bảng và ràng buộc.
2. [`database/02_seed.sql`](database/02_seed.sql) — thêm dữ liệu demo.
3. [`database/04_seed_validation.sql`](database/04_seed_validation.sql) — kiểm tra số lượng và quan hệ dữ liệu.

Có thể chạy [`database/03_demo_queries.sql`](database/03_demo_queries.sql) để xem một số truy vấn minh họa. Các script schema và seed dành cho database mới; không chạy lặp lại trên database đã có dữ liệu.

### 3. Cài backend và cấu hình kết nối

Từ thư mục gốc của repository, tạo virtual environment, cài thư viện và sao chép file cấu hình mẫu:

```powershell
python -m venv backend/venv
backend/venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example .env
```

Mở `.env` và cập nhật `DATABASE_URL` theo SQL Server, database và ODBC Driver trên máy. Ví dụ với SQL Server Express và Windows Authentication:

```dotenv
DATABASE_URL=mssql+pyodbc://localhost\\SQLEXPRESS/UniversityLms_Dev?driver=SQL+Server&trusted_connection=yes&TrustServerCertificate=yes
```

Thay `localhost\\SQLEXPRESS`, tên database và `driver` nếu cấu hình local khác. File `.env` nằm ở thư mục gốc vì backend được khởi chạy từ đó; file này đã được Git bỏ qua. `APP_ENV` cần giữ là `development` để bật khởi tạo mật khẩu demo.

### 4. Khởi chạy backend

Trong cửa sổ PowerShell tại thư mục gốc:

```powershell
backend/venv/Scripts/python.exe -m uvicorn backend.app.main:app --reload --port 8000
```

FastAPI sẽ kết nối database khi khởi động. Trong môi trường `development`, backend tự đặt mật khẩu cho các tài khoản seed có mật khẩu đánh dấu chưa khởi tạo.

### 5. Cài và chạy frontend

Mở cửa sổ terminal thứ hai:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Mở ứng dụng tại [http://localhost:5173](http://localhost:5173). Vite chuyển tiếp các request `/api` đến `http://127.0.0.1:8000` theo cấu hình mặc định. Có thể đổi địa chỉ backend bằng biến môi trường `LMS_API_PROXY_TARGET`.

## Kiểm tra dịch vụ

- Giao diện web: [http://localhost:5173](http://localhost:5173).
- Backend health check: [http://localhost:8000/health](http://localhost:8000/health). Phản hồi thành công yêu cầu backend kết nối được SQL Server.
- Tài liệu API: [http://localhost:8000/docs](http://localhost:8000/docs).

## Chạy kiểm tra

Kiểm tra frontend từ thư mục `frontend`:

```powershell
npm run lint
npm run build
```

Kiểm tra backend không cần database từ thư mục gốc:

```powershell
backend/venv/Scripts/python.exe -m pytest backend/tests/test_forensic_contracts.py -q
```

Các bài kiểm tra backend tích hợp cần một SQL Server database riêng có tên bắt đầu bằng `UniversityLms_Test_`. Hướng dẫn chuẩn bị database và chạy đầy đủ suite nằm trong [runbook kiểm thử local](docs/audit/2026-10-21/06_DEMO_RUNBOOK.md).

## Chức năng theo vai trò

### Quản trị viên (ADMIN)

- Xem tổng quan số lượng người dùng, khóa học, sinh viên, giảng viên và lượt ghi danh.
- Tạo, cập nhật, tìm kiếm và lọc tài khoản theo vai trò hoặc trạng thái; kích hoạt hay tạm khóa tài khoản.
- Tạo khóa học, phân công giảng viên, chỉnh sửa thông tin, lưu trữ hoặc mở lại khóa học.
- Ghi danh sinh viên vào khóa học và rút ghi danh; xem danh sách lớp.
- Trong trang chi tiết khóa học, tạo và cập nhật chương học, bài giảng; xuất bản hoặc ẩn nội dung.
- Nhận thông báo cá nhân và đánh dấu thông báo đã đọc.

Backend cũng cho phép ADMIN quản lý bài tập, bài kiểm tra và xem sổ điểm. Các trang này có thể mở trực tiếp tại `/assignments`, `/quizzes` và `/grades`, nhưng hiện không xuất hiện trong menu điều hướng của quản trị viên.

### Giảng viên (LECTURER)

- Xem số khóa học được phân công, số sinh viên đang học và số bài nộp cần chấm.
- Xem khóa học được phân công và danh sách sinh viên trong lớp.
- Với khóa học mình phụ trách, tạo và cập nhật chương học, bài giảng; xuất bản hoặc ẩn nội dung.
- Tạo và cập nhật bài tập, đặt hạn nộp và điểm tối đa; xuất bản hoặc đóng bài tập.
- Xem bài nộp, chấm điểm và gửi nhận xét cho sinh viên.
- Tạo và cập nhật bài kiểm tra, câu hỏi; xuất bản hoặc ẩn bài kiểm tra, xem trước nội dung và xem các lượt làm bài.
- Xem sổ điểm của khóa học mình phụ trách.
- Xem và đánh dấu đã đọc thông báo cá nhân.

### Sinh viên (STUDENT)

- Xem tổng quan các khóa học đang học, bài tập sắp đến hạn, bài kiểm tra còn mở và thông báo chưa đọc.
- Xem các khóa học đang hoạt động mà mình đã được ghi danh; mở chương và bài giảng đã xuất bản.
- Xem bài tập được giao, nộp câu trả lời dạng văn bản và cập nhật bài nộp theo điều kiện của bài tập.
- Làm bài kiểm tra trắc nghiệm có giới hạn thời gian và số lượt; xem điểm sau khi nộp.
- Xem điểm và nhận xét của mình theo từng khóa học.
- Xem và đánh dấu đã đọc thông báo cá nhân.

### Phạm vi và quyền truy cập

- Giảng viên chỉ quản lý nội dung, bài tập, bài kiểm tra và điểm của khóa học được phân công.
- Sinh viên chỉ xem nội dung đã xuất bản trong khóa học đang hoạt động mà mình có ghi danh còn hiệu lực.
- Bài nộp hiện chỉ lưu văn bản; chức năng tải tệp trực tiếp chưa được hỗ trợ. Sinh viên có thể đưa liên kết tài liệu vào nội dung bài nộp.
- Bài kiểm tra tự động chấm câu hỏi một lựa chọn và đúng/sai. Quyền được kiểm tra ở backend; việc ẩn nút trên giao diện không thay thế kiểm tra quyền phía máy chủ.
- Sinh viên không tự ghi danh khóa học; việc ghi danh do quản trị viên thực hiện.

## Tài khoản thử nghiệm

Các tài khoản bên dưới được tạo bởi [`database/02_seed.sql`](database/02_seed.sql). Tất cả dùng chung mật khẩu `Demo@123` sau khi API khởi động với `APP_ENV=development`.

| Vai trò | Tài khoản |
| --- | --- |
| ADMIN | `admin@university.edu.vn` |
| LECTURER | `lecturer1@university.edu.vn`, `lecturer2@university.edu.vn`, `lecturer3@university.edu.vn` |
| STUDENT | `student1@university.edu.vn`, `student2@university.edu.vn`, `student3@university.edu.vn`, `student4@university.edu.vn`, `student5@university.edu.vn`, `student6@university.edu.vn` |

Chỉ sử dụng các thông tin này với database local dùng dữ liệu demo. Không dùng tài khoản hoặc khóa JWT mặc định ở môi trường triển khai.

## Cấu trúc repository

- `backend/app`: API, xác thực, phân quyền, mô hình và truy cập database.
- `backend/tests`: kiểm tra hợp đồng và kiểm thử backend.
- `database`: script schema, dữ liệu mẫu, kiểm tra seed và truy vấn demo.
- `frontend/src`: giao diện, các trang theo vai trò, client gọi API và kiểu dữ liệu.
- `docs`: kiến trúc, yêu cầu, API, thiết kế database, kế hoạch và bằng chứng kiểm thử.

## Tài liệu dự án

- [Tổng quan kiến trúc](docs/03_ARCHITECTURE.md).
- [Vai trò và use case](docs/02_ROLES_USE_CASES.md).
- [Thiết kế cơ sở dữ liệu](docs/04_DATABASE_DESIGN.md).
- [Danh sách API](docs/05_API_SPEC.md).
