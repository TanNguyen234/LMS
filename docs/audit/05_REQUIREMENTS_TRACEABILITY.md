> **Historical audit snapshot:** this document describes an earlier repository state. Its PASS/RESOLVED claims are not evidence for the 2026-10-21 forensic-fix branch. Use the dated reports in `docs/audit/2026-10-21/` for current findings and verification.

# Audit Document 05: Requirements & Acceptance Traceability Matrix (RTM)

This matrix maps every functional requirement (FR), business rule (BR), non-functional requirement (NFR), and acceptance criterion (AC) to its implementing code, corresponding automated test, and browser demo flow.

---

## 1. Acceptance Criteria Traceability (AC-01 through AC-10)

| AC ID | Acceptance Description | Implementing Backend & Frontend Code | Automated Test Method | Verification Status |
| :--- | :--- | :--- | :--- | :--- |
| **AC-01** | **User Authentication & JWT Tokens**<br>Admin, Lecturer, and Student log in via JSON credentials; receive valid JWT and role claims. | `backend/app/api/routes/auth.py`<br>`frontend/src/auth/AuthContext.tsx`<br>`frontend/src/api/client.ts:login` | `test_acceptance.py::test_ac01_authentication` | **PASSED** |
| **AC-02** | **Role-Based Authorization (RBAC)**<br>Endpoints enforce strict permissions; unauthenticated returns 401; unauthorized role returns 403. | `backend/app/core/security.py`<br>`backend/app/api/routes/admin.py` | `test_acceptance.py::test_ac02_authorization` | **PASSED** |
| **AC-03** | **Course Creation & Isolation**<br>Admin creates courses; Lecturers only manage assigned courses; Students only view enrolled. | `backend/app/api/routes/courses.py`<br>`frontend/src/pages/CoursesPage.tsx`<br>`frontend/src/pages/CourseDetailPage.tsx` | `test_acceptance.py::test_ac03_course_isolation` | **PASSED** |
| **AC-04** | **Enrollment Management & Uniqueness**<br>Admin enrolls students into courses; duplicate active enrollments rejected. | `backend/app/api/routes/courses.py:enroll_student`<br>`database/01_schema.sql:UQ_Enrollments_Course_Student` | `test_acceptance.py::test_ac04_enrollment_uniqueness` | **PASSED** |
| **AC-05** | **Module & Lesson Visibility**<br>Students only see published lessons; draft content hidden from enrolled students. | `backend/app/api/routes/modules.py`<br>`frontend/src/pages/CourseDetailPage.tsx` | `test_acceptance.py::test_ac05_published_content` | **PASSED** |
| **AC-06** | **Assignment Submission & Deadlines**<br>Submissions permitted to PUBLISHED/ACTIVE assignments; rejected if late without `allowLate`. | `backend/app/api/routes/assignments.py:submit_assignment`<br>`frontend/src/pages/AssignmentsPage.tsx` | `test_acceptance.py::test_ac06_assignment_deadline` | **PASSED** |
| **AC-07** | **Grading & Gradebook Sync**<br>Lecturer grades submission; student must be enrolled; grade automatically synchronizes to Gradebook. | `backend/app/api/routes/assignments.py:grade_submission`<br>`backend/app/api/routes/grades.py` | `test_acceptance.py::test_ac07_grading_sync` | **PASSED** |
| **AC-08** | **Quiz Attempt Limit Enforcement**<br>Students cannot start attempt if `maxAttempts` reached; late attempts marked `EXPIRED`. | `backend/app/api/routes/quizzes.py:start_quiz_attempt`<br>`backend/app/api/routes/quizzes.py:submit_quiz_attempt` | `test_acceptance.py::test_ac08_quiz_max_attempts` | **PASSED** |
| **AC-09** | **Quiz Secret Protection**<br>Students cannot see `correctAnswer` in quiz question endpoints prior to or during an attempt. | `backend/app/api/routes/quizzes.py:get_quiz_detail`<br>`backend/app/schemas/schemas.py:QuizQuestionStudentResponse` | `test_acceptance.py::test_ac09_quiz_secret_protection` | **PASSED** |
| **AC-10** | **Notification Isolation & Ownership**<br>Users can only view and mark as read notifications specifically addressed to them. | `backend/app/api/routes/notifications.py`<br>`frontend/src/pages/NotificationsPage.tsx` | `test_acceptance.py::test_ac10_notification_ownership` | **PASSED** |

---

## 2. Business Rules & Invariants Traceability (BR-01 to BR-08)

| Rule ID | Business Rule Specification | Enforcement Mechanism |
| :--- | :--- | :--- |
| **BR-01** | Student self-enrollment is prohibited; enrollment is exclusively administrative. | Removed `StudentSelfEnroll` CTA from `CourseDetailPage.tsx`; `POST /api/courses/{id}/enrollments` requires `ADMIN`. |
| **BR-02** | User email must be unique and valid university domain format. | Enforced in `UserCreate` Pydantic schema and SQL Server unique constraint `UQ_Users_Email`. |
| **BR-03** | Course code must follow academic catalog format (e.g., CS101, SE301). | Verified via regex pattern in `CourseCreate` schema and `UQ_Courses_CourseCode`. |
| **BR-04** | Module sort orders must be strictly sequential per course. | Enforced in module retrieval queries with `order_by(Module.SortOrder.asc())`. |
| **BR-05** | Immutable submission once graded; no overwrite of graded submissions. | Checked in `assignments.py:submit_assignment`: raises 400 Bad Request if `existing_sub.Status == "GRADED"`. |
| **BR-06** | Quiz time limit strictly bounded between 1 and 300 minutes. | Enforced in schema constraint `CK_Quizzes_TimeLimit` and Pydantic validation `Field(..., ge=1, le=300)`. |
| **BR-07** | Manual grade creation requires confirmed active student enrollment. | Verified in `grades.py:create_manual_grade` via query to `Enrollment` table. |
| **BR-08** | Database health failure must return HTTP 503 instead of 200. | Implemented in `backend/app/main.py:health_check` with active `SELECT 1` execution. |
