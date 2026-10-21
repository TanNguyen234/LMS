# Release gate — forensic fix 2026-10-21

Evidence cut: 2026-10-21 00:52 UTC. Working tree was dirty on the fix branch; final source changes were included in these checks.

The follow-up below records later direct-browser findings and supersedes the earlier “no live HTTP/browser request” statements for those specific read-only checks. It does not supersede the remaining integration/write-E2E blockers.

## Decision: BLOCKED

The source and documentation corrections are on branch fix/lms-forensic-acceptance-20261021 at source commit b1f5cd3e31be90a8a9f780a2455d517dc7236654. Draft PR [#1](https://github.com/TanNguyen234/LMS/pull/1) is open for review. No merge or deployment occurred. The release gate cannot pass because no disposable SQL Server database or browser/API staging journey was available.

## Evidence attached to this branch

- Baseline SHA and origin/main: 4fc2ead72d929ace0c3ed6ce85ae09dc4ac3fa6a.
- Frontend npm ci: exit 0, 113 packages.
- Frontend build: exit 0.
- Frontend lint: exit 0 with 17 warnings.
- Pure regression tests: 14 passed, exit 0.
- Full pytest collection: 40 collected, exit 0.
- Full pytest: 14 passed, 6 skipped, 20 setup errors, exit 1. Existing integration fixtures refused to run against UniversityLms. No integration body ran on the guarded final run.
- Python compile: exit 0.
- Local FastAPI app.openapi() inventory: exit 0, 51 route operations. No live HTTP request.
- Exact logs: docs/audit/2026-10-21/evidence/.
- Independent source review found answer metadata aliases in student quiz options and inconsistent assignment detail timestamps. Both were fixed and covered by the 14 passing pure tests; this does not replace SQL/API verification.
- The follow-up source review found no remaining actionable issue in those two fixes. See evidence/independent_review.md.

## Blocking conditions

1. The local backend configuration points at UniversityLms. A command to create a fresh UniversityLms_Test_<id> database was rejected by command policy. No database was created or modified.
2. Because no isolated DB exists, SQL schema/seed/validation, alembic stamp/upgrade, persistence/concurrency tests, HTTP /health and browser E2E are NOT RUN.
3. The E2E script requires an explicit test-database name, expects Admin/Lecturer/Student journeys and quiz start/submit, and will not kill existing Chrome processes. It was not run.
4. Full integration coverage remains unverified. Static fixes and passing pure contracts do not establish 0 remaining P0/P1 issues.

## Source-level triage

The baseline review confirmed 4 P0, 8 P1 and 1 P2 finding; implementation updates are listed in 01_FINDINGS_AND_TRIAGE.md. Current verified status is 14 pure regression tests passing, while database-dependent findings remain UNKNOWN pending SQL Server and browser evidence.

## Approval boundary

The incremental migration file is prepared but was not applied. Do not merge until the disposable SQL Server suite and required E2E pass or a human explicitly accepts the remaining release limitations.

## Follow-up direct-browser verification — 2026-10-21 01:08 UTC

- Source follow-up commit `2b8bbb7` fixes a live 500 in assignment reads. The actual dashboard response failed because `DueAt` arrived as a string; a focused regression test failed before the patch and the post-patch actual browser request returned HTTP 200.
- The active database was confirmed as local `UniversityLms`; no `UniversityLms_Test_*` database was present. Existing active accounts in all three roles logged in successfully. ADMIN users/dashboard, LECTURER assignments/quizzes/gradebook, and STUDENT dashboard/assignments/quizzes/grades were exercised through the actual UI. These were read-only after login; no quiz attempt or coursework mutation was created.
- Post-fix contract tests: 15 passed. Full suite: 15 passed, 6 skipped, 20 setup errors because the fixture guard rejects `UniversityLms`. Python compile and diff check passed. Detailed steps and sanitized observations are in `evidence/live_readonly_browser.md`.
- A fresh browser tab had zero console errors/warnings after the fix. Three errors in the original tab were from the pre-fix reproduction. The Chrome DevTools MCP could not open a tab because its configured profile was already running; the live UI was inspected in the in-app Chromium browser and statuses were read from Uvicorn access logs.
- No SQL integration case or write journey was executed. Assignment creation/submission, grading, quiz start/submit, and persistence/idempotency remain UNKNOWN. No schema, migration, seed, or existing coursework data was changed.

The gate remains **BLOCKED** until a disposable SQL Server database is available for the guarded integration suite and full write-E2E flow, or a human explicitly accepts those remaining release limitations. No merge has occurred.
