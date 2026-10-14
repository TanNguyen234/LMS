# 12 — Kế hoạch & Bằng chứng Nghiệm thu Người dùng (UAT & Acceptance Evidence)

## 1. Mục đích & Phạm vi Nghiệm thu (UAT Purpose & Scope)
Giai đoạn Nghiệm thu người dùng (User Acceptance Testing - UAT) diễn ra tại **Tuần 16** (Mốc Milestone M6), với sự tham gia của đại diện 3 nhóm người dùng:
1. Đại diện Quản trị viên (Admin - Phòng Đào tạo)
2. Đại diện Giảng viên (Lecturers)
3. Đại diện Sinh viên (Students)

**Mục tiêu:** Kiểm chứng toàn bộ 10 kịch bản chấp nhận cốt lõi (AC-01 đến AC-10) và sự vận hành liên tục của hệ thống prototype University LMS trên bộ dữ liệu kiểm thử chuẩn.

---

## 2. Nhật ký Thực thi Kịch bản Chấp nhận (Acceptance Scenarios Log)

| Mã kịch bản (Scenario ID) | Tiêu chí chấp nhận & Mục đích | Vai trò thực hiện (Actor) | Điều kiện tiên quyết (Preconditions) | Các bước thực hiện (Test Steps) | Kết quả kỳ vọng (Expected Result) | Kết quả thực tế (Actual Result) | Đánh giá (Status) |
|---|---|:---:|---|---|---|---|:---:|
| **UAT-AC-01** | **Xác thực người dùng (Authentication):** Đăng nhập thành công trả về token và profile tương ứng. | All Roles (Admin / Lecturer / Student) | Tài khoản tồn tại trong DB, `IsActive = 1`, mật khẩu `Demo@123`. | 1. Mở trang login.<br>2. Nhập email & password.<br>3. Bấm Đăng nhập. | Trả về mã JWT hợp lệ, HTTP 200, lưu token và chuyển hướng đúng trang Dashboard theo vai trò. | Hệ thống cấp JWT token chính xác, hiển thị đúng họ tên và vai trò người dùng. | **PASS** |
| **UAT-AC-02** | **Phân quyền người dùng (Authorization):** Sinh viên không được phép gọi endpoint quản trị người dùng. | Student | Sinh viên đăng nhập thành công với token hợp lệ của role STUDENT. | 1. Dùng token Sinh viên gửi request GET tới `/api/users`. | Server trả về mã lỗi HTTP 403 Forbidden với thông điệp từ chối truy cập. | Hệ thống trả về HTTP 403 Forbidden: "Insufficient permissions". | **PASS** |
| **UAT-AC-03** | **Cô lập khóa học giữa các giảng viên (Course Isolation):** Giảng viên A không thể chỉnh sửa khóa học của Giảng viên B. | Lecturer | Giảng viên 2 đăng nhập; Khóa học CS101 thuộc quyền phụ trách của Giảng viên 1. | 1. Giảng viên 2 gửi request PUT sửa thông tin khóa CS101 hoặc thêm Module vào CS101. | Server từ chối thao tác, trả về mã lỗi HTTP 403 Forbidden. | Server kiểm tra `course.LecturerId == current_user.UserId`, trả về 403 Forbidden. | **PASS** |
| **UAT-AC-04** | **Tính duy nhất của ghi danh (Enrollment Uniqueness):** Không thể ghi danh trùng lặp sinh viên vào cùng khóa học. | Admin | Sinh viên An (SV001) đã được ghi danh vào môn CS101 (`Status = ACTIVE`). | 1. Admin chọn môn CS101.<br>2. Chọn ghi danh SV001 một lần nữa.<br>3. Xác nhận. | Server bắt lỗi ràng buộc duy nhất, trả về HTTP 400 Bad Request kèm thông báo đã ghi danh. | Hệ thống trả về HTTP 400: "Student is already enrolled in this course". | **PASS** |
| **UAT-AC-05** | **Ẩn nội dung bản nháp (Published Content Protection):** Sinh viên không thể thấy bài học chưa xuất bản. | Student | Khóa học có Module 1 với Bài học 1 (`IsPublished=1`) và Bài học 2 (`IsPublished=0`). | 1. Sinh viên mở danh sách bài học của môn học.<br>2. Cố gắng truy cập bài học 2 bằng ID. | Bài học 2 không xuất hiện trên danh sách; gọi trực tiếp bằng ID trả về HTTP 404/403. | Sinh viên chỉ nhận được bài học có `IsPublished=1`; bài học bản nháp hoàn toàn bị ẩn. | **PASS** |
| **UAT-AC-06** | **Ràng buộc hạn nộp bài tập (Assignment Deadline & Late Policy):** Chặn nộp bài sau deadline khi không cho phép trễ hạn. | Student | Bài tập có `DueAt < Hiện tại` và `AllowLate = 0`. | 1. Sinh viên chọn bài tập quá hạn.<br>2. Tải bài nộp và bấm Gửi bài. | Server từ chối nhận bài, trả về HTTP 400 Bad Request thông báo bài tập đã đóng. | Hệ thống kiểm tra thời gian thực tế so với DueAt, chặn nộp bài và thông báo lỗi hợp lệ. | **PASS** |
| **UAT-AC-07** | **Quy trình chấm bài & Đồng bộ điểm (Grading & Sync):** Giảng viên chấm bài, sinh viên thấy ngay điểm số và nhận xét. | Lecturer & Student | Sinh viên đã nộp bài; Giảng viên mở danh sách bài nộp của lớp. | 1. Giảng viên chấm 8.5/10 điểm kèm nhận xét.<br>2. Sinh viên đăng nhập vào Bảng điểm của tôi. | Bài nộp chuyển trạng thái GRADED; bảng `Grades` cập nhật; sinh viên thấy ngay điểm 8.5. | Điểm số và nhận xét phản hồi hiển thị tức thì trên giao diện sinh viên; thông báo được tạo. | **PASS** |
| **UAT-AC-08** | **Giới hạn số lượt làm bài thi (Quiz Max Attempts):** Chặn bắt đầu lượt làm mới khi đã hết số lượt cho phép. | Student | Bài kiểm tra quy định `MaxAttempts = 1`; Sinh viên đã nộp 1 bài làm trước đó. | 1. Sinh viên bấm "Bắt đầu làm bài" lần thứ 2. | Server từ chối tạo lượt thi mới, trả về HTTP 400 Bad Request thông báo đã hết lượt thi. | Hệ thống đếm số attempts đã có trong CSDL, trả về 400: "Maximum attempts reached". | **PASS** |
| **UAT-AC-09** | **Bảo mật đáp án trắc nghiệm (Quiz Secret Protection):** API không để lộ đáp án đúng cho sinh viên trước/trong khi thi. | Student | Đề thi trắc nghiệm có 5 câu hỏi; Sinh viên xem đề và làm bài. | 1. Mở công cụ Network kiểm tra payload JSON API trả về khi sinh viên lấy đề thi. | DTO trả về cho sinh viên chỉ có nội dung câu hỏi và danh sách lựa chọn; không có `CorrectAnswer`. | Payload API hoàn toàn không chứa trường `CorrectAnswer`; tính bảo mật được đảm bảo. | **PASS** |
| **UAT-AC-10** | **Bảo mật thông báo người dùng (Notification Ownership):** Không thể đọc hoặc sửa thông báo của tài khoản khác. | Student | Thông báo ID-1 thuộc về Giảng viên 1; Sinh viên đăng nhập với tài khoản của mình. | 1. Sinh viên gửi request PATCH đánh dấu đã đọc thông báo ID-1. | Server từ chối thao tác, trả về HTTP 403/404 vì không thuộc quyền sở hữu của user. | Server kiểm tra `notification.UserId == current_user.UserId`, trả về 403 Forbidden. | **PASS** |

---

## 3. Tổng hợp Kết quả Nghiệm thu (UAT Execution Summary)
- **Tổng số kịch bản kiểm thử UAT:** 10 kịch bản
- **Số kịch bản đạt (Pass):** 10 / 10 (Tỷ lệ 100%)
- **Số kịch bản không đạt (Fail):** 0 / 10
- **Số lỗi P0 (Blocker) phát hiện:** 0 lỗi
- **Số lỗi P1 (Major) phát hiện:** 0 lỗi
- **Số lỗi P2/P3 phát hiện:** 1 lỗi hiển thị giao diện nhỏ (đã xử lý trong đợt làm mịn)

---

## 4. Biên bản Nghiệm thu Người dùng (UAT Sign-Off Form)

Căn cứ vào kết quả thực hiện các kịch bản kiểm thử chấp nhận người dùng tại Tuần 16, các bên liên quan xác nhận:
1. Prototype hệ thống University LMS đáp ứng đầy đủ các yêu cầu nghiệp vụ bắt buộc được quy định trong Bản cơ sở phạm vi.
2. Hệ thống vận hành ổn định, dữ liệu được ghi nhận chính xác và cơ chế bảo mật phân quyền hoạt động đúng thiết kế.
3. Đồng ý phê duyệt Mốc tiến độ M6 (UAT Approval) và cho phép tiến hành chuẩn bị phát hành phiên bản Demo.

| Đại diện bên liên quan | Họ và tên | Chức vụ | Chữ ký xác nhận |
|---|---|---|---|
| Đại diện Quản trị / Đào tạo | ThS. Trần Mai Lan | Trưởng phòng Đào tạo | **ĐÃ KÝ DUYỆT (Passed)** |
| Đại diện Giảng viên | TS. Trần Hoàng Nam | Giảng viên Khoa CNTT | **ĐÃ KÝ DUYỆT (Passed)** |
| Đại diện Sinh viên | Nguyễn An | Lớp trưởng K26 CNTT | **ĐÃ KÝ DUYỆT (Passed)** |
| Đại diện Đội ngũ Dự án | Nguyễn Minh Trí | Project Manager | **ĐÃ KÝ DUYỆT (Passed)** |
