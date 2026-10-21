# API contract matrix — forensic source snapshot

The endpoint list was generated with backend/venv/Scripts/python.exe -c "from backend.app.main import app; print app.openapi paths". This imports FastAPI and builds app.openapi() locally; it is not a request to a running API and does not prove server/database behavior. Exact method/path inventory: [evidence/openapi_paths.txt](evidence/openapi_paths.txt). Request and response fields are checked against Pydantic schemas and frontend/src/api/client.ts.

Role shorthand: Public = no token; User = active authenticated account; Admin = ADMIN; Owner = Admin or the lecturer assigned to the course; Enrolled Student = STUDENT with ACTIVE enrollment. UUIDs stay strings on the client.

| Area / methods | Route and wire contract | Server authorization | Frontend consumer / status |
|---|---|---|---|
| Health | GET /health → status, environment and database_connected | Public | deployment/runbook probe; HTTP behavior NOT RUN |
| Auth | POST /api/auth/login {email,password} → access_token, token_type, user; GET /api/auth/me → UserResponse | login public; /me active User | api.login, api.getMe; no live HTTP run |
| Users | GET /api/users?role&page&pageSize&isActive → paginated items/total; POST /api/users {email,fullName,role,password}; GET /api/users/{id}; PUT /api/users/{id}; PATCH /api/users/{id}/status {isActive} → MessageResponse | Admin for user administration | api.getUsers, createUser, toggleUserStatus; integration NOT RUN |
| Courses | GET /api/courses?status&lecturerId → CourseResponse[]; POST /api/courses → CourseResponse; GET/PUT /api/courses/{courseId}; PATCH /status {status} → MessageResponse | list/detail User with role visibility; writes Admin | api.getCourses/getCourse/createCourse/updateCourse; create button Admin-only |
| Enrollments | GET /api/courses/{courseId}/enrollments; POST same {studentId}; DELETE /api/courses/{courseId}/enrollments/{studentId} | list Admin or course Lecturer; writes Admin | api.getCourseEnrollments/enrollStudent; UI enrollment write Admin-only. No PATCH status route |
| Modules | GET/POST /api/courses/{courseId}/modules; PUT /api/modules/{moduleId}; PATCH /publish {isPublished} | course access for list; Owner for writes | api.getCourseModules/createModule; route helpers exist for update/publish |
| Lessons | POST /api/modules/{moduleId}/lessons; GET/PUT /api/lessons/{lessonId}; PATCH /publish {isPublished} | Owner writes; students read published lessons in an accessible course | api.createLesson/getLesson/updateLesson; UI uses create/read |
| Assignments | GET/POST /api/courses/{courseId}/assignments; GET/PUT /api/assignments/{assignmentId}; PUT /api/assignments/{assignmentId}/submission {contentText}; GET /my-submission; GET /submissions; PUT /api/submissions/{submissionId}/grade {score,feedback} | list/detail course access; Owner manages/grades; enrolled Student submits/reads own | api.getCourseAssignments/createAssignment, submitAssignment, getAssignmentSubmissions, gradeSubmission; UI text-only |
| Quizzes | GET/POST /api/courses/{courseId}/quizzes; GET/PUT /api/quizzes/{quizId}; PATCH /publish {isPublished}; POST /questions; PUT /api/questions/{questionId}; GET /attempts | list/detail User with course access; Owner writes and lists attempts | api.getCourseQuizzes/getQuiz/createQuiz/addQuizQuestion; Admin/Lecturer see Preview |
| Quiz attempts | POST /api/quizzes/{quizId}/attempts/start → attemptId, attemptNo, startedAt, timeLimitMinutes, maxScore, safe questions; POST /api/quiz-attempts/{attemptId}/submit {answers} → QuizAttemptResponse | Enrolled Student; start enforces published/time window/max attempts; submit requires own in-progress attempt | api.startQuizAttempt/submitQuiz; Student only; submit no longer starts a new attempt |
| Grades | GET /api/courses/{courseId}/gradebook; GET /api/courses/{courseId}/my-grades; POST /manual {studentId,itemTitle,score,maxScore,weightPercent,feedback} | Owner gradebook/manual; enrolled Student own grades | api.getCourseGradebook/getMyGrades/createManualGrade |
| Notifications | GET /api/notifications; PATCH /{notificationId}/read; PATCH /read-all | active User; only own notifications | api.getNotifications/markNotificationRead/markAllNotificationsRead |
| Dashboards | GET /api/dashboard/admin, /lecturer, /student | matching role | api.getDashboardStats selects role route |

## Contract decisions

- Assignment statuses are DRAFT, PUBLISHED and CLOSED; the UI creates PUBLISHED because no publish step exists. Student list excludes DRAFT; CLOSED cannot accept submission.
- Submission body contains text only. A filename/fileUrl is not accepted as a file upload.
- QuizQuestion supports SINGLE_CHOICE and TRUE_FALSE only. Question score must be positive. A correct answer must match a real option key, or true/false.
- Quiz maxScore is sum of server-side question scores. passingScore is a threshold, not a denominator.
- Quiz attempt start returns questions without CorrectAnswer. The submit path includes the original attempt UUID.
- Course status filters accept DRAFT, ACTIVE, ARCHIVED; PUBLISHED is not a course state.
- OpenAPI contract snapshot has 51 method/path operations. HTTP responses, auth enforcement and SQL persistence remain unverified until the disposable test stack is available.
