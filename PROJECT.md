# University LMS — Project Status

## System boundary

- Backend: FastAPI on Python 3.12, SQLAlchemy 2.x and pyodbc.
- Database: Microsoft SQL Server.
- Frontend: React 19, TypeScript, Vite, React Router 7, fetch-based API client.
- Roles: ADMIN, LECTURER and STUDENT; server-side dependencies enforce permissions.
- Assignment submission is text-only in this MVP. No upload endpoint or public uploads directory is part of the current UI contract.
- Student self-enrollment is outside scope.

## Status for the 2026-10-21 forensic fix

This branch addresses assignment status and submission contracts, timed quiz start/submit identity, question option and max-score contracts, user/course filters, role-gated controls, grading source labels, quiz grade consistency, SQL uniqueness, test database safety and public-file/path handling.

Implementation status does not equal release acceptance. SQL Server integration, seed validation and browser journeys require a separate disposable UniversityLms_Test_<id> database. The current release decision and exact evidence are maintained in [the dated release gate](docs/audit/2026-10-21/05_RELEASE_GATE.md).

## Feature inventory

| Area | Implementation state | Verification boundary |
|---|---|---|
| Authentication and JWT | Implemented; rejects the default demo signing key outside development/test | Pure contract checks; startup integration still requires database config |
| RBAC and course isolation | Implemented server-side | API integration tests not run without isolated SQL Server |
| Users and activation | Implemented; message response and active filter/pagination aligned | API integration not run |
| Courses and enrollment | Implemented; status/lecturer filters supported; UI actions role-gated | API integration not run |
| Modules and lessons | Implemented | API integration not run |
| Assignment and grading | Published/Draft/Closed status contract; text-only submission; UTC due date handling | API integration not run |
| Quiz and attempts | Start creates or resumes a timed attempt; submit requires that attempt ID; students receive safe question DTOs and server max score | API integration/E2E not run |
| Grades and notifications | Source titles and quiz grade tuple are aligned | API integration not run |
| SQL schema and Alembic | Canonical SQL bootstrap documented; incremental migration added for existing baseline schemas | No database migration executed |
| Frontend | TypeScript/Vite build and lint evidence are in the dated evidence report | Build/lint must be rerun after final source changes |
| PM coursework | Corrected filenames, schedule network, budget labels and simulated UAT/closure evidence | Academic figures remain planned/simulated, not measured |

## Authoritative reports

- [Baseline and environment](docs/audit/2026-10-21/00_BASELINE.md)
- [Findings and triage](docs/audit/2026-10-21/01_FINDINGS_AND_TRIAGE.md)
- [API contract matrix](docs/audit/2026-10-21/02_API_CONTRACT_MATRIX.md)
- [Test matrix](docs/audit/2026-10-21/03_TEST_MATRIX.md)
- [PM reconciliation](docs/audit/2026-10-21/04_PM_RECONCILIATION.md)
- [Release gate](docs/audit/2026-10-21/05_RELEASE_GATE.md)
- [Disposable database and demo runbook](docs/audit/2026-10-21/06_DEMO_RUNBOOK.md)

Do not use the prior audit status labels as evidence for this branch. No deployment, production acceptance or live uptime check is claimed.
