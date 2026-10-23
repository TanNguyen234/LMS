# Rà soát định hướng — Đề tài: Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học

Ngày rà soát: **23/10/2026**. Đối tượng: repo `TanNguyen234/LMS`, `main` và nhánh thử nghiệm `feat/student-workload-and-dashboard-20261023`.

> Đồ án thuộc **môn Quản lý dự án phần mềm**. LMS là sản phẩm minh chứng cho cách quản lý dự án từ khởi tạo đến đóng dự án. Không coi số dòng code, số dashboard, số endpoint là tiêu chí thành công chính.

## 1. Phân biệt phạm vi sản phẩm và phạm vi công tác quản lý dự án

**Phạm vi sản phẩm (product scope):** prototype web LMS ở 3 vai trò, chạy được đăng nhập/phân quyền, user/course/enrollment, module/lesson, assignment/submission/grade, quiz/attempt, thông báo cơ bản; backend FastAPI, frontend React/Vite và SQL Server theo yêu cầu đã chốt.

**Phạm vi dự án (project scope):** xác lập business case, Charter và stakeholder; phân rã scope thành WBS; lập lịch và CPM; tính nguồn lực/chi phí; quản lý risk/quality/communication/change; theo dõi triển khai, test/UAT và đóng gói bằng chứng; kiểm soát các thay đổi có phê duyệt.

**Lưu ý về mô phỏng:** Cỡ triển khai 10.000 sinh viên/500 giảng viên và kế hoạch 20 tuần/1,2 tỷ VND trong hồ sơ là **giả định học thuật**, không phải quy mô chịu tải được thử nghiệm hoặc kinh phí đã thực chi.

## 2. Đánh giá đối chiếu các hồ sơ hiện có

| Mảng quản lý dự án | Tài liệu nguồn hiện có | Đánh giá phạm vi / lưu ý chứng cứ |
|---|---|---|
| Initiation | `01_PROJECT_CHARTER.md`, `02_STAKEHOLDER_REGISTER.md` | Có mục tiêu, sponsor/stakeholder mô phỏng, giả định và ràng buộc; chưa có quyết định thật của sponsor |
| Responsibility | `03_RACI_MATRIX.md` | Có phân vai trách nhiệm theo work package; vai trò/FTE ở kế hoạch mang tính giả định |
| Scope | `04_SCOPE_BASELINE_WBS.md`, `05_WBS_DICTIONARY.md`, `docs/01_SCOPE_AND_REQUIREMENTS.md` | Có WBS Level 3 và từ điển; phải giữ FR-01–FR-15 làm baseline, không tự thêm FR-16–FR-19 |
| Schedule | `06_SCHEDULE_CPM_GANTT.md` | Có bảng CPM và baseline 20 tuần; là lịch kế hoạch, **không phải tiến độ thực tế**. Mọi thay đổi công việc phải tính lại đường găng |
| Resource/Cost | `07_RESOURCE_AND_BUDGET_BASELINE.md` | Có phân rã 1,2 tỷ và 8,5 FTE giả định; chưa có timesheet, invoice hay actual cost để tính variance thực |
| Risk | `08_RISK_REGISTER.md` | Có scoring/owner/trigger/response. Cần đưa nguy cơ scope creep của nhánh mở rộng vào CR/risk review |
| Quality | `09_QUALITY_PLAN_AND_GATES.md` | Có quality gates, DoD và test strategy; phải phân biệt test bằng log thật với checklist kế hoạch |
| Communication | `10_COMMUNICATION_PLAN.md` | Có ma trận và mẫu báo cáo; không suy ra rằng các cuộc họp/mốc báo cáo đã diễn ra |
| Change control | `11_CHANGE_MANAGEMENT_PLAN.md` | Có quy trình CCB, change log ví dụ; CR-2026-10-23 **chưa có phê duyệt**, chưa thay đổi BAC/duration |
| Acceptance | `12_UAT_AND_ACCEPTANCE_EVIDENCE.md` | Có 10 UAT scenarios và mẫu ký duyệt mô phỏng; không được diễn giải là đã tổ chức UAT thật |
| Closure | `13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md` | Có bài học/closure và EVM giả định; EV, PV, AC minh họa không phải kết quả chi tiêu thực |
| Technical evidence | `docs/audit/2026-10-21/05_RELEASE_GATE.md` | Có chứng cứ local baseline: 44 backend tests, browser workflow; không thể áp dụng kết quả cũ cho feature branch mới |

Đánh giá: **bộ hồ sơ quản lý dự án đã có nhiều thành phần cần thiết**. Khoảng trống quan trọng nhất trước khi trình bày là **tính nhất quán giữa hồ sơ và code, tính truy vết yêu cầu → công việc → kiểm thử → evidence, và cách giải thích số liệu giả định so với thực tế**. Không có cơ sở để tuyên bố đạt 100% nghiệm thu chỉ vì đủ 13 file.

## 3. Sai lệch đã phát hiện ở nhánh nâng cấp và cách xử lý

1. Nhánh analytics thêm FR-16–FR-19 vào requirements như đã được chấp thuận nhưng không có hồ sơ duyệt/ước lượng/WBS/CPM tương ứng. **Đã hoàn nguyên requirements baseline về FR-01–FR-15**; phần mới được quản lý tại CR riêng.
2. UI specification gộp route /study-plan và /insights như yêu cầu màn hình đã chốt. **Đã tách thành ứng viên cải tiến**, chưa phải UAT bắt buộc.
3. `14_CHANGE_REQUEST_2026-10-23.md` trước đây thiên về mô tả code đã viết, chưa có quyết định/ước lượng tác động. **Đã chuẩn hóa trạng thái Proposed/Pending, khuyến nghị defer cho tới khi core MVP được nghiệm thu**, ghi rõ chưa biết schedule/cost increment.
4. Các sửa lỗi như gỡ KPI ảo và hiển thị lỗi đúng có thể phân loại là **sửa defect của FR-15**, không nhất thiết phải biến thành chức năng ngoài scope.
5. Giữ code cải tiến trên nhánh để tránh mất công, nhưng **không dùng việc push để suy ra phê duyệt, stakeholder sign-off hoặc release readiness**.

## 4. Thứ tự hoàn thiện đúng trọng tâm môn học

### P0 — Nghiệm thu và truy vết yêu cầu

- Tạo/hoàn thiện một **Requirements Traceability Matrix** có cột FR/AC → WBS ID → API/page → test case → evidence path → trạng thái `VERIFIED / FAILED / NOT RUN / NOT APPLICABLE` → người chịu trách nhiệm.
- Kiểm tra 10 tình huống UAT theo đúng baseline; tách thành kịch bản trên giấy và kết quả chạy thực tế. Nếu không có người dùng thật, gọi là **technical acceptance simulation**, không giả chữ ký.
- Đối soát build frontend, SQL test DB cô lập, nghiệp vụ ba vai trò và phân quyền trước khi phát hành prototype.

### P1 — Quản lý tiến độ, chi phí, thay đổi

- Đảm bảo `WBS → Activity → predecessor → CPM → milestone → cost/resource` khớp số liệu. Đã có baseline 20 tuần và 1,2 tỷ; tránh tự thay đổi chúng.
- Lập **status snapshot** cho công việc repo: `not started / in progress / verified / blocked` với evidence thật. Không đánh đồng trạng thái code với tiến độ giả định 20 tuần.
- Khi có chức năng mới, ghi Change Request và phân tích tác động before/after. Không ghi **0 tuần/0 VNĐ** nếu không có estimate.
- Rủi ro: lưu trigger, owner, response, review date; không tự tuyên bố đã giảm xác suất nếu chưa đo.

### P2 — Trình bày và bảo vệ dự án

- Chuẩn bị sơ đồ tổng thể dự án, RACI, WBS, Gantt, CPM, budget breakdown, risk matrix và traceability/quality gates rõ ràng.
- Xây dựng **kịch bản demo 3 vai trò** đủ 10–15 phút và các ảnh/log minh chứng tương ứng với các AC quan trọng.
- Trình bày rõ: *cái gì là mô phỏng học thuật, cái gì đã xây, cái gì đã test trên môi trường thật, cái gì chưa làm.*
- Nếu còn thời gian sau khi hoàn thành P0/P1, cải tiến UX vừa phải; không nhất thiết phải thêm AI, live class, thanh toán, chat, dashboard phân tích vượt scope.

## 5. Quyết định triển khai kiến nghị

**Baseline đề tài được bảo vệ trước tiên**: 20 tuần, 1,2 tỷ VND, 8,5 FTE học thuật, FR-01–FR-15 và 13 PM documents. PR #3 tiếp tục ở Draft; có thể tách commit sửa lỗi/UX trong scope thành một PR nhỏ để nghiệm thu riêng với các tính năng mới.

**Các tính năng analytics** có thể được nêu trong báo cáo là đề xuất P2/future enhancement và dùng để minh họa **quy trình quản lý thay đổi**, ngay cả khi đã có code nguyên mẫu. Không được tự coi CR là Approved.

**Câu hỏi cần chuẩn bị để bảo vệ:**
- Dự án này quản lý *việc xây hệ thống* hay quản lý *các khóa học*? Phân biệt project scope và product scope thế nào?
- Vì sao ngân sách 1,2 tỷ và 20 tuần là hợp lý trong kịch bản giả định? Tài liệu nào là source-of-truth?
- Nếu stakeholder yêu cầu analytics/AI ngoài scope, PM xử lý thế nào, tính tác động ra sao?
- Vì sao một hoạt động là đường găng và trễ nó tác động đến milestone nào?
- Test backend chạy được có đồng nghĩa với UAT có chữ ký không?
- Sự khác nhau giữa số liệu EVM giả định và chi phí/tiến độ thật là gì?

## 6. Những việc chưa xác nhận

Bản rà soát dựa trên đọc nội dung repo và lịch sử audit; **không** có nghiệm thu stakeholder, thống kê thời gian làm việc thực tế, máy SQL Server thử nghiệm mới, hay build frontend mới trong phiên này. Kết luận không bảo đảm các feature trên PR #3 chạy được. Trước khi merge cần chạy kiểm thử thực tế và cập nhật quality evidence theo nhánh.
