> **Historical audit snapshot:** this document describes an earlier repository state. Its PASS/RESOLVED claims are not evidence for the 2026-10-21 forensic-fix branch. Use the dated reports in `docs/audit/2026-10-21/` for current findings and verification.

# Audit Document 02: Defects & Findings Register

This register details all critical (P0), high (P1), and medium (P2) defects identified during the audit, their root causes, reproduction steps, impacted files/lines, fix actions, and current status.

---

## 1. Findings Summary Table

| Finding ID | Severity | File & Location | Root Cause | Fix Applied | Test Evidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **F-01** | **P0** | `frontend/src/api/client.ts:25`, `AuthContext.tsx` | Frontend sent OAuth2 `FormData` (`username`, `password`) instead of JSON `{ email, password }` required by FastAPI `LoginRequest`. | Re-engineered `api.login` to send raw JSON matching Pydantic model. | AC-01 PASSED | **RESOLVED** |
| **F-02** | **P0** | `frontend/src/pages/LoginPage.tsx:18` | Demo credentials referenced fictitious emails (`student@university.edu.vn`) missing from SQL Server seed dataset. | Aligned demo credentials with actual seed users (`admin@university.edu.vn`, `lecturer1@university.edu.vn`, `student1@university.edu.vn`). | AC-01 PASSED | **RESOLVED** |
| **F-03** | **P0** | `frontend/src/pages/AdminUsersPage.tsx:40` | Backend `/api/users` returned `PaginatedResponse[UserResponse]` while UI expected a flat array `User[]`. | Added defensive envelope unpacking `Array.isArray(res) ? res : res.items`. | AC-02 PASSED | **RESOLVED** |
| **F-04** | **P0** | `frontend/src/pages/CourseDetailPage.tsx:75` | Lecturer access triggered unauthorized `/api/users` call (Admin only), crashing course detail rendering. | Decoupled user fetching: only query student list if active user has `ADMIN` role. | AC-03 PASSED | **RESOLVED** |
| **F-05** | **P0** | `frontend/src/api/client.ts:80`, `CourseDetailPage.tsx` | Delete enrollment passed student ID instead of enrollment ID, causing 404/405 route failure. | Passed `enrollmentId` directly to `DELETE /api/courses/{id}/enrollments/{enrollmentId}`. | AC-04 PASSED | **RESOLVED** |
| **F-06** | **P0** | `backend/app/api/routes/assignments.py:199` | Submission status check rejected valid database status `PUBLISHED` (`if a.Status != "ACTIVE"`), breaking all standard submissions. | Changed logic to reject only `DRAFT` and `CLOSED`, permitting `PUBLISHED` and `ACTIVE`. | AC-06, AC-07 PASSED | **RESOLVED** |
| **F-07** | **P1** | `frontend/src/pages/CourseDetailPage.tsx:145` | Student Self-Enrollment button present in UI despite being explicitly out of scope for Academic prototype. | Removed unauthorized self-enrollment UI and handler from `CourseDetailPage.tsx`. | Code audit confirmed | **RESOLVED** |
| **F-08** | **P1** | `backend/app/api/routes/quizzes.py:240` | Late quiz submission allowed posting scores after time limit expired; questions leaked correct answers. | Added time-limit check (+60s grace), atomic status transition to `EXPIRED`, and sanitized student DTOs. | AC-08, AC-09 PASSED | **RESOLVED** |
| **F-09** | **P1** | `backend/app/api/routes/grades.py:110` | Manual grade creation did not verify if target student was actively enrolled in course. | Added strict enrollment verification check returning 400 Bad Request if not enrolled. | AC-07 PASSED | **RESOLVED** |
| **F-10** | **P1** | `backend/app/main.py:45` | `/health` endpoint returned HTTP 200 OK even when SQL Server connection failed. | Added active `SELECT 1` DB probe returning HTTP 503 Service Unavailable on connectivity loss. | Health endpoint unit test PASSED | **RESOLVED** |
| **F-11** | **P2** | `database/04_seed_validation.sql` | Verification script only printed text without aborting or raising fatal errors on seed mismatches. | Refactored with `RAISERROR(..., 16, 1)` and error rollback to guarantee pipeline termination on mismatch. | SQL execution exit code 0 | **RESOLVED** |
| **F-12** | **P2** | `docs/project-management/06_SCHEDULE_CPM_GANTT.md` | ACT-14 listed ACT-13 as predecessor while ACT-13 depended on ACT-12, distorting Critical Path float. | Re-calculated CPM forward/backward passes: fixed ACT-14 predecessor to ACT-12, TF=2 (non-critical). | CPM reconciliation PASSED | **RESOLVED** |
| **F-13** | **P2** | `docs/project-management/12_UAT_AND_ACCEPTANCE_EVIDENCE.md` | Document contained simulated enterprise sign-off names without disclaimers distinguishing simulation from real evidence. | Added academic governance disclaimer clarifying simulated PM templates vs verified automated test suites. | PM review PASSED | **RESOLVED** |

---

## 2. Detailed Root-Cause Analyses

### Finding F-06: Assignment Submission Status Check Mismatch
- **Description:** In `backend/app/api/routes/assignments.py`, `submit_assignment` enforced `if a.Status != "ACTIVE": raise HTTPException(...)`.
- **Root Cause:** The SQL Server schema constraint `CK_Assignments_Status` restricts assignment status to `'DRAFT'`, `'PUBLISHED'`, or `'CLOSED'`. There is no `'ACTIVE'` status for assignments in the database schema. Standard seed data and test fixtures create assignments with status `'PUBLISHED'`. Checking `!= "ACTIVE"` rejected valid submissions with `Cannot submit to an assignment with status 'PUBLISHED'`.
- **Resolution:** Updated `assignments.py` to check `if a.Status in ["DRAFT", "CLOSED"]: raise HTTPException(...)`. Both `test_ac06_assignment_deadline` and `test_ac07_grading_sync` immediately passed green.

### Finding F-08: Timed Quiz Integrity & Secret Leak Prevention
- **Description:** Quiz questions contained `CorrectAnswer` fields in database models. If returned unfiltered to students, answers could be extracted via browser devtools. Furthermore, students submitting past the allotted time could record scores.
- **Root Cause:** Absence of student-facing DTO redaction and lacking server-side expiration checks in `quizzes.py`.
- **Resolution:** Implemented `QuizDetailResponse` that maps questions to `QuizQuestionStudentResponse` (omitting `correctAnswer`). In `submit_quiz_attempt`, added elapsed time calculation compared against `TimeLimitMinutes` (with a 60-second network latency buffer). Attempts exceeding the limit are marked `EXPIRED` and zeroed.
