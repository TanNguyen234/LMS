# University LMS — Project Status & Architecture Inventory

## System boundary

- **Backend:** FastAPI on Python 3.12, SQLAlchemy 2.x, Alembic (`head = 20261117_02`), Pydantic v2, and `pyodbc` (`use_setinputsizes=False` with automatic installed Windows ODBC driver selection).
- **Database:** Microsoft SQL Server — **21 normalized Unicode (`NVARCHAR` / `DATETIME2(0)`) tables** defined in [01_schema.sql](database/01_schema.sql) and incremental migrations under `backend/alembic/versions/`.
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Vite, React Router 7, `lucide-react`, `dompurify`, and typed domain API clients (`frontend/src/api/`).
- **Unified Launcher:** [START_SYSTEM.bat](START_SYSTEM.bat) performs prerequisite checks, SQL Server bootstrap/Alembic migration, idempotent demo seed sync (`backend.app.db.seed_demo`), Vite production build, and single-port SPA + API hosting on `http://127.0.0.1:8000`.
- **Security & Isolation:** Server-side RBAC (`ADMIN`, `LECTURER`, `STUDENT`), course ownership/enrollment checks, archived-semester/archived-course write guards, out-of-webroot File Vault (`backend/storage/vault`) with authenticated HTTP 206 Range streaming, and strict stripping of `CorrectAnswer` from student quiz payloads.

## Feature inventory

| Area | Implementation state | Verification boundary |
|---|---|---|
| Authentication, codes & Demo Switcher | JWT Bearer login via email, `StudentCode`, or `StaffCode`; rejects placeholder secrets outside `development`/`test`; dev-only demo account switcher | Covered by `test_acceptance.py`, `test_auth_users_demo.py`, `test_forensic_contracts.py` |
| Users & CSV bulk import | Admin CRUD, activation toggle, search/role/status pagination, and CSV batch user import (`POST /api/users/import-csv`) | Covered by `test_auth_users_demo.py` and `test_challenger_recon.py` |
| Academic semesters & lifecycle | `AcademicSemesters` CRUD, current-term tracking, automatic expiration archiving (`EndDate + GraceDays`), and read-only archived course protection | Covered by `test_semesters_and_scale.py` |
| Courses, bulk import, clone & self-enroll | Section codes (`UQ_Courses_Code_Section_Term`), searchable `LecturerCombobox`, bulk course import, cross-semester course cloning, student catalog self-enrollment, and join codes | Covered by `test_semesters_and_scale.py` and `test_learning_flows.py` |
| Timetable scheduler & conflict engine | `CourseSessions` CRUD, multi-week quick schedule generator, and lecturer/room/student-enrollment timetable conflict detection | Covered by `test_schedules_and_conflicts.py` |
| Modules, lessons & progress | Ordered modules/lessons (`TEXT`, `PDF`, `VIDEO`, `SLIDE`), publish guards, sanitized HTML, and `LessonProgress` completion/time tracking | Covered by `test_files_and_content.py` and `test_learning_flows.py` |
| Secure File Vault & preview | Authenticated upload/metadata/delete (`POST /api/files/upload`), SHA-256 hashing, `pypdf` text extraction, HTTP 206 Range streaming, `FileDropzone` & `FilePreviewModal` | Covered by `test_files_and_content.py` |
| Assignments, rubrics & grading | Draft/Published/Closed lifecycle, text and File Vault submissions, JSON rubrics, `AllowLate` (`LATE` status) policy, split-view grading drawer | Covered by `test_acceptance.py`, `test_learning_flows.py`, `test_forensic_contracts.py` |
| Quizzes, drafts, manual review & analytics | Timed attempt start/resume/submit, debounced draft autosave, `SINGLE_CHOICE`/`TRUE_FALSE` auto-grading + `SHORT_TEXT` manual grading, score visibility rules, and item analytics | Covered by `test_learning_flows.py`, `test_live_qa_regressions.py`, `test_challenger_recon.py` |
| Weighted gradebook, transcript & notifications | Filtered unique assessment grades (`UQ_Grades_Source_Learner`), weighted final score sync, cross-course GPA transcript, and real-time WebSocket notification push | Covered by `test_learning_flows.py` and `test_acceptance.py` |
| Virtual classroom & realtime hub | MS Teams/Jitsi-inspired fullscreen room (`MeetingRoom.tsx`), WebRTC signaling, host mute/moderation, live polls, collaborative `WhiteboardCanvas`, `ChannelChat`, and attendance logs | Covered by `test_meetings_and_teams.py`, `test_meeting_lifecycle.py`, `test_realtime_classroom.py` |
| AI academic assistant | Lesson tutor, draft quiz generator, and grading feedback assistant (`POST /api/ai/*`) with Google Gemini + deterministic local extractive fallback | Covered by `test_ai_assistant.py` |
| SQL Server schema & Alembic | 21-table canonical DDL (`01_schema.sql`), 21-table `04_seed_validation.sql`, idempotent `seed_demo.py`, and incremental migrations through `20261117_02` | Requires isolated `UniversityLms_Test_<id>` SQL Server DB for live integration runs |
| Academic PM coursework | 13 PMI-aligned baseline artifacts under `docs/project-management/` with verified 20-week CPM network, 1.2B VND budget reconciliation, and post-baseline Change Requests | Academic dates, approvals, and EVM actuals remain explicitly simulated |

## Historical forensic reports (2026-10-21 baseline snapshot)

The reports under `docs/audit/2026-10-21/` preserve the verified 12-table / 51-operation baseline milestone prior to the November 2026 feature waves:

- [Baseline and environment](docs/audit/2026-10-21/00_BASELINE.md)
- [Findings and triage](docs/audit/2026-10-21/01_FINDINGS_AND_TRIAGE.md)
- [API contract matrix](docs/audit/2026-10-21/02_API_CONTRACT_MATRIX.md)
- [Test matrix](docs/audit/2026-10-21/03_TEST_MATRIX.md)
- [PM reconciliation](docs/audit/2026-10-21/04_PM_RECONCILIATION.md)
- [Release gate](docs/audit/2026-10-21/05_RELEASE_GATE.md)
- [Disposable database and demo runbook](docs/audit/2026-10-21/06_DEMO_RUNBOOK.md)

 SQL Server integration suites and browser E2E runs must always target an isolated `UniversityLms_Test_<id>` database (`LMS_E2E_TEST_DATABASE`). No production cloud deployment or external uptime SLA is claimed.

## Project Governance & Coding Standards

- **Zero AI-Slop Emojis Policy:** Decorative or AI-slop emojis are strictly prohibited across all source code, UI components, comments, SQL scripts, and documentation (`.gemini/rules/no-ai-slop-emojis.md`). Use clean Markdown formatting and `lucide-react` vector icons.
