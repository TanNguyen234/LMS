SET NOCOUNT ON;
BEGIN TRANSACTION;

-- USERS: 10 rows
INSERT INTO dbo.Users (UserId, Email, FullName, PasswordHash, Role, IsActive, StudentCode, StaffCode, CreatedAt) VALUES
(N'00000000-0000-0000-0000-000000000001', N'admin@university.edu.vn', N'Nguyễn Minh Admin', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'ADMIN', True, NULL, N'AD001', N'2026-08-01 01:00:00'),
(N'00000000-0000-0000-0000-000000000002', N'lecturer1@university.edu.vn', N'TS. Trần Hoàng Nam', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'LECTURER', True, NULL, N'GV001', N'2026-08-01 01:01:00'),
(N'00000000-0000-0000-0000-000000000003', N'lecturer2@university.edu.vn', N'ThS. Lê Thu Hà', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'LECTURER', True, NULL, N'GV002', N'2026-08-01 01:02:00'),
(N'00000000-0000-0000-0000-000000000004', N'lecturer3@university.edu.vn', N'TS. Phạm Quốc Bảo', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'LECTURER', True, NULL, N'GV003', N'2026-08-01 01:03:00'),
(N'00000000-0000-0000-0000-000000000005', N'student1@university.edu.vn', N'Nguyễn An', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV001', NULL, N'2026-08-10 02:00:00'),
(N'00000000-0000-0000-0000-000000000006', N'student2@university.edu.vn', N'Trần Bình', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV002', NULL, N'2026-08-10 02:01:00'),
(N'00000000-0000-0000-0000-000000000007', N'student3@university.edu.vn', N'Lê Chi', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV003', NULL, N'2026-08-10 02:02:00'),
(N'00000000-0000-0000-0000-000000000008', N'student4@university.edu.vn', N'Phạm Dũng', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV004', NULL, N'2026-08-10 02:03:00'),
(N'00000000-0000-0000-0000-000000000009', N'student5@university.edu.vn', N'Võ Giang', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV005', NULL, N'2026-08-10 02:04:00'),
(N'00000000-0000-0000-0000-000000000010', N'student6@university.edu.vn', N'Đặng Huy', N'$2b$12$UKEAJTGyJ5NEyoXvg0RFoOmKUtuGtyYTOUGKJAC9GRbjWUgXoQyCa', N'STUDENT', True, N'SV006', NULL, N'2026-08-10 02:05:00');

-- COURSES: 10 rows
INSERT INTO dbo.Courses (CourseId, CourseCode, Title, Description, LecturerId, Semester, AcademicYear, Credits, Status, CreatedAt) VALUES
(N'10000000-0000-0000-0000-000000000001', N'CS101', N'Nhập môn Lập trình', N'Cơ sở lập trình và tư duy giải thuật.', N'00000000-0000-0000-0000-000000000002', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:00:00'),
(N'10000000-0000-0000-0000-000000000002', N'CS202', N'Cấu trúc dữ liệu và giải thuật', N'Danh sách, cây, đồ thị và độ phức tạp.', N'00000000-0000-0000-0000-000000000002', N'HK1', N'2026-2027', 4, N'ACTIVE', N'2026-08-15 01:01:00'),
(N'10000000-0000-0000-0000-000000000003', N'DB201', N'Cơ sở dữ liệu', N'Mô hình quan hệ, SQL và thiết kế dữ liệu.', N'00000000-0000-0000-0000-000000000003', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:02:00'),
(N'10000000-0000-0000-0000-000000000004', N'SE301', N'Công nghệ phần mềm', N'Quy trình phát triển và đảm bảo chất lượng phần mềm.', N'00000000-0000-0000-0000-000000000003', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:03:00'),
(N'10000000-0000-0000-0000-000000000005', N'NW210', N'Mạng máy tính', N'Kiến trúc mạng, TCP/IP và dịch vụ mạng.', N'00000000-0000-0000-0000-000000000004', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:04:00'),
(N'10000000-0000-0000-0000-000000000006', N'OS301', N'Hệ điều hành', N'Kiến trúc hệ điều hành, quản lý tiến trình, đa luồng, điều phối CPU và bộ nhớ ảo.', N'00000000-0000-0000-0000-000000000004', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:05:00'),
(N'10000000-0000-0000-0000-000000000007', N'WEB220', N'Phát triển ứng dụng Web', N'Frontend, REST API và triển khai ứng dụng web.', N'00000000-0000-0000-0000-000000000002', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:06:00'),
(N'10000000-0000-0000-0000-000000000008', N'PM401', N'Quản lý dự án CNTT', N'Phạm vi, tiến độ, chi phí, rủi ro và chất lượng.', N'00000000-0000-0000-0000-000000000003', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:07:00'),
(N'10000000-0000-0000-0000-000000000009', N'SEC330', N'An toàn thông tin', N'Các nguyên lý bảo mật ứng dụng và hệ thống.', N'00000000-0000-0000-0000-000000000004', N'HK1', N'2026-2027', 3, N'ACTIVE', N'2026-08-15 01:08:00'),
(N'10000000-0000-0000-0000-000000000010', N'CLOUD350', N'Điện toán đám mây', N'Khái niệm cloud, container và triển khai dịch vụ.', N'00000000-0000-0000-0000-000000000004', N'HK1', N'2026-2027', 3, N'DRAFT', N'2026-08-15 01:09:00');

-- ENROLLMENTS: 30 rows
INSERT INTO dbo.Enrollments (EnrollmentId, CourseId, StudentId, EnrolledAt, Status, FinalScore) VALUES
(N'7436FC66-4BE3-49B7-8E27-02A305B2B9F4', N'10000000-0000-0000-0000-000000000004', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'6AED31AA-2EB2-49F2-BBC6-0B46CE057B15', N'10000000-0000-0000-0000-000000000004', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'4D2DBE49-A047-4E71-A1E7-0FF1D1495AAD', N'10000000-0000-0000-0000-000000000009', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'55E08AD2-04C3-40A9-87C1-1879C7AF53EE', N'10000000-0000-0000-0000-000000000006', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'335616F6-963F-418A-B428-1BAA183AA72C', N'10000000-0000-0000-0000-000000000007', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'F2899467-FD01-4EC8-9660-1D9775F75E69', N'10000000-0000-0000-0000-000000000001', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'D5FABB86-A552-477D-A804-293D557EFF29', N'10000000-0000-0000-0000-000000000006', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'5D488C00-7D09-4396-B38E-2DE1789415C7', N'10000000-0000-0000-0000-000000000008', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'A9C27AB6-BD6A-415C-9DE1-31766967EF3D', N'10000000-0000-0000-0000-000000000002', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'3834B470-D0A7-43B8-B106-32D72A95B77F', N'10000000-0000-0000-0000-000000000006', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'3E1CE13A-9A18-489A-8960-33213CF6852D', N'10000000-0000-0000-0000-000000000010', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'8CC50C5D-9D86-4FD2-AAD6-4119BD7448BE', N'10000000-0000-0000-0000-000000000003', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'F4242A0A-8034-4D10-BEC3-4284BBD055C8', N'10000000-0000-0000-0000-000000000003', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'9B83BF2F-EBDC-4C9C-B777-44EE441F205D', N'10000000-0000-0000-0000-000000000007', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'FBFC7082-E170-49FF-A048-574A1F23A4F9', N'10000000-0000-0000-0000-000000000002', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'158BE62B-291A-4128-9B4A-581A6A418B41', N'10000000-0000-0000-0000-000000000004', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'E154B402-5849-47E9-9560-61CD3ADB2206', N'10000000-0000-0000-0000-000000000005', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'8F9962E1-D266-418C-96C5-6577B1BEF865', N'10000000-0000-0000-0000-000000000009', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'DC745361-9A2A-4CB2-8AD9-672FD8A16054', N'10000000-0000-0000-0000-000000000009', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'82F715E4-8340-438B-951F-7949F53BD1EF', N'10000000-0000-0000-0000-000000000003', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'BD1D549B-D056-4CAB-9A99-79BC33A8106A', N'10000000-0000-0000-0000-000000000001', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'81F3B7C6-085F-4DFA-80A0-86378B7FF232', N'10000000-0000-0000-0000-000000000005', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'A0135D30-BB24-4EEB-A54D-976F6A450791', N'10000000-0000-0000-0000-000000000002', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'A4271018-902E-4CAD-91B2-A413276E6014', N'10000000-0000-0000-0000-000000000001', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'62255431-5E8E-43B8-B0C1-AB1D9BEDAB3C', N'10000000-0000-0000-0000-000000000008', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'8187FDD2-08DD-489A-9A0B-CB26E356DF56', N'10000000-0000-0000-0000-000000000010', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'473BD9B4-D620-4402-B112-D585359FFC34', N'10000000-0000-0000-0000-000000000008', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'AF90387E-CBA6-4AC8-9F40-DF00113FC83F', N'10000000-0000-0000-0000-000000000005', N'00000000-0000-0000-0000-000000000007', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'E3F8D4AA-57E8-42B8-902B-EFAF9A891375', N'10000000-0000-0000-0000-000000000010', N'00000000-0000-0000-0000-000000000006', N'2026-10-28 01:37:09', N'ACTIVE', NULL),
(N'0988A945-82BE-4BBF-8F49-F10655683987', N'10000000-0000-0000-0000-000000000007', N'00000000-0000-0000-0000-000000000005', N'2026-10-28 01:37:09', N'ACTIVE', NULL);

-- MODULES: 20 rows
INSERT INTO dbo.Modules (ModuleId, CourseId, Title, SortOrder, Description, IsPublished, CreatedAt) VALUES
(N'6CB9965E-BD8E-4883-8D38-06EF0FC40C01', N'10000000-0000-0000-0000-000000000004', N'Tuần 1 - Vòng đời Phát triển Phần mềm (SDLC)', 1, N'Tổng quan về các mô hình phát triển phần mềm cổ điển và hiện đại.', True, N'2026-10-28 01:37:09'),
(N'D7DB8DCC-2716-419F-9EDC-133B0131ED81', N'10000000-0000-0000-0000-000000000003', N'Tuần 2 - Ngôn ngữ Truy vấn SQL & Chuẩn hóa 3NF', 2, N'Cú pháp DDL tạo bảng và các quy tắc chuẩn hóa dữ liệu 1NF, 2NF, 3NF.', True, N'2026-10-28 01:37:09'),
(N'40748F73-DE88-4D3D-9757-134DBE59A4D3', N'10000000-0000-0000-0000-000000000006', N'Tuần 2 - Điều phối CPU & Đồng bộ hóa Tiến trình', 2, N'Các thuật toán lập lịch FCFS, Round Robin, SJF và vấn đề tương tranh.', True, N'2026-10-28 01:37:09'),
(N'87F3F0B4-99F6-44A0-AFC8-26B52C684C80', N'10000000-0000-0000-0000-000000000002', N'Tuần 1 - Đánh giá Thuật toán & Ký hiệu Big-O', 1, N'Đo lường thời gian thực thi và không gian bộ nhớ của thuật toán.', True, N'2026-10-28 01:37:09'),
(N'DA5A43CA-B3AD-46FD-BF04-2F246F9832E8', N'10000000-0000-0000-0000-000000000009', N'Tuần 1 - Nguyên lý Bảo mật & Tam giác CIA', 1, N'Tính bảo mật, toàn vẹn, khả dụng và các mô hình phòng thủ an ninh.', True, N'2026-10-28 01:37:09'),
(N'8D00A22E-AAF5-4C8D-B3EA-4FA1B1D11A49', N'10000000-0000-0000-0000-000000000005', N'Tuần 1 - Mô hình 7 tầng OSI & Giao thức TCP/IP', 1, N'Kiến trúc mạng máy tính, vai trò từng tầng và cơ chế đóng gói dữ liệu.', True, N'2026-10-28 01:37:09'),
(N'443D64C2-9CA6-4526-8F09-5D0FEF2AC80E', N'10000000-0000-0000-0000-000000000010', N'Tuần 1 - Tổng quan Điện toán Đám mây & Ảo hóa', 1, N'Khái niệm đám mây theo chuẩn NIST, mô hình IaaS, PaaS, SaaS.', True, N'2026-10-28 01:37:09'),
(N'BBA188FC-8264-4537-88DA-6370A64ABFED', N'10000000-0000-0000-0000-000000000008', N'Tuần 1 - Khởi tạo Dự án & Bản tuyên chương (Project Charter)', 1, N'Xác định mục tiêu SMART, phạm vi dự án và nhận diện các bên liên quan.', True, N'2026-10-28 01:37:09'),
(N'72B3F0B4-EB7D-4403-B898-732561EBB9E3', N'10000000-0000-0000-0000-000000000009', N'Tuần 2 - Lỗ hổng Ứng dụng Web & Mô hình Đe dọa STRIDE', 2, N'Nhận diện rủi ro theo OWASP Top 10: SQLi, XSS, CSRF và phương pháp khắc phục.', True, N'2026-10-28 01:37:09'),
(N'CB89C6CE-2879-4ACD-93E5-7FBB8637E21B', N'10000000-0000-0000-0000-000000000010', N'Tuần 2 - Đóng gói Container với Docker & Microservices', 2, N'Xây dựng Dockerfile, quản lý Images, Containers và Docker Compose.', True, N'2026-10-28 01:37:09'),
(N'0982AFE5-0648-49E0-BA48-82B7CA3FFB74', N'10000000-0000-0000-0000-000000000003', N'Tuần 1 - Mô hình Thực thể Quan hệ (ERD)', 1, N'Khảo sát thực tế, xác định thực thể, thuộc tính và mối kết hợp.', True, N'2026-10-28 01:37:09'),
(N'1515A016-AF26-42BE-A6D6-84CAAC249858', N'10000000-0000-0000-0000-000000000004', N'Tuần 2 - Đặc tả Yêu cầu Phần mềm (SRS)', 2, N'Kỹ thuật thu thập yêu cầu, viết User Stories và vẽ biểu đồ Use Case.', True, N'2026-10-28 01:37:09'),
(N'6DA200EA-7C98-4839-881F-8A0956C5DE6E', N'10000000-0000-0000-0000-000000000008', N'Tuần 2 - Phân rã Công việc (WBS) & Lập tiến độ Dự án', 2, N'Cấu trúc phân rã công việc WBS, ước lượng thời gian và sơ đồ Gantt.', True, N'2026-10-28 01:37:09'),
(N'BFCDE8F4-6C3B-46DE-A1AB-A179E327C578', N'10000000-0000-0000-0000-000000000001', N'Tuần 2 - Cấu trúc Điều khiển & Hàm', 2, N'Cấu trúc rẽ nhánh if-else, switch-case, vòng lặp for/while và kỹ thuật chia nhỏ hàm.', True, N'2026-10-28 01:37:09'),
(N'BB961FA2-DA78-4AB6-B7E1-A92CB2799360', N'10000000-0000-0000-0000-000000000002', N'Tuần 2 - Cấu trúc Dữ liệu Tuyến tính', 2, N'Danh sách liên kết đơn, Ngăn xếp (Stack) và Hàng đợi (Queue).', True, N'2026-10-28 01:37:09'),
(N'FF7FC1E1-34D6-4827-A2A7-ACE91E6D5F2C', N'10000000-0000-0000-0000-000000000006', N'Tuần 1 - Kiến trúc Nhân Hệ điều hành & Tiến trình', 1, N'Quản lý tiến trình, luồng, khối PCB và chuyển ngữ cảnh.', True, N'2026-10-28 01:37:09'),
(N'46F57274-E8AE-418F-9F9E-C9AC6BF95FB6', N'10000000-0000-0000-0000-000000000007', N'Tuần 2 - Frontend SPA với React & Xác thực JWT', 2, N'Xây dựng giao diện Single Page App, quản lý State và cơ chế đăng nhập bảo mật.', True, N'2026-10-28 01:37:09'),
(N'62157298-E990-4A40-974A-E3A6477C9F6A', N'10000000-0000-0000-0000-000000000007', N'Tuần 1 - Kiến trúc Web Hiện đại & RESTful API', 1, N'Kiến trúc Client-Server, giao thức HTTP/HTTPS và thiết kế API.', True, N'2026-10-28 01:37:09'),
(N'87DF6C12-5AE5-4554-BA1B-E90B04FBD431', N'10000000-0000-0000-0000-000000000001', N'Tuần 1 - Môi trường Lập trình & Cú pháp cơ bản', 1, N'Tổng quan về lập trình máy tính, biến, kiểu dữ liệu và cấu trúc tuần tự.', True, N'2026-10-28 01:37:09'),
(N'60E9B9C7-4CCF-4150-876C-F3B38A5BBBBF', N'10000000-0000-0000-0000-000000000005', N'Tuần 2 - Phân chia Mạng con (Subnetting) & Định tuyến', 2, N'Tính toán địa chỉ IP, Subnet Mask và cấu hình thiết bị mạng Cisco.', True, N'2026-10-28 01:37:09');

-- LESSONS: 20 rows
INSERT INTO dbo.Lessons (LessonId, ModuleId, Title, ContentHtml, MaterialUrl, SortOrder, IsPublished, EstimatedMinutes, CreatedAt) VALUES
(N'D88AE9D5-3E80-4DE4-93B4-0463A0346E11', N'D7DB8DCC-2716-419F-9EDC-133B0131ED81', N'Truy vấn SQL Nâng cao & Chuẩn hóa Dữ liệu', N'I. Mục tiêu học tập:
- Viết các truy vấn kết nối (JOIN), gom nhóm (GROUP BY) và hàm tổng hợp.
- Chuẩn hóa lược đồ bảng về dạng chuẩn 3 (3NF) để tránh dị thường dữ liệu.

II. Nội dung bài giảng:
1. Phân loại INNER JOIN, LEFT JOIN, FULL JOIN.
2. Phụ thuộc hàm và các bước chuẩn hóa cơ sở dữ liệu.

III. Yêu cầu thực hành:
- Chạy thử script SQL trong file sample-code.zip đính kèm.', N'/materials/db201-lab-guide.pdf, /materials/db201-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'8408176A-90C9-4AA0-8A4D-1BB95CBB117A', N'46F57274-E8AE-418F-9F9E-C9AC6BF95FB6', N'Tích hợp Giao diện React & Bảo mật Token JWT', N'I. Mục tiêu học tập:
- Quản lý trạng thái với React Hooks (useState, useEffect, useContext).
- Lưu trữ và gửi Token JWT qua HTTP Authorization Header.

II. Nội dung bài giảng:
1. Chu kỳ sống của React component và điều hướng React Router.
2. Cơ chế làm mới Token (Refresh Token) và xử lý lỗi phân quyền 401/403.

III. Yêu cầu thực hành:
- Tải mã nguồn mẫu giao diện trong file đính kèm để thực hành.', N'/materials/web220-lab-guide.pdf, /materials/web220-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'420A27A7-0BCA-412F-905E-30BF0E5DF7AF', N'1515A016-AF26-42BE-A6D6-84CAAC249858', N'Soạn thảo Bản đặc tả Yêu cầu Phần mềm (SRS)', N'I. Mục tiêu học tập:
- Phân biệt yêu cầu chức năng (Functional) và phi chức năng (Non-functional).
- Viết User Story theo tiêu chí INVEST và vẽ Use Case Diagram.

II. Nội dung bài giảng:
1. Cấu trúc chuẩn của một tài liệu SRS theo chuẩn IEEE 830.
2. Tiêu chí nghiệm thu (Acceptance Criteria) cho từng chức năng.

III. Yêu cầu thực hành:
- Tải mẫu biểu SRS template trong file đính kèm để thực hành.', N'/materials/se301-lab-guide.pdf, /materials/se301-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'D88B8877-ADF4-46A8-A675-39B187D9AC03', N'BB961FA2-DA78-4AB6-B7E1-A92CB2799360', N'Danh sách liên kết đơn & Ngăn xếp Stack', N'I. Mục tiêu học tập:
- Nắm vững cơ chế cấp phát bộ nhớ động bằng con trỏ.
- Cài đặt các thao tác thêm, xóa, tìm kiếm trên Linked List và cơ chế LIFO của Stack.

II. Nội dung bài giảng:
1. Cấu trúc Node và quản lý liên kết con trỏ.
2. Thao tác Push, Pop trên Stack và ứng dụng khử đệ quy.

III. Yêu cầu thực hành:
- Tải mã nguồn mẫu đính kèm để chạy thử demo cài đặt Linked List.', N'/materials/cs202-lab-guide.pdf, /materials/cs202-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'7AC6F6DC-4503-419E-9CEE-461B2A811CAA', N'40748F73-DE88-4D3D-9757-134DBE59A4D3', N'Thuật toán Lập lịch CPU & Vùng tranh chấp (Critical Section)', N'I. Mục tiêu học tập:
- Đánh giá thuật toán điều phối CPU dựa trên Throughput, Turnaround và Waiting Time.
- Hiểu điều kiện tương tranh (Race Condition), cơ chế Mutex và Semaphore.

II. Nội dung bài giảng:
1. Mô phỏng thuật toán Round Robin với lượng tử thời gian (Quantum).
2. Giải pháp Peterson và cơ chế khóa đồng bộ phần cứng.

III. Yêu cầu thực hành:
- Tải mã nguồn mô phỏng lập lịch trong file zip đính kèm để chạy thử.', N'/materials/os301-lab-guide.pdf, /materials/os301-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'DE5E85E1-1786-4708-994C-5A7F940389BC', N'6CB9965E-BD8E-4883-8D38-06EF0FC40C01', N'So sánh Mô hình Waterfall & Khung làm việc Agile', N'I. Mục tiêu học tập:
- Nắm vững các pha chuẩn trong quy trình phát triển phần mềm.
- Phân biệt giữa quy trình tuyến tính (Waterfall) và phương pháp linh hoạt (Agile Scrum).

II. Nội dung bài giảng:
1. Các sự kiện trong Scrum: Sprint Planning, Daily Scrum, Sprint Review.
2. Vai trò của Product Owner, Scrum Master và Development Team.

III. Yêu cầu thực hành:
- Đọc tài liệu slide và bài tập phân tích quy trình đính kèm bên trên.', N'/materials/se301-slide-tuan1.pdf, /materials/se301-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'9F2103FC-1A99-4B3B-BC18-754A4EEC1A89', N'60E9B9C7-4CCF-4150-876C-F3B38A5BBBBF', N'Kỹ thuật Chia Mạng con (VLSM) & Cấu hình Router', N'I. Mục tiêu học tập:
- Chia mạng con theo độ dài mặt nạ biến đổi (VLSM).
- Cấu hình định tuyến tĩnh và định tuyến động cơ bản.

II. Nội dung bài giảng:
1. Cách xác định Network ID, Broadcast ID và dải IP khả dụng.
2. Cấu hình bảng định tuyến (Routing Table) trên Router Cisco.

III. Yêu cầu thực hành:
- Tải bài lab Packet Tracer trong file đính kèm để mô phỏng mạng.', N'/materials/nw210-lab-guide.pdf, /materials/nw210-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'8181BFC0-C3A0-4DAC-9E1F-7D637752177C', N'62157298-E990-4A40-974A-E3A6477C9F6A', N'Thiết kế RESTful API Backend với FastAPI', N'I. Mục tiêu học tập:
- Nắm vững các phương thức chuẩn GET, POST, PUT, DELETE.
- Thiết kế định danh tài nguyên (URI) rõ ràng và chuẩn mã trạng thái HTTP.

II. Nội dung bài giảng:
1. Kiến trúc phân tầng Controller - Service - Repository.
2. Kiểm thực dữ liệu tự động với Pydantic và ORM SQLAlchemy.

III. Yêu cầu thực hành:
- Xem slide và làm bài thực hành theo file lab-guide đính kèm.', N'/materials/web220-slide-tuan1.pdf, /materials/web220-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'AB4D0341-A48F-4112-9897-7ED6B7577AA1', N'CB89C6CE-2879-4ACD-93E5-7FBB8637E21B', N'Đóng gói Ứng dụng với Docker & Điều phối Đám mây', N'I. Mục tiêu học tập:
- Viết Dockerfile tối ưu kích thước đa tầng (Multi-stage build).
- Khởi chạy hệ thống nhiều dịch vụ bằng Docker Compose.

II. Nội dung bài giảng:
1. Quản lý Container Network, Volume lưu trữ dữ liệu bền vững.
2. Giới thiệu kiến trúc Microservices và điều phối với Kubernetes.

III. Yêu cầu thực hành:
- Tải file docker-compose mẫu trong file sample-code.zip đính kèm.', N'/materials/cloud350-lab-guide.pdf, /materials/cloud350-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'96C73253-06B6-431B-9335-83E077BBAE7C', N'BFCDE8F4-6C3B-46DE-A1AB-A179E327C578', N'Vòng lặp và Kỹ thuật tổ chức hàm con', N'I. Mục tiêu học tập:
- Hiểu rõ cơ chế rẽ nhánh và lặp trong lập trình có cấu trúc.
- Biết cách thiết kế hàm, truyền tham số theo giá trị (Pass-by-value) và tham chiếu (Pass-by-reference).

II. Nội dung bài giảng:
1. Cấu trúc lặp for, while, do-while và các điều kiện thoát sớm (break, continue).
2. Tầm vực của biến (Scope) và biến toàn cục/cục bộ.
3. Nguyên lý tái sử dụng mã nguồn và tránh lặp code (DRY).

III. Yêu cầu thực hành:
- Tải mã nguồn mẫu sample-code.zip bên trên để chạy thử các ví dụ về vòng lặp và đệ quy.', N'/materials/cs101-lab-guide.pdf, /materials/cs101-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'0A3E45FF-78FC-4DE3-9941-8BBB73AFD55F', N'72B3F0B4-EB7D-4403-B898-732561EBB9E3', N'Mô hình hóa Đe dọa STRIDE & Phòng chống SQL Injection', N'I. Mục tiêu học tập:
- Phân tích rủi ro hệ thống bằng mô hình STRIDE của Microsoft.
- Sử dụng Parameterized Queries và ORM để triệt tiêu lỗi SQLi.

II. Nội dung bài giảng:
1. Kỹ thuật tấn công Injection và rò rỉ dữ liệu nhạy cảm.
2. Cơ chế lọc dữ liệu đầu vào (Input Sanitization) và mã hóa đầu ra.

III. Yêu cầu thực hành:
- Tải mã nguồn demo kiểm tra lỗ hổng trong file zip đính kèm.', N'/materials/sec330-lab-guide.pdf, /materials/sec330-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'09D5A972-4679-4097-915B-8C75DA39C1AA', N'8D00A22E-AAF5-4C8D-B3EA-4FA1B1D11A49', N'Phân tầng Mạng & Giao thức Truyền thông', N'I. Mục tiêu học tập:
- Hiểu chức năng 7 tầng trong mô hình OSI và 4 tầng của bộ TCP/IP.
- Nắm vững cơ chế đóng gói (Encapsulation) và mở gói (Decapsulation).

II. Nội dung bài giảng:
1. Tầng Transport: TCP tin cậy (3-way handshake) vs UDP tốc độ cao.
2. Tầng Network: Địa chỉ IPv4, IPv6 và nguyên lý định tuyến.

III. Yêu cầu thực hành:
- Mở Wireshark bắt gói tin và tham khảo slide hướng dẫn đính kèm.', N'/materials/nw210-slide-tuan1.pdf, /materials/nw210-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'D70D24C6-4DA5-4758-8AA1-9C3A8ADC8E78', N'6DA200EA-7C98-4839-881F-8A0956C5DE6E', N'Kỹ thuật Lập sơ đồ WBS & Quản lý Đường găng (CPM)', N'I. Mục tiêu học tập:
- Phân chia dự án thành các gói công việc (Work Packages) cụ thể.
- Xác định đường găng (Critical Path) để tối ưu thời gian bàn giao dự án.

II. Nội dung bài giảng:
1. Kỹ thuật ước lượng 3 điểm (PERT).
2. Xây dựng biểu đồ tiến độ Gantt Chart và theo dõi giá trị thu được (EVM).

III. Yêu cầu thực hành:
- Tải file Excel mẫu biểu WBS và Gantt Chart trong tệp đính kèm.', N'/materials/pm401-lab-guide.pdf, /materials/pm401-sample-code.zip', 1, True, 60, N'2026-10-28 01:37:09'),
(N'DAD162DA-B5B7-4B04-BAB8-AE77B131BED3', N'87DF6C12-5AE5-4554-BA1B-E90B04FBD431', N'Cài đặt công cụ và Khởi tạo dự án', N'I. Mục tiêu học tập:
- Nắm vững quy trình thiết lập IDE và trình biên dịch.
- Hiểu cấu trúc một chương trình chuẩn: hàm main, luồng thực thi và xuất nhập chuẩn (I/O).
- Biết cách biên dịch, chạy thử và debug cơ bản.

II. Nội dung bài giảng:
1. Cấu hình Visual Studio Code và GCC compiler.
2. Cú pháp khai báo biến, hằng số và các kiểu dữ liệu nguyên thủy (int, float, char, bool).
3. Sử dụng thư viện xuất nhập chuẩn stdio.h / iostream.

III. Yêu cầu thực hành:
- Tải slide bài giảng và hướng dẫn thực hành Lab 01 ở danh sách tài liệu đính kèm bên trên để bắt đầu làm bài.', N'/materials/cs101-slide-tuan1.pdf, /materials/cs101-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'EB76CD21-CC8E-44B8-8179-B17C682DAD49', N'0982AFE5-0648-49E0-BA48-82B7CA3FFB74', N'Thiết kế Lược đồ ERD & Khóa quan hệ', N'I. Mục tiêu học tập:
- Chuyển đổi yêu cầu nghiệp vụ thành bản vẽ mô hình quan hệ ERD.
- Xác định khóa chính (PK), khóa ngoại (FK) và các ràng buộc nghiệp vụ.

II. Nội dung bài giảng:
1. Mối kết hợp 1-1, 1-N, N-N và cách phân rã quan hệ nhiều-nhiều.
2. Ràng buộc toàn vẹn tham chiếu (Referential Integrity).

III. Yêu cầu thực hành:
- Đọc slide và làm bài thực hành theo file lab-guide đính kèm.', N'/materials/db201-slide-tuan1.pdf, /materials/db201-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'BA80BCF2-56A3-4665-8B8D-C4B65BAD4D23', N'BBA188FC-8264-4537-88DA-6370A64ABFED', N'Xây dựng Bản tuyên chương Dự án (Project Charter)', N'I. Mục tiêu học tập:
- Hiểu ý nghĩa pháp lý và định hướng của Project Charter.
- Thiết lập ranh giới phạm vi, ngân sách dự toán và cột mốc then chốt.

II. Nội dung bài giảng:
1. Phân tích các bên liên quan (Stakeholder Matrix).
2. Thẩm quyền và trách nhiệm của Giám đốc dự án (Project Manager).

III. Yêu cầu thực hành:
- Tham khảo mẫu Charter chuẩn trong tài liệu đính kèm để làm bài tập.', N'/materials/pm401-slide-tuan1.pdf, /materials/pm401-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'120A20E1-F5E6-4028-9E81-CA00D6900F28', N'DA5A43CA-B3AD-46FD-BF04-2F246F9832E8', N'Tam giác Bảo mật CIA & Chiến lược Phòng thủ Chiều sâu', N'I. Mục tiêu học tập:
- Hiểu rõ 3 yếu tố cốt lõi của an toàn thông tin: CIA Triad.
- Áp dụng nguyên tắc đặc quyền tối thiểu (Least Privilege).

II. Nội dung bài giảng:
1. Mã hóa đối xứng AES và mã hóa bất đối xứng RSA.
2. Hàm băm mật mã (SHA-256) và ứng dụng kiểm tra tính toàn vẹn.

III. Yêu cầu thực hành:
- Đọc tài liệu slide và bài tập phân tích an toàn thông tin đính kèm.', N'/materials/sec330-slide-tuan1.pdf, /materials/sec330-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'7B21340F-896C-453F-9A34-DF99C99A93CE', N'FF7FC1E1-34D6-4827-A2A7-ACE91E6D5F2C', N'Khái niệm Tiến trình (Process) & Đa luồng (Threading)', N'I. Mục tiêu học tập:
- Hiểu kiến trúc phân tầng Kernel và User Space.
- Nắm vững vòng đời tiến trình, khối PCB và chuyển ngữ cảnh (Context Switching).

II. Nội dung bài giảng:
1. Cấu trúc bộ nhớ của tiến trình: Text, Data, Heap, Stack.
2. Phân biệt Luồng mức người dùng và Luồng mức nhân.

III. Yêu cầu thực hành:
- Đọc giáo trình và bài tập điều phối tiến trình trong tài liệu đính kèm.', N'/materials/os301-slide-tuan1.pdf, /materials/os301-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'F32D1BA5-9D3B-4EB1-AAA9-F137C20B39EA', N'443D64C2-9CA6-4526-8F09-5D0FEF2AC80E', N'Các Mô hình Dịch vụ Đám mây & Nguyên lý Ảo hóa', N'I. Mục tiêu học tập:
- Nắm vững 5 đặc tính thiết yếu của Cloud Computing.
- Phân biệt giữa ảo hóa cấp phần cứng (Hypervisor) và ảo hóa cấp OS (Container).

II. Nội dung bài giảng:
1. So sánh chi phí CapEx vs OpEx trong chuyển đổi số.
2. Khả năng co giãn tự động (Auto Scaling) và tính sẵn sàng cao (High Availability).

III. Yêu cầu thực hành:
- Xem tài liệu slide và hướng dẫn thực hành cloud đính kèm bên trên.', N'/materials/cloud350-slide-tuan1.pdf, /materials/cloud350-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09'),
(N'3167F192-F970-4610-A6B0-FD99FE25BF09', N'87F3F0B4-99F6-44A0-AFC8-26B52C684C80', N'Phân tích độ phức tạp thời gian Big-O', N'I. Mục tiêu học tập:
- Đánh giá hiệu năng thuật toán độc lập với kiến trúc phần cứng.
- Nắm vững ý nghĩa toán học của Big-O, Big-Omega, Big-Theta.

II. Nội dung bài giảng:
1. Phân loại độ phức tạp: O(1), O(log n), O(n), O(n log n), O(n^2).
2. Quy tắc cộng và quy tắc nhân khi phân tích vòng lặp.
3. Đánh giá thuật toán trong trường hợp xấu nhất (Worst-case).

III. Yêu cầu thực hành:
- Xem slide và làm theo hướng dẫn bài tập trong tài liệu đính kèm.', N'/materials/cs202-slide-tuan1.pdf, /materials/cs202-lab-guide.pdf', 1, True, 60, N'2026-10-28 01:37:09');

-- ASSIGNMENTS: 20 rows
INSERT INTO dbo.Assignments (AssignmentId, CourseId, Title, Description, DueAt, MaxScore, AllowLate, AttachmentUrl, Status, CreatedAt) VALUES
(N'51340D09-9802-47FD-9C06-1B4489386DD4', N'10000000-0000-0000-0000-000000000004', N'Đồ án giữa kỳ - Ứng dụng thực tế SE301', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/se301-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'EA7E0FB7-4961-411A-AF4E-1C25EA26CBCF', N'10000000-0000-0000-0000-000000000001', N'Đồ án giữa kỳ - Ứng dụng thực tế CS101', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/cs101-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'EF19060E-699C-4267-9690-3BBBD47BE2F7', N'10000000-0000-0000-0000-000000000005', N'Bài tập 1 - Thực hành kỹ năng NW210', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/nw210-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'A6E8CFFD-A114-4443-B251-485891AE789D', N'10000000-0000-0000-0000-000000000006', N'Đồ án giữa kỳ - Ứng dụng thực tế OS301', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/os301-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'69BA3D49-83B4-448A-A2AD-4BC5BBB72FFB', N'10000000-0000-0000-0000-000000000003', N'Bài tập 1 - Thực hành kỹ năng DB201', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/db201-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'D48BB306-511C-4523-B567-527406DE0CF6', N'10000000-0000-0000-0000-000000000001', N'Bài tập 1 - Thực hành kỹ năng CS101', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/cs101-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'43E51CEA-EAF5-45A6-8354-5C21113985BD', N'10000000-0000-0000-0000-000000000010', N'Bài tập 1 - Thực hành kỹ năng CLOUD350', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/cloud350-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'E14CC1A4-EFA7-46CA-B9D6-5DB90E4D898A', N'10000000-0000-0000-0000-000000000010', N'Đồ án giữa kỳ - Ứng dụng thực tế CLOUD350', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/cloud350-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'29029EBB-B729-48D3-A97A-5EF9F37EA5D8', N'10000000-0000-0000-0000-000000000008', N'Đồ án giữa kỳ - Ứng dụng thực tế PM401', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/pm401-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'BAE9CAD6-70E0-45B4-806D-6A2E61334E0E', N'10000000-0000-0000-0000-000000000005', N'Đồ án giữa kỳ - Ứng dụng thực tế NW210', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/nw210-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'1EC687D1-1F42-449C-A484-6B674FEC4329', N'10000000-0000-0000-0000-000000000004', N'Bài tập 1 - Thực hành kỹ năng SE301', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/se301-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'8C597FD4-55AE-4469-81EF-6E7CEB4CA08B', N'10000000-0000-0000-0000-000000000009', N'Đồ án giữa kỳ - Ứng dụng thực tế SEC330', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/sec330-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'041C1925-704D-4B67-B0BF-71B35CFB8E3A', N'10000000-0000-0000-0000-000000000002', N'Bài tập 1 - Thực hành kỹ năng CS202', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/cs202-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'55EA671B-F144-4F3A-8EE6-72BA23D46453', N'10000000-0000-0000-0000-000000000003', N'Đồ án giữa kỳ - Ứng dụng thực tế DB201', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/db201-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'C2900591-64C4-4C5B-A863-7363BE594975', N'10000000-0000-0000-0000-000000000007', N'Bài tập 1 - Thực hành kỹ năng WEB220', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/web220-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'B0270008-1FAA-4CB6-8EAF-86C90C535FC2', N'10000000-0000-0000-0000-000000000008', N'Bài tập 1 - Thực hành kỹ năng PM401', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/pm401-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'FA6C7BF9-B386-413E-A1BE-9317A4FF3C59', N'10000000-0000-0000-0000-000000000006', N'Bài tập 1 - Thực hành kỹ năng OS301', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/os301-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'715EC069-94DE-4088-B351-A554EDF714ED', N'10000000-0000-0000-0000-000000000007', N'Đồ án giữa kỳ - Ứng dụng thực tế WEB220', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/web220-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'9ABA94D2-C309-4A27-B44A-C76ACCEC159A', N'10000000-0000-0000-0000-000000000002', N'Đồ án giữa kỳ - Ứng dụng thực tế CS202', N'Thực hiện đồ án nghiên cứu và phát triển giải pháp thực tế. Báo cáo gồm đặc tả kỹ thuật, mã nguồn và slide bảo vệ.', N'2026-11-30 23:59:00', N'10.00', False, N'/assignments/cs202-do-an-giua-ky.pdf', N'PUBLISHED', N'2026-10-28 01:37:09'),
(N'0CFC07D4-9320-45E5-A3E1-EF359C714EFB', N'10000000-0000-0000-0000-000000000009', N'Bài tập 1 - Thực hành kỹ năng SEC330', N'Yêu cầu sinh viên hoàn thành bài tập thực hành theo đề bài đính kèm. Nộp mã nguồn và file báo cáo PDF.', N'2026-11-15 23:59:00', N'10.00', True, N'/assignments/sec330-a1.pdf', N'PUBLISHED', N'2026-10-28 01:37:09');

-- SUBMISSIONS: 30 rows
INSERT INTO dbo.Submissions (SubmissionId, AssignmentId, StudentId, SubmittedAt, ContentText, FileUrl, Status, Score, Feedback, UpdatedAt) VALUES
(N'F6F9996C-A498-4D19-ABE4-062614E7BC4A', N'51340D09-9802-47FD-9C06-1B4489386DD4', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-se301-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'4CCAA3F0-AF7D-4B0E-B50D-1A47F9815718', N'0CFC07D4-9320-45E5-A3E1-EF359C714EFB', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-sec330-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'5234F40F-E8EF-4252-9C86-1F05DC83C268', N'EF19060E-699C-4267-9690-3BBBD47BE2F7', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-nw210-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'4EDCC08B-8AD3-4DE4-BA9A-261E7D2A0520', N'041C1925-704D-4B67-B0BF-71B35CFB8E3A', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-cs202-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'1FEDDEF5-04C2-43D7-B3AC-3780810BDD09', N'EA7E0FB7-4961-411A-AF4E-1C25EA26CBCF', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-cs101-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'DBE551A5-8103-4AA8-8F93-3B17C531E179', N'715EC069-94DE-4088-B351-A554EDF714ED', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-web220-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'2E81E729-ECF5-4EB6-81CB-3D0BA2FE65D3', N'69BA3D49-83B4-448A-A2AD-4BC5BBB72FFB', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-db201-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'6714F792-2262-462F-BFAF-406CFC4DCF29', N'1EC687D1-1F42-449C-A484-6B674FEC4329', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-se301-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'04294247-FE49-4C1B-A841-44963A16B637', N'EF19060E-699C-4267-9690-3BBBD47BE2F7', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-nw210-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'EC918709-5416-49D7-AE0B-4D04FF66C331', N'FA6C7BF9-B386-413E-A1BE-9317A4FF3C59', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-os301-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'7EF5C8FB-4ADE-4DC6-AC0B-4E0800A2E6F4', N'041C1925-704D-4B67-B0BF-71B35CFB8E3A', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-cs202-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'7F2ED291-E19C-4C16-A436-5639C824D6BC', N'55EA671B-F144-4F3A-8EE6-72BA23D46453', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-db201-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'2DB1575B-957C-45A2-BF5F-611EC57543EF', N'0CFC07D4-9320-45E5-A3E1-EF359C714EFB', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-sec330-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'56C53B15-9C7F-4248-919B-6CBF75A9D511', N'A6E8CFFD-A114-4443-B251-485891AE789D', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-os301-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'12085DED-2F41-410A-AD6E-89EFB864699C', N'E14CC1A4-EFA7-46CA-B9D6-5DB90E4D898A', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-cloud350-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'1A43BDC3-0D30-4E3E-8D14-8C3C96A2FF22', N'BAE9CAD6-70E0-45B4-806D-6A2E61334E0E', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-nw210-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'90ACF0F5-10C1-4F4D-B21D-9443AFB0DA47', N'1EC687D1-1F42-449C-A484-6B674FEC4329', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-se301-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'93A4EF8D-10D2-48AE-A3A1-97698C613E17', N'C2900591-64C4-4C5B-A863-7363BE594975', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-web220-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'552E7DB6-09A0-4028-8922-9E876A0E8D27', N'B0270008-1FAA-4CB6-8EAF-86C90C535FC2', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-pm401-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'BE99B0F3-FA32-43A8-8838-A18B43D2FB2B', N'69BA3D49-83B4-448A-A2AD-4BC5BBB72FFB', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-db201-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'92E71EA3-B583-47F0-B766-BE3C71CA60F1', N'43E51CEA-EAF5-45A6-8354-5C21113985BD', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-cloud350-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'C1BE3228-69B0-4A01-8BEE-C2F06A12ACC7', N'C2900591-64C4-4C5B-A863-7363BE594975', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-web220-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'204906B5-F1B6-48B7-8273-CF499B3DBE0E', N'29029EBB-B729-48D3-A97A-5EF9F37EA5D8', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-pm401-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'576E40E8-8655-4FF4-991F-DD3D4E28930D', N'9ABA94D2-C309-4A27-B44A-C76ACCEC159A', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-cs202-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'47798729-A8B8-4047-A6AF-DFDA67670CEE', N'B0270008-1FAA-4CB6-8EAF-86C90C535FC2', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-pm401-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'9C78CADC-D18C-4176-9AF7-E2C1D65582A5', N'D48BB306-511C-4523-B567-527406DE0CF6', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-cs101-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'F22DA330-FA63-4A2F-BE2A-EB2A2415747C', N'D48BB306-511C-4523-B567-527406DE0CF6', N'00000000-0000-0000-0000-000000000006', N'2026-10-26 09:15:00', N'Em gửi bản báo cáo bài tập 1 dạng PDF. Em đã hoàn thành 100% yêu cầu đề bài.', N'/submissions/sv002-cs101-a1.pdf', N'SUBMITTED', NULL, NULL, NULL),
(N'ECC51ADD-10E7-46C0-BFE8-EBFCF59C2D54', N'43E51CEA-EAF5-45A6-8354-5C21113985BD', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-cloud350-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09'),
(N'3DD4325A-C9E9-4DAA-B07B-ECE029AC6F5F', N'8C597FD4-55AE-4469-81EF-6E7CEB4CA08B', N'00000000-0000-0000-0000-000000000007', N'2026-10-27 16:00:00', N'Báo cáo đồ án giữa kỳ của nhóm sinh viên Lê Chi. Báo cáo đính kèm phân tích chi tiết.', N'/submissions/sv003-sec330-do-an.pdf', N'GRADED', N'9.50', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'2026-10-28 01:37:09'),
(N'28FC1442-97A3-42B9-90D2-EF13A60359F8', N'FA6C7BF9-B386-413E-A1BE-9317A4FF3C59', N'00000000-0000-0000-0000-000000000005', N'2026-10-25 14:30:00', N'Kính gửi Giảng viên, em xin nộp bài làm bài tập 1. Mã nguồn và kết quả kiểm thử đã đính kèm đầy đủ.', N'/submissions/sv001-os301-a1.zip', N'GRADED', N'9.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'2026-10-28 01:37:09');

-- QUIZZES: 10 rows
INSERT INTO dbo.Quizzes (QuizId, CourseId, Title, Description, StartAt, EndAt, TimeLimitMinutes, MaxAttempts, PassingScore, IsPublished, CreatedAt) VALUES
(N'50BC02E4-C6E8-4F1F-8C50-0BFBD89B3F27', N'10000000-0000-0000-0000-000000000006', N'Quiz 1 - Đánh giá kiến thức OS301', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Hệ điều hành.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'E311DCC3-1E3C-4E20-8176-11D61BB54FF7', N'10000000-0000-0000-0000-000000000001', N'Quiz 1 - Đánh giá kiến thức CS101', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Nhập môn Lập trình.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'F6733EAC-4958-4EF8-A16D-13F5EAA402F1', N'10000000-0000-0000-0000-000000000010', N'Quiz 1 - Đánh giá kiến thức CLOUD350', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Điện toán đám mây.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'4833CD42-EBFF-4B18-ABA7-29CF66834B93', N'10000000-0000-0000-0000-000000000009', N'Quiz 1 - Đánh giá kiến thức SEC330', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn An toàn thông tin.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'BB423C10-5BA6-4B17-8BEB-84819D105FF6', N'10000000-0000-0000-0000-000000000002', N'Quiz 1 - Đánh giá kiến thức CS202', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Cấu trúc dữ liệu và giải thuật.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'A372AD80-302A-4681-8CEB-A81DDD24447B', N'10000000-0000-0000-0000-000000000005', N'Quiz 1 - Đánh giá kiến thức NW210', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Mạng máy tính.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'F917503B-025D-4CE7-BAC7-BAAEF2904BFF', N'10000000-0000-0000-0000-000000000008', N'Quiz 1 - Đánh giá kiến thức PM401', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Quản lý dự án CNTT.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'63CAF9B2-823A-4373-982C-DD57F63ED300', N'10000000-0000-0000-0000-000000000003', N'Quiz 1 - Đánh giá kiến thức DB201', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Cơ sở dữ liệu.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'090E4896-764F-4D56-AFD8-EFEE337033E0', N'10000000-0000-0000-0000-000000000004', N'Quiz 1 - Đánh giá kiến thức SE301', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Công nghệ phần mềm.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09'),
(N'880C770F-EEB8-43A2-908B-FFF302C0844B', N'10000000-0000-0000-0000-000000000007', N'Quiz 1 - Đánh giá kiến thức WEB220', N'Bài kiểm tra trắc nghiệm 20 phút kiểm tra kiến thức tuần 1 và tuần 2 môn Phát triển ứng dụng Web.', N'2026-10-01 00:00:00', N'2026-11-30 23:59:00', 20, 2, N'5.00', True, N'2026-10-28 01:37:09');

-- QUIZQUESTIONS: 20 rows
INSERT INTO dbo.QuizQuestions (QuestionId, QuizId, QuestionText, QuestionType, OptionsJson, CorrectAnswer, Score, SortOrder) VALUES
(N'A2012BD5-CA5E-4EC9-8E06-0A7768457183', N'63CAF9B2-823A-4373-982C-DD57F63ED300', N'Mục tiêu cốt lõi của môn học Cơ sở dữ liệu (DB201) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'FA27E8C2-AA8B-4E7E-809F-1C0FF670F395', N'4833CD42-EBFF-4B18-ABA7-29CF66834B93', N'Khi nộp sản phẩm thực hành môn SEC330, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'4EBABDB2-DD5A-42E5-ACC3-1C99DC6E8258', N'E311DCC3-1E3C-4E20-8176-11D61BB54FF7', N'Khi nộp sản phẩm thực hành môn CS101, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'0A62C2E6-3D0C-4217-B6E6-1F81AD57BF80', N'880C770F-EEB8-43A2-908B-FFF302C0844B', N'Khi nộp sản phẩm thực hành môn WEB220, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'B8E0ACF4-D9B0-4819-8E6D-2052BA690698', N'E311DCC3-1E3C-4E20-8176-11D61BB54FF7', N'Mục tiêu cốt lõi của môn học Nhập môn Lập trình (CS101) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'383A7D6D-D602-4FF8-8080-351238DA0308', N'F6733EAC-4958-4EF8-A16D-13F5EAA402F1', N'Mục tiêu cốt lõi của môn học Điện toán đám mây (CLOUD350) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'705AEE57-07F4-41FD-BABA-412052103D49', N'880C770F-EEB8-43A2-908B-FFF302C0844B', N'Mục tiêu cốt lõi của môn học Phát triển ứng dụng Web (WEB220) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'9B6C6508-3CFE-41DD-83B1-506726A5F5C2', N'BB423C10-5BA6-4B17-8BEB-84819D105FF6', N'Mục tiêu cốt lõi của môn học Cấu trúc dữ liệu và giải thuật (CS202) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'926E419C-A8A9-4397-885B-74BA5AAA0E12', N'F917503B-025D-4CE7-BAC7-BAAEF2904BFF', N'Khi nộp sản phẩm thực hành môn PM401, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'14B1543D-3BB4-417E-B161-84819195206F', N'4833CD42-EBFF-4B18-ABA7-29CF66834B93', N'Mục tiêu cốt lõi của môn học An toàn thông tin (SEC330) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'AD15E731-C641-4A5B-882C-89BD83D0150C', N'090E4896-764F-4D56-AFD8-EFEE337033E0', N'Mục tiêu cốt lõi của môn học Công nghệ phần mềm (SE301) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'BFF74A47-6993-4FD6-8003-94A08C1686B1', N'090E4896-764F-4D56-AFD8-EFEE337033E0', N'Khi nộp sản phẩm thực hành môn SE301, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'2E25D11C-8AEB-4728-A888-A42DD769A123', N'BB423C10-5BA6-4B17-8BEB-84819D105FF6', N'Khi nộp sản phẩm thực hành môn CS202, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'D9BE50D4-42C8-41EE-A561-A7CCC6FC428A', N'F6733EAC-4958-4EF8-A16D-13F5EAA402F1', N'Khi nộp sản phẩm thực hành môn CLOUD350, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'87F0E830-A437-429F-AE74-AA7AFCF34269', N'A372AD80-302A-4681-8CEB-A81DDD24447B', N'Mục tiêu cốt lõi của môn học Mạng máy tính (NW210) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'3D2C8550-2791-4B54-91E5-AD541B8B9A00', N'50BC02E4-C6E8-4F1F-8C50-0BFBD89B3F27', N'Mục tiêu cốt lõi của môn học Hệ điều hành (OS301) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'79467440-8A5A-42E3-964D-B419407DE140', N'F917503B-025D-4CE7-BAC7-BAAEF2904BFF', N'Mục tiêu cốt lõi của môn học Quản lý dự án CNTT (PM401) là gì?', N'SINGLE_CHOICE', N'["Xây dựng kiến thức nền tảng và kỹ năng giải quyết bài toán thực tế", "Học thuộc lòng lý thuyết mà không cần thực hành", "Chỉ sử dụng công cụ có sẵn không cần hiểu nguyên lý", "Không có đáp án đúng"]', N'A', N'5.00', 1),
(N'75FA3591-7F30-4D5D-81FD-D1615511E24E', N'A372AD80-302A-4681-8CEB-A81DDD24447B', N'Khi nộp sản phẩm thực hành môn NW210, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'C8976583-EBFD-4D6A-8B70-EB4AC49029C7', N'63CAF9B2-823A-4373-982C-DD57F63ED300', N'Khi nộp sản phẩm thực hành môn DB201, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2),
(N'261ACD9E-BA4E-47FD-A6F3-F64E8E2B8045', N'50BC02E4-C6E8-4F1F-8C50-0BFBD89B3F27', N'Khi nộp sản phẩm thực hành môn OS301, sinh viên cần chú trọng điều gì nhất?', N'SINGLE_CHOICE', N'["Chỉ cần nộp đúng giờ không cần chạy được", "Tính đúng đắn của giải pháp, chuẩn mã nguồn và tài liệu kỹ thuật", "Sao chép nguyên văn bài làm từ nguồn khác", "Bỏ qua các tiêu chuẩn bảo mật"]', N'B', N'5.00', 2);

-- QUIZATTEMPTS: 10 rows
INSERT INTO dbo.QuizAttempts (AttemptId, QuizId, StudentId, StartedAt, SubmittedAt, AttemptNo, AnswersJson, Score) VALUES
(N'30FFD8B0-DF9D-4238-B992-4B1523A376F0', N'4833CD42-EBFF-4B18-ABA7-29CF66834B93', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'5C0D0B85-D519-4625-B7D6-6FC8AB4D98E2', N'090E4896-764F-4D56-AFD8-EFEE337033E0', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'F8E1FFE0-DA2B-43A5-AAE0-77E73DF8B4D4', N'BB423C10-5BA6-4B17-8BEB-84819D105FF6', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'7D1C871A-38C0-4C00-81EB-8F2644EBE7AF', N'50BC02E4-C6E8-4F1F-8C50-0BFBD89B3F27', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'EDAFA399-C1AD-45EC-A711-A04450DF4C50', N'F6733EAC-4958-4EF8-A16D-13F5EAA402F1', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'18953038-AA01-4234-9909-A140F27FF418', N'E311DCC3-1E3C-4E20-8176-11D61BB54FF7', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'9ACF38E2-DF47-461E-AD14-AAC70CA1D809', N'880C770F-EEB8-43A2-908B-FFF302C0844B', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'E7F5972E-7EE0-4524-9FE0-DC320AD23840', N'F917503B-025D-4CE7-BAC7-BAAEF2904BFF', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'17EAFB71-22D5-42DE-B039-EBCDE12C940F', N'A372AD80-302A-4681-8CEB-A81DDD24447B', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00'),
(N'F02D7416-D8D7-4C16-AD07-F54D143F1D3A', N'63CAF9B2-823A-4373-982C-DD57F63ED300', N'00000000-0000-0000-0000-000000000005', N'2026-10-20 10:00:00', N'2026-10-20 10:15:00', 1, N'{"q1":"A","q2":"B"}', N'10.00');

-- GRADES: 20 rows
INSERT INTO dbo.Grades (GradeId, CourseId, StudentId, SourceType, SourceId, Score, MaxScore, WeightPercent, Feedback, GradedBy, GradedAt) VALUES
(N'5FDDC3F6-0B96-4218-8C51-00E260F7C4A5', N'10000000-0000-0000-0000-000000000005', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'EF19060E-699C-4267-9690-3BBBD47BE2F7', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'6480CCED-977E-4FE7-BC87-0960D488A92E', N'10000000-0000-0000-0000-000000000005', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'BAE9CAD6-70E0-45B4-806D-6A2E61334E0E', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'14177086-08E0-4BE3-8A3C-0E673A533241', N'10000000-0000-0000-0000-000000000007', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'715EC069-94DE-4088-B351-A554EDF714ED', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09'),
(N'8D008457-A397-4468-A0DB-2A5565402189', N'10000000-0000-0000-0000-000000000004', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'1EC687D1-1F42-449C-A484-6B674FEC4329', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'EEACBC5E-B62E-4067-B3C9-3096076A9B3F', N'10000000-0000-0000-0000-000000000003', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'69BA3D49-83B4-448A-A2AD-4BC5BBB72FFB', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'2783D97D-8A61-451D-9862-41650E21E8C4', N'10000000-0000-0000-0000-000000000008', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'29029EBB-B729-48D3-A97A-5EF9F37EA5D8', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'3C063004-A4B3-4ADD-95A7-50DEC26CE7EA', N'10000000-0000-0000-0000-000000000006', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'FA6C7BF9-B386-413E-A1BE-9317A4FF3C59', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'A971179F-FCB3-4CAF-A80B-68F6CF7FCDB6', N'10000000-0000-0000-0000-000000000010', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'43E51CEA-EAF5-45A6-8354-5C21113985BD', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'1B3C735C-26DB-4705-B75B-703E3AF0BD11', N'10000000-0000-0000-0000-000000000007', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'C2900591-64C4-4C5B-A863-7363BE594975', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09'),
(N'10E9EC44-FC7E-4B51-AB34-869DC5BFFC4A', N'10000000-0000-0000-0000-000000000006', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'A6E8CFFD-A114-4443-B251-485891AE789D', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'F5A8715C-94D0-4C8E-8CAE-8764580080B8', N'10000000-0000-0000-0000-000000000009', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'0CFC07D4-9320-45E5-A3E1-EF359C714EFB', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'970BC830-0F32-40F1-BC3C-87808F96FB9B', N'10000000-0000-0000-0000-000000000003', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'55EA671B-F144-4F3A-8EE6-72BA23D46453', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'A7EBBE01-4E75-42CF-94CF-B1A7C467C4A4', N'10000000-0000-0000-0000-000000000002', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'041C1925-704D-4B67-B0BF-71B35CFB8E3A', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09'),
(N'BF2AC060-459B-4B72-ACA2-B8349492820C', N'10000000-0000-0000-0000-000000000002', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'9ABA94D2-C309-4A27-B44A-C76ACCEC159A', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09'),
(N'08D7B0BD-220B-4DD5-A71D-B9FDBC70517C', N'10000000-0000-0000-0000-000000000010', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'E14CC1A4-EFA7-46CA-B9D6-5DB90E4D898A', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'2320D498-1CF0-4ACA-AE43-D246DE7CA21B', N'10000000-0000-0000-0000-000000000009', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'8C597FD4-55AE-4469-81EF-6E7CEB4CA08B', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000004', N'2026-10-28 01:37:09'),
(N'D8DFF311-9E53-4F2E-9C84-D46DB9B76DDA', N'10000000-0000-0000-0000-000000000008', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'B0270008-1FAA-4CB6-8EAF-86C90C535FC2', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'EE355AB2-C8E0-41DB-9A4B-DB08C7974890', N'10000000-0000-0000-0000-000000000004', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'51340D09-9802-47FD-9C06-1B4489386DD4', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000003', N'2026-10-28 01:37:09'),
(N'2064C7BB-91E7-45F3-BD84-E2923C73C2C5', N'10000000-0000-0000-0000-000000000001', N'00000000-0000-0000-0000-000000000007', N'ASSIGNMENT', N'EA7E0FB7-4961-411A-AF4E-1C25EA26CBCF', N'9.50', N'10.00', N'30.00', N'Đồ án xuất sắc, kiến trúc phân tầng chuẩn mực.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09'),
(N'29FEC768-8875-45F6-96FC-E6E4C4A15B4F', N'10000000-0000-0000-0000-000000000001', N'00000000-0000-0000-0000-000000000005', N'ASSIGNMENT', N'D48BB306-511C-4523-B567-527406DE0CF6', N'9.00', N'10.00', N'20.00', N'Bài làm rất tốt, logic rõ ràng và có kiểm thử đầy đủ.', N'00000000-0000-0000-0000-000000000002', N'2026-10-28 01:37:09');

-- NOTIFICATIONS: 10 rows
INSERT INTO dbo.Notifications (NotificationId, UserId, Title, Message, Type, IsRead, CreatedAt, RelatedUrl) VALUES
(N'E72FF9BB-F252-4940-8FC3-028D9A6B35DF', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn CS202', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Cấu trúc dữ liệu và giải thuật.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000002'),
(N'46608E3B-3A9A-4257-98E1-3906FE850147', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn CLOUD350', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Điện toán đám mây.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000010'),
(N'9353897E-C6F1-4548-968B-5F1FA1863D88', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn NW210', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Mạng máy tính.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000005'),
(N'8066282D-8B4E-4690-BB98-63578D38ED7C', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn DB201', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Cơ sở dữ liệu.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000003'),
(N'D2811748-3227-408B-8DDF-63C1F80F67AA', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn WEB220', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Phát triển ứng dụng Web.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000007'),
(N'51FC9181-0970-46C8-B303-8DA4A4A78E67', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn CS101', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Nhập môn Lập trình.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000001'),
(N'49168696-2DB5-4FF0-8955-9DE2BAF965BB', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn SEC330', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn An toàn thông tin.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000009'),
(N'321D2BC5-23AC-461B-BBDC-D10D91A329D2', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn PM401', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Quản lý dự án CNTT.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000008'),
(N'C400788D-775A-49DE-AB73-D776446EDEC4', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn SE301', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Công nghệ phần mềm.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000004'),
(N'27C85773-4EFF-40DF-9A02-FDDDC4F0349A', N'00000000-0000-0000-0000-000000000005', N'Tài liệu mới môn OS301', N'Giảng viên đã đăng tải slide, tài liệu lab và bài tập cho môn Hệ điều hành.', N'COURSE', False, N'2026-10-28 01:37:09', N'/courses/10000000-0000-0000-0000-000000000006');

COMMIT;
GO
