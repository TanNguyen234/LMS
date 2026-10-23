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

Correctness fixes support existing FR-15. The former FR-16–FR-19 enhancements are **proposals recorded in the unapproved CR**, not accepted baseline requirements. Technical completion is **source pushed**, not **UAT accepted**. PM baseline sign-off, cost variance and stakeholder approvals are unchanged and should not be represented as completed for this branch.


## Second-stage functional depth — analytics and lecturer workbench

A subsequent change on the same branch adds:
- `GET /api/analytics/teaching` (LECTURER): authorized active courses; grouped student, published lesson, published quiz, assignment and grading counts; oldest 60 pending submissions and total count across lecturer's courses.
- `GET /api/analytics/learning` (STUDENT): only recorded grade items from student's active courses, with per-course and global **unweighted observed** mean on a ten-point scale. Missing grades return null, not a fabricated 0/GPA.
- `GET /api/analytics/operations` (ADMIN): real user role distribution, active account count, course lifecycle, current enrollment, published content and grading backlog.
- `/insights` (three-role frontend): course overview charts, lecturer grade queue with on-demand retrieval of the full authorized submission and inline save via existing endpoint, student course result charts, admin activity snapshot.
- `frontend/src/api/client.ts`: corrected `gradeSubmission` response normalization to an actual Submission, matching backend; old method falsely modeled a Grade.
- `/grades?course=<UUID>`: deep links select only a course already in the user's authorized course list. The empty gradebook no longer invents an academic classification.
- Quiz workload state: distinguish an in-progress attempt from a submitted or exhausted one. Expired/exhausted attempts no longer automatically imply completion.
- PM change request `docs/project-management/14_CHANGE_REQUEST_2026-10-23.md`, FR-16–FR-19 candidate requirements tracked in a pending Change Request, not the approved baseline.

### Added verification source

`backend/tests/test_analytics.py` includes endpoint role enforcement, lecturer course/queue scoping, student's observed grade contracts and internal consistency of admin counts. These tests have **not been run against a live SQL Server in this session**.

### Risks and remaining acceptance gates

1. The analytics snapshot queries are bounded and suitable for demo-sized data. No production throughput benchmark, server-side pagination of all analytics records, caching, or scale claim.
2. Queue shows up to 60 oldest pending records. The total pending value explicitly denotes the entire scoped set; searching filters the visible 60 only. This is not a complete historical export.
3. Marking a grade requires the existing backend to accept score/feedback and commit the Submission, Grade and Notification atomically; confirm with the local SQL Server E2E before release.
4. The UI now has multiple role-conditioned panels, so a clean `tsc` / Vite build and real-browser checks are required. Static source inspection alone does not make the PR merge-ready.
5. If using the previous dated acceptance suite, keep its evidence separated: it proves the earlier baseline, **not** these new analytics features.


## PM scope correction — 23/10/2026

The coursework topic is **Quản lý dự án xây dựng hệ thống quản lý học tập trực tuyến (LMS) cho trường đại học**. Development is supporting evidence; PM baselines take priority. The original FR-01–FR-15 remain the governing requirement set; `docs/01_SCOPE_AND_REQUIREMENTS.md` was restored accordingly. The new analytics/study-planner code is still in Draft PR #3 as an experimental scope-extension candidate. [See the PM scope review](2026-10-23_PM_SCOPE_REVIEW.md) and [pending change request](../project-management/14_CHANGE_REQUEST_2026-10-23.md). No unapproved scope, schedule, budget or UAT result may be treated as baseline.
