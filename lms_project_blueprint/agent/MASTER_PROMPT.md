# Master Prompt for AI Agent

Bạn đang triển khai **University LMS** cho **đồ án cuối kỳ môn Quản lý dự án phần mềm**.

Mục tiêu kép:

1. Hoàn thiện hồ sơ quản lý dự án nhất quán và đủ chiều sâu để nộp/thuyết trình.
2. Xây prototype LMS chạy end-to-end làm bằng chứng nghiệm thu.

Không biến bài này thành bài showcase kiến trúc enterprise.

## Bắt buộc đọc trước khi làm

Đọc `AGENT_START_HERE.md` và toàn bộ file mà nó liệt kê. Không code trước khi hiểu project-management baseline và scope.

## Stack khóa

- Frontend: React + TypeScript + Vite.
- Backend: **Python 3.12+ + FastAPI**.
- ORM: SQLAlchemy 2.x.
- Migration: Alembic.
- Validation: Pydantic v2.
- Database: SQL Server qua pyodbc.
- Auth: JWT + ADMIN/LECTURER/STUDENT.
- Tests: pytest cho backend; Vitest cho flow frontend quan trọng.
- Architecture: modular monolith.

## Source of truth

- Course deliverables: `docs/00_COURSE_CONTEXT_AND_DELIVERABLES.md`.
- Project baseline: `docs/08_PROJECT_MANAGEMENT.md`.
- Scope: `docs/01_SCOPE_AND_REQUIREMENTS.md`.
- Business rules: `docs/07_BUSINESS_RULES.md`.
- Database: `database/01_schema.sql` + `docs/04_DATABASE_DESIGN.md`.
- API behavior: `docs/05_API_SPEC.md`.
- Acceptance: `docs/09_TEST_PLAN_ACCEPTANCE.md`.

## Nguyên tắc làm việc

- Không mở rộng scope nếu không cần cho acceptance/deliverable.
- Không microservices, Redis, Kafka/RabbitMQ, Kubernetes, AI, realtime chat.
- Ưu tiên vertical slice chạy được hơn skeleton rộng.
- Mỗi phase phải có test/evidence trước khi chuyển phase.
- Ambiguity nhỏ: chọn giải pháp đơn giản nhất và ghi assumption.
- Không để TODO/fake implementation trong demo flow chính.
- Không tối ưu premature.

## Track A — Project Management deliverables

Trước khi tuyên bố project hoàn thành, phải có artefact có thể đưa vào báo cáo:

- Project Charter.
- Stakeholder Register + Power/Interest Matrix.
- RACI.
- Scope baseline.
- WBS Level 3 + WBS Dictionary.
- Activity/dependency/duration table.
- Gantt-ready schedule + Critical Path.
- Milestones.
- Resource plan.
- Cost estimate + budget baseline + contingency.
- Risk Register.
- Quality plan + quality gates.
- Communication plan.
- Change control.
- UAT/acceptance evidence.
- Closure checklist + lessons learned.

Nếu cần tạo file mới, đặt dưới `docs/project-management/`.

## Track B — Prototype

Backend FastAPI phải map đủ 12 tables bằng SQLAlchemy.

Các vertical slices:

1. DB/health/auth.
2. Users.
3. Courses/enrollments.
4. Modules/lessons.
5. Assignments/submissions/grading.
6. Quizzes/attempts/auto-score.
7. Grades/notifications.
8. Dashboard counts.
9. Tests/demo evidence.

Development initializer xử lý `PasswordHash='__SET_ON_FIRST_RUN__'` thành hash của `Demo@123`; tuyệt đối không chạy cơ chế này trong production-like environment.

## Security rules không được bỏ qua

- Lecturer chỉ modify own course.
- Student chỉ truy cập enrolled course.
- Student không nhận answer key trước/đang làm quiz.
- User chỉ đọc/update notification của mình.
- Mọi authorization quan trọng phải server-side.

## Definition of Done

Không báo “done” chỉ vì code chạy.

Done khi:
- PM artefacts đủ theo `docs/00...`;
- baseline giữa các tài liệu không mâu thuẫn;
- prototype chạy các acceptance scenario chính;
- database seed/integrity hợp lệ;
- pytest critical rules pass;
- Swagger usable;
- có README setup/run;
- có `IMPLEMENTATION_NOTES.md`;
- có evidence/screenshots/test result hoặc hướng dẫn thu evidence cho report.

## Output cuối

- Source backend/frontend.
- Alembic migration.
- SQL schema + seed giữ nguyên khả năng chạy độc lập.
- Swagger/OpenAPI.
- Tests.
- Project-management artefacts.
- `IMPLEMENTATION_NOTES.md`.
- `FUTURE_ENHANCEMENTS.md` chỉ ghi những phần ngoài scope, không triển khai.
