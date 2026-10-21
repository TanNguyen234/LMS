# Release gate — forensic fix 2026-10-21

Evidence cut: 2026-10-21 10:43:45 UTC. Baseline SHA: `4fc2ead72d929ace0c3ed6ce85ae09dc4ac3fa6a`. Fix branch: `fix/lms-forensic-acceptance-20261021`, based on `821ddf21210f275b167b4345c176bc1ce525ffc3`. Verified source commit SHA: `34d19a7f3b8fc7ce66a3d452d973f5e8bff8d7cd`. Existing PR #1 is already merged at `3c722e0a46a7804b60232000d8115e492ef6978b`.

## Decision: PASS — local test acceptance scope

The code, API, SQL Server integration, real-browser user journeys and PM document reconciliation meet the forensic acceptance checks for the documented MVP. The result applies to the local disposable test environment; it makes no production deployment or external uptime claim.

## Acceptance evidence

| Gate | Result | Evidence |
|---|---|---|
| Fresh frontend install/build/lint | PASS; `npm ci` and build exit 0; lint exit 0 with 15 nonblocking warnings | `evidence/final_npm_ci.txt`, `evidence/live_frontend_build_final.txt`, `evidence/live_frontend_lint_final.txt` |
| SQL Server fresh bootstrap | PASS; new `UniversityLms_Test_Repeat_20261021_1027`; schema + seed + referential validation; 12 tables, 10 seed rows each; Alembic head `6f2d4db8312a` | `evidence/live_fresh_repeat_bootstrap.txt`, `evidence/live_alembic_repeat_stamp.txt` |
| SQL Server backend tests | PASS; all 44 tests pass in standard order and reversed module order, including on the repeat DB | `evidence/live_backend_pytest_final_44.txt`, `evidence/live_backend_pytest_reverse_order.txt`, `evidence/live_backend_pytest_fresh_repeat_final.txt` |
| Core security/lifecycle regressions | PASS; RBAC, expired token, assignment lifecycle, quiz expiry, concurrency and side-effect uniqueness covered | backend tests and `evidence/live_quiz_concurrency_test.txt`, `evidence/live_quiz_expiry_test.txt`, `evidence/live_expired_token_test.txt` |
| Live API | PASS; `/health` 200 with SQL connection; `/openapi.json` 200 and 51 operations | `evidence/live_http_health_openapi.txt` |
| Three-role Chrome E2E | PASS; 29 visible UI operations, 43 successful browser writes, 226 API 2xx responses, 10 SQL persistence checks; same quiz attempt UUID from Start through Submit; zero unexpected API or console failures | `evidence/crud-e2e/live_crud_e2e.log` and screenshots |
| PM source reconciliation | PASS; all 13 actual PM files linked, CPM recomputed, 1.2B VND budget/cash flow reconciled, simulated approvals/EVAs labeled; no fictitious file references | `04_PM_RECONCILIATION.md` and `docs/project-management/` |

## Exact commands and evidence timestamps

The source changes represented by this evidence are committed at `34d19a7f3b8fc7ce66a3d452d973f5e8bff8d7cd`; subsequent audit-only commits do not change tested source. The timestamps below are the UTC modification times of the captured command outputs. All dates are 2026-10-21. Commands ran in the local repository; no production DB or credentials are recorded.

| Command | CWD and environment | Evidence time (UTC) | Exit/result | Output |
|---|---|---:|---|---|
| `npm ci` | `frontend`; bundled Node/npm runtime | 00:53:44 | 0; 113 packages | `evidence/final_npm_ci.txt` |
| `npm run lint` | `frontend`; final frontend source | 10:22:17 | 0; 15 warnings | `evidence/live_frontend_lint_final.txt` |
| `npm run build` | `frontend`; final frontend source | 10:22:24 | 0 | `evidence/live_frontend_build_final.txt` |
| `backend\venv\Scripts\python.exe -m pytest backend/tests -q` | repo root; `LMS_E2E_TEST_DATABASE=UniversityLms_Test_20261021_0124` | 10:13:58 | 0; 44 passed | `evidence/live_backend_pytest_final_44.txt` |
| `backend\venv\Scripts\python.exe -m pytest -q backend/tests/test_recon2_challenger.py backend/tests/test_forensic_contracts.py backend/tests/test_challenger_recon.py backend/tests/test_acceptance.py` | repo root; E2E test DB above | 10:29:31 | 0; 44 passed | `evidence/live_backend_pytest_reverse_order.txt` |
| Same reversed-order pytest command | repo root; `LMS_E2E_TEST_DATABASE=UniversityLms_Test_Repeat_20261021_1027` | 10:33:51 | 0; 44 passed | `evidence/live_backend_pytest_fresh_repeat_final.txt` |
| Run `database/01_schema.sql`, `database/02_seed.sql`, then `database/04_seed_validation.sql` | SSMS; newly created repeat test DB | 10:31:21 | PASS; 12 tables, 10 seed rows each, referential checks pass | `evidence/live_fresh_repeat_bootstrap.txt` |
| `backend\venv\Scripts\python.exe -m alembic -c backend/alembic.ini stamp head` | repo root; repeat test DB | 10:31:34 | 0; head `6f2d4db8312a` | `evidence/live_alembic_repeat_stamp.txt` |
| `database/04_seed_validation.sql` | SSMS; repeat DB after full suite | 10:34:10 | PASS; 12 tables and referential checks | `evidence/live_seed_validation_repeat_final.txt` |
| `GET /health` and `GET /openapi.json` | local API `127.0.0.1:8001`; E2E test DB | 10:03:46 | 200; connected; 51 operations | `evidence/live_http_health_openapi.txt` |
| `backend\venv\Scripts\python.exe -m py_compile scripts\run_live_crud_e2e.py backend\app\api\routes\users.py backend\app\schemas\schemas.py backend\tests\test_acceptance.py backend\tests\test_challenger_recon.py backend\tests\test_recon2_challenger.py` | repo root; Python 3.12 | 10:42:46 | 0 | `evidence/live_py_compile_final.txt` |
| `backend\venv\Scripts\python.exe scripts\run_live_crud_e2e.py` | repo root; visible Chrome CDP 9333, Vite 5174, API 8001, E2E test DB | 10:43:45 | 0; 29 operations, 43 writes, 226 API 2xx, 10 SQL checks | `evidence/crud-e2e/live_crud_e2e.log` and `live_crud_e2e_verified.stdout.log` |
| `git diff --check` | repo root; final working diff | 10:48:20 | 0; no whitespace errors (Git reports only configured LF-to-CRLF notices) | `evidence/live_diff_check.txt` |

The final E2E harness now records `Runtime.consoleAPICalled` errors without persisting argument values, avoids duplicate Log console events, times out CDP commands and fails pending commands if the listener exits. It passed again after these changes. CRG tools were unavailable; no graph-backed review is claimed. The earlier independent review identified an overbroad expected-401 whitelist; it has been narrowed to exact `GET /api/auth/me` 401 responses and the final E2E passes with response/log counts matched.

## Findings and bounded limitations

- Baseline confirmed **4 P0, 8 P1, 1 P2**. No P0/P1 remains confirmed open within the documented MVP and tested flows.
- The product uses reversible lifecycle actions for “delete”: user deactivation, course archive, enrollment drop, content unpublish and assignment close. It has no physical-delete API for users, courses, modules, lessons, assignments, quizzes or questions; no hard-delete capability is claimed as tested.
- File upload is explicitly outside the MVP; submission is text-only and no UI claims a file was uploaded.
- The coursework UAT/sign-off scenarios and EVM actuals remain planning/simulation artifacts. The browser run is technical acceptance evidence, not a real stakeholder approval.
- No production-mode deployment, external uptime observation or performance/scale test was executed.
- Lint has 15 nonblocking style/hooks warnings. Backend emits 15 dependency/deprecation warnings. Both commands exit successfully.
- A prior test DB named `UniversityLms_Test_Bootstrap_20261021_1014` was found without schema during a later independent probe despite an earlier successful bootstrap log. It was not used as final verification or deleted. A newly created repeat DB then passed the full bootstrap, stamp, suite and validation workflow; related failure/output is retained in `03_TEST_MATRIX.md`.

## Finalization

The user explicitly authorized commit, push and merge to `main`. This gate records local SQL Server and browser acceptance; repository integration is recorded in the final task report and its associated pull request. The local API, frontend and Chrome test session remain open for direct inspection. No test database is dropped.
