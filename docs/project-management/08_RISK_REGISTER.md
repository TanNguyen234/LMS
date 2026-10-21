# 08 — Sổ theo dõi Rủi ro (Risk Register & Risk Management Plan)

> **Risk register giả định cho đồ án.** Mức độ, trigger, owner và trạng thái phản hồi là kế hoạch mô phỏng; không khẳng định sự kiện đã xảy ra hoặc biện pháp đã được triển khai.

## 1. Phương pháp luận & Thang đo Quản lý Rủi ro
Dự án áp dụng quy trình quản lý rủi ro chuẩn PMI gồm: Nhận diện $\rightarrow$ Phân tích định tính $\rightarrow$ Lập kế hoạch ứng phó $\rightarrow$ Giám sát và kiểm soát.

### 1.1 Thang đo Xác suất (Probability - P)
- **1 — Rất thấp (Very Low):** Khả năng xảy ra $< 10\%$
- **2 — Thấp (Low):** Khả năng xảy ra $10\% - 30\%$
- **3 — Trung bình (Medium):** Khả năng xảy ra $30\% - 50\%$
- **4 — Cao (High):** Khả năng xảy ra $50\% - 70\%$
- **5 — Rất cao (Very High):** Khả năng xảy ra $> 70\%$

### 1.2 Thang đo Mức độ tác động (Impact - I)
- **1 — Rất thấp:** Không ảnh hưởng đến tiến độ, chi phí tăng $< 1\%$
- **2 — Thấp:** Chậm tiến độ $< 1$ tuần, chi phí tăng $1\% - 5\%$
- **3 — Trung bình:** Chậm tiến độ $1 - 2$ tuần, chi phí tăng $5\% - 10\%$
- **4 — Cao:** Chậm tiến độ $2 - 4$ tuần, ảnh hưởng chức năng cốt lõi
- **5 — Rất cao / Nghiêm trọng:** Dừng dự án, rò rỉ dữ liệu, thất bại nghiệm thu

### 1.3 Ma trận Đánh giá Rủi ro (Risk Score = P × I)
- **1 – 4 (Xanh):** Rủi ro thấp (Low) $\rightarrow$ Giám sát định kỳ.
- **5 – 11 (Vàng):** Rủi ro trung bình (Medium) $\rightarrow$ Có biện pháp phòng ngừa chủ động.
- **12 – 25 (Đỏ):** Rủi ro cao / Khẩn cấp (High/Critical) $\rightarrow$ Bắt buộc có kế hoạch phòng ngừa và dự phòng chi tiết.

---

## 2. Bảng Theo dõi Rủi ro Chi tiết (Detailed Risk Register)

| Mã RR (Risk ID) | Tên & Mô tả rủi ro (Risk Description) | P (1-5) | I (1-5) | Điểm (P×I) | Mức độ | Dấu hiệu nhận biết (Trigger) | Người phụ trách (Owner) | Biện pháp phòng ngừa (Preventive Action) | Biện pháp dự phòng (Contingency Plan) | Trạng thái (Status) |
|---|---|:---:|:---:|:---:|:---:|---|---|---|---|:---:|
| **RSK-01** | **Mở rộng phạm vi ngoài kiểm soát (Scope Creep):** Các bên liên quan đề xuất thêm tính năng ngoài core (chat realtime, AI, SSO). | 4 | 4 | **16** | **Cao (Đỏ)** | Có yêu cầu thêm module trong các phiên họp tuần. | PM | Thiết lập Scope baseline chặt chẽ tại Tuần 4; quy định mọi yêu cầu mới phải qua Change Request. | Kích hoạt quy trình Change Control; mặc định Defer (hoãn) các tính năng ngoài scope sang backlog tương lai. | Đang kiểm soát |
| **RSK-02** | **Lỗ hổng phân quyền làm lộ dữ liệu (Authorization Breach):** Sinh viên truy cập dữ liệu quản trị hoặc đề thi/đáp án trắc nghiệm. | 2 | 5 | **10** | **Vừa (Vàng)** | Phát hiện endpoint thiếu kiểm tra token/role khi test. | Backend Lead | Bắt buộc kiểm tra RBAC và quyền sở hữu (ownership) tại server-side; che giấu `CorrectAnswer` ở DTO sinh viên. | Khóa endpoint ngay lập tức; viết bổ sung unit test chặn quyền (AC-02, AC-03, AC-09) trước khi release. | Đã giảm thiểu |
| **RSK-03** | **Tiến độ phát triển bị chậm (Late Development):** Khối lượng công việc backend/frontend lớn làm trễ mốc Feature Complete (W12). | 3 | 4 | **12** | **Cao (Đỏ)** | Burn-down chart bị lệch quá 3 ngày vào tuần 10. | PM & Dev Lead | Áp dụng mô hình Vertical Slice (làm từng luồng chạy được end-to-end), tránh over-engineering kiến trúc. | Điều chuyển nhân sự hỗ trợ từ các hoạt động có độ trễ dương (Total Float); rút gọn giao diện phụ. | Đang kiểm soát |
| **RSK-04** | **Giảng viên và sinh viên ít tiếp nhận (Low Adoption):** Người dùng pilot ngần ngại dùng hệ thống mới do quen kênh cũ. | 3 | 4 | **12** | **Cao (Đỏ)** | Tỷ lệ đăng nhập và tạo bài giảng thử nghiệm thấp sau tuần 16. | BA | Tổ chức sớm 3 phiên workshop thực hành trực tiếp; biên soạn tài liệu hướng dẫn và video clip trực quan. | Thu thập phản hồi nhanh, cải tiến các luồng nhập liệu phức tạp; hỗ trợ 1-1 cho các giảng viên nòng cốt. | Đang kiểm soát |
| **RSK-05** | **Số liệu tài liệu QLDA không nhất quán (PM Artefacts Inconsistency):** Số liệu thời gian, ngân sách, nhân sự lệch nhau giữa các file. | 3 | 4 | **12** | **Cao (Đỏ)** | Phát hiện độ lệch số liệu khi đối soát giữa WBS, CPM và Ngân sách. | PM | Dùng 13 tài liệu thật trong `docs/project-management/` và báo cáo đối soát ngày 2026-10-21; không dẫn chiếu file không tồn tại. | Chạy quy trình traceability review toàn bộ 13 tài liệu trước khi đóng gói báo cáo cuối kỳ. | Kế hoạch phản hồi mô phỏng |
| **RSK-06** | **Dữ liệu mẫu không đồng bộ (Seed Data Inconsistency):** Dữ liệu mẫu bị lỗi khóa ngoại hoặc sinh viên chưa enroll vẫn nộp bài. | 3 | 3 | **9** | **Vừa (Vàng)** | Lỗi foreign key violation khi chạy script seed. | Backend Dev | Sử dụng script kiểm tra tính toàn vẹn `04_seed_validation.sql` để xác minh 10 rows/bảng và không bản ghi mồ côi. | Chạy lại script nạp seed data sạch từ file transaction gốc trước mỗi phiên demo. | Đã giảm thiểu |
| **RSK-07** | **Phản hồi UAT quá muộn (Late UAT Feedback):** Phát hiện lỗi quy trình nghiệp vụ vào sát ngày nghiệm thu Tuần 16. | 3 | 3 | **9** | **Vừa (Vàng)** | Người dùng từ chối nghiệm thu do giao diện khó thao tác. | BA & QA | Cho các bên liên quan xem trước các bản demo tăng dần (incremental demo) vào cuối tuần 10 và 12. | Phân loại nhanh lỗi UAT: chỉ sửa lỗi P0/P1 trong tuần 16; chuyển các góp ý cải tiến sang P2/P3. | Đang kiểm soát |
| **RSK-08** | **Tải cao khi nộp bài/thi trắc nghiệm tập trung (Peak Quiz Load):** Nhiều sinh viên nộp bài cùng lúc gây nghẽn kết nối CSDL. | 3 | 3 | **9** | **Vừa (Vàng)** | Tốc độ phản hồi API chậm $> 2$ giây trong kịch bản đồng thời. | DevOps & Backend | Tối ưu hóa truy vấn CSDL, chỉ số hóa (Index) các cột tìm kiếm và lưu câu trả lời quiz dạng JSON gọn nhẹ. | Cấu hình Connection Pool cho SQLAlchemy và khuyến nghị mở rộng khung giờ làm bài trắc nghiệm. | Đang kiểm soát |
| **RSK-09** | **Sai lệch kỳ vọng về upload (Submission Upload Expectation):** UI prototype không truyền file bytes; MVP nộp bài hiện chỉ hỗ trợ văn bản. | 3 | 2 | **6** | **Vừa (Vàng)** | Người dùng chọn tệp nhưng không thấy tệp thật trong hệ thống. | DevOps | Bỏ file picker và ghi rõ nộp văn bản; upload file nằm ngoài phạm vi cho đến khi có quy trình xác thực và download an toàn. | Không có upload file ở MVP; chỉ xem xét lại qua Change Request. | Đang kiểm soát |
| **RSK-10** | **Lỗi kết nối CSDL SQL Server (DB Driver & Connection Issue):** Môi trường thiếu driver ODBC tương thích hoặc sai cấu hình xác thực. | 2 | 4 | **8** | **Vừa (Vàng)** | Backend không thể kết nối tới SQL Server khi khởi động. | DevOps & Backend | Viết script kiểm tra kết nối `test_sql.ps1`; hỗ trợ Windows Integrated Security và chuẩn hóa Connection String. | Cung cấp tài liệu cấu hình chi tiết cho SQL Server Express và tùy chọn chạy script qua LocalDB nếu cần. | Đã khắc phục |

---

## 3. Kế hoạch Giám sát & Báo cáo Rủi ro (Monitoring Cadence)
- **Tần suất rà soát:** Cập nhật Sổ theo dõi rủi ro vào mỗi buổi họp tiến độ hàng tuần (Thứ Hai).
- **Ngưỡng kích hoạt quỹ dự phòng (Contingency Reserve):** Bất kỳ rủi ro nào chuyển sang trạng thái sự cố (Issue) làm phát sinh chi phí hoặc kéo dài hoạt động trên đường găng sẽ được PM trình lên Sponsor để giải ngân từ quỹ dự phòng 120.000.000 VNĐ.
