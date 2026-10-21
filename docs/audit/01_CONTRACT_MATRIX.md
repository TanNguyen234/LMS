> **Historical audit snapshot:** this document describes an earlier repository state. Its PASS/RESOLVED claims are not evidence for the 2026-10-21 forensic-fix branch. Use the dated reports in `docs/audit/2026-10-21/` for current findings and verification.

# Audit Document 01: API Contract Reconciliation Matrix

This document provides a comprehensive mapping of all backend endpoints under `backend/app/api/routes/`, their canonical Pydantic request/response schemas, allowed roles, frontend consumption points in `frontend/src/api/client.ts`, and verification status.

---

## 1. Complete API Route & Contract Specification

| Method | Path | Allowed Roles | Request Body / Query Params | Response DTO / Structure | Frontend Consumer / Caller | Test & Verification Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | `LoginRequest` (`email`, `password`) | `TokenResponse` (`accessToken`, `tokenType`, `user`) | `api.login` / `AuthContext.tsx`, `LoginPage.tsx` | **VERIFIED (AC-01)** |
| `GET` | `/api/auth/me` | Authenticated | None | `UserResponse` (`userId`, `email`, `fullName`, `role`) | `api.getCurrentUser` / `AuthContext.tsx` | **VERIFIED (AC-01)** |
| `GET` | `/api/users` | `ADMIN` | `role` (opt), `search` (opt), `skip`, `limit` | `PaginatedResponse[UserResponse]` (`items`, `total`, `skip`, `limit`) | `api.getUsers` / `AdminUsersPage.tsx` | **VERIFIED (AC-02)** |
| `POST` | `/api/users` | `ADMIN` | `UserCreate` (`email`, `fullName`, `role`, `password`) | `UserResponse` | `api.createUser` / `AdminUsersPage.tsx` | **VERIFIED (AC-02)** |
| `GET` | `/api/courses` | Authenticated | `status` (opt), `search` (opt), `skip`, `limit` | `List[CourseResponse]` | `api.getCourses` / `CoursesPage.tsx`, `DashboardPage.tsx` | **VERIFIED (AC-03)** |
| `POST` | `/api/courses` | `ADMIN` | `CourseCreate` (`courseCode`, `title`, `description`, `credits`, `semester`, `department`, `lecturerId`) | `CourseResponse` | `api.createCourse` / `CoursesPage.tsx` | **VERIFIED (AC-03)** |
| `GET` | `/api/courses/{id}` | Authenticated (Access) | `course_id: UUID` | `CourseDetailResponse` | `api.getCourse` / `CourseDetailPage.tsx` | **VERIFIED (AC-03)** |
| `PUT` | `/api/courses/{id}` | `ADMIN`, Course Lecturer | `CourseUpdate` | `CourseResponse` | `api.updateCourse` / `CourseDetailPage.tsx` | **VERIFIED** |
| `GET` | `/api/courses/{id}/enrollments` | `ADMIN`, Course Lecturer | `course_id: UUID` | `List[EnrollmentResponse]` | `api.getCourseEnrollments` / `CourseDetailPage.tsx` | **VERIFIED (AC-04)** |
| `POST` | `/api/courses/{id}/enrollments` | `ADMIN` | `EnrollmentCreate` (`studentId`) | `EnrollmentResponse` | `api.enrollStudent` / `CourseDetailPage.tsx` | **VERIFIED (AC-04)** |
| `DELETE` | `/api/courses/{id}/enrollments/{enrollment_id}` | `ADMIN` | `course_id: UUID`, `enrollment_id: UUID` | `MessageResponse` | `api.removeEnrollment` / `CourseDetailPage.tsx` | **VERIFIED (AC-04)** |
| `GET` | `/api/courses/{id}/modules` | Authenticated (Access) | `course_id: UUID` | `List[ModuleResponse]` | `api.getCourseModules` / `CourseDetailPage.tsx` | **VERIFIED (AC-05)** |
| `POST` | `/api/courses/{id}/modules` | Course Lecturer, `ADMIN` | `ModuleCreate` (`title`, `description`, `sortOrder`) | `ModuleResponse` | `api.createModule` / `CourseDetailPage.tsx` | **VERIFIED** |
| `POST` | `/api/modules/{id}/lessons` | Course Lecturer, `ADMIN` | `LessonCreate` (`title`, `contentType`, `contentBody`, `sortOrder`, `isPublished`) | `LessonResponse` | `api.createLesson` / `CourseDetailPage.tsx` | **VERIFIED (AC-05)** |
| `GET` | `/api/courses/{id}/assignments` | Authenticated (Access) | `course_id: UUID` | `List[AssignmentResponse]` | `api.getCourseAssignments` / `AssignmentsPage.tsx` | **VERIFIED (AC-06)** |
| `POST` | `/api/courses/{id}/assignments` | Course Lecturer, `ADMIN` | `AssignmentCreate` (`title`, `dueAt`, `maxScore`, `allowLate`, `status`) | `AssignmentResponse` | `api.createAssignment` / `AssignmentsPage.tsx` | **VERIFIED (AC-06)** |
| `GET` | `/api/assignments/{id}` | Authenticated (Access) | `assignment_id: UUID` | `AssignmentResponse` | `api.getAssignment` / `AssignmentsPage.tsx` | **VERIFIED (AC-06)** |
| `PUT` | `/api/assignments/{id}/submission` | Enrolled `STUDENT` | `SubmissionCreate` (`contentText`, `fileUrl`) | `SubmissionResponse` | `api.submitAssignment` / `AssignmentsPage.tsx` | **VERIFIED (AC-06)** |
| `GET` | `/api/assignments/{id}/submissions` | Course Lecturer, `ADMIN` | `assignment_id: UUID` | `List[SubmissionResponse]` | `api.getAssignmentSubmissions` / `AssignmentsPage.tsx` | **VERIFIED** |
| `POST` | `/api/submissions/{id}/grade` | Course Lecturer, `ADMIN` | `GradeSubmissionRequest` (`score`, `feedback`) | `SubmissionResponse` | `api.gradeSubmission` / `AssignmentsPage.tsx` | **VERIFIED (AC-07)** |
| `GET` | `/api/courses/{id}/quizzes` | Authenticated (Access) | `course_id: UUID` | `List[QuizResponse]` | `api.getCourseQuizzes` / `QuizzesPage.tsx` | **VERIFIED (AC-08)** |
| `POST` | `/api/courses/{id}/quizzes` | Course Lecturer, `ADMIN` | `QuizCreate` (`title`, `startAt`, `endAt`, `timeLimitMinutes`, `maxAttempts`, `passingScore`) | `QuizResponse` | `api.createQuiz` / `QuizzesPage.tsx` | **VERIFIED** |
| `GET` | `/api/quizzes/{id}` | Authenticated (Access) | `quiz_id: UUID` | `QuizDetailResponse` (Stripped of `correctAnswer` for students) | `api.getQuiz` / `QuizzesPage.tsx` | **VERIFIED (AC-09)** |
| `POST` | `/api/quizzes/{id}/attempts` | Enrolled `STUDENT` | `quiz_id: UUID` | `QuizAttemptResponse` | `api.startQuizAttempt` / `QuizzesPage.tsx` | **VERIFIED (AC-08)** |
| `POST` | `/api/attempts/{id}/submit` | Enrolled `STUDENT` | `SubmitQuizAnswersRequest` (`answers`: key-value map) | `QuizAttemptResponse` (`score`, `isPassed`) | `api.submitQuizAttempt` / `QuizzesPage.tsx` | **VERIFIED (AC-08)** |
| `GET` | `/api/courses/{id}/gradebook` | Authenticated (Access) | `course_id: UUID` | `List[GradeResponse]` | `api.getCourseGradebook` / `GradesPage.tsx` | **VERIFIED (AC-07)** |
| `POST` | `/api/grades` | Course Lecturer, `ADMIN` | `ManualGradeCreate` (`courseId`, `studentId`, `sourceType`, `score`, `maxScore`, `weight`) | `GradeResponse` | `api.createManualGrade` / `GradesPage.tsx` | **VERIFIED (AC-07)** |
| `GET` | `/api/notifications` | Authenticated | `skip`, `limit` | `List[NotificationResponse]` | `api.getNotifications` / `NotificationsPage.tsx` | **VERIFIED (AC-10)** |
| `PUT` | `/api/notifications/{id}/read` | Owner Authenticated | `notification_id: UUID` | `NotificationResponse` | `api.markNotificationRead` / `NotificationsPage.tsx` | **VERIFIED (AC-10)** |
| `GET` | `/api/dashboard/admin` | `ADMIN` | None | `AdminDashboardStats` | `api.getAdminDashboard` / `DashboardPage.tsx` | **VERIFIED** |
| `GET` | `/api/dashboard/lecturer` | `LECTURER` | None | `LecturerDashboardStats` | `api.getLecturerDashboard` / `DashboardPage.tsx` | **VERIFIED** |
| `GET` | `/api/dashboard/student` | `STUDENT` | None | `StudentDashboardStats` | `api.getStudentDashboard` / `DashboardPage.tsx` | **VERIFIED** |
| `GET` | `/health` | Public | None | `HealthResponse` (`status`, `database`, `timestamp`) | Load Balancers / Monitoring | **VERIFIED (503 on DB down)** |

---

## 2. Before vs After Contract Reconciliation Proof

| Action / Workflow | Pre-Audit Broken Contract (Before) | Reconciled Canonical Contract (After) | Status |
| :--- | :--- | :--- | :--- |
| **Authentication** | Sent `multipart/form-data` with `username` to `/api/auth/login`, causing HTTP 422 Unprocessable Entity. | Sends clean JSON `{ email: "...", password: "..." }` conforming to `LoginRequest`. | **RESOLVED** |
| **User Listing** | Frontend expected bare array `User[]`; backend returned `{ items: [...], total, skip, limit }`, causing runtime crash `users.map is not a function`. | Frontend unwraps `res.items ?? res` handling both `PaginatedResponse` and arrays. | **RESOLVED** |
| **Course Detail & ID** | Frontend sent numeric IDs or mixed casing (`id` vs `course_id`); course models lacked field normalization. | Normalized to UUID string `courseId` with bidirectional JSON mapping. | **RESOLVED** |
| **Enrollment Deletion** | Frontend attempted `DELETE /api/courses/{id}/enrollments/{student_id}`; backend expected `enrollment_id`. | Frontend passes actual `enrollmentId: UUID` to backend route. | **RESOLVED** |
| **Assignment Submission** | Frontend sent `POST /api/assignments/{id}/submissions`; backend route was defined as `PUT /api/assignments/{id}/submission`. | Frontend calls `PUT /api/assignments/{id}/submission` with `SubmissionCreate` payload. | **RESOLVED** |
| **Assignment Lifecycle** | Backend only permitted status `ACTIVE`, rejecting valid database `PUBLISHED` assignments with 400 Bad Request. | Backend allows `PUBLISHED` and `ACTIVE`, strictly blocking `DRAFT` and `CLOSED`. | **RESOLVED** |
| **Quiz Secret Leak** | Student could view quiz details with answer keys prior to attempting. | Backend filters out `CorrectAnswer` on all student reads, revealing only upon completion if configured. | **RESOLVED** |
| **Scope Creep (Self-Enroll)** | UI had `StudentSelfEnroll` button violating University Academic Policy where only Admins enroll students. | Out-of-scope self-enrollment button removed entirely from `CourseDetailPage.tsx`. | **RESOLVED** |
