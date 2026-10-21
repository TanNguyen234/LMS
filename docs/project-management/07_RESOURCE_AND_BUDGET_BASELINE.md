> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 07 — Kế hoạch Nguồn lực & Bản cơ sở Ngân sách (Resource & Cost Baseline)

## 1. Bản cơ sở Ngân sách (Budget Baseline Overview)
- **Tổng ngân sách phê duyệt (BAC - Budget at Completion):** **1.200.000.000 VNĐ** (Một tỷ hai trăm triệu đồng).
- **Thời lượng dự án:** 20 tuần (5 tháng).
- **Phương pháp ước tính:** Bottom-up Estimation kết hợp Parametric Costing.
- **Quy tắc kiểm soát:** Các khoản trong tài liệu là ước tính baseline; đối soát tổng tại [Project Charter](01_PROJECT_CHARTER.md) và bảng này.

---

## 2. Kế hoạch Nguồn lực Nhân sự (Human Resource Plan & Labor Cost)

Kế hoạch phân bổ nhân lực có tổng 8.5 FTE. Bảng chi phí gồm 9 dòng phân bổ (PM, BA, UI/UX, 2 BE, 2 FE, QA, DevOps); số đầu người thực tế không được xác định bởi bảng ngân sách:

| Vai trò (Role) | Số lượng / FTE | Thời gian tham gia | Đơn giá tháng (VNĐ/tháng) | Thành tiền (VNĐ) | Trách nhiệm chính |
|---|---:|:---:|---:|---:|---|
| **Project Manager (PM)** | 1.0 FTE | 5 tháng (20 tuần) | 30.000.000 | 150.000.000 | Quản lý tổng thể phạm vi, tiến độ, chi phí, rủi ro, stakeholder |
| **Business Analyst (BA)** | 1.0 FTE | 5 tháng (20 tuần) | 22.000.000 | 110.000.000 | Thu thập yêu cầu, viết SRS, thiết kế Use Cases và kịch bản UAT |
| **UI/UX Designer** | 1.0 FTE | 3 tháng (Tuần 3-14) | 20.000.000 | 60.000.000 | Thiết kế Wireframe, Design System, Mockup và prototype trải nghiệm |
| **Backend Developer 1 (Lead)** | 1.0 FTE | 5 tháng (20 tuần) | 25.000.000 | 125.000.000 | Thiết kế kiến trúc, CSDL SQL Server, FastAPI core, bảo mật & auth |
| **Backend Developer 2** | 1.0 FTE | 4 tháng (Tuần 5-20) | 20.000.000 | 80.000.000 | Hiện thực API bài học, bài tập, trắc nghiệm, sổ điểm & thông báo |
| **Frontend Developer 1 (Lead)** | 1.0 FTE | 5 tháng (20 tuần) | 25.000.000 | 125.000.000 | Kiến trúc React, TypeScript, Vite, định tuyến, state management |
| **Frontend Developer 2** | 1.0 FTE | 4 tháng (Tuần 5-20) | 20.000.000 | 80.000.000 | Phát triển giao diện chi tiết phân hệ Admin, Giảng viên, Sinh viên |
| **QA / Test Engineer** | 1.0 FTE | 4 tháng (Tuần 5-20) | 18.000.000 | 72.000.000 | Lập Test Plan, viết test case tự động Pytest, kiểm thử hệ thống & UAT |
| **DevOps / Infrastructure** | 0.5 FTE | 5 tháng (Tuần 1-20) | 7.600.000 (part-time)| 38.000.000 | Thiết lập môi trường server, CSDL SQL Server, CI/CD, backup |
| **TỔNG CHI PHÍ NHÂN SỰ (1)** | **8.5 FTE** | | | **840.000.000** | **Chiếm 70,0% tổng ngân sách** |

---

## 3. Dự toán Chi phí Phi nhân sự (Non-Labor Costs)

### 3.1 Hạ tầng máy chủ & Môi trường Demo (Infrastructure Cost)
- Máy chủ phát triển và staging (Local VM & Demo Server trong 5 tháng): 80.000.000 VNĐ
- Lưu trữ CSDL SQL Server, hệ thống lưu file và backup dữ liệu: 30.000.000 VNĐ
- Tên miền, chứng chỉ SSL và đường truyền mạng bảo mật: 10.000.000 VNĐ
- **Cộng mục Hạ tầng (2):** **120.000.000 VNĐ** (Chiếm 10,0%)

### 3.2 Công cụ phần mềm & Bản quyền (Tools & Software Licenses)
- Bản quyền công cụ thiết kế & phát triển (Figma, GitHub Enterprise, Postman, IDEs): 36.000.000 VNĐ
- Công cụ quản trị dự án & cộng tác (Jira, Confluence): 12.000.000 VNĐ
- **Cộng mục Công cụ & Bản quyền (3):** **48.000.000 VNĐ** (Chiếm 4,0%)

### 3.3 Đào tạo, Hướng dẫn & Truyền thông (Training & Materials)
- Tổ chức workshop hướng dẫn giảng viên và sinh viên pilot (3 phiên): 25.000.000 VNĐ
- Biên soạn, in ấn tài liệu hướng dẫn sử dụng và video hướng dẫn học vụ: 15.000.000 VNĐ
- **Cộng mục Đào tạo (4):** **40.000.000 VNĐ** (Chiếm 3,33%)

### 3.4 Quản lý dự án & Chi phí Hành chính (Administration & Management)
- Chi phí họp khởi động, các phiên nghiệm thu, văn phòng phẩm & tiếp khách: 20.000.000 VNĐ
- Chi phí đánh giá chất lượng học thuật và hội đồng nghiệm thu: 12.000.000 VNĐ
- **Cộng mục Hành chính (5):** **32.000.000 VNĐ** (Chiếm 2,67%)

### 3.5 Dự phòng rủi ro (Contingency Reserve)
- Quỹ dự phòng rủi ro tài chính (10% tổng ngân sách, dùng khi có rủi ro phát sinh theo Risk Register): **120.000.000 VNĐ** (Chiếm 10,0%)

---

## 4. Bảng Tổng hợp & Đối soát Ngân sách Baseline (Reconciliation Table)

| Hạng mục chi phí | Dự toán chi tiết (VNĐ) | Tỷ trọng (%) | Ghi chú kiểm soát |
|---|---:|---:|---|
| 1. Chi phí Nhân sự (Labor) | 840.000.000 | 70,00% | 9 dòng phân bổ, tổng 8.5 FTE; đầu người chưa xác định |
| 2. Hạ tầng & Môi trường Demo | 120.000.000 | 10,00% | Máy chủ, SQL Server, demo host |
| 3. Công cụ & Bản quyền phần mềm | 48.000.000 | 4,00% | Công cụ quản lý, thiết kế, code |
| 4. Đào tạo & Tài liệu hướng dẫn | 40.000.000 | 3,33% | Workshop, hướng dẫn người dùng |
| 5. Quản trị & Chi phí hành chính | 32.000.000 | 2,67% | Họp hành, đánh giá, thủ tục |
| 6. Dự phòng rủi ro (Contingency Reserve)| 120.000.000 | 10,00% | Dự phòng có quản lý theo CR |
| **TỔNG CỘNG NGÂN SÁCH (BAC)** | **1.200.000.000** | **100,00%** | **Khớp chính xác với baseline** |

$$\sum \text{Chi phí} = 840.000.000 + 120.000.000 + 48.000.000 + 40.000.000 + 32.000.000 + 120.000.000 = \mathbf{1.200.000.000\text{ VNĐ}}$$

---

## 5. Kế hoạch giải ngân theo các giai đoạn (Cash Flow Schedule)

```text
Giai đoạn (Phase)                           Ngân sách giải ngân (VNĐ)    Tỷ lệ tích lũy
───────────────────────────────────────────────────────────────────────────────────────
Phase 1: Khởi tạo & Phạm vi (W1-W4)                  180.000.000              15,0%
Phase 2: Thiết kế & Lập kế hoạch (W5-W6)             150.000.000              27,5%
Phase 3: Phát triển Prototype (W7-W12)               450.000.000              65,0%
Phase 4: Kiểm thử, UAT & Release (W13-W18)           240.000.000              85,0%
Phase 5: Đóng dự án & Dự phòng (W19-W20)             180.000.000             100,0%
───────────────────────────────────────────────────────────────────────────────────────
TỔNG CỘNG                                          1.200.000.000             100,0%
```
