# Audit Document 00: Baseline and System Inventory

- **Repository Root:** `d:\Download\LMS`
- **Initial Baseline Commit SHA:** `9944bacbf2ed1be6c6eac1f98f1c4264655cd17a`
- **Active Git Branch:** `main` (Per direct instruction: working directly on `main`)
- **Audit Date:** 2026-10-15
- **Reference Specification:** `D:/Download/LMS_SUPER_PROMPT_FIX_AUDIT_2026-10-14.md`

---

## 1. Environment & Stack Specifications

| Component | Installed / Target Specification | Verification Evidence |
| :--- | :--- | :--- |
| **Operating System** | Windows 11 Enterprise (64-bit) | System architecture confirmed via PowerShell |
| **Database Engine** | Microsoft SQL Server 2022 Express (`localhost\SQLEXPRESS`) | `pyodbc` connection to `UniversityLms` confirmed |
| **Database Driver** | ODBC Driver / SQL Server Native Client | Tested via `Driver={SQL Server}` in pyodbc |
| **Backend Runtime** | Python 3.12.4 (`pythonProject/.venv`) | Verified via `pytest-8.2.2` execution |
| **Backend Framework** | FastAPI 0.115+, Uvicorn, SQLAlchemy 2.0, Pydantic v2 | Verified in `backend/app/main.py` |
| **Frontend Runtime** | Node.js v20.x, npm | Node package management verified |
| **Frontend Framework** | React 19.2.8, Vite 8.3.4, React Router 7.18.4, TailwindCSS 4 | Verified via `vite build` (`1931 modules transformed`) |
| **Testing Harness** | Pytest 8.2.2 (`pytest-asyncio`, `respx`, `httpx`) | 10/10 acceptance tests passing (`test_acceptance.py`) |

---

## 2. Scope Authority & Boundary Definitions

1. **System Authority:**
   - University Learning Management System (LMS) designed for academic course management, assignments, quizzes, and grading.
   - Core Roles: `ADMIN`, `LECTURER`, `STUDENT`.
2. **Strict Scope Boundaries:**
   - **Student Self-Enrollment is strictly OUT OF SCOPE**: Enrollment is managed exclusively by Academic Administration (`ADMIN`) or Course Owners. Student self-enrollment buttons/routes were identified as unauthorized scope creep and eliminated from the UI.
   - **Database Dialect**: Native Microsoft SQL Server (`DATETIME2(0)`, `UNIQUEIDENTIFIER`, `BIT`, `NVARCHAR(MAX)`). No SQLite mock compromises for production execution.
   - **Seed Data Baseline**: Exactly 12 relational tables x minimum 10 verified seed records per table, fully satisfying referential integrity constraints.

---

## 3. Repository File Inventory

```
d:\Download\LMS\
├── backend/
│   ├── alembic/                      # Database migrations
│   ├── app/
│   │   ├── api/routes/               # Route controllers
│   │   │   ├── admin.py              # User management & metrics
│   │   │   ├── assignments.py        # Assignment CRUD, submissions & grading
│   │   │   ├── auth.py               # Token issuance & user profile
│   │   │   ├── courses.py            # Course management & enrollments
│   │   │   ├── dashboard.py          # Admin/Lecturer/Student dashboard aggregations
│   │   │   ├── grades.py             # Course gradebooks & manual grade overrides
│   │   │   ├── modules.py            # Modules & lesson management
│   │   │   ├── notifications.py      # User notifications & read status
│   │   │   └── quizzes.py            # Quizzes, questions, timed attempts & auto-scoring
│   │   ├── core/                     # Configuration, security & JWT
│   │   ├── db/                       # Session management & SQLAlchemy base
│   │   ├── models/                   # 12 SQLAlchemy ORM models
│   │   ├── schemas/                  # Pydantic v2 validation DTOs
│   │   └── main.py                   # FastAPI application factory & health checks
│   └── tests/
│       ├── conftest.py               # Test fixtures & test DB session
│       └── test_acceptance.py        # AC-01 to AC-10 acceptance verification suite
├── database/
│   ├── 01_schema.sql                 # SQL Server DDL with constraints
│   ├── 02_seed.sql                   # 12 tables x 10 rows seed dataset
│   ├── 03_demo_queries.sql           # Persona verification queries
│   └── 04_seed_validation.sql        # Automated table count & foreign key assertion script
├── docs/
│   ├── project-management/           # 13 SPM Project Management artifacts (01 to 13)
│   └── audit/                        # Audit evidence reports (00 to 08)
├── frontend/
│   ├── src/
│   │   ├── api/client.ts             # Normalized type-safe HTTP client
│   │   ├── auth/AuthContext.tsx      # Auth state, token & localStorage management
│   │   ├── pages/                    # 8 Role-based application pages
│   │   └── types/index.ts            # Normalized TypeScript interfaces & DTOs
│   └── package.json                  # Scripts & dependencies
└── README.md                         # Runbook, architecture & setup guidelines
```
