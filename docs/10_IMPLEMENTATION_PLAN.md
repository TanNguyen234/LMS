# 10 — Implementation Plan for AI Agent

Đây là plan xây **prototype minh họa**, không phải production rollout plan. Lịch baseline chính cho tiểu luận nằm ở `08_PROJECT_MANAGEMENT.md`.

## Phase 0 — Baseline consistency check

Trước khi code:

- Đọc course deliverables.
- Đối chiếu scope/WBS/timeline/budget/risk.
- Tạo `IMPLEMENTATION_NOTES.md` ghi assumptions.
- Không thay đổi project baseline tùy tiện.

Exit: không có contradiction rõ giữa scope, acceptance và architecture.

## Phase 1 — Bootstrap

- Tạo FastAPI app.
- Configure `.env` + SQL Server connection.
- SQLAlchemy models.
- Alembic baseline migration.
- Health endpoint.
- React shell + routing.

Exit: backend/frontend chạy sạch; `/health` OK; DB connection OK.

## Phase 2 — Auth & users

- Password hashing.
- Development seed password initializer.
- JWT.
- Current-user dependency.
- Role checks.
- Login + `/me`.
- Admin user CRUD.

Exit: 3 roles login; protected API enforce role.

## Phase 3 — Courses & enrollments

- Course CRUD.
- Filter course by role.
- Enrollment CRUD.
- Ownership/enrollment helper.

Exit: student không access non-enrolled course; lecturer không modify other course.

## Phase 4 — Learning content

- Module/lesson CRUD.
- Publish rules.
- Student course content.

Exit: draft hidden from student.

## Phase 5 — Assignments

- Assignment CRUD.
- Submission create/update.
- Deadline rule.
- Lecturer submission list.
- Grade submission + upsert grade.

Exit: submit -> grade -> student sees score.

## Phase 6 — Quizzes

- Quiz CRUD.
- Questions.
- Start/submit attempt.
- Auto-score supported types.
- Protect answer keys.

Exit: max-attempt/time-window enforced server-side.

## Phase 7 — Grades, notifications, dashboard

- Gradebook.
- My Grades.
- Notification list/read.
- Synchronous notification insert after grading.
- Simple role dashboard counts.

Không xây BI platform.

## Phase 8 — QA/UAT evidence

- pytest critical rules.
- API integration tests.
- Seed smoke test.
- UAT script.
- Screenshots/evidence folder.
- Swagger cleanup.
- Local run README.

## Phase 9 — PM artefact completion

Trước khi closure:

- Hoàn thiện WBS Dictionary.
- Tạo activity/dependency/duration table.
- Xác nhận Critical Path.
- Hoàn thiện cost/resource baseline.
- Risk Register.
- Communication Plan.
- Change Request template.
- UAT summary.
- Closure checklist + Lessons Learned.

## Agent stop conditions

Không mở phase mới khi phase hiện tại:

- startup/build fail;
- migration/schema mismatch;
- critical test fail;
- authorization path chưa xong;
- hoặc tạo contradiction với scope baseline.

## Anti-overengineering gate

Không thêm library/layer/service mới chỉ vì “best practice”. Mỗi addition phải trả lời được: **nó phục vụ acceptance criterion hay deliverable môn học nào?** Nếu không trả lời được, defer.
