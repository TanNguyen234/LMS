# 06 — Đối soát tài liệu Quản lý Dự án

> **Báo cáo hiện hành ngày 2026-10-21.** Nội dung này thay thế báo cáo cũ. Kế hoạch, chữ ký, UAT, ngày thực hiện và chi phí được phân biệt với bằng chứng thực tế.

## 1. Kiểm kê 13 tài liệu có thật

| # | Tệp thật | Ghi chú đối soát |
|---:|---|---|
| 01 | [01_PROJECT_CHARTER.md](../project-management/01_PROJECT_CHARTER.md) | Baseline 20 tuần, 1.200.000.000 VNĐ, ba vai trò người dùng; 8.5 FTE, đầu người chưa chốt. |
| 02 | [02_STAKEHOLDER_REGISTER.md](../project-management/02_STAKEHOLDER_REGISTER.md) | Sổ stakeholder giả định của đồ án. |
| 03 | [03_RACI_MATRIX.md](../project-management/03_RACI_MATRIX.md) | RACI cho nhóm dự án và sponsor giả định. |
| 04 | [04_SCOPE_BASELINE_WBS.md](../project-management/04_SCOPE_BASELINE_WBS.md) | Scope/WBS; student self-enrollment ngoài phạm vi. |
| 05 | [05_WBS_DICTIONARY.md](../project-management/05_WBS_DICTIONARY.md) | Từ điển WBS liên kết deliverables. |
| 06 | [06_SCHEDULE_CPM_GANTT.md](../project-management/06_SCHEDULE_CPM_GANTT.md) | CPM tính lại theo phụ thuộc và float. |
| 07 | [07_RESOURCE_AND_BUDGET_BASELINE.md](../project-management/07_RESOURCE_AND_BUDGET_BASELINE.md) | Ngân sách 1.2 tỷ; 9 dòng phân bổ, tổng 8.5 FTE. |
| 08 | [08_RISK_REGISTER.md](../project-management/08_RISK_REGISTER.md) | Upload rủi ro được đổi thành kỳ vọng nộp bài; MVP chỉ nhận văn bản. |
| 09 | [09_QUALITY_PLAN_AND_GATES.md](../project-management/09_QUALITY_PLAN_AND_GATES.md) | Tiêu chí chất lượng là mục tiêu, không phải kết quả đo hiện tại. |
| 10 | [10_COMMUNICATION_PLAN.md](../project-management/10_COMMUNICATION_PLAN.md) | Kế hoạch truyền thông mô phỏng. |
| 11 | [11_CHANGE_MANAGEMENT_PLAN.md](../project-management/11_CHANGE_MANAGEMENT_PLAN.md) | Quy trình change control dự kiến. |
| 12 | [12_UAT_AND_ACCEPTANCE_EVIDENCE.md](../project-management/12_UAT_AND_ACCEPTANCE_EVIDENCE.md) | 10 kịch bản; kết quả mẫu được gắn nhãn mô phỏng/chưa chạy. |
| 13 | [13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md](../project-management/13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md) | EVM/đóng dự án là ví dụ minh họa, không phải số đo/biên bản thật. |

Repo không có các file 04_EFFORT_ESTIMATION_COCOMO_FPA.md, 05_BUDGET_COST_BASELINE.md, 07_RISK_MANAGEMENT_PLAN.md, 08_QUALITY_ASSURANCE_PLAN.md, 09_PROCUREMENT_VENDOR_MANAGEMENT.md, 11_CONFIGURATION_DATA_MANAGEMENT.md hoặc 13_PROJECT_CLOSURE_REPORT.md được nêu trong báo cáo cũ.

## 2. CPM: quy ước và phép tính

ES/EF tính theo thời điểm bắt đầu 0, finish-to-start; EF=ES+duration. Backward pass lấy mốc kết thúc tuần 20; LS=LF-duration, TF=LS-ES. ACT-03 và ACT-05 nối vào ACT-06 vì kế hoạch/kiến trúc phải xong trước môi trường. ACT-14 và ACT-15 nối vào ACT-17 vì triage lẫn UAT phải xong trước release. Nhờ vậy mọi hoạt động nằm trên đường về mốc đóng dự án.

| Activity | Predecessors | Dur. | ES | EF | LS | LF | TF |
|---|---|---:|---:|---:|---:|---:|---:|
| ACT-01 | — | 2 | 0 | 2 | 0 | 2 | 0 |
| ACT-02 | ACT-01 | 2 | 2 | 4 | 2 | 4 | 0 |
| ACT-03 | ACT-02 | 2 | 4 | 6 | 4 | 6 | 0 |
| ACT-04 | ACT-02 | 2 | 4 | 6 | 5 | 7 | 1 |
| ACT-05 | ACT-02 | 2 | 4 | 6 | 4 | 6 | 0 |
| ACT-06 | ACT-03, ACT-05 | 1 | 6 | 7 | 6 | 7 | 0 |
| ACT-07 | ACT-04, ACT-06 | 1 | 7 | 8 | 7 | 8 | 0 |
| ACT-08 | ACT-07 | 1 | 8 | 9 | 8 | 9 | 0 |
| ACT-09 | ACT-08 | 1 | 9 | 10 | 9 | 10 | 0 |
| ACT-10 | ACT-09 | 1 | 10 | 11 | 10 | 11 | 0 |
| ACT-11 | ACT-10 | 1 | 11 | 12 | 11 | 12 | 0 |
| ACT-12 | ACT-11 | 1 | 12 | 13 | 12 | 13 | 0 |
| ACT-13 | ACT-12 | 2 | 13 | 15 | 13 | 15 | 0 |
| ACT-14 | ACT-13 | 1 | 15 | 16 | 15 | 16 | 0 |
| ACT-15 | ACT-13 | 1 | 15 | 16 | 15 | 16 | 0 |
| ACT-16 | ACT-15 | 1 | 16 | 17 | 18 | 19 | 2 |
| ACT-17 | ACT-14, ACT-15 | 2 | 16 | 18 | 16 | 18 | 0 |
| ACT-18 | ACT-17 | 1 | 18 | 19 | 18 | 19 | 0 |
| ACT-19 | ACT-16, ACT-18 | 1 | 19 | 20 | 19 | 20 | 0 |

Mạng có thời lượng 20 tuần. ACT-04 có float 1 tuần; ACT-16 có float 2 tuần. Các nhánh găng song song là ACT-03/ACT-05 trước ACT-06 và ACT-14/ACT-15 trước ACT-17. Đây là tính toán baseline, không phải thời lượng thực tế.

## 3. Ngân sách và nguồn lực

- Labor 840M + infrastructure 120M + software 48M + training 40M + administration 32M + contingency 120M = **1.200M VNĐ**.
- Cash flow: 180M + 150M + 450M + 240M + 180M = **1.200M VNĐ**.
- Labor rows sum to **8.5 FTE**. Budget has 9 role-allocation rows while charter previously said 8 people. Corrected docs do not assert a headcount.
- Closure example: PV=1.200M, EV=1.200M, AC=1.175M; SV=0, SPI=1.0, CV=+25M, CPI≈1.021. These are illustrative only; repo contains no invoice, timesheet or measured actual cost.

## 4. UAT, closure and implementation truth

UAT defines 10 scenarios; its sample outcomes are now marked SIMULATED/NOT RUN, not an automated test report. Closure status, approvals, duration and EVM are also scenario templates. Current executed evidence is separate in 2026-10-21/03_TEST_MATRIX.md.

README and PROJECT.md now state the actual stack (React 19, fetch, React Router 7), text-only assignment submission and dated release status. Fresh SQL bootstrap is database/01_schema.sql, then 02_seed.sql, then 04_seed_validation.sql. Initial Alembic revision modifies existing tables and cannot bootstrap an empty DB. For a fresh database created from the current SQL scripts, stamp Alembic at head after schema/seed validation. For an existing database at revision efd8af3f19c3, the incremental migration adds filtered grade uniqueness and supported question-type constraints; it can stop before mutation if duplicate/unsupported rows exist.

The former report mislabeled ACT-14 as UAT, changed its predecessor incorrectly, used wrong budget allocations and cited nonexistent PM files. Those claims are superseded.
