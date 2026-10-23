# LMS change assessment — 2026-10-23

Branch: `feat/student-workload-and-dashboard-20261023` (target: `main`).
Context: course final project in Software Project Management. This is a bounded, read-only student workflow improvement, **not** an enterprise LMS expansion.

## Observed main-branch gaps (source inspection)

| Finding | Baseline evidence | Impact | Change |
|---|---|---|---|
| Misleading dashboard indicators | `DashboardPage.tsx`: fallback GPA `8.80`, static `100% Hoạt động bình thường`, hard-coded `Fall 2026` | Demo appears realistic while values may not be measured | Removed; replaced with real role-based counters, explicit limited notification counts |
| Unrepresentative deadlines | Dashboard loaded assignments only for `coursesData[0]`, first three records | Other active courses omitted; not necessarily urgent | Dedicated student workload endpoint aggregates every active enrolled course and sorts by deadline |
| No cross-course actionable schedule | Navigation, routes and screens had no student workload view | Students must open each course individually | Student-only `/study-plan`, search, course/status filters and state labels |
| Poor task navigation | Assignments and quizzes always selected the first course on entry | Links from an aggregate calendar cannot land in the correct course | Accept `?course=<UUID>` only if it matches courses returned for the authenticated role |
| Inconsistent student metrics | `dashboard.py` used all active enrollment IDs even when `Course.Status=ARCHIVED` | Archived course tasks could contribute to counters | Reuse the list of visible, ACTIVE courses in metric queries |
| Repeated per-item requests | Student assignment page checks submission state per assignment | More requests as workload grows | New planner endpoint uses one SQL left join for student-scoped submissions, one query for attempts |

## Changed components

- `backend/app/api/routes/workload.py`: `GET /api/dashboard/student/workload`. RBAC `STUDENT`, only active enrolled courses, published/closed assignments and published quizzes. No questions, answer keys, file payloads or other students' attempts. UTC timestamps are explicit.
- `backend/app/main.py`: registers the new router.
- `backend/app/api/routes/dashboard.py`: fixes archived-course counting.
- `frontend/src/pages/StudyPlannerPage.tsx`: deadline queue, search, course filters, honest state labels, retry and accessible controls.
- `frontend/src/pages/DashboardPage.tsx`: redesigned role-aware homepage, genuine information only, student priority queue.
- Frontend API client/types, sidebar, routes and course-aware entry links.
- Scope and UI specification synced, including an explicit text-only submission boundary.
- `backend/tests/test_workload.py`: UTC format, response safety, student role enforcement, and active-course access assertions.

## Product boundaries and design decisions

- No migrations, no seeded fake dates, no new authentication roles or storage technology.
- Planner reports observed submissions and attempted quiz count, not fabricated grades, progress percentages or GPA. A quiz attempt is considered used even if expired; the quiz backend makes the final eligibility decision.
- The planner is a **read-only overview**. Submission, deadline validation, authorization and quiz rules remain enforced by the existing backend at action time.
- Only active courses are listed. An empty workload does not establish that a student's education is complete.
- No upload support is implied. Text-only assignment submission remains the MVP.

## Acceptance checklist — pending live execution

**Important: the earlier 2026-10-21 release-gate PASS applies to old source. No command below has been executed as evidence for this new branch in this assessment.** Re-run on a clean checkout before merge.

1. `cd frontend && npm ci && npm run build && npm run lint`.
2. Use a dedicated SQL Server `UniversityLms_Test_<id>` database; apply schema and seed exactly per `docs/audit/2026-10-21/06_DEMO_RUNBOOK.md`. Never run integration tests against a shared database.
3. `python -m pytest backend/tests/test_workload.py backend/tests/test_acceptance.py -q` and `python -m pytest backend/tests -q` with the test DB configured.
4. Test Admin and Lecturer tokens against `GET /api/dashboard/student/workload`: expect HTTP 403; Student gets only their active courses; never receives answer keys.
5. For Student, create two valid active enrollments with published assignments, submit one, then verify the student plan displays submitted/not-submitted states and sorts by due date. Check local timezone rendering and course links.
6. Archive one enrolled course; verify its assignments and quizzes disappear from workload and student dashboard metrics. Restore it for repeatable acceptance.
7. Test an overdue assignment with `AllowLate=False`, a late-enabled one, a not-yet-open quiz, an expired quiz and a quiz with no remaining attempts. Confirm backend action restrictions still apply.
8. Test both narrow and desktop widths; keyboard navigation; API failure/retry; logged-out and wrong-role route access.

## Follow-on opportunities (not implemented)

- Admin/lecturer overview: per-course activity trends and pending grading by course, requiring a new measured API contract.
- Course list: server-side pagination/search to meet `NFR-04` at larger data volumes.
- Accessibility audit and improved skeleton/loading states throughout the other legacy screens.
- If students request attachments later, implement a real storage/security contract with explicit change control rather than a filename-only field.

## Change-control interpretation

This enhancement supports FR-15 and newly documented FR-16. Technical completion is **source pushed**, not **UAT accepted**. PM baseline sign-off, cost variance and stakeholder approvals are unchanged and should not be represented as completed for this branch.
