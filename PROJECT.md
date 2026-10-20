# Project: University LMS Full-Stack Reconciliation & Verified Acceptance

## Architecture
- **Backend**: FastAPI (Python 3.12), SQLAlchemy 2.x, PyODBC, Pydantic v2 schemas (camelCase DTOs), JWT HS256 auth, bcrypt passwords.
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Axios API client (`frontend/src/api/client.ts`), React Router v6.
- **Database**: Microsoft SQL Server (`localhost\SQLEXPRESS`, database `UniversityLms`, 12 tables, seed data).
- **Service Ports**:
  - FastAPI backend: `http://127.0.0.1:8000` (API routes `/api/*`, `/health`, `/docs`)
  - React Vite frontend: `http://localhost:5173` (Vite dev server proxying `/api` and `/uploads` to `:8000`)
- **Interactive Testing**: Google Chrome with remote debugging on port 9222 / DevTools Protocol.

## Feature Inventory
| # | Feature | Description | Milestone | Status |
|---|---|---|---|---|
| 1 | Database Integrity | 12 tables x >=10 rows seeded in SQL Server with zero referential errors | M1 / M2 / M5 | DONE |
| 2 | Auth & JWT | Login with JSON {email, password}, JWT Bearer token, User DTO in camelCase | M1 / M2 | DONE |
| 3 | Role-Based Access Control | Strict RBAC for Admin, Lecturer, Student across all endpoints | M1 / M2 | DONE |
| 4 | Admin User & Course Mgmt | Users CRUD, Courses CRUD, Lecturer assignment, Student enrollment | M2 / M4 | DONE |
| 5 | Lecturer Content Mgmt | Modules, Lessons, Assignments, Timed Quizzes, Grading | M2 / M4 | DONE |
| 6 | Student Learning Flows | Course viewing, Assignment submission, Taking quizzes, Viewing grades | M2 / M4 | DONE |
| 7 | Contract & Bug Fixes | Fix UUID Number() coercion, Quiz questionType enum, Gradebook query, /health payload, timedelta import | M2 | DONE |
| 8 | Full-Stack Service Startup | Launch MS SQL Server, FastAPI on :8000, React Vite on :5173 | M3 | DONE |
| 9 | Chrome DevTools E2E Testing | Interactive browser sessions for Admin, Lecturer, Student with logs & screenshots | M4 | DONE |
| 10 | Forensic Integrity & Release Gate | Forensic audit (no cheats/fakes), 26/26 pytest, clean build | M5 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Survey & Baseline Assessment | Comprehensive code, DB, test, and environment survey | none | DONE |
| M2 | Full-Stack Reconciliation & Fixes | Fix UUID coercion bugs, quiz questionType enum, student grades view, /health endpoint, timedelta import | M1 | DONE |
| M3 | Full-Stack Service Startup | Boot FastAPI backend (:8000) and React frontend (:5173), verify /health HTTP 200 | M2 | DONE |
| M4 | Chrome DevTools E2E Verification | Direct browser automation for Admin, Lecturer, Student personas with DevTools capture | M3 | DONE |
| M5 | Forensic Integrity & Acceptance Report | Run teamwork_preview_auditor, verify 26/26 pytest, verify build, produce handoff | M4 | DONE |

## Interface Contracts
### Frontend (`frontend/src/api/client.ts`) ↔ Backend (`backend/app/api/routes/`)
- **Authentication**: `POST /api/auth/login` payload `{email, password}` -> `{access_token, token_type: "bearer", user: UserResponse}`.
- **Health Check**: `GET /health` -> `{"status": "ok", "status_detail": "healthy", "database_connected": true, ...}`.
- **Entity IDs**: All entity IDs are UUID strings (`UNIQUEIDENTIFIER`). Frontend components preserve them as strings without `Number(...)`.
- **Quiz Questions**: `questionType` enum is `SINGLE_CHOICE`, `TRUE_FALSE`, or `SHORT_TEXT`.
- **Quiz Submissions**: `POST /api/quiz-attempts/{id}/submit` uses imported `timedelta` and calculates valid elapsed duration.
- **Course Status**: Course status recognizes `'ACTIVE'`, `'DRAFT'`, or `'ARCHIVED'`.
- **Grades API**: Student grades endpoint is `GET /api/courses/{course_id}/my-grades`.

## Code Layout
- `backend/app/`: FastAPI application
  - `main.py`: Entrypoint, `/health`, CORS, static SPA fallback
  - `api/routes/`: Router modules (auth, users, courses, content, assignments, quizzes, grades, notifications, dashboard)
  - `models/models.py`: SQLAlchemy ORM definitions
  - `schemas/schemas.py`: Pydantic request/response schemas
  - `core/`: Config, security, dependencies
  - `db/`: Database engine, sessions, seed initialization
- `backend/tests/`: Automated pytest acceptance & challenger suites
- `frontend/src/`: React TypeScript frontend
  - `api/client.ts`: Typed API client
  - `types/index.ts`: TypeScript data contracts
  - `pages/`: Role-specific and general pages
  - `components/`: UI layout and shared components
- `database/`: SQL scripts (`01_schema.sql`, `02_seed.sql`, `04_seed_validation.sql`)
