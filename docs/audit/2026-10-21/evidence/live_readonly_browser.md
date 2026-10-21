# Live read-only browser evidence — 2026-10-21

## Target and safety boundary

- Branch: `fix/lms-forensic-acceptance-20261021`; source follow-up commit: `2b8bbb7`.
- Frontend: `http://127.0.0.1:5173`; backend: `http://127.0.0.1:8000`.
- Backend loaded `backend/.env`: local SQL Server `localhost\SQLEXPRESS`, database `UniversityLms`, `APP_ENV=development`. Credential values were not recorded.
- `sys.databases` contained `UniversityLms` but no `UniversityLms_Test_*`. There were zero sentinel-password rows and zero pre-existing E2E-marked courses, assignments, or quizzes.
- The forensic prompt requires exploratory writes to use a fresh disposable database. No write request, migration, or database modification was made during this browser pass.
- Chrome DevTools MCP could not create a tab because its configured Chrome profile was already running. The actual app was exercised in the visible in-app Chromium browser. Browser console logs and live Uvicorn access logs were inspected; this is not claimed as a Chrome DevTools Network-panel run.

## Failure reproduced, then fixed

Before the source follow-up, the real ADMIN dashboard requested `GET /api/courses/10000000-0000-0000-0000-000000000010/assignments` and received HTTP 500. The browser console recorded three `Error fetching dashboard data` entries at `2026-10-21T01:02:03.626Z`, `.890Z`, and `.939Z`. Uvicorn's traceback ended in `AttributeError: 'str' object has no attribute 'tzinfo'` at the assignment response datetime conversion. A read-only SQL metadata query reported `Assignments.DueAt` as `datetime2` with 96 non-null rows.

The regression test `test_assignment_response_deadline_parses_sql_server_datetime_strings` was run before the fix and failed with the same `AttributeError`. The conversion helper now parses ISO SQL datetime strings before applying the existing UTC normalization. After the backend restart, the same real browser API route returned HTTP 200 and the dashboard rendered. A fresh browser tab loaded the student dashboard with zero console errors or warnings.

## Real account journeys

Active ADMIN, LECTURER, and STUDENT identities were selected from `dbo.Users`; the local development password was verified against the stored hashes for one active account in each role. Account identifiers, hashes, and tokens are intentionally omitted from this artifact.

| Role | Direct UI and API observations |
|---|---|
| ADMIN | Login 200; `/api/auth/me`, `/api/dashboard/admin`, `/api/courses`, and `/api/users?page=1&pageSize=100` returned 200. The user page rendered 10 rows. The dashboard's assignment request returned 200 after the fix. |
| LECTURER | Login 200; dashboard rendered 3 assigned courses and 10 pending submissions. Assignment list rendered a real assignment; quiz list rendered a real quiz; gradebook rendered a real grade. Requests to `/api/dashboard/lecturer`, `/api/courses`, `/api/courses/10000000-0000-0000-0000-000000000007/assignments`, `/quizzes`, and `/gradebook` returned 200. |
| STUDENT | Login 200; dashboard rendered 2 enrollments, 1 upcoming assignment, and 2 available quizzes. Assignment list, quiz list, and personal gradebook rendered real records. Requests to `/api/courses`, `/api/courses/10000000-0000-0000-0000-000000000006/assignments`, `/quizzes`, and `/my-grades` returned 200. |

The `/assignments`, `/quizzes`, and `/grades` views were opened through the UI. No create, update, deactivate, assignment submission, grading, quiz start, or quiz submission action was invoked. The student quiz's “Làm bài” button remained untouched so no attempt or grade could be written to `UniversityLms`.

## Commands and results

| Command | CWD | Result |
|---|---|---|
| `backend/venv/Scripts/python.exe -m pytest backend/tests/test_forensic_contracts.py::test_assignment_response_deadline_parses_sql_server_datetime_strings -q` | repository root, before source fix | Exit 1; one expected regression failure reproduced. |
| `backend/venv/Scripts/python.exe -m pytest backend/tests/test_forensic_contracts.py -q` | repository root, after source fix | Exit 0; 15 passed, 15 dependency/deprecation warnings. |
| `backend/venv/Scripts/python.exe -m pytest --collect-only -q backend/tests` | repository root | Exit 0; 41 tests collected. |
| `backend/venv/Scripts/python.exe -m pytest backend/tests -q` | repository root, database guard enabled | Exit 1; 15 passed, 6 skipped, 20 setup errors. Every integration setup error states that the configured DB is not `UniversityLms_Test_<id>`; no integration test body ran. |
| `backend/venv/Scripts/python.exe -m py_compile backend/app/api/routes/assignments.py backend/tests/test_forensic_contracts.py` | repository root | Exit 0. |
| `git diff --check` | repository root | Exit 0; only Git's line-ending conversion warnings were printed. |

## Still unverified

The write journeys in the forensic acceptance prompt remain NOT RUN: assignment creation and submission, grading, quiz start and submit, persistence/idempotency checks, and the SQL Server integration suite. A disposable SQL Server test database is required to complete them without changing existing coursework records. No release-complete claim is made from these read-only sessions.
