> **Tài liệu đồ án học thuật mô phỏng.** Vai trò, ước tính, giả định, trạng thái và biên bản trong kế hoạch này không phải bằng chứng thực thi hoặc phê duyệt thực tế.

# 11 — Kế hoạch Quản lý Thay đổi (Change Management Plan)

## 1. Mục đích & Nguyên tắc Quản lý Thay đổi
Trong quá trình thực hiện dự án University LMS, các yêu cầu thay đổi có thể xuất phát từ người dùng, ban quản lý hoặc lý do kỹ thuật. Mục tiêu của quy trình quản lý thay đổi là:
- Đảm bảo mọi đề xuất thay đổi đều được ghi nhận, phân tích tác động và phê duyệt minh bạch.
- Ngăn chặn triệt để tình trạng "phình to phạm vi" (Scope Creep) làm vỡ đường găng 20 tuần và ngân sách trần 1,2 tỷ VNĐ.
- Duy trì tính đồng bộ của toàn bộ hồ sơ quản lý dự án khi có thay đổi được chấp thuận.

### Nguyên tắc xử lý mặc định (Default Deferral Rules):
Các tính năng sau đây mặc định bị **TỪ CHỐI hoặc HOÃN (REJECT / DEFER)** sang phiên bản tương lai, không được đưa vào scope của đồ án:
1. Trợ lý ảo AI / Tự động chấm bài luận bằng AI (AI Tutoring).
2. Phòng học trực tuyến / Video Call thời gian thực.
3. Hệ thống chat tin nhắn thời gian thực (Realtime chat/Websocket).
4. Kiến trúc Microservices hoặc Kubernetes.
5. Tích hợp cổng thanh toán học phí hoặc đăng ký học tín chỉ phức tạp.

---

## 2. Quy trình Kiểm soát Thay đổi (Change Control Workflow)

```mermaid
flowchart TD
    A["1. Đề xuất Thay đổi\n(Gửi phiếu Change Request - CR)"] --> B["2. Đăng ký & Sơ loại\n(PM ghi nhận vào Change Log)"]
    B --> C["3. Phân tích Tác động (Impact Analysis)\n(Đánh giá Scope, Schedule, Cost, Quality, Risk)"]
    C --> D{"4. Hội đồng Phê duyệt (CCB)\nThẩm định quyết định"}
    D -->|Phê duyệt (Approved)| E["5. Cập nhật Kế hoạch & Thực thi\n(Điều chỉnh Baseline, WBS, Code)"]
    D -->|Hoãn lại (Deferred)| F["6. Chuyển vào Backlog Tương lai\n(Ghi nhận vào FUTURE_ENHANCEMENTS.md)"]
    D -->|Từ chối (Rejected)| G["7. Thông báo lý do cho Người đề xuất\n(Đóng yêu cầu CR)"]
```

### Thành phần Hội đồng Kiểm soát Thay đổi (Change Control Board - CCB):
1. **Chủ tịch CCB:** Project Sponsor (Ban Giám hiệu nhà trường).
2. **Ủy viên nghiệp vụ:** Trưởng phòng Đào tạo (Business Owner).
3. **Ủy viên kỹ thuật:** Technical Lead / Trưởng phòng CNTT.
4. **Thư ký & Điều phối:** Project Manager (PM).

---

## 3. Biểu mẫu Yêu cầu Thay đổi Chuẩn (Change Request Form Template)

```text
PHIẾU ĐỀ XUẤT THAY ĐỔI (CHANGE REQUEST FORM)
Mã yêu cầu (CR ID): CR-[NĂM]-[SỐ THỨ TỰ] (Ví dụ: CR-2026-001)

1. THÔNG TIN CHUNG:
   - Tên đề xuất thay đổi: ................................................................
   - Người đề xuất: ................................... Chức vụ/Đơn vị: ................
   - Ngày gửi yêu cầu: [DD/MM/YYYY] | Mức độ ưu tiên: [Khẩn cấp / Cao / Vừa / Thấp]

2. MÔ TẢ CHI TIẾT THAY ĐỔI:
   - Hiện trạng (Hiện tại hệ thống đang như thế nào?): .................................
   - Nội dung thay đổi đề xuất: ......................................................
   - Lý do / Lợi ích mang lại: .......................................................

3. BÁO CÁO PHÂN TÍCH TÁC ĐỘNG (DO ĐỘI DỰ ÁN THỰC HIỆN):
   - Tác động đến Phạm vi (Scope Impact): ............................................
   - Tác động đến Tiến độ (Schedule Impact): Tăng/Giảm bao nhiêu tuần/ngày? ............
     (Có ảnh hưởng đến hoạt động trên đường găng hay không?)
   - Tác động đến Chi phí (Cost Impact): Tăng/Giảm bao nhiêu VNĐ? .....................
     (Có sử dụng quỹ dự phòng rủi ro 120 triệu VNĐ hay không?)
   - Tác động đến Rủi ro & Chất lượng (Risk/Quality Impact): ..........................

4. KHUYẾN NGHỊ CỦA PROJECT MANAGER:
   [ ] Phê duyệt (Approve)   [ ] Từ chối (Reject)   [ ] Hoãn (Defer to future)
   - Lý do khuyến nghị: ..............................................................

5. QUYẾT ĐỊNH CỦA HỘI ĐỒNG CCB (CHANGE CONTROL BOARD DECISION):
   - Quyết định chính thức: [ ĐÃ PHÊ DUYỆT / TỪ CHỐI / HOÃN LẠI ]
   - Ngày quyết định: [DD/MM/YYYY]
   - Chữ ký Đại diện CCB: .............................................................
```

---

## 4. Nhật ký Quản lý Thay đổi Thực tế (Project Change Log Example)

| Mã CR | Ngày đề xuất | Người đề xuất | Tóm tắt nội dung thay đổi | Phân tích tác động | Quyết định CCB | Ghi chú xử lý |
|---|---|---|---|---|:---:|---|
| **CR-01** | Tuần 5 | Đại diện Giảng viên | Thêm tính năng chat thảo luận trực tiếp giữa sinh viên và giảng viên trong khóa học. | Scope: Thêm module chat; Schedule: +3 tuần; Cost: +60 triệu VNĐ. Làm trễ đường găng. | **DEFERRED (Hoãn)** | Ghi nhận vào `FUTURE_ENHANCEMENTS.md` cho giai đoạn 2; giữ nguyên baseline prototype. |
| **CR-02** | Tuần 8 | Phòng Đào tạo | Bổ sung trường thông tin `StudentCode` (MSSV) và `StaffCode` (Mã GV) trong tài khoản người dùng để phục vụ quản lý học vụ. | Scope: Nhỏ; Schedule: 0 ngày (lồng vào thiết kế bảng Users); Cost: 0 VNĐ; Không lệch đường găng. | **APPROVED (Duyệt)** | Đã cập nhật vào schema CSDL `01_schema.sql` và model Pydantic tương ứng. |
| **CR-03** | Tuần 11 | Đại diện Sinh viên | Tích hợp cổng thanh toán trực tuyến tiền mua giáo trình học tập. | Scope: Lớn; Schedule: +4 tuần; Rủi ro bảo mật tài chính cao; Out-of-scope đồ án. | **REJECTED (Từ chối)** | Bác bỏ vì vi phạm Scope baseline môn học; hướng dẫn sinh viên thanh toán qua kênh kế toán trường. |


---

## 5. Yêu cầu thay đổi phát sinh trên repo ngày 23/10/2026 (ngoài nhật ký mô phỏng)

Có một bản code thử nghiệm về dashboard, study planner và analytics trên nhánh `feat/student-workload-and-dashboard-20261023`, kèm [CR-2026-10-23](14_CHANGE_REQUEST_2026-10-23.md). **Trạng thái: PROPOSED — CHƯA ĐƯỢC CCB PHÊ DUYỆT.** Đây không phải CR-01/02/03 giả định ở bảng ví dụ, không sửa baseline 20 tuần/1,2 tỷ, không tự tăng FR-01–FR-15 thành FR-19. Nếu đưa vào phạm vi nghiệm thu, cần phân tích impact, cập nhật WBS/CPM/budget/RTM/UAT và chứng minh kiểm thử thật trước khi chấp thuận.
