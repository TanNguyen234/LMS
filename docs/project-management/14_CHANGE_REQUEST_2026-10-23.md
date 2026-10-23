# CR-2026-10-23 — LMS Analytics and Teaching Workbench

**Project:** University Learning Management System (Software Project Management coursework)  
**Change status:** Implemented on feature branch; independent integration/UAT approval **pending**  
**Implementation branch:** `feat/student-workload-and-dashboard-20261023`  
**Production deployment:** Not requested / not tested

## Problem and business case

The base LMS allows basic course, lesson, assignment, quiz and grade CRUD. However, users lack cross-course prioritization. Lecturer grading takes several navigation steps; students have no honest cumulative perspective across their courses; admins cannot observe operational workload from one view. Static figures in the old dashboard were also misleading.

## Proposed change / delivered branch scope

| Role | Deliverable | Data contract |
|---|---|---|
| Lecturer | Teaching workspace, per-class publishing/submission metrics and direct grade action for pending submissions | `GET /api/analytics/teaching`; existing authorized submissions endpoint; existing `PUT /api/submissions/{id}/grade` |
| Student | Read-only workload timeline, quiz attempt state, per-course unweighted observed averages and recent grade history | `GET /api/dashboard/student/workload`; `GET /api/analytics/learning` |
| Admin | Account role/lifecycle and course/assessment workload charts | `GET /api/analytics/operations` |
| All | Clear error, empty, loading and retry states; contextual course navigation | React/Vite views, backend RBAC |

## Explicit exclusions

File uploads, AI tutoring, attendance prediction, chat, payment, remote proctoring, official GPA, stakeholder sign-offs, production uptime claims and scope/technology migrations remain excluded. These could require a separate change request.

## Impact assessment

- **Architecture:** FastAPI + SQL Server + React/Vite; new query routes, no tables or migrations.
- **Security:** each analytics endpoint has server-side role requirements; lecturer only assigned active courses, student only own data from active enrolled courses.
- **Operations:** analytics queries compute on request without persisted caches. Suitable for coursework-sized data; production scale would require aggregation benchmarking, paging, and performance review.
- **Quality:** new integration tests assert roles, course isolation and internal counting consistency, but are not claimed as executed on this branch.
- **Budget / timeline:** no actual expense evidence, revised PM baseline or sponsor approval is inferred from code changes. Review the existing WBS/CPM if formally accepting this change.

## Acceptance criteria (not yet signed off)

1. On SQL Server `UniversityLms_Test_*`, run schema + seeds, full pytest and role-isolation tests; archived courses never appear in active analytics.
2. Lecturer with at least two assigned courses sees both class summaries and a consolidated queue. Lecturer B receives no Lecturer A queue. Admin and Student receive 403 for the teaching endpoint.
3. Open an actual pending submission, verify the full content matches database, enter valid score and feedback; verify `Submissions`, `Grades` and `Notifications` persist appropriately; reload without duplicate grade.
4. Validate out-of-range score is blocked by API, and re-grading stale entries reports a clear response.
5. Student sees only own grade records; items with no valid score remain ungraded with no invented average/GPA.
6. Admin numbers reconcile against SQL queries; a course archive or user deactivation changes the correct metrics on reload.
7. Fresh `npm ci`, `npm run build`, `npm run lint`, backend tests and Chrome three-role workflows pass; screenshots and logs archived under a dated evidence directory.
8. Product owner/lecturer explicitly reviews scope and usability before PR merge.

## Decision log

2026-10-23: Feature source pushed and linked through Draft PR #3. Build, SQL Server integration, end-to-end browser testing, review approval and merge are not evidenced by this change note. No production-readiness claim.
