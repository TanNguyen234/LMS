# Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học

**Yêu cầu cô đã giao (theo thông tin nhóm cung cấp):** tên đề tài trên, sử dụng **Trello** để quản lý dự án và **draw.io / diagrams.net** để vẽ sơ đồ. Hiện chưa có rubric chính thức về số tuần, ngân sách, bộ tài liệu, loại sơ đồ hoặc mức độ bắt buộc lập trình.

**Bắt đầu từ đây:** [Kế hoạch Trello và bộ sơ đồ draw.io có thể chỉnh sửa](docs/coursework-trello-drawio/README.md).

**Phân biệt:** Tài liệu `docs/project-management/` đang là kịch bản quản lý dự án do nhóm chuẩn bị. Kế hoạch 20 tuần/1,2 tỷ VNĐ và phần mềm LMS trong repo **không phải yêu cầu bắt buộc được xác nhận từ cô**. Không tự trình bày dữ liệu giả định là số liệu thực thi/đã phê duyệt.

---

## Prototype LMS hiện có trong repo

University LMS is an academic project prototype for course content, assignment text submissions, timed quizzes, grading and notifications. The project keeps a FastAPI backend, SQL Server database and React/Vite web frontend.

## Current verification

The dated forensic report is the source of truth for tested behavior, environment limits and release status: [docs/audit/2026-10-21/05_RELEASE_GATE.md](docs/audit/2026-10-21/05_RELEASE_GATE.md). The prior audit files in docs/audit are historical snapshots and are not current release evidence.

## Technology

- Backend: Python 3.12, FastAPI, SQLAlchemy, Alembic, pyodbc.
- Database: Microsoft SQL Server.
- Frontend: React 19, TypeScript, Vite, React Router 7 and a fetch-based API client.
- Roles: ADMIN, LECTURER and STUDENT. Authorization is enforced by the API.
- Assignment submission MVP: text only. The frontend does not upload files.

## Repository guide

- backend/app: API routes, schemas, models, authentication and database session.
- backend/tests: SQL Server integration suite and pure forensic contract tests.
- database: schema, seed and validation SQL scripts.
- frontend/src: API client, role-aware views and shared types.
- docs/project-management: the 13 academic project-management documents.
- docs/audit/2026-10-21: current forensic baseline, contracts, test matrix, reconciliation, release gate and runbook.

## Safe local setup

Use a disposable SQL Server database named UniversityLms_Test_<id> for verification. Do not point test commands at a personal or shared UniversityLms database. Follow [the dated demo and test runbook](docs/audit/2026-10-21/06_DEMO_RUNBOOK.md) for schema, seed, Alembic and startup steps. Local secrets belong in an ignored .env file and must not be committed.

Install backend dependencies from the repository root with:

    python -m pip install -r backend/requirements.txt

Start the API from the repository root after configuring its DATABASE_URL for the disposable database:

    python -m uvicorn backend.app.main:app --reload --port 8000

Install and start the frontend from frontend:

    npm ci
    npm run dev

The API docs are served at /docs, health at /health, and the local web app at http://localhost:5173.

## Verification commands

From frontend:

    npm ci
    npm run build
    npm run lint

From the repository root, after configuring an isolated SQL Server database:

    backend\venv\Scripts\python.exe -m pytest backend/tests -q

The pytest fixture refuses to run database integration tests unless the configured database name begins with UniversityLms_Test_. Pure contract tests can be run separately with:

    backend\venv\Scripts\python.exe -m pytest backend/tests/test_forensic_contracts.py -q

Do not interpret an unavailable database, a collected test count, a previous screenshot or a historical report as a passing integration or browser test.

## Demo seed accounts

The SQL seed defines demo accounts for each role; the development-only password initializer uses the demo password described in the seed. Use them only in a local disposable environment. Do not reuse demo credentials in a deployed environment.

## Project-management documents

The actual files are the numbered set under docs/project-management:

1. [Project Charter](docs/project-management/01_PROJECT_CHARTER.md)
2. [Stakeholder Register](docs/project-management/02_STAKEHOLDER_REGISTER.md)
3. [RACI Matrix](docs/project-management/03_RACI_MATRIX.md)
4. [Scope Baseline and WBS](docs/project-management/04_SCOPE_BASELINE_WBS.md)
5. [WBS Dictionary](docs/project-management/05_WBS_DICTIONARY.md)
6. [Schedule and CPM](docs/project-management/06_SCHEDULE_CPM_GANTT.md)
7. [Resource and Budget Baseline](docs/project-management/07_RESOURCE_AND_BUDGET_BASELINE.md)
8. [Risk Register](docs/project-management/08_RISK_REGISTER.md)
9. [Quality Plan](docs/project-management/09_QUALITY_PLAN_AND_GATES.md)
10. [Communication Plan](docs/project-management/10_COMMUNICATION_PLAN.md)
11. [Change Management Plan](docs/project-management/11_CHANGE_MANAGEMENT_PLAN.md)
12. [UAT Scenarios](docs/project-management/12_UAT_AND_ACCEPTANCE_EVIDENCE.md)
13. [Project Closure Scenario](docs/project-management/13_PROJECT_CLOSURE_AND_LESSONS_LEARNED.md)
