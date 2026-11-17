# University Learning Management System (LMS)

University LMS is an academic modular-monolith platform built for the Software Project Management capstone course. It supports full teaching and learning workflows across three server-enforced roles (`ADMIN`, `LECTURER`, `STUDENT`), combining a FastAPI backend, Microsoft SQL Server (21 normalized Unicode tables), and a React 19 + TypeScript + Tailwind CSS v4 single-page frontend.

## Capabilities

- **Authentication & Role Governance:** JWT Bearer authentication via email, `StudentCode`, or `StaffCode`; server-side RBAC (`ADMIN`, `LECTURER`, `STUDENT`); development-only Demo Role Switcher and sentinel password bootstrap (`Demo@123`).
- **Academic Semesters & Scaling Operations:** Semester lifecycle management (`UPCOMING`, `ACTIVE`, `ARCHIVED`) with grace-period auto-archiving and read-only archived-course enforcement, bulk course import, cross-semester course cloning, searchable lecturer assignment (`LecturerCombobox`), and CSV user import.
- **Courses, Catalog & Enrollment:** Admin enrollment management plus configurable student self-enrollment and course join codes with automatic timetable conflict checks.
- **Timetable & Smart Scheduler:** Course session scheduling (`CourseSessions`), multi-week quick schedule generation, and real-time lecturer, student-cohort, and room conflict detection.
- **Course Content & Secure File Vault:** Structured modules and lessons (`TEXT`, `PDF`, `VIDEO`, `SLIDE`), student lesson completion tracking (`LessonProgress`), and an out-of-webroot File Vault (`StoredFiles`) with SHA-256 verification, PDF text extraction, inline preview, and HTTP 206 Range streaming.
- **Assignments & Weighted Grading:** Published/Draft/Closed assignment lifecycle, text and file-vault submissions, rubric support, configurable `AllowLate` (`LATE` status) enforcement, weighted course gradebooks, and cumulative student transcripts.
- **Timed Quizzes & Item Analytics:** Server-timed attempts (`SINGLE_CHOICE`, `TRUE_FALSE`, and `SHORT_TEXT` with lecturer manual review), debounced draft autosave, strict student DTO answer stripping (`CorrectAnswer` never leaves the server), score-visibility policies, and per-question analytics.
- **Virtual Classroom & Realtime Collaboration:** Built-in WebRTC/WebSocket live classroom (`Meetings`, `MeetingLogs`) with MS Teams/Jitsi-style fullscreen controls, host moderation, live polls, collaborative canvas whiteboard (`WhiteboardSnapshots`), course/meeting chat (`CourseMessages`), and real-time notifications.
- **AI Academic Assistant:** Lesson tutor, draft quiz question generator, and submission feedback assistant (`AiInteractionLogs`) backed by Google Gemini with deterministic local extractive fallback when `GEMINI_API_KEY` is unset.

## Quick start (Windows one-click launcher)

To validate prerequisites, initialize or upgrade SQL Server (`alembic upgrade head` -> `20261117_02`), synchronize relative-date demo seed data and sample vault files, build the React bundle, and serve both SPA and API on `http://127.0.0.1:8000`:

```bat
START_SYSTEM.bat
```

Run a non-mutating environment and database preflight check without starting the server:

```bat
START_SYSTEM.bat --check
```

## Safe local development & isolated verification

Local secrets belong in an untracked `backend/.env` (copied from `backend/.env.example`) and must never be committed.

1. **Backend dependencies** (from repository root):

   ```powershell
   python -m venv backend\venv
   backend\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   ```

2. **Bootstrap an isolated disposable test database** (never run integration tests against a shared `UniversityLms` database):

   ```powershell
   powershell -ExecutionPolicy Bypass -File database\setup_database.ps1 -Server "localhost\SQLEXPRESS" -Database "UniversityLms_Test_Dev"
   $env:LMS_E2E_TEST_DATABASE = "UniversityLms_Test_Dev"
   backend\venv\Scripts\python.exe -m alembic -c backend\alembic.ini stamp head
   backend\venv\Scripts\python.exe -m backend.app.db.seed_demo
   ```

3. **Run API and Vite dev server separately** (optional hot-reload workflow):

   ```powershell
   backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
   ```

   In a second terminal from `frontend/`:

   ```powershell
   npm ci
   npm run dev
   ```

   Swagger UI is served at `http://127.0.0.1:8000/docs`, health check at `http://127.0.0.1:8000/health`, and Vite dev UI at `http://localhost:5173`.

## Verification commands

From `frontend/`:

```powershell
npm ci
npm run build
npm run lint
```

From repository root against an isolated `UniversityLms_Test_<id>` database:

```powershell
$env:LMS_E2E_TEST_DATABASE = "UniversityLms_Test_<id>"
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

Pure contract checks without mutating `UniversityLms`:

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests/test_forensic_contracts.py -q
```

See [docs/audit/2026-10-21/06_DEMO_RUNBOOK.md](docs/audit/2026-10-21/06_DEMO_RUNBOOK.md) for the disposable-database Chrome DevTools E2E runbook, and [docs/audit/2026-10-21/05_RELEASE_GATE.md](docs/audit/2026-10-21/05_RELEASE_GATE.md) for the historical 2026-10-21 baseline audit record.

## Project-management documents

The 13 academic project-management baseline artifacts are maintained under `docs/project-management`:

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
