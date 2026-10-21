# API contract matrix — forensic source snapshot

The endpoint list was generated from the app OpenAPI schema and checked against Pydantic schemas and `frontend/src/api/client.ts`. A live `GET /openapi.json` on the SQL Server-backed API returned HTTP 200 with 51 operations; `GET /health` returned HTTP 200 and `database_connected=true`. Exact method/path inventory: [evidence/openapi_paths.txt](evidence/openapi_paths.txt), live probe: [evidence/live_http_health_openapi.txt](evidence/live_http_health_openapi.txt).

Role shorthand: Public = no token; User = active authenticated account; Admin = ADMIN; Owner = Admin or the lecturer assigned to the course; Enrolled Student = STUDENT with ACTIVE enrollment. UUIDs stay strings on the client.

| Area / methods | Route and wire contract | Server authorization | Frontend consumer / status |
|---|---|---|---|
| Health | GET /health → status, environment and database_connected | Public | Live HTTP 200; SQL Server connected. |
| Auth | POST /api/auth/login {email,password} → access_token, token_type, user; GET /api/auth/me → UserResponse | login public; /me active User | All three real seeded roles log in and reload; expired token receives 401, clears session and redirects. |
| Users | GET /api/users?role&page&pageSize&isActive → paginated items/total; POST /api/users {email,fullName,role,password}; GET /api/users/{id}; PUT /api/users/{id}; PATCH /api/users/{id}/status {isActive} → MessageResponse | Admin for user administration | Admin browser create/edit/deactivate/reactivate; SQL persistence and backend filter/RBAC tests pass. |
| Courses | GET /api/courses?status&lecturerId → CourseResponse[]; POST /api/courses → CourseResponse; GET/PUT /api/courses/{courseId}; PATCH /status {status} → MessageResponse | list/detail User with role visibility; writes Admin | Admin browser create/edit/archive/reactivate; student/lecturer visibility and role tests pass. |
| Enrollments | GET /api/courses/{courseId}/enrollments; POST same {studentId}; DELETE /api/courses/{courseId}/enrollments/{studentId} | list Admin or course Lecturer; writes Admin | Admin browser add/drop/re-enroll; DELETE is a reversible `DROPPED` transition, not physical row deletion. |
| Modules | GET/POST /api/courses/{courseId}/modules; PUT /api/modules/{moduleId}; PATCH /publish {isPublished} | course access for list; Owner for writes | Lecturer browser create/edit/publish/unpublish; Student visibility checked. No hard-delete route. |
| Lessons | POST /api/modules/{moduleId}/lessons; GET/PUT /api/lessons/{lessonId}; PATCH /publish {isPublished} | Owner writes; students read published lessons in an accessible course | Lecturer browser create/edit/publish/unpublish; Student reads actual published lesson. No hard-delete route. |
| Assignments | GET/POST /api/courses/{courseId}/assignments; GET/PUT /api/assignments/{assignmentId}; PUT /api/assignments/{assignmentId}/submission {contentText}; GET /my-submission; GET /submissions; PUT /api/submissions/{submissionId}/grade {score,feedback} | list/detail course access; Owner manages/grades; enrolled Student submits/reads own | Lecturer browser create/edit/close/reopen; Student submits real text; Lecturer grades; Student gradebook reloads. Uploads are out of scope. |
| Quizzes | GET/POST /api/courses/{courseId}/quizzes; GET/PUT /api/quizzes/{quizId}; PATCH /publish {isPublished}; POST /questions; PUT /api/questions/{questionId}; GET /attempts | list/detail User with course access; Owner writes and lists attempts | Lecturer browser create/edit/publish/unpublish/question update; Admin/Lecturer preview; Student-only attempts. No hard-delete route. |
| Quiz attempts | POST /api/quizzes/{quizId}/attempts/start → attemptId, attemptNo, startedAt, timeLimitMinutes, maxScore, safe questions; POST /api/quiz-attempts/{attemptId}/submit {answers} → QuizAttemptResponse | Enrolled Student; start enforces published/time window/max attempts; submit requires own in-progress attempt | Live E2E asserts same attempt UUID at start/submit, correct max score, no answer leak; SQL Server race/expiry tests pass. |
| Grades | GET /api/courses/{courseId}/gradebook; GET /api/courses/{courseId}/my-grades; POST /manual {studentId,itemTitle,score,maxScore,weightPercent,feedback} | Owner gradebook/manual; enrolled Student own grades | Lecturer grades via UI; Student sees score, feedback and course gradebook after reload; SQL rows verified. |
| Notifications | GET /api/notifications; PATCH /{notificationId}/read; PATCH /read-all | active User; only own notifications | Backend ownership tests pass; quiz grade notification persisted once under concurrent submit. |
| Dashboards | GET /api/dashboard/admin, /lecturer, /student | matching role | All role pages load in integration/browser flows; backend dashboard contract tests pass. |

## Contract decisions

- Assignment statuses are DRAFT, PUBLISHED and CLOSED; the UI creates PUBLISHED because no publish step exists. Student list excludes DRAFT; CLOSED cannot accept submission.
- Submission body contains text only. A filename/fileUrl is not accepted as a file upload.
- QuizQuestion supports SINGLE_CHOICE and TRUE_FALSE only. Question score must be positive. A correct answer must match a real option key, or true/false.
- Quiz maxScore is sum of server-side question scores. passingScore is a threshold, not a denominator.
- Quiz attempt start returns questions without CorrectAnswer. The submit path includes the original attempt UUID.
- Course status filters accept DRAFT, ACTIVE, ARCHIVED; PUBLISHED is not a course state.
- OpenAPI exposes 51 method/path operations. Contract, role and SQL integration tests pass on disposable DBs; the real-browser E2E verifies the listed Admin/Lecturer/Student journeys. The E2E does not claim to physically delete resources; it checks the product’s reversible lifecycle actions.
