# Disposable SQL Server test and demo runbook

This runbook is for local Windows SQL Server Express. Use only a newly created database named UniversityLms_Test_<unique-id>. Never point tests at UniversityLms or another shared/user database. The current audit branch did not create this database because command policy rejected the create command; steps below are instructions for the next authorized test run, not evidence they were completed.

## 1. Provision a disposable test database

1. Open SSMS and connect to the local SQL Server Express instance.
2. In a query connected to master, create a new unique test database, for example UniversityLms_Test_20261021. Confirm the selected database name before running scripts.
3. In SSMS, select that new database and run, in order:
   - database/01_schema.sql
   - database/02_seed.sql
   - database/04_seed_validation.sql
4. Confirm 12 tables have at least 10 rows each and validation returns no error. The validation script is static, not run in this audit.

Do not run database/03_reset.sql. Do not use the existing UniversityLms database. No auto-drop/cleanup command is included.

## 2. Point backend and Alembic at the disposable database

Copy backend/.env.example to backend/.env if no local file exists. Set DATABASE_URL to the disposable database, for example:

    mssql+pyodbc://localhost%5CSQLEXPRESS/UniversityLms_Test_20261021?driver=SQL+Server&trusted_connection=yes&TrustServerCertificate=yes

Keep the URL and all credentials private. For pytest from the repository root, set DATABASE_URL only in the current PowerShell process to the test URL; do not write it into a tracked file. Confirm the database name before starting any command. The conftest and recon2 module guards require the UniversityLms_Test_ prefix.

The fresh SQL script creates the current schema. After successful seed validation, stamp Alembic at head; do not run the historical initial revision as an empty-database bootstrap:

    backend\venv\Scripts\python.exe -m alembic -c backend/alembic.ini stamp head

For an existing disposable database already at revision efd8af3f19c3, review the data and then apply the incremental revision with Alembic upgrade head. The migration prechecks duplicate source grades and unsupported question types. Do not run either command on a non-disposable database.

## 3. Run backend checks

From the repository root, with DATABASE_URL set only in the test shell:

    backend\venv\Scripts\python.exe -m pytest --collect-only -q backend/tests
    backend\venv\Scripts\python.exe -m pytest backend/tests -q

The expected test database includes the seed records plus changes made by integration tests. To repeat, provision a new uniquely named database and reseed it; do not reset a shared database. Preserve the stdout/stderr and exit code in the dated evidence directory without connection strings or tokens.

## 4. Start API and frontend

PowerShell window 1, repository root, API configured for the disposable DB:

    backend\venv\Scripts\python.exe -m uvicorn backend.app.main:app --env-file backend/.env --host 127.0.0.1 --port 8000

Check /health returns HTTP 200 with database_connected=true. Inspect /openapi.json only on this local test API.

PowerShell window 2, frontend:

    Set-Location frontend
    npm ci
    npm run dev

The UI should be available at http://localhost:5173.

## 5. Browser smoke/E2E

1. Start a dedicated test-only Chrome process/profile with remote debugging on port 9222. Do not reuse a personal Chrome profile.
2. In the same PowerShell session, set LMS_E2E_TEST_DATABASE to the exact disposable database name actually used by the running API.
3. Run scripts/run_devtools_e2e.py from the repository root. It refuses to run without the test-database name, requires an available student quiz, checks start and submit both return 200 with the same attemptId, verifies the server maxScore and checks the student response/DOM for answer leakage. It asserts no unexpected API 4xx/5xx and JavaScript exceptions.
4. The script does not launch, terminate or kill Chrome processes. It writes screenshots and a DevTools audit log only after it reaches those steps. No screenshot or E2E log from this branch is claimed.

The current script covers the Admin, Lecturer and Student page smoke flows plus the timed quiz journey. It does not yet automate every planned user-management, course-enrollment and assignment-grading scenario from the full E2E acceptance table; those remain an additional release gate.

## 6. Demo accounts and safe finish

Seed accounts use admin@university.edu.vn, lecturer1@university.edu.vn and student1@university.edu.vn. Their development password initializer runs only when APP_ENV=development. Use accounts only in the disposable demo database.

Never commit .env, token values, database contents or screenshots containing personal data. Do not drop the test database automatically; request approval before deletion.
