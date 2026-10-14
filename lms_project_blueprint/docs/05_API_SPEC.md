# 05 — REST API Specification

Base URL: `/api`

## 1. Auth

| Method | Endpoint | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | Public | Login |
| GET | `/auth/me` | Authenticated | Current profile |

Login request:

```json
{
  "email": "student1@university.edu.vn",
  "password": "Demo@123"
}
```

## 2. Users

| Method | Endpoint | Role |
|---|---|---|
| GET | `/users?page=1&pageSize=20&search=` | Admin |
| GET | `/users/{id}` | Admin |
| POST | `/users` | Admin |
| PUT | `/users/{id}` | Admin |
| PATCH | `/users/{id}/status` | Admin |

## 3. Courses & enrollment

| Method | Endpoint | Role |
|---|---|---|
| GET | `/courses` | Authenticated; filtered by role |
| GET | `/courses/{id}` | Authorized resource access |
| POST | `/courses` | Admin |
| PUT | `/courses/{id}` | Admin |
| PATCH | `/courses/{id}/status` | Admin |
| GET | `/courses/{id}/enrollments` | Admin / own Lecturer |
| POST | `/courses/{id}/enrollments` | Admin |
| DELETE | `/courses/{id}/enrollments/{studentId}` | Admin |

## 4. Modules & lessons

| Method | Endpoint | Role |
|---|---|---|
| GET | `/courses/{courseId}/modules` | Authorized |
| POST | `/courses/{courseId}/modules` | Own Lecturer |
| PUT | `/modules/{id}` | Own Lecturer |
| PATCH | `/modules/{id}/publish` | Own Lecturer |
| POST | `/modules/{moduleId}/lessons` | Own Lecturer |
| PUT | `/lessons/{id}` | Own Lecturer |
| PATCH | `/lessons/{id}/publish` | Own Lecturer |
| GET | `/lessons/{id}` | Authorized |

## 5. Assignments & submissions

| Method | Endpoint | Role |
|---|---|---|
| GET | `/courses/{courseId}/assignments` | Authorized |
| POST | `/courses/{courseId}/assignments` | Own Lecturer |
| PUT | `/assignments/{id}` | Own Lecturer |
| GET | `/assignments/{id}` | Authorized |
| PUT | `/assignments/{id}/submission` | Enrolled Student |
| GET | `/assignments/{id}/my-submission` | Enrolled Student |
| GET | `/assignments/{id}/submissions` | Own Lecturer |
| PUT | `/submissions/{id}/grade` | Own Lecturer |

## 6. Quizzes

| Method | Endpoint | Role |
|---|---|---|
| GET | `/courses/{courseId}/quizzes` | Authorized |
| POST | `/courses/{courseId}/quizzes` | Own Lecturer |
| PUT | `/quizzes/{id}` | Own Lecturer |
| PATCH | `/quizzes/{id}/publish` | Own Lecturer |
| GET | `/quizzes/{id}` | Authorized; student DTO không chứa CorrectAnswer |
| POST | `/quizzes/{id}/questions` | Own Lecturer |
| PUT | `/questions/{id}` | Own Lecturer |
| POST | `/quizzes/{id}/attempts/start` | Enrolled Student |
| POST | `/quiz-attempts/{attemptId}/submit` | Attempt owner |
| GET | `/quizzes/{id}/attempts` | Own Lecturer |

## 7. Grades

| Method | Endpoint | Role |
|---|---|---|
| GET | `/courses/{courseId}/gradebook` | Own Lecturer |
| GET | `/courses/{courseId}/my-grades` | Enrolled Student |
| POST | `/courses/{courseId}/grades/manual` | Own Lecturer |

## 8. Notifications

| Method | Endpoint | Role |
|---|---|---|
| GET | `/notifications` | Authenticated |
| PATCH | `/notifications/{id}/read` | Owner |
| PATCH | `/notifications/read-all` | Authenticated |

## 9. Dashboard

| Method | Endpoint | Role |
|---|---|---|
| GET | `/dashboard/admin` | Admin |
| GET | `/dashboard/lecturer` | Lecturer |
| GET | `/dashboard/student` | Student |

## 10. Response conventions

Success list:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "total": 0
}
```

Error nên dùng RFC ProblemDetails hoặc structure tương đương:

```json
{
  "title": "Validation failed",
  "status": 400,
  "errors": {
    "dueAt": ["Due date must be in the future"]
  }
}
```
