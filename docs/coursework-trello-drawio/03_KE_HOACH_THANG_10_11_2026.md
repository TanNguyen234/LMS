# Kịch bản quản lý dự án LMS trong tháng 10–11/2026

**Đề tài cô giao:** Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học.

**Công cụ được nêu:** Trello quản lý dự án, draw.io để thiết kế sơ đồ. Khối lượng chương báo cáo, ngân sách, mức lập trình và thời hạn chưa có rubric chính thức.

## 1. Bảng Trello thật

[QLDA — Xây dựng hệ thống LMS cho trường đại học](https://trello.com/b/sLfApXgV/qlda-x%C3%A2y-d%E1%BB%B1ng-h%E1%BB%87-th%E1%BB%91ng-lms-cho-tr%C6%B0%E1%BB%9Dng-%C4%91%E1%BA%A1i-h%E1%BB%8Dc)

**Snapshot ngày 23/10/2026:** 9 danh sách, 39 thẻ. 25 To Do bao gồm 10 PM + 15 Diagram, 2 yêu cầu xác nhận, 1 Blocked, 8 mốc kế hoạch M01–M08 và 3 card scenario SIM. Thẻ Done bằng 0 trong snapshot; không tự suy ra dự án đã nghiệm thu.

## 2. Lịch kịch bản học thuật

| Milestone | Khoảng thời gian | Deliverable |
|---|---|---|
| M01 | 01–07/10 | Problem, project objectives và scope |
| M02 | 08–14/10 | WBS, actor, sơ đồ sơ bộ |
| M03 | 15–21/10 | Đối chiếu core LMS với baseline audit |
| M04 | 22–31/10 | Hoàn thiện UML/ERD và review |
| M05 | 01–07/11 | Integration, authorization và browser checks |
| M06 | 08–14/11 | Kịch bản UAT có ghi kết quả thật khi chạy |
| M07 | 15–21/11 | Word, ảnh minh chứng, demo narration |
| M08 | 22–30/11 | Soát xét, đóng gói, bàn giao |

Các mốc M01–M03 là hồi cứu **trong phương án nhóm đề xuất**, không có bằng chứng rằng công việc diễn ra đúng các ngày trên. Ngày 23/10, các mốc tháng 11 nằm ở tương lai.

## 3. Dự toán mẫu tách khỏi kịch bản 20 tuần

| Chi phí mô phỏng | VND |
|---|---:|
| PM/BA 14 công × 350k | 4.900.000 |
| Backend 18 công × 400k | 7.200.000 |
| Frontend 16 công × 400k | 6.400.000 |
| QA 9 công × 300k | 2.700.000 |
| UX 6 công × 300k | 1.800.000 |
| Hạ tầng và demo | 1.200.000 |
| Công cụ / vật tư | 800.000 |
| Quỹ dự phòng | 2.000.000 |
| **Tổng giả định** | **27.000.000** |

27 triệu là budget **tình huống học thuật**, không phải chi phí thực tế hay số liệu cô yêu cầu. Không trộn với baseline 20 tuần và 1,2 tỷ VND trong tài liệu cũ của repo.

## 4. Kịch bản hoàn tất thành công ngày 30/11 (CHỈ MÔ PHỎNG)

Giả sử sản phẩm LMS đáp ứng tất cả Must-have, không còn lỗi P0/P1, 10/10 kịch bản UAT giả định đạt; nhóm có Word, UML và evidence. Ví dụ EVM: BAC/PV/EV=27 triệu, AC=25,65 triệu (giả định), CPI≈1,053. Đây là bảng minh họa phương pháp quản lý dự án, **không được chuyển thành kết quả kiểm thử thật, chi phí đã chi hay biên bản phê duyệt đã ký**.

Mẫu scenario có ba thẻ riêng trên Trello: SIM-01 (UAT), SIM-02 (EVM), SIM-03 (checklist). Các card này không được đánh dấu Done để ngụy tạo nghiệm thu.

## 5. Minh chứng đúng

Để trình bày báo cáo, yêu cầu tối thiểu đề xuất: chụp thật T01 board, T02 task/checklist, T03 milestone, T04 mô phỏng, D01 Use Case, D02 ERD trên diagrams.net, L01–L05 giao diện chạy thật nếu demo phần mềm và log kiểm thử có nguồn. Bản đồ nơi chèn hình đã được xuất thành Word riêng trong bộ tài liệu bàn giao qua chat.

**Ảnh PNG minh họa trong bản Word** được render từ mô hình của file .drawio, chưa phải screenshot ứng dụng draw.io. Trường hợp không có session có UI Trello để chụp, dùng link board và snapshot dữ liệu có chú thích thay vì dựng giao diện giả.

## 6. Quản lý thay đổi

Quy trình quyết định: đề xuất → impact scope/schedule/cost/quality → trưởng nhóm xem xét → cập nhật WBS/Trello nếu duyệt. Việc code của LMS gần hoàn chỉnh không đồng nghĩa toàn bộ chất lượng và UAT đã được xác minh. Giữ an toàn source; không push dữ liệu nhạy cảm hay lịch sử giả.
