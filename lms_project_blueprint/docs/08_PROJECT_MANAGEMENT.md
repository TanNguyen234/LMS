# 08 — Project Management Baseline

> Đây là **baseline trung tâm** của đồ án cuối kỳ môn Quản lý dự án phần mềm. Nếu một file khác mâu thuẫn về scope, duration, team hoặc budget, ưu tiên baseline này rồi cập nhật file còn lại cho nhất quán.

## 1. Project Charter

**Project name:** University LMS Implementation

**Business need:** Chuẩn hóa việc phân phối tài liệu, bài tập, quiz và điểm số trên một nền tảng tập trung thay cho việc phân tán qua nhiều kênh.

**Objective:** Lập kế hoạch và triển khai prototype LMS cho quy mô giả định 10.000 sinh viên và 500 giảng viên, pilot ở một số khoa, chứng minh các luồng học tập cốt lõi và hoàn thành đầy đủ artefact quản lý dự án.

**Duration baseline:** 20 tuần.

**Budget baseline:** **1,2 tỷ VND** (giả định học thuật), bao gồm nhân sự, hạ tầng/demo, đào tạo, quản lý và dự phòng.

**Success condition:** Scope core được nghiệm thu qua UAT giả lập; không còn P0/P1; các baseline scope/schedule/cost/risk/quality/change được hoàn thiện.

## 2. Major deliverables

1. Project Management Plan + baselines.
2. Prototype LMS web.
3. SQL Server database + seed data.
4. API documentation.
5. Test/UAT evidence.
6. Final report + presentation evidence.
7. Closure + lessons learned.

## 3. Team baseline

| Role | Qty/FTE | Main responsibility |
|---|---:|---|
| Project Manager | 1 | Scope, schedule, cost, risk, stakeholder |
| Business Analyst | 1 | Requirements, traceability, UAT |
| UI/UX Designer | 1 | Flow, prototype |
| Backend Developer | 2 | FastAPI, SQLAlchemy, API, DB, auth |
| Frontend Developer | 2 | React web app |
| QA Engineer | 1 | Test plan, regression, evidence |
| DevOps/Infra | 0.5 FTE | Environment, DB setup, deployment demo |

Đây là team giả định để lập kế hoạch học thuật; người thực hiện đồ án không cần có đủ người thật tương ứng.

## 4. WBS Level 2

1. Project initiation
   - Charter
   - Stakeholder identification
   - Kickoff
2. Requirements & scope
   - As-is/problem analysis
   - Functional requirements
   - Non-functional requirements
   - Scope baseline approval
3. Planning & design
   - WBS/schedule/cost/risk plans
   - UX prototype
   - Architecture
   - Database/API design
4. Prototype development
   - Auth/users
   - Courses/enrollment
   - Content
   - Assignments/submissions
   - Quizzes/attempts
   - Grades/notifications/dashboard
5. Testing & quality
   - Unit/API tests
   - System test
   - Authorization/security checks
   - Regression
6. UAT & training/demo preparation
   - Lecturer UAT
   - Student UAT
   - Demo/training material
7. Deployment/demo environment
   - Environment setup
   - Data setup
   - Demo release
8. Closure
   - Defect closure
   - Acceptance
   - Lessons learned
   - Final report/presentation packaging

## 5. WBS Dictionary — minimum fields

Khi agent tạo WBS Dictionary chi tiết, mỗi work package phải có:

- WBS ID.
- Name.
- Description.
- Owner.
- Inputs.
- Outputs/deliverables.
- Acceptance criteria.
- Estimated effort/duration.
- Dependencies.
- Risks/notes.

Không cần tách WBS xuống mức task vài giờ; Level 3 là đủ cho đa số work package.

## 6. Timeline baseline

| Week | Activity |
|---|---|
| 1-2 | Initiation |
| 3-4 | Requirements & scope baseline |
| 5-6 | PM planning + UX/architecture/DB/API design |
| 7-12 | Prototype development |
| 13-15 | System/integration testing |
| 16 | UAT |
| 17 | Demo/training + release preparation |
| 18 | Demo release/go-live simulation |
| 19 | Stabilization + report evidence |
| 20 | Acceptance + closure + final presentation package |

## 7. Milestones

- M1: Charter approved — end W2.
- M2: Scope baseline approved — end W4.
- M3: PM/design baseline approved — end W6.
- M4: Feature complete — end W12.
- M5: System test passed — end W15.
- M6: UAT approved — end W16.
- M7: Demo release — W18.
- M8: Project closure — W20.

## 8. Schedule/CPM requirement

Report phải có activity table gồm:

- Activity ID.
- Activity name.
- WBS link.
- Predecessor(s).
- Duration.
- Owner/resource.
- ES/EF/LS/LF.
- Total Float.
- Critical? Yes/No.

Agent không được tự tuyên bố critical path nếu chưa tính từ dependency + duration.

## 9. Cost baseline rule

Tổng budget phải giữ ở **1,2 tỷ VND** trừ khi có Change Request được ghi rõ.

Cost breakdown tối thiểu:

- Labor cost.
- Infrastructure/demo environment.
- Tools/licensing giả định nếu có.
- Training/demo material.
- Project management/administration.
- Contingency reserve.

Bảng chi tiết phải reconcile về đúng tổng budget baseline.

## 10. Top risks baseline

| Risk | Probability | Impact | Response |
|---|---|---|---|
| Scope creep | High | High | Baseline + formal change control |
| Lecturer adoption thấp | Medium | High | Early demo/pilot + training |
| Peak quiz load | Medium | High | Basic load test + defer scaling architecture |
| Authorization bug exposes data | Low-Med | Critical | Server RBAC/ownership tests |
| Late development | Medium | High | Vertical slices + milestone tracking |
| Seed/demo data inconsistency | Medium | Medium | Validation SQL + smoke test |
| File storage growth | Medium | Medium | Size/type limit + future retention plan |
| UAT feedback too late | Medium | Medium | Incremental review before W16 |
| PM artefacts inconsistent | Medium | High | Single baseline + traceability review |

Detailed Risk Register phải thêm Risk ID, owner, trigger, score, preventive action, contingency và status.

## 11. Stakeholder baseline

Tối thiểu gồm:

- Project Sponsor/Ban giám hiệu giả định.
- Phòng đào tạo.
- Phòng CNTT.
- Lecturer representatives.
- Student representatives.
- Project Manager/team.

Mỗi stakeholder cần interest, influence/power, expectations, engagement strategy.

## 12. Communication baseline

Ví dụ cadence dùng cho bài:

| Audience | Content | Frequency | Channel | Owner |
|---|---|---|---|---|
| Sponsor | Status, milestone, risk | Bi-weekly | Report/meeting | PM |
| Core team | Progress/blockers | Weekly | Team meeting | PM |
| BA + Lecturer reps | Requirement/UAT feedback | Weekly in analysis/UAT | Workshop | BA |
| QA + Dev | Defect triage | 2x/week during test | Issue board/meeting | QA |

## 13. Change control

Mọi Change Request phải có:

- CR ID.
- Description/reason.
- Requested by.
- Scope impact.
- Schedule impact.
- Cost impact.
- Risk/quality impact.
- Recommendation.
- Decision: Approve/Reject/Defer.

AI feature, realtime chat, enterprise SSO, microservices mặc định **defer**.

## 14. Quality gates

- Requirements approved trước design freeze.
- DB/API contract reviewed trước development full speed.
- Không feature-complete nếu authorization path chưa test.
- Không UAT nếu P0/P1 defect còn mở.
- Không project closure nếu PM artefacts và evidence chưa reconcile.

## 15. Closure criteria

- Acceptance criteria reviewed.
- UAT summary signed-off giả lập.
- Open P2/P3 documented.
- Final budget/schedule variance được ghi nhận.
- Lessons learned hoàn thành.
- Final report/presentation evidence packaged.
