# Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học

**Môn học:** Quản lý dự án phần mềm. **Sản phẩm minh họa:** University LMS prototype (FastAPI + SQL Server + React/Vite).

Đây là đồ án về **quản lý quá trình xây dựng phần mềm**, không phải chỉ làm một trang web LMS. Trọng tâm là Charter, stakeholder, scope/WBS, lịch/CPM, resource-budget, risk, quality, communication, change control, UAT và closure. Prototype LMS gồm ba vai trò chỉ minh chứng cho kế hoạch và kiểm thử nghiệp vụ cốt lõi.

**Bắt đầu xem hồ sơ quản lý dự án:** [Project Management Baseline](docs/08_PROJECT_MANAGEMENT.md) · [13 tài liệu nền tảng](docs/project-management/) · [Báo cáo rà soát đúng phạm vi đề tài](docs/audit/2026-10-23_PM_SCOPE_REVIEW.md) · [Change Request tính năng mở rộng chưa duyệt](docs/project-management/14_CHANGE_REQUEST_2026-10-23.md).

Kế hoạch 20 tuần, ngân sách 1,2 tỷ VND và nguồn lực 8,5 FTE là **giả định học thuật**, không được coi là ngân sách đã chi hoặc timeline đã thực hiện.

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
- Các route `/study-plan` và `/insights` hiện chỉ là **ứng viên cải tiến trên nhánh thử nghiệm**, không phải scope/UAT baseline được duyệt; xem Change Request.
- docs/project-management: 13 tài liệu PM baseline + hồ sơ CR-2026-10-23 tách riêng, chưa được duyệt.
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

## Feature-branch notes

The `feat/student-workload-and-dashboard-20261023` branch contains bug fixes and candidate functional enhancements. **These are not incorporated into approved FR-01–FR-15, WBS, schedule or cost baselines.** Review the unapproved change request before treating them as deliverables. See [change summary and acceptance checklist](docs/audit/2026-10-23_WORKLOAD_CHANGE.md). The 2026-10-21 release gate verifies the older main baseline only; its PASS results must not be misattributed to this feature branch.

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
