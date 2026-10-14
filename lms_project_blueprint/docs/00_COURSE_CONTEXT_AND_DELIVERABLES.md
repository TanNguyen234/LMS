# 00 — Course Context & Required Deliverables

## 1. Bối cảnh học phần

Đây là **đồ án cuối kỳ môn Quản lý dự án phần mềm**, không phải đồ án chuyên sâu về kiến trúc hệ thống hay đồ án tốt nghiệp.

Hệ thống LMS được xây dựng như **case study + prototype minh họa** để chứng minh kế hoạch quản lý dự án có thể được triển khai thành sản phẩm phần mềm có luồng nghiệp vụ chạy được.

Ưu tiên của project theo thứ tự:

1. Tính nhất quán của hồ sơ quản lý dự án.
2. Scope rõ ràng và có thể nghiệm thu.
3. WBS, lịch, nguồn lực, chi phí, rủi ro và stakeholder có số liệu hợp lý.
4. Prototype chạy được các luồng nghiệp vụ chính.
5. Test và bằng chứng nghiệm thu.
6. UI polish và tối ưu kỹ thuật nâng cao.

Không được hy sinh các deliverable quản lý dự án chỉ để thêm tính năng kỹ thuật.

## 2. Deliverable bắt buộc của học phần

### A. Project initiation
- Project Charter.
- Business case / problem statement.
- Project objectives theo SMART ở mức phù hợp.
- Stakeholder Register.
- Power–Interest Matrix.
- RACI Matrix.

### B. Scope management
- Product scope.
- Project scope.
- In-scope / out-of-scope.
- Requirements baseline.
- WBS ít nhất đến Level 3 cho các work package chính.
- WBS Dictionary cho các work package quan trọng.
- Acceptance criteria.

### C. Schedule management
- Activity list.
- Dependency / predecessor.
- Duration estimate.
- Gantt Chart.
- Network diagram hoặc bảng quan hệ công việc đủ để tính CPM.
- Critical Path.
- Milestones.
- Schedule baseline.

### D. Cost & resource management
- Project team structure.
- Resource assignment.
- Effort estimate.
- Cost estimate theo role/work package.
- Budget baseline.
- Contingency reserve.

### E. Risk management
- Risk Register.
- Probability / Impact scale.
- Risk score.
- Owner.
- Preventive response.
- Contingency response.

### F. Quality management
- Quality objectives.
- Definition of Done.
- Test plan.
- Quality gates.
- UAT criteria.
- Defect severity baseline.

### G. Communication & change
- Communication Plan.
- Meeting cadence.
- Reporting format.
- Escalation path.
- Change Request template.
- Change Control workflow.

### H. Execution evidence / prototype
- Source code prototype.
- SQL Server schema + seed data.
- FastAPI Swagger/OpenAPI.
- Các luồng demo end-to-end.
- Test results.
- Screenshots hoặc evidence phục vụ báo cáo.

### I. Closure
- UAT / acceptance record giả lập.
- Project closure checklist.
- Lessons learned.
- Future enhancements ngoài scope.

## 3. Mức độ prototype yêu cầu

Prototype phải đủ để demo:

1. Admin đăng nhập, quản lý user/course/enrollment.
2. Lecturer quản lý nội dung, assignment, quiz và chấm điểm.
3. Student học nội dung đã publish, nộp bài, làm quiz và xem điểm.
4. Server enforce authorization.
5. Database có dữ liệu mẫu đủ để demo ngay.

Không yêu cầu:
- high availability;
- autoscaling;
- distributed cache;
- message broker;
- observability stack enterprise;
- production cloud architecture;
- microservices.

## 4. Quy tắc nhất quán tài liệu

Mọi con số dùng trong báo cáo phải lấy từ một baseline duy nhất. Nếu thay đổi duration, team, budget hoặc scope thì phải cập nhật các file liên quan, không để mỗi chương dùng một số liệu khác nhau.

`docs/08_PROJECT_MANAGEMENT.md` là baseline quản lý dự án chính. `docs/01_SCOPE_AND_REQUIREMENTS.md`, `docs/09_TEST_PLAN_ACCEPTANCE.md` và `docs/11_REPORT_OUTLINE.md` phải nhất quán với baseline này.
