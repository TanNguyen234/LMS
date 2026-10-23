# CR-2026-10-23 — Đề xuất cải tiến LMS ngoài phạm vi gốc

> **HỒ SƠ ĐỀ XUẤT / CHƯA ĐƯỢC PHÊ DUYỆT.** Việc đã viết code trên nhánh thử nghiệm không đồng nghĩa với việc CCB chấp thuận thay đổi scope, ngân sách hay tiến độ. Không dùng tài liệu này làm bằng chứng UAT hoặc phê duyệt của Trường Đại học.

## 1. Thông tin Change Request

| Trường | Thông tin |
|---|---|
| CR ID | CR-2026-10-23 |
| Tên đề xuất | Tăng tính hữu dụng của prototype LMS: kế hoạch học tập, trung tâm giảng dạy và báo cáo dữ liệu |
| Ngày ghi nhận | 23/10/2026 |
| Nguồn yêu cầu | Đề xuất cải tiến kỹ thuật phát sinh trong quá trình rà soát repo; chưa xác nhận đại diện nhà trường |
| Người phê duyệt | Chưa có (CCB mô phỏng chưa đưa ra quyết định) |
| Baseline tham chiếu | `docs/08_PROJECT_MANAGEMENT.md`, `docs/01_SCOPE_AND_REQUIREMENTS.md` (FR-01…FR-15), `docs/project-management/04_SCOPE_BASELINE_WBS.md` |
| Nhánh mã nguồn thử nghiệm | `feat/student-workload-and-dashboard-20261023`; Draft PR #3 |
| Trạng thái CR | **PROPOSED / PENDING IMPACT ANALYSIS** |
| Quyết định CCB | **CHƯA CÓ** |
| Khuyến nghị PM | **DEFER** cho tới khi core demo và hồ sơ quản lý dự án đạt yêu cầu |

## 2. Mô tả nhu cầu và giá trị dự kiến

- Bổ sung danh sách deadline theo các học phần sinh viên đang đăng ký, giúp truy cập đúng bài tập/quiz.
- Bổ sung giao diện giảng viên theo dõi bài nộp, tìm bài cần chấm và gọi API chấm bài hiện có.
- Bổ sung thông tin điểm quan sát cho sinh viên và bảng tổng hợp thống kê hoạt động cho Admin.
- Loại bỏ số liệu cố định gây hiểu nhầm trong dashboard.

**Phân nhóm:** Việc loại bỏ số liệu không đúng và sửa lỗi logic có thể xử lý như **defect correction trong phạm vi FR-15**. Các màn hình, endpoint analytics mới là **scope extension**, chỉ được vào baseline sau khi đánh giá và duyệt riêng. Không vì đã code mà xem FR-16–FR-19 là yêu cầu Must/Should của baseline.

## 3. Phân tích tác động dự kiến

| Chiều tác động | Đánh giá có căn cứ | Điều kiện trước khi chấp thuận |
|---|---|---|
| Scope | Tăng API đọc dữ liệu và hai màn hình /study-plan, /insights; ngoài bộ FR-01–FR-15 đã chốt | Lập danh sách yêu cầu, tiêu chí nghiệm thu mới; xác định rõ in/out scope |
| WBS | Có thêm work package phát triển/kiểm thử/đào tạo | WBS ID + Dictionary, RACI, mapping owner/deliverable |
| Schedule | **Chưa lượng hóa được** vì không có timesheet, effort estimate được phê duyệt hay dependency mới | Estimate, dependency và tính lại ES/EF/LS/LF/float; đối chiếu milestone 20 tuần |
| Cost | **Chưa lượng hóa được**; không được ghi 0 VNĐ chỉ vì đã có code | Estimate effort theo role + QA/UAT; xác định funding/reserve; đối soát với BAC 1,2 tỷ |
| Risk | Scope creep, query load, dữ liệu điểm nhạy cảm, lỗi phân quyền, tăng khối lượng UAT | Bổ sung Risk Register/owner/probability-impact/response |
| Quality | Cần thêm cross-role RBAC, SQL Server integration, UI three-role E2E và dữ liệu chính xác | Nghiệm thu qua test có log, SQL verification và người đánh giá |
| Documentation | Phải đồng bộ project charter/scope/WBS/schedule/budget/test/closure nếu duyệt | RTM cập nhật; baseline versions và Change Log |

## 4. Mã nguồn hiện có nhưng chưa phải deliverable đã duyệt

- Backend thử nghiệm: `backend/app/api/routes/analytics.py` và `workload.py`.
- Frontend thử nghiệm: `frontend/src/pages/InsightsPage.tsx` và `StudyPlannerPage.tsx`.
- Test source mới: `backend/tests/test_analytics.py`, `test_workload.py`.
- Các trang hiện có cũng được sửa để loại bỏ KPI bịa và cải thiện điều hướng.
- Chưa có bằng chứng trong phiên làm việc này rằng build sạch, test SQL Server, trình duyệt ba vai trò, nghiệm thu học vụ hay kiểm thử hiệu năng trên nhánh mới đều đạt.

## 5. Phương án quyết định của CCB

| Phương án | Lợi ích | Rủi ro | Kiến nghị |
|---|---|---|---|
| A. Giữ baseline, chỉ nhận sửa lỗi FR-01–FR-15 | Có thể bảo vệ đồ án theo Charter, WBS, UAT hiện hành; ít phát sinh hơn | Prototype ít phong phú hơn | **Ưu tiên** |
| B. Duyệt một phần (dashboard chính xác, hành động chấm bài theo flow sẵn có) | Cải thiện UX nhưng không quá lớn | Phải điều chỉnh acceptance và test nếu vượt FR-15 | Chỉ khi có impact và phê duyệt |
| C. Duyệt toàn bộ analytics mở rộng | UI nhiều thông tin hơn | Tăng scope, QA, UAT, bảo trì, áp lực bảo vệ tiến độ/chi phí | **Defer** |

## 6. Trạng thái nghiệm thu và ký duyệt

- Người chuẩn bị/đánh giá kỹ thuật: AI-assisted source review; không thay cho PM hay CCB.
- Quyết định CCB: **PENDING** (chưa có chữ ký, ngày duyệt, căn cứ điều chỉnh ngân sách/CPM).
- UAT các feature mới: **NOT VERIFIED**.
- Draft PR: có mã nguồn nhưng **không nên merge vào main** trước khi có quyết định về phạm vi và đủ kiểm thử.
- Tài liệu gốc về stakeholder, baseline ngân sách, mốc 20 tuần, CPM và UAT không thay đổi do CR chưa được duyệt.

Xem [báo cáo rà soát phạm vi theo tên đề tài](../audit/2026-10-23_PM_SCOPE_REVIEW.md) và [Change Management Plan](11_CHANGE_MANAGEMENT_PLAN.md).
