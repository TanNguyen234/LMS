# 13 — Đóng Dự án & Bài học Kinh nghiệm (Project Closure & Lessons Learned)

> **Kịch bản đóng dự án học thuật mô phỏng, chưa phải hồ sơ đóng dự án thực tế.** Trạng thái, chi phí, thời lượng, phê duyệt và bài học dưới đây là giả định đồ án; không dùng làm bằng chứng nghiệm thu hoặc chi tiêu.

## 1. Bảng kiểm Đóng dự án (Project Closure Checklist)

| STT | Hạng mục kiểm tra đóng dự án (Closure Item) | Tiêu chí hoàn thành | Tình trạng | Bằng chứng dẫn chiếu |
|:---:|---|---|:---:|---|
| 1 | Nghiệm thu phạm vi & Sản phẩm bàn giao | Kịch bản giả định: yêu cầu Must-have hoàn thành | **MÔ PHỎNG** | Mẫu UAT tại `12_UAT_AND_ACCEPTANCE_EVIDENCE.md` |
| 2 | Ký duyệt Biên bản UAT | Kịch bản giả định có đại diện các bên | **MÔ PHỎNG** | Không phải chữ ký thật hay xác nhận UAT |
| 3 | Xử lý khiếm khuyết phần mềm | Kịch bản giả định: xử lý defect theo severity | **MÔ PHỎNG** | Kết quả kiểm thử thực tế ghi riêng trong báo cáo forensic |
| 4 | Bàn giao mã nguồn & tài liệu kỹ thuật | Backend, frontend, CSDL và API docs | **MÔ PHỎNG** | Repo `backend/`, `frontend/`, `database/` |
| 5 | Phân tích độ lệch tiến độ & chi phí | Công thức EVM minh họa | **MÔ PHỎNG** | Chỉ là ví dụ tính toán ở mục 2 |
| 6 | Đánh giá bài học kinh nghiệm | Tổng kết theo kịch bản | **MÔ PHỎNG** | Tài liệu Lessons Learned tại mục 3 |
| 7 | Giải phóng nguồn lực & đóng hợp đồng | Kịch bản giả định ở mốc M8 | **MÔ PHỎNG** | Không có hợp đồng hoặc xác nhận thực tế |
| 8 | Đóng gói báo cáo đồ án | Kịch bản giả định hoàn tất hồ sơ | **MÔ PHỎNG** | Không khẳng định đã nộp hoặc được duyệt |

---

## 2. Ví dụ tính Earned Value (số liệu mô phỏng, không phải số đo dự án)

### 2.1 Đánh giá Tiến độ (Schedule Variance - SV)
- **Kế hoạch (Planned Duration):** 20 tuần.
- **Thời lượng giả định trong kịch bản:** 20 tuần; chưa có nhật ký thời gian thực tế.
- **PV giả định tại tuần 20:** 1.200.000.000 VNĐ.
- **EV giả định:** 1.200.000.000 VNĐ (giả định 100% hoàn thành; chưa được xác minh).
- **Độ lệch tiến độ:** $\text{SV} = \text{EV} - \text{PV} = 1.200.000.000 - 1.200.000.000 = \mathbf{0\text{ VNĐ}}$
- **Chỉ số hiệu suất tiến độ:** $\text{SPI} = \frac{\text{EV}}{\text{PV}} = \mathbf{1.0}$ (Dự án hoàn thành chính xác 100% theo đúng tiến độ baseline).

### 2.2 Đánh giá Chi phí (Cost Variance - CV)
- **BAC baseline giả định:** 1.200.000.000 VNĐ.
- **AC minh họa trong kịch bản:** 1.175.000.000 VNĐ; không phải chứng từ hoặc chi tiêu đo được.
  - Nhân sự: 840.000.000 VNĐ (giả định).
  - Chi phí hạ tầng & demo server: 120.000.000 VNĐ.
  - Công cụ & bản quyền: 48.000.000 VNĐ.
  - Đào tạo & workshop: 40.000.000 VNĐ.
  - Quản trị & hành chính: 32.000.000 VNĐ.
  - Quỹ dự phòng rủi ro giải ngân: 95.000.000 VNĐ / 120.000.000 VNĐ (dùng để tối ưu hóa truy vấn CSDL và bổ sung workshop hướng dẫn).
  - Dư quỹ dự phòng: 25.000.000 VNĐ.
- **CV minh họa:** EV − AC = **+25.000.000 VNĐ**.
- **CPI minh họa:** EV / AC ≈ **1,021**; không đánh giá hiệu quả chi phí thực tế.

---

## 3. Tổng kết Bài học Kinh nghiệm (Lessons Learned)

### 3.1 Về Quản lý Phạm vi (Scope Management)
- **Thành công:** Việc áp dụng triệt để "Stop Rule chống over-engineering" và khóa phạm vi nghiêm ngặt tại Tuần 4 đã cứu dự án khỏi nguy cơ trễ hạn. Việc kiên quyết hoãn (Defer) các tính năng phức tạp như chat realtime, AI hay SSO giúp đội ngũ tập trung hoàn thiện 100% các luồng cốt lõi.
- **Bài học rút ra:** Cần xác định ranh giới In-scope / Out-of-scope ngay từ ngày đầu và có chữ ký đồng thuận của các bên để làm căn cứ từ chối các yêu cầu phát sinh không chính đáng.

### 3.2 Về Thiết kế Kiến trúc & Kỹ thuật (Technical & Architecture)
- **Thành công:** Lựa chọn kiến trúc Modular Monolith trên nền FastAPI + React + SQL Server là hoàn toàn đúng đắn cho quy mô một đồ án prototype học thuật. Mã nguồn gọn gàng, dễ debug, dễ kiểm thử và không tiêu tốn tài nguyên quản lý phân tán.
- **Bài học rút ra:** Luôn phải bắt buộc kiểm tra phân quyền (RBAC) và tính toàn vẹn (Ownership) tại Server-side, không bao giờ tin cậy dữ liệu truyền lên từ Client. Việc che giấu trường `CorrectAnswer` thông qua Pydantic DTO riêng biệt là kinh nghiệm bảo mật tối quan trọng trong các ứng dụng thi cử.

### 3.3 Về Quản lý Tiến độ & Đường găng (Schedule & CPM)
- **Thành công:** Nhận diện đúng đường găng (Critical Path) và theo dõi sát các nhiệm vụ từ ACT-05 đến ACT-13 đã giúp dự án không bao giờ bị động. Việc tận dụng độ trễ (Total Float) của các gói thiết kế UI/UX và tài liệu đào tạo giúp điều phối nguồn lực linh hoạt mà không gây tắc nghẽn.
- **Bài học rút ra:** Khi chia nhỏ công việc thành các "Vertical Slices" (làm xong trọn vẹn từng luồng nghiệp vụ thay vì xây dựng skeleton dàn trải), việc tích hợp và kiểm thử diễn ra trơn tru hơn rất nhiều.

### 3.4 Về Quản lý Chất lượng & Dữ liệu (Quality & Data Management)
- **Thành công:** Bộ dữ liệu mẫu chuẩn (120 dòng seed data phân bố đều 10 dòng/bảng) và script kiểm tra tự động `04_seed_validation.sql` đã bảo đảm môi trường demo luôn sẵn sàng và không bao giờ gặp lỗi dữ liệu mồ côi.
- **Bài học rút ra:** Cần có cơ chế khởi tạo mật khẩu phát triển an toàn (sentinel password hash) để dữ liệu seed trong mã nguồn không chứa mật khẩu thực tế nhưng vẫn cho phép demo dễ dàng với tài khoản mẫu.

---

## 4. Biên bản Bàn giao & Đóng Dự án (Formal Sign-Off)

Trong kịch bản học thuật, dự án **University Learning Management System (LMS) Implementation** được giả định đóng tại mốc Tuần 20. Bảng dưới là mẫu ký duyệt mô phỏng, không phải phê duyệt thật.

| Đại diện bên liên quan | Họ và tên | Chức vụ | Trạng thái phê duyệt |
|---|---|---|---|
| Project Sponsor | Đại diện giả định | Vai trò mô phỏng | **CHƯA CÓ PHÊ DUYỆT THỰC TẾ** |
| Business Owner | Đại diện giả định | Vai trò mô phỏng | **CHƯA CÓ NGHIỆM THU THỰC TẾ** |
| Technical Authority | Đại diện giả định | Vai trò mô phỏng | **CHƯA CÓ BÀN GIAO THỰC TẾ** |
| Project Manager | Nhóm thực hiện đồ án | Vai trò mô phỏng | **MẪU KẾT THÚC, CHƯA XÁC NHẬN** |
