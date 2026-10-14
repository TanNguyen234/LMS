# University LMS — Software Project Management Final Project Blueprint

> Đề tài: **Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học**

Đây là bộ blueprint dành cho **đồ án cuối kỳ môn Quản lý dự án phần mềm**. Mục tiêu không phải xây một LMS enterprise hoàn chỉnh, mà tạo một case study quản lý dự án đầy đủ kèm prototype đủ mạnh để demo và nghiệm thu.

## 1. Nguyên tắc ưu tiên

AI agent phải ưu tiên theo thứ tự:

1. Project Charter, scope và requirements baseline.
2. WBS, schedule/Gantt/CPM, milestone.
3. Resource/cost baseline.
4. Risk, quality, communication, change management.
5. Prototype chạy end-to-end.
6. Test/UAT evidence.
7. UI polish.

**Không over-engineering kỹ thuật.** Nếu một lựa chọn không giúp trực tiếp cho acceptance criteria hoặc deliverable môn học, mặc định không triển khai.

## 2. Product scope

LMS web phục vụ ba nhóm:

- **Admin**: users, courses, enrollment.
- **Lecturer**: modules, lessons, assignments, quizzes, grading.
- **Student**: học nội dung, nộp bài, làm quiz, xem điểm, notification.

Prototype sử dụng kiến trúc **modular monolith**: SPA frontend + FastAPI REST API + SQL Server.

## 3. Tech stack đã chốt

- Frontend: **React + TypeScript + Vite**.
- UI: Ant Design hoặc Material UI; chọn một và dùng nhất quán.
- Backend: **Python 3.12+ + FastAPI**.
- ORM: **SQLAlchemy 2.x**.
- Migration: **Alembic**.
- Validation/DTO: **Pydantic v2**.
- Database: **Microsoft SQL Server**.
- SQL Server driver: **pyodbc** qua SQLAlchemy.
- Authentication: JWT Bearer + RBAC.
- Password hashing: `pwdlib`/Argon2 hoặc bcrypt; chọn một thư viện maintained và dùng nhất quán.
- API docs: OpenAPI/Swagger tự động của FastAPI.
- Backend tests: **pytest + FastAPI TestClient/httpx**.
- Frontend tests: Vitest + React Testing Library cho flow quan trọng.
- File upload prototype: local configurable storage; DB chỉ lưu URL/path.

## 4. Không làm

Không tự ý thêm:

- Microservices.
- Redis.
- Kafka/RabbitMQ.
- Kubernetes.
- CQRS/Event Sourcing framework.
- Realtime chat.
- Self-hosted video streaming.
- AI recommendation/chatbot.
- Blockchain.
- Multi-tenant SaaS.
- Enterprise SSO.
- Elasticsearch.
- Cloud infrastructure phức tạp.

Các ý tưởng này chỉ được ghi ở `FUTURE_ENHANCEMENTS.md` nếu cần.

## 5. Cấu trúc tài liệu

| File | Vai trò |
|---|---|
| `AGENT_START_HERE.md` | Entry point cho AI agent |
| `docs/00_COURSE_CONTEXT_AND_DELIVERABLES.md` | Bối cảnh học phần + deliverable bắt buộc |
| `docs/01_SCOPE_AND_REQUIREMENTS.md` | Product/project scope + requirements |
| `docs/02_ROLES_USE_CASES.md` | Role, use case, permission matrix |
| `docs/03_ARCHITECTURE.md` | Kiến trúc FastAPI/React vừa đủ |
| `docs/04_DATABASE_DESIGN.md` | Database model và constraints |
| `docs/05_API_SPEC.md` | REST API contract |
| `docs/06_UI_UX_SCREENS.md` | Screen list và user flow |
| `docs/07_BUSINESS_RULES.md` | Business rules |
| `docs/08_PROJECT_MANAGEMENT.md` | Project management baseline |
| `docs/09_TEST_PLAN_ACCEPTANCE.md` | Quality/Test/UAT/acceptance |
| `docs/10_IMPLEMENTATION_PLAN.md` | Plan triển khai prototype |
| `docs/11_REPORT_OUTLINE.md` | Khung tiểu luận cuối kỳ |
| `agent/MASTER_PROMPT.md` | Prompt giao thẳng cho coding agent |
| `database/01_schema.sql` | SQL Server schema |
| `database/02_seed.sql` | 10 dòng dữ liệu mẫu mỗi bảng |
| `database/03_demo_queries.sql` | Query phục vụ demo |
| `database/04_seed_validation.sql` | Kiểm tra seed/integrity |

## 6. Core modules

1. Authentication & authorization.
2. User management.
3. Course management.
4. Enrollment.
5. Modules & lessons.
6. Assignments & submissions.
7. Quizzes & attempts.
8. Grades.
9. Notifications.
10. Dashboard/reporting cơ bản.

## 7. Database & demo accounts

Database hiện có **12 tables**, mỗi table có **10 seed rows** để demo ngay.

`PasswordHash` trong seed dùng sentinel `__SET_ON_FIRST_RUN__`. Khi chạy ở development, FastAPI startup/CLI initializer phải hash password mặc định `Demo@123` và cập nhật các account sentinel. Không chạy initializer này ở production-like environment.

Demo emails:

- `admin@university.edu.vn`
- `lecturer1@university.edu.vn`
- `lecturer2@university.edu.vn`
- `lecturer3@university.edu.vn`
- `student1@university.edu.vn` ... `student6@university.edu.vn`

Development password: `Demo@123`

## 8. Definition of Done của đồ án

### Hồ sơ quản lý dự án
- Có Charter, Stakeholder Register, RACI.
- Có WBS và WBS Dictionary.
- Có activity/dependency/duration để lập Gantt và CPM.
- Có Critical Path + milestones.
- Có resource/cost/budget baseline.
- Có Risk Register + response plan.
- Có Quality Plan + Test/UAT criteria.
- Có Communication Plan + Change Control.
- Có Closure/Lessons Learned.

### Prototype
- FastAPI kết nối SQL Server và migrations/schema chạy được.
- Seed chạy sạch, 10 rows/table và relationship hợp lệ.
- 3 role login được và enforce đúng quyền.
- Lecturer publish nội dung, assignment, quiz.
- Student xem course đã enroll, nộp assignment, làm quiz.
- Lecturer chấm và student xem grade.
- Notification list/mark-read hoạt động.
- Swagger mô tả endpoint chính.
- pytest cover các business rule/authorization quan trọng.
- README chạy local từ clean checkout.

Không yêu cầu đạt chuẩn production enterprise.

## 9. Quy tắc cuối cho AI agent

**Course deliverables > correctness > end-to-end completeness > polish.**

Nếu phải chọn giữa thêm một tính năng mới và hoàn thiện WBS/cost/risk/UAT evidence, chọn deliverable quản lý dự án.
