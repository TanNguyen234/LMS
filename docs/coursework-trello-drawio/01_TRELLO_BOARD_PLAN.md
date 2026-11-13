# Mẫu bảng Trello để quản lý đồ án LMS

**Tên board đề xuất:** QLDA — Xây dựng LMS cho trường đại học

> Đây là mẫu để **tạo thủ công trên Trello** hoặc dùng kết nối Trello sau khi được người dùng cấp quyền. Chưa có bảng Trello nào được tạo hay xác minh bởi tài liệu này.

## 1. Danh sách (Lists) — workflow

1. **00 — Yêu cầu & Tài liệu nguồn**: những gì cô thực sự yêu cầu, tiêu chí nghiệm thu và nguồn liên hệ.
2. **01 — Backlog**: công việc có giá trị nhưng chưa quyết định thực hiện.
3. **02 — To Do (Tuần này)**: việc đã có owner, deadline, đầu ra rõ ràng.
4. **03 — Doing**: công việc đang làm; hạn chế mỗi người 1–2 thẻ đồng thời.
5. **04 — Review / Kiểm tra**: sản phẩm chờ thành viên khác đọc, kiểm chứng hoặc góp ý.
6. **05 — Done / Có minh chứng**: chỉ chuyển khi thỏa Definition of Done.
7. **06 — Blocked / Chờ xác nhận**: thiếu thông tin, dữ liệu hoặc quyết định từ cô/nhóm.

Không ghi hoàn thành nếu thiếu evidence; nhãn trạng thái phải phản ánh việc thật trên board.

## 2. Labels gợi ý

- `PM`: Điều lệ, phạm vi, WBS, lịch, chi phí, rủi ro, nghiệm thu.
- `Diagram`: Sơ đồ thiết kế bằng draw.io.
- `LMS`: Phân tích nghiệp vụ, API, UI, dữ liệu hoặc code nếu chọn làm prototype.
- `Review`: Yêu cầu soát chéo.
- `Blocker`: Cần hỏi/thiếu quyết định.

**Fields mỗi thẻ:** tiêu đề hành động, mô tả đầu ra, owner thật, due date theo lịch thật, checklist, attachment/link evidence, danh sách phụ thuộc (nếu có), reviewer. Không tự gán ngày/owner giả.

## 3. Thẻ khởi tạo gợi ý

| ID | Thẻ Trello | Nhãn | Đầu ra khi hoàn thành |
|---|---|---|---|
| T01 | Xác nhận rubric, phần phải nộp và phạm vi lập trình với giảng viên | PM, Blocker | Tin nhắn / thông báo / ghi chép có nguồn |
| T02 | Thống nhất phạm vi MVP LMS và những thứ ngoài phạm vi | PM, LMS | Scope statement 1–2 trang |
| T03 | Lập danh sách stakeholder trường đại học và vai trò nhóm | PM | Stakeholder register gọn, có người phụ trách |
| T04 | Chia WBS các gói công việc của dự án LMS | PM, Diagram | WBS và người phụ trách; file .drawio nếu cần |
| T05 | Vẽ Use Case: Admin, Lecturer, Student | Diagram, LMS | File `02_lms_use_cases.drawio` đã review |
| T06 | Vẽ kiến trúc tổng quan và luồng dữ liệu | Diagram, LMS | File `03_lms_architecture.drawio` đã review |
| T07 | Vẽ sơ đồ quy trình thực hiện dự án | PM, Diagram | File `01_project_workflow.drawio` đã review |
| T08 | Thiết kế ERD dữ liệu LMS (khi cô yêu cầu sơ đồ CSDL) | Diagram, LMS | ERD đối chiếu với bảng dữ liệu thật |
| T09 | Lập tiến độ và phân công theo công việc Trello | PM | Due dates, dependency và milestone có nguồn |
| T10 | Lập ước lượng thời gian, công sức và chi phí **nếu được yêu cầu** | PM | Bảng estimate ghi rõ giả định và phương pháp |
| T11 | Quản lý rủi ro và cách xử lý phát sinh | PM | Risk log / issue log gắn thẻ Trello |
| T12 | Soát tính nhất quán giữa sơ đồ, Trello và báo cáo | Review | Checklist peer review và link tài liệu đã kiểm |
| T13 | Chuẩn bị kịch bản trình bày Trello + mở file draw.io | PM, Review | Demo có thể thực hiện trực tiếp |
| T14 | Ghi lại kết quả kiểm tra/chạy LMS **nếu có code** | LMS, Review | Log/screenshot thật, không dùng ảnh minh họa giả |
| T15 | Chốt bộ file nộp và phản hồi nhóm | PM | Thư mục bàn giao, link Trello và source draw.io |

## 4. Checklist mẫu cho một thẻ

Thẻ `T05 — Use Case LMS`:
- [ ] Xác định 3 actor chính và nghiệp vụ tương ứng.
- [ ] Vẽ với draw.io; không coi sơ đồ là chức năng đã code.
- [ ] Lưu file .drawio, đồng bộ repo.
- [ ] Người khác review actor, use case, quy tắc phân quyền.
- [ ] Gắn link commit hoặc file bản cuối vào thẻ.
- [ ] Chuyển sang Done sau khi reviewer xác nhận.

## 5. Definition of Done

Một thẻ chỉ **Done** khi: (a) có deliverable thật, (b) lưu đúng thư mục/tên file, (c) link trực tiếp đến file/ảnh/commit hoặc evidence, (d) được kiểm tra chéo, (e) không còn vấn đề gây ảnh hưởng nội dung nộp. 

**Trello không tự chứng minh các tài liệu đã được duyệt**. Chữ ký/nhận xét giảng viên chỉ được ghi khi có bằng chứng thật.
