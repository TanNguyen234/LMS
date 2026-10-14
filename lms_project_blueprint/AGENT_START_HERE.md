# AI Agent — Start Here

Bạn đang hỗ trợ **đồ án cuối kỳ môn Quản lý dự án phần mềm** với case study University LMS.

Không được coi đây chỉ là coding project. Prototype là bằng chứng thực thi cho Project Management Plan.

## 1. Thứ tự bắt buộc phải đọc

1. `README.md`
2. `docs/00_COURSE_CONTEXT_AND_DELIVERABLES.md`
3. `docs/08_PROJECT_MANAGEMENT.md`
4. `docs/01_SCOPE_AND_REQUIREMENTS.md`
5. `docs/02_ROLES_USE_CASES.md`
6. `docs/07_BUSINESS_RULES.md`
7. `docs/04_DATABASE_DESIGN.md`
8. `database/01_schema.sql`
9. `database/02_seed.sql`
10. `docs/03_ARCHITECTURE.md`
11. `docs/05_API_SPEC.md`
12. `docs/06_UI_UX_SCREENS.md`
13. `docs/09_TEST_PLAN_ACCEPTANCE.md`
14. `docs/10_IMPLEMENTATION_PLAN.md`
15. `docs/11_REPORT_OUTLINE.md`

## 2. Stack bắt buộc

- Frontend: React + TypeScript + Vite.
- Backend: **FastAPI + Python 3.12+**.
- ORM: SQLAlchemy 2.x.
- Migration: Alembic.
- Validation: Pydantic v2.
- Database: Microsoft SQL Server qua pyodbc.
- Backend tests: pytest.

Không đổi stack nếu không có blocker kỹ thuật thực sự.

## 3. Quy tắc scope

- Không thêm module ngoài scope.
- Không microservices, Redis, queue, Kubernetes, AI, realtime chat.
- Không fake API khi backend thật có thể làm đơn giản.
- Authorization phải enforce server-side.
- Không lưu password plain text.
- Không lưu file binary trong SQL Server.
- Validate dữ liệu server-side.
- Course resources phải kiểm tra ownership/enrollment.
- Thay đổi DB phải được phản ánh ở SQLAlchemy model + Alembic và không mâu thuẫn với SQL reference schema.

## 4. Hai track phải hoàn thành song song

### Track A — Project Management artefacts

Agent phải duy trì/tạo các artefact đủ cho báo cáo:

- Project Charter.
- Stakeholder Register + Power/Interest Matrix.
- RACI.
- Scope baseline.
- WBS + WBS Dictionary.
- Activity/dependency/duration table.
- Gantt input + Critical Path calculation.
- Resource plan.
- Cost estimate + budget baseline.
- Risk Register.
- Quality plan.
- Communication plan.
- Change management plan.
- UAT/acceptance evidence.
- Project closure + lessons learned.

### Track B — Prototype

Triển khai vertical slices:

1. Bootstrap FastAPI + DB + health check.
2. Auth + roles + demo accounts.
3. Courses + enrollments.
4. Modules + lessons.
5. Assignments + submissions.
6. Quizzes + attempts + simple auto-scoring.
7. Grades.
8. Notifications.
9. Dashboard counts.
10. Tests + demo evidence.

## 5. Stop rule chống over-engineering

Một task kỹ thuật chỉ nên làm nếu ít nhất một điều đúng:

- cần cho acceptance criterion;
- cần cho security/correctness cơ bản;
- cần để demo end-to-end;
- cần để tạo evidence cho tiểu luận.

Nếu không, defer.

## 6. Output cuối mong đợi

```text
lms/
  backend/
  frontend/
  database/
  docs/
    project-management/
    evidence/
  README.md
  FUTURE_ENHANCEMENTS.md
```

Backend tối thiểu chạy bằng `uvicorn app.main:app --reload`; frontend chạy độc lập bằng npm script được ghi trong README.
