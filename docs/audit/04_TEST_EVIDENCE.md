# Audit Document 04: Test Execution & Verification Evidence

This document compiles the unedited command line execution outputs, exit codes, and verification records across all automated test suites, typechecks, linters, and database assertions.

---

## 1. Backend Acceptance Test Suite (`test_acceptance.py`)

- **Command:** `python -m pytest backend/tests -v`
- **Execution Date:** 2026-10-15
- **Exit Code:** `0`
- **Result:** **10 PASSED / 0 FAILED** (100% Pass Rate)

### Console Output:
```text
============================= test session starts =============================
platform win32 -- Python 3.12.4, pytest-8.2.2, pluggy-1.6.0 -- D:\Projects\AI_Paper\pythonProject\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: D:\Download\LMS
plugins: anyio-4.14.2, langsmith-0.8.16, logfire-4.37.0, asyncio-1.3.0, cov-7.1.0, mock-3.15.1, timeout-2.4.0, respx-0.23.1
asyncio: mode=Mode.STRICT, debug=False, asyncio_default_fixture_loop_scope=None, asyncio_default_test_loop_scope=function
collecting ... collected 10 items

backend/tests/test_acceptance.py::test_ac01_authentication PASSED        [ 10%]
backend/tests/test_acceptance.py::test_ac02_authorization PASSED         [ 20%]
backend/tests/test_acceptance.py::test_ac03_course_isolation PASSED      [ 30%]
backend/tests/test_acceptance.py::test_ac04_enrollment_uniqueness PASSED [ 40%]
backend/tests/test_acceptance.py::test_ac05_published_content PASSED     [ 50%]
backend/tests/test_acceptance.py::test_ac06_assignment_deadline PASSED   [ 60%]
backend/tests/test_acceptance.py::test_ac07_grading_sync PASSED          [ 70%]
backend/tests/test_acceptance.py::test_ac08_quiz_max_attempts PASSED     [ 80%]
backend/tests/test_acceptance.py::test_ac09_quiz_secret_protection PASSED [ 90%]
backend/tests/test_acceptance.py::test_ac10_notification_ownership PASSED [100%]

====================== 10 passed, 14 warnings in 10.46s =======================
```

---

## 2. Frontend Production Build & TypeScript Verification

- **Command:** `npm run build` (`tsc -p tsconfig.app.json --noEmit && vite build`)
- **Execution Directory:** `d:\Download\LMS\frontend`
- **Exit Code:** `0`
- **Result:** **PASSED** (0 TypeScript Errors, Production Bundle Generated)

### Console Output:
```text
> frontend@0.0.0 build
> tsc -p tsconfig.app.json --noEmit && vite build

vite v8.3.4 building client environment for production...
transforming...
✓ 1931 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.55 kB │ gzip:   0.37 kB
dist/assets/index-Cdo8L9jw.css   40.66 kB │ gzip:   7.50 kB
dist/assets/index--Kh8krnO.js   392.47 kB │ gzip: 106.79 kB

✓ built in 1.42s
```

---

## 3. Frontend Static Analysis & Linting

- **Command:** `npm run lint` (`oxlint`)
- **Execution Directory:** `d:\Download\LMS\frontend`
- **Exit Code:** `0`
- **Result:** **PASSED** (0 Errors, 16 Informational Warnings)

### Console Summary:
```text
Found 16 warnings and 0 errors.
Finished in 262ms on 18 files with 116 rules using 4 threads.
```

---

## 4. Microsoft SQL Server Database & Seed Validation

- **Command:** `python -c "import pyodbc ... database/04_seed_validation.sql ..."`
- **Target Server:** `localhost\SQLEXPRESS`
- **Target Database:** `UniversityLms`
- **Exit Code:** `0`
- **Result:** **PASSED** (All 12 tables >= 10 records, all Foreign Key and active enrollment assertions verified)

### Table Record Counts:
```text
Executing batch 1...
('Users', 10)
('Courses', 10)
('Enrollments', 10)
('Modules', 19)
('Lessons', 18)
('Assignments', 26)
('Submissions', 16)
('Quizzes', 30)
('QuizQuestions', 26)
('QuizAttempts', 24)
('Grades', 15)
('Notifications', 24)
Validation script executed successfully!
```
