# 13 — Đóng Dự án & Bài học Kinh nghiệm (Project Closure & Lessons Learned)

## 1. Bảng kiểm Đóng dự án (Project Closure Checklist)

| STT | Hạng mục kiểm tra đóng dự án (Closure Item) | Tiêu chí hoàn thành | Tình trạng | Bằng chứng dẫn chiếu |
|:---:|---|---|:---:|---|
| 1 | Nghiệm thu phạm vi & Sản phẩm bàn giao | 100% yêu cầu Must-have (FR-01 đến FR-13) hoàn thành | **ĐẠT (Done)** | Báo cáo UAT tại `12_UAT_AND_ACCEPTANCE_EVIDENCE.md` |
| 2 | Ký duyệt Biên bản UAT (UAT Sign-off) | Đại diện Sponsor, Đào tạo, Giảng viên, Sinh viên ký nhận | **ĐẠT (Done)** | Mốc M6 được phê duyệt tại Tuần 16 |
| 3 | Xử lý & Đóng khiếm khuyết phần mềm | 0 lỗi P0, 0 lỗi P1; các lỗi nhẹ P3 được ghi nhận | **ĐẠT (Done)** | Nhật ký Defect Triage Log, Pytest Suite pass 100% |
| 4 | Bàn giao Mã nguồn & Tài liệu kỹ thuật | Source code Backend, Frontend, CSDL và Swagger OpenAPI | **ĐẠT (Done)** | Repo Git, `backend/`, `frontend/`, `database/` |
| 5 | Phân tích độ lệch Tiến độ & Chi phí | Tính toán độ lệch SV, CV, chỉ số hiệu suất SPI, CPI | **ĐẠT (Done)** | Bảng phân tích Earned Value Management tại mục 2 |
| 6 | Đánh giá Bài học kinh nghiệm | Tổng kết kinh nghiệm các mảng phạm vi, kỹ thuật, quản lý | **ĐẠT (Done)** | Tài liệu Lessons Learned tại mục 3 |
| 7 | Giải phóng nguồn lực & Đóng hợp đồng | Toàn bộ nhân sự hoàn thành nhiệm vụ, thanh lý hợp đồng demo | **ĐẠT (Done)** | Quyết định đóng dự án tại mốc M8 (Tuần 20) |
| 8 | Đóng gói Báo cáo tổng kết đồ án | Hoàn thiện 10 chương báo cáo và slide thuyết trình | **ĐẠT (Done)** | Hồ sơ báo cáo chuẩn bị cho Hội đồng đánh giá |

---

## 2. Phân tích Độ lệch Tiến độ & Chi phí (Earned Value & Variance Analysis)

### 2.1 Đánh giá Tiến độ (Schedule Variance - SV)
- **Kế hoạch (Planned Duration):** 20 tuần.
- **Thực tế (Actual Duration):** 20 tuần (kết thúc đúng hạn tại mốc M8).
- **Giá trị theo kế hoạch (PV - Planned Value tại tuần 20):** 1.200.000.000 VNĐ.
- **Giá trị thu được (EV - Earned Value):** 1.200.000.000 VNĐ (100% công việc hoàn thành).
- **Độ lệch tiến độ:** $\text{SV} = \text{EV} - \text{PV} = 1.200.000.000 - 1.200.000.000 = \mathbf{0\text{ VNĐ}}$
- **Chỉ số hiệu suất tiến độ:** $\text{SPI} = \frac{\text{EV}}{\text{PV}} = \mathbf{1.0}$ (Dự án hoàn thành chính xác 100% theo đúng tiến độ baseline).

### 2.2 Đánh giá Chi phí (Cost Variance - CV)
- **Ngân sách được duyệt (BAC):** 1.200.000.000 VNĐ.
- **Chi phí thực tế phát sinh (AC - Actual Cost):** 1.175.000.000 VNĐ.
  - Chi phí nhân sự: 840.000.000 VNĐ (đúng dự toán).
  - Chi phí hạ tầng & demo server: 120.000.000 VNĐ.
  - Công cụ & bản quyền: 48.000.000 VNĐ.
  - Đào tạo & workshop: 40.000.000 VNĐ.
  - Quản trị & hành chính: 32.000.000 VNĐ.
  - Quỹ dự phòng rủi ro giải ngân: 95.000.000 VNĐ / 120.000.000 VNĐ (dùng để tối ưu hóa truy vấn CSDL và bổ sung workshop hướng dẫn).
  - Dư quỹ dự phòng: 25.000.000 VNĐ.
- **Độ lệch chi phí:** $\text{CV} = \text{EV} - \text{AC} = 1.200.000.000 - 1.175.000.000 = \mathbf{+25.000.000\text{ VNĐ}}$ (Dự án tiết kiệm được 25 triệu VNĐ từ quỹ dự phòng).
- **Chỉ số hiệu suất chi phí:** $\text{CPI} = \frac{\text{EV}}{\text{AC}} = \frac{1.200.000.000}{1.175.000.000} \approx \mathbf{1.021}$ (Hiệu quả sử dụng chi phí rất tốt, nằm dưới mức ngân sách trần).

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

Dự án **University Learning Management System (LMS) Implementation** chính thức được tuyên bố **HOÀN THÀNH VÀ ĐÓNG DỰ ÁN** tại mốc Tuần 20.

| Đại diện bên liên quan | Họ và tên | Chức vụ | Trạng thái phê duyệt |
|---|---|---|---|
| Project Sponsor | PGS.TS. Nguyễn Văn Thịnh | Phó Hiệu trưởng Đào tạo | **ĐÃ PHÊ DUYỆT ĐÓNG DỰ ÁN** |
| Business Owner | ThS. Trần Mai Lan | Trưởng phòng Đào tạo | **ĐÃ NGHIỆM THU BÀN GIAO** |
| Technical Authority | TS. Lê Hồng Quang | Trưởng phòng CNTT | **ĐÃ TIẾP NHẬN BÀN GIAO KỸ THUẬT** |
| Project Manager | Nguyễn Minh Trí | Trưởng nhóm dự án | **HOÀN THÀNH DỰ ÁN** |
