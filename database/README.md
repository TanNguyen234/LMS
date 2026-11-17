# Database Setup & Schema Guide

Database target: **Microsoft SQL Server** (`NVARCHAR` Unicode + `DATETIME2(0)` UTC).

## Automated setup (recommended)

From the repository root, initialize a fresh database (schema + seed + 21-table integrity check):

```powershell
powershell -ExecutionPolicy Bypass -File database\setup_database.ps1 -Server "localhost\SQLEXPRESS" -Database "UniversityLms"
```

After running `setup_database.ps1` on a brand-new database, stamp Alembic at `head` (`20261117_02`) and synchronize relative demo dates and sample File Vault assets:

```powershell
backend\venv\Scripts\python.exe -m alembic -c backend\alembic.ini stamp head
backend\venv\Scripts\python.exe -m backend.app.db.seed_demo
```

(`START_SYSTEM.bat` automates all of the steps above for local Windows startup.)

## Manual SQL run order

1. Create an empty database (for example `UniversityLms` or disposable `UniversityLms_Test_<id>`).
2. Execute `01_schema.sql` (creates all **21 tables**, constraints, and indexes).
3. Execute `02_seed.sql` (inserts 10 rows into each of the 12 core tables plus baseline extended records).
4. Execute `04_seed_validation.sql` (verifies all 21 tables exist, core row counts >= 10, and referential integrity).
5. Optionally run `03_demo_queries.sql` for inspection queries.

## Development password initializer

`02_seed.sql` never stores plain-text credentials; seeded accounts carry sentinel `PasswordHash = '__SET_ON_FIRST_RUN__'`. When `APP_ENV=development`, FastAPI startup (`backend/app/db/init_db.py`) hashes `Demo@123` with `bcrypt` for sentinel accounts and invokes `ensure_demo_seed` (`backend/app/db/seed_demo.py`).

## SQLAlchemy + Alembic parity

- `01_schema.sql` is the canonical 21-table SQL Server DDL reference (`Users`, `AcademicSemesters`, `Courses`, `Enrollments`, `Modules`, `Meetings`, `MeetingLogs`, `StoredFiles`, `Lessons`, `Assignments`, `Submissions`, `Quizzes`, `QuizQuestions`, `QuizAttempts`, `Grades`, `Notifications`, `CourseMessages`, `WhiteboardSnapshots`, `LessonProgress`, `AiInteractionLogs`, `CourseSessions`).
- `backend/alembic/versions/` manages incremental upgrades through revision `20261117_02`.
- `backend/app/core/config.py` automatically selects an installed Windows ODBC driver (`ODBC Driver 18 for SQL Server`, `ODBC Driver 17 for SQL Server`, or `SQL Server`) and honors `LMS_E2E_TEST_DATABASE=UniversityLms_Test_<id>` for isolated test runs.
