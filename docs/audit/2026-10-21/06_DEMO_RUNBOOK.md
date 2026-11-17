# Local demo and live acceptance runbook — 2026-10-21

This runbook describes the tested local workflow on the existing SQL Server and visible Chrome. It never targets the user database `UniversityLms`. Use a newly created, uniquely named `UniversityLms_Test_<id>` database and retain it after testing; no cleanup step drops databases. The audited run used `UniversityLms_Test_20261021_0124` for browser/backend checks and `UniversityLms_Test_Repeat_20261021_1027` for clean bootstrap/repeat-suite checks.

## 1. Create an isolated test database

1. Connect to the local SQL Server instance and initialize a fresh disposable database with a unique `UniversityLms_Test_<id>` name (do not reuse `UniversityLms`):
   ```powershell
   powershell -ExecutionPolicy Bypass -File database\setup_database.ps1 -Server "localhost\SQLEXPRESS" -Database "UniversityLms_Test_<id>"
   ```
   Alternatively, in SSMS create `UniversityLms_Test_<id>` and run `database/01_schema.sql`, `database/02_seed.sql`, and `database/04_seed_validation.sql` in order.
2. Confirm that `04_seed_validation.sql` passes the 21-table schema check, 12 core tables >= 10 rows check, and referential integrity checks. Do not run destructive reset/drop scripts against `UniversityLms`.

The scripts use the existing SQL Server installation. This workflow does not require installing `sqlcmd`.

## 2. Select the test DB for Python commands

In each PowerShell session that runs backend, Alembic, or `pytest` commands, select the exact disposable test database by name (honored by `backend/app/core/config.py`, `scripts/serve_e2e_test_database.py`, and the E2E runners):

```powershell
$env:LMS_E2E_TEST_DATABASE = 'UniversityLms_Test_<id>'
```

The repository's local `backend/.env` supplies the base SQL Server connection settings; do not print, copy into tracked files, or include credentials in evidence. The test fixtures reject any database name without the `UniversityLms_Test_` prefix.

After schema, seed, and validation succeed, stamp the fresh SQL schema at the current migration head (`20261117_02`) and sync relative demo fixtures:

```powershell
backend\venv\Scripts\python.exe -m alembic -c backend/alembic.ini stamp head
backend\venv\Scripts\python.exe -m backend.app.db.seed_demo
```

Then run the integration suite:

```powershell
backend\venv\Scripts\python.exe -m pytest backend/tests -q
```

For order-independence verification, run the modules in a different order:

```powershell
backend\venv\Scripts\python.exe -m pytest -q backend/tests/test_recon2_challenger.py backend/tests/test_forensic_contracts.py backend/tests/test_challenger_recon.py backend/tests/test_acceptance.py
```

Every repeat run that needs a clean database must use another uniquely named test DB and repeat schema/seed/validation/stamp. Do not reset the user's DB.

## 3. Run the local API and frontend

Start the API in a PowerShell window from the repository root, with the exact test DB name already selected:

```powershell
backend\venv\Scripts\python.exe scripts\serve_e2e_test_database.py
```

The launcher enforces the `UniversityLms_Test_` prefix and serves the SQL Server-backed API on `127.0.0.1:8001`. Confirm `/health` reports HTTP 200 and a connected database before testing.

Start Vite in another window, explicitly pointing its `/api` and WebSocket proxy at port `8001` (`vite.config.ts` defaults `LMS_API_PROXY_TARGET` to `http://127.0.0.1:8000` when unset):

```powershell
Set-Location frontend
$env:LMS_API_PROXY_TARGET = 'http://127.0.0.1:8001'
npm run dev -- --host 127.0.0.1 --port 5174
```

The app is served at `http://127.0.0.1:5174`; with `LMS_API_PROXY_TARGET` set above, its `/api` proxy points to the isolated API at port `8001`.

## 4. Run the real Chrome E2E journey

Use a test Chrome session with remote debugging on port 9333. The runner uses the visible browser, actual UI controls, actual HTTP requests and SQL Server persistence checks; it does not mock browser or API responses. It does not close Chrome, API or Vite.

In the PowerShell session, set the same exact database name used by the API and run:

```powershell
$env:LMS_E2E_TEST_DATABASE = 'UniversityLms_Test_<id>'
backend\venv\Scripts\python.exe scripts\run_live_crud_e2e.py
```

The script verifies its connected database with `SELECT DB_NAME()`, uses the seeded admin, lecturer and student accounts, and fails on unapproved API rejections, JavaScript exceptions or `console.error`. It writes the run log and screenshots beneath `docs/audit/2026-10-21/evidence/crud-e2e/`.

The acceptance flow covers add/edit/view and reversible lifecycle actions for the implemented product features: users, courses, enrollments, lessons/modules, assignments, grades, quizzes and questions. Current deletion behavior is reversible (deactivate, archive, drop, unpublish or close). Physical deletion endpoints for users, courses, modules, lessons, assignments, quizzes and questions are not implemented; this runbook does not claim those flows.

## 5. Test accounts and data safety

Seeded test accounts are `admin@university.edu.vn`, `lecturer1@university.edu.vn` and `student1@university.edu.vn`. The local E2E runner initializes/uses development test credentials; credential values are intentionally omitted from this report. Do not use or disclose real user passwords or tokens in logs/screenshots.

Keep both test databases for review unless the user separately asks to remove them. Never commit `.env`, database URLs, credentials, tokens or personal data. Do not run any database drop/reset command against `UniversityLms`.
