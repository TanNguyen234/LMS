# 02 — Stakeholder Register & Power-Interest Matrix

## 1. Danh bạ các bên liên quan (Stakeholder Register)

| ID | Tên bên liên quan | Vai trò / Đơn vị | Phân loại | Kỳ vọng chính | Mức độ quan tâm (Interest) | Mức độ ảnh hưởng (Power) | Chiến lược quản trị (Engagement Strategy) |
|---|---|---|---|---|---|---|---|
| **SH-01** | Ban Giám hiệu (Sponsor) | Đại diện nhà trường | Nội bộ / Cao cấp | Triển khai đúng tiến độ, ngân sách, nâng cao chất lượng đào tạo | Cao (High) | Cao (High) | **Manage Closely (Quản lý chặt chẽ):** Họp định kỳ 2 tuần/lần, báo cáo mốc quan trọng, xin phê duyệt thay đổi lớn. |
| **SH-02** | Phòng Đào tạo (Business Owner) | Quản lý học vụ & chuẩn đầu ra | Nội bộ / Trực tiếp | Dễ dàng quản lý khóa học, phân công giảng viên, dữ liệu điểm minh bạch | Cao (High) | Cao (High) | **Manage Closely (Quản lý chặt chẽ):** Tham gia phân tích yêu cầu (Tuần 3-4), nghiệm thu UAT (Tuần 16). |
| **SH-03** | Phòng CNTT (Technical Stakeholder) | Quản trị hạ tầng mạng & CSDL | Nội bộ / Kỹ thuật | Bảo mật CSDL SQL Server, tuân thủ tiêu chuẩn mạng, an toàn dữ liệu | Cao (High) | Cao (High) | **Manage Closely (Quản lý chặt chẽ):** Tham gia review kiến trúc, phê duyệt phương án backup và cấp phát máy chủ demo. |
| **SH-04** | Đại diện Giảng viên (Lecturers) | Người dạy học trực tiếp | Nội bộ / Người dùng | Giao diện đăng bài học thuận tiện, chấm bài nhanh, tạo đề trắc nghiệm dễ dàng | Cao (High) | Vừa (Medium) | **Keep Informed / Consult (Tham vấn thường xuyên):** Phỏng vấn nhu cầu, workshop trải nghiệm prototype, huấn luyện sử dụng. |
| **SH-05** | Đại diện Sinh viên (Students) | Người học trực tiếp | Nội bộ / Người dùng | Truy cập tài liệu ổn định, nộp bài không lỗi, thi trắc nghiệm rõ ràng, xem điểm minh bạch | Cao (High) | Thấp (Low) | **Keep Informed (Cung cấp thông tin đầy đủ):** Hướng dẫn sử dụng trực quan, khảo sát mức độ hài lòng ở đợt pilot. |
| **SH-06** | Project Team (PM, BA, Dev, QA) | Đội ngũ triển khai dự án | Nội bộ / Thực thi | Yêu cầu rõ ràng, môi trường làm việc hiệu quả, đạt chuẩn môn học | Cao (High) | Vừa (Medium) | **Active Collaboration (Cộng tác tích cực):** Họp tiến độ hàng tuần, giải quyết blocker, duy trì liên tục. |
| **SH-07** | Giảng viên hướng dẫn môn học | Đánh giá học thuật đồ án | Bên ngoài / Giám sát | Hồ sơ quản lý dự án chuẩn chỉnh, prototype hoạt động trơn tru, logic nhất quán | Cao (High) | Cao (High) | **Manage Closely (Quản lý chặt chẽ):** Báo cáo theo đúng các mốc học phần, tuân thủ chặt chẽ đề cương. |

---

## 2. Ma trận Quyền lực - Mức độ quan tâm (Power-Interest Matrix)

```
Quyền lực (Power)
  ^
  |  [Keep Satisfied]                |  [Manage Closely]
C |                                  |  - Ban Giám hiệu (SH-01)
a |                                  |  - Phòng Đào tạo (SH-02)
o |                                  |  - Phòng CNTT (SH-03)
  |                                  |  - Giảng viên môn học (SH-07)
--+----------------------------------+----------------------------------
  |  [Monitor]                       |  [Keep Informed]
T |                                  |  - Đại diện Giảng viên (SH-04)
h |                                  |  - Đội ngũ dự án (SH-06)
ấ |                                  |  - Đại diện Sinh viên (SH-05)
p |                                  |
  +----------------------------------+---------------------------------->
                 Thấp                             Cao
                           Mức độ quan tâm (Interest)
```

### Phân tích chiến lược hành động:
1. **Manage Closely (Quyền lực cao, Quan tâm cao):**
   - SH-01 (Sponsor), SH-02 (Phòng Đào tạo), SH-03 (Phòng CNTT), SH-07 (Giảng viên môn học).
   - *Hành động:* Duy trì kênh liên lạc hai chiều, cập nhật tiến độ mỗi 2 tuần, tham vấn trước khi điều chỉnh phạm vi hoặc kiến trúc.
2. **Keep Informed (Quyền lực thấp/vừa, Quan tâm cao):**
   - SH-04 (Giảng viên), SH-05 (Sinh viên), SH-06 (Project Team).
   - *Hành động:* Cung cấp thông tin cập nhật thường xuyên, cung cấp tài liệu đào tạo mẫu, lấy phản hồi trong đợt thử nghiệm UAT.
3. **Keep Satisfied & Monitor:**
   - Đảm bảo các quy định an toàn thông tin, chính sách nhà trường được tuân thủ nghiêm ngặt để không phát sinh cản trở hành chính.
