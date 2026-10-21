# 01 — Project Charter (Điều lệ Dự án)

> **Tài liệu đồ án học thuật mô phỏng.** Sponsor, khách hàng, phê duyệt, ngày và quy mô được giả định; bảng sign-off là mẫu, không phải chứng cứ phê duyệt thực tế.

## 1. Thông tin chung về dự án
- **Tên dự án:** University Learning Management System (LMS) Implementation
- **Mã dự án:** PRJ-LMS-2026
- **Môn học:** Quản lý dự án phần mềm (Software Project Management)
- **Đơn vị chủ quản / Khách hàng giả định:** Ban Giám hiệu & Phòng Đào tạo Trường Đại học
- **Giám đốc dự án (Project Manager):** Đại diện nhóm thực hiện đồ án
- **Ngày lập:** Tuần 1 (Kỳ học 2026-2027)
- **Thời lượng baseline:** 20 tuần
- **Ngân sách baseline:** 1.200.000.000 VNĐ (Một tỷ hai trăm triệu đồng)

---

## 2. Lý do thực hiện dự án (Business Case & Problem Statement)
Hiện tại, công tác quản lý dạy và học tại trường đại học đang bị phân tán qua nhiều kênh không đồng nhất (email, mạng xã hội, các thư mục chia sẻ đám mây cá nhân). Điều này dẫn đến các bất cập nghiêm trọng:
1. **Thất lạc và chậm trễ:** Sinh viên khó tiếp cận tài liệu chính thống, nộp bài muộn hoặc sai quy định.
2. **Khó khăn trong đánh giá:** Giảng viên tốn nhiều thời gian tổng hợp bài nộp, chấm trắc nghiệm thủ công và nhập điểm rời rạc.
3. **Thiếu kiểm soát quản lý:** Phòng Đào tạo và Ban Giám hiệu không thể giám sát tiến độ giảng dạy, tỷ lệ nộp bài và kết quả học tập theo thời gian thực.

**Mục tiêu dự án:**
Xây dựng kế hoạch quản lý toàn diện và phát triển prototype hệ thống University LMS tập trung, phục vụ quy mô giả định 10.000 sinh viên và 500 giảng viên (triển khai pilot tại các khoa nòng cốt), chứng minh khả năng vận hành của các luồng nghiệp vụ học tập cốt lõi và cung cấp đầy đủ hồ sơ bằng chứng quản lý dự án học thuật.

---

## 3. Mục tiêu dự án theo tiêu chí SMART
1. **Specific (Cụ thể):** Triển khai web app University LMS gồm 3 phân hệ chính (Admin, Giảng viên, Sinh viên) hỗ trợ phân phối bài học, nộp bài tập, thi trắc nghiệm tự động chấm và sổ điểm tập trung.
2. **Measurable (Đo lường được):** Nghiệm thu đạt 100% kịch bản kiểm thử Must-have (AC-01 đến AC-10), 0 lỗi P0/P1 khi nghiệm thu UAT, hoàn thiện 13 tài liệu hồ sơ quản lý dự án.
3. **Achievable (Khả thi):** Giới hạn phạm vi ở kiến trúc Modular Monolith (FastAPI + React + SQL Server), không triển khai microservices hay các tính năng mở rộng ngoài luồng cốt lõi.
4. **Relevant (Thích hợp):** Giải quyết trực tiếp bài toán chuyển đổi số quản lý học tập và đáp ứng toàn diện chuẩn đầu ra môn Quản lý dự án phần mềm.
5. **Time-bound (Thời hạn rõ ràng):** Hoàn thành toàn bộ trong 20 tuần (khởi động tuần 1, UAT tuần 16, đóng dự án tuần 20).

---

## 4. Phạm vi dự án tổng quan (Scope Overview)

### Trong phạm vi (In-Scope):
- Xác thực & Phân quyền: Đăng nhập email/mật khẩu, kiểm soát vai trò (ADMIN, LECTURER, STUDENT).
- Quản trị (Admin): Quản lý người dùng, tạo khóa học, phân công giảng viên, ghi danh sinh viên.
- Giảng viên (Lecturer): Quản lý giáo trình (Module/Bài học), tạo bài tập, chấm bài & phản hồi, tạo đề thi trắc nghiệm, quản lý sổ điểm.
- Sinh viên (Student): Xem nội dung đã xuất bản, nộp bài tập, làm bài kiểm tra trắc nghiệm trong khung giờ mở, xem điểm số và thông báo.
- Dữ liệu & Bằng chứng: Cơ sở dữ liệu Microsoft SQL Server (12 bảng), seed data chuẩn, bộ tài liệu quản lý dự án và bằng chứng UAT.

### Ngoài phạm vi (Out-of-Scope):
- Đăng ký môn học tự phục vụ, thanh toán học phí.
- Lớp học trực tuyến (video conference), chat thời gian thực.
- Kiểm tra đạo văn (plagiarism check), AI tutoring.
- Ứng dụng di động native, Single Sign-On (SSO) doanh nghiệp.

---

## 5. Các mốc tiến độ chính (Milestones)

| Mốc (Milestone) | Nội dung bàn giao chính | Thời hạn baseline |
|---|---|---|
| **M1** | Project Charter được phê duyệt | Cuối Tuần 2 |
| **M2** | Scope baseline & Requirements được phê duyệt | Cuối Tuần 4 |
| **M3** | PM Plan, UX Design & Architecture/DB baseline phê duyệt | Cuối Tuần 6 |
| **M4** | Prototype Feature Complete (Hoàn thiện chức năng) | Cuối Tuần 12 |
| **M5** | System & Integration Testing hoàn thành | Cuối Tuần 15 |
| **M6** | UAT (Nghiệm thu người dùng) phê duyệt | Cuối Tuần 16 |
| **M7** | Demo Release / Go-live simulation | Tuần 18 |
| **M8** | Project Closure & Nghiệm thu toàn diện | Tuần 20 |

---

## 6. Ngân sách baseline (Budget Summary)
Tổng ngân sách được phê duyệt: **1.200.000.000 VNĐ**
- Chi phí nhân sự (Labor Cost): 840.000.000 VNĐ (70,0%)
- Hạ tầng máy chủ & Môi trường Demo: 120.000.000 VNĐ (10,0%)
- Công cụ phần mềm & Bản quyền: 48.000.000 VNĐ (4,0%)
- Đào tạo, hướng dẫn & Truyền thông: 40.000.000 VNĐ (3,3%)
- Chi phí quản lý dự án & Hành chính: 32.000.000 VNĐ (2,7%)
- Dự phòng rủi ro (Contingency Reserve): 120.000.000 VNĐ (10,0%)

---

## 7. Cơ cấu tổ chức & Nhân sự dự án (Project Team Structure)
Nguồn lực theo kế hoạch giả định: tổng 8.5 FTE. Bảng ngân sách có 9 dòng phân bổ vai trò; tổng số đầu người không được khóa trong baseline.
1. Project Manager (1.0 FTE)
2. Business Analyst (1.0 FTE)
3. UI/UX Designer (1.0 FTE)
4. Backend Developer (2.0 FTE)
5. Frontend Developer (2.0 FTE)
6. QA Engineer (1.0 FTE)
7. DevOps / Infrastructure (0.5 FTE)

---

## 8. Các giả định & Ràng buộc (Assumptions & Constraints)
- **Giả định:** Ban Giám hiệu và các bên liên quan cung cấp đầy đủ thông tin yêu cầu học vụ; đội ngũ kỹ thuật có kỹ năng làm chủ FastAPI, React, SQL Server.
- **Ràng buộc công nghệ:** Backend FastAPI + SQLAlchemy 2.x + SQL Server qua pyodbc; Frontend React + TypeScript + Vite.
- **Ràng buộc thời gian:** 20 tuần không thay đổi trừ khi có Change Request cấp cao phê duyệt.
- **Ràng buộc ngân sách:** Giữ mức trần 1,2 tỷ VNĐ với 10% quỹ dự phòng.

---

## 9. Phê duyệt điều lệ (Charter Approval Sign-Off)

| Đại diện bên liên quan | Họ và tên | Chức vụ | Chữ ký / Tình trạng |
|---|---|---|---|
| Project Sponsor | Đại diện giả định | Vai trò mô phỏng | **MẪU — CHƯA CÓ PHÊ DUYỆT THỰC TẾ** |
| Business Owner | Đại diện giả định | Vai trò mô phỏng | **MẪU — CHƯA CÓ PHÊ DUYỆT THỰC TẾ** |
| Technical Authority | Đại diện giả định | Vai trò mô phỏng | **MẪU — CHƯA CÓ PHÊ DUYỆT THỰC TẾ** |
| Project Manager | Nhóm thực hiện đồ án | Vai trò mô phỏng | **MẪU — CHƯA CÓ XÁC NHẬN THỰC TẾ** |
