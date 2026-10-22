# Test matrix — 2026-10-21 forensic acceptance

All commands listed below were executed from the stated working directory. Database URLs, passwords and tokens are omitted. Logs contain no credentials. The default application database `UniversityLms` was not used for test writes.

## Final passing checks

| Command / action | CWD and target | Exit/result | Evidence |
|---|---|---:|---|
| `npm ci` | `frontend`; Node/npm workspace runtime | 0; 113 packages installed | [evidence/final_npm_ci.txt](evidence/final_npm_ci.txt) |
| `npm run build` | `frontend`; final AuthContext change | 0; TypeScript and Vite build passed | [evidence/live_frontend_build_final.txt](evidence/live_frontend_build_final.txt) |
| `npm run lint` | `frontend`; final source | 0; 15 nonblocking warnings | [evidence/live_frontend_lint_final.txt](evidence/live_frontend_lint_final.txt) |
| `backend/venv/Scripts/python.exe -m pytest backend/tests -q` | repo root; SQL Server DB `UniversityLms_Test_20261021_0124` | 0; 44 passed, 15 warnings | [evidence/live_backend_pytest_final_44.txt](evidence/live_backend_pytest_final_44.txt) |
| `python -m pytest -q backend/tests/test_recon2_challenger.py backend/tests/test_forensic_contracts.py backend/tests/test_challenger_recon.py backend/tests/test_acceptance.py` | repo root; SQL Server DB `UniversityLms_Test_20261021_0124`; modules reversed | 0; 44 passed, 15 warnings | [evidence/live_backend_pytest_reverse_order.txt](evidence/live_backend_pytest_reverse_order.txt) |
| Same reversed full-suite command | repo root; separately bootstrapped `UniversityLms_Test_Repeat_20261021_1027` | 0; 44 passed, 15 warnings | [evidence/live_backend_pytest_fresh_repeat_final.txt](evidence/live_backend_pytest_fresh_repeat_final.txt) |
| `python -m pytest ...::test_challenger_concurrent_quiz_start_and_submit_have_single_effects -q` | repo root; disposable SQL Server test DB | 0; 1 passed; 5 concurrent starts share one attempt and only one submit persists | [evidence/live_quiz_concurrency_test.txt](evidence/live_quiz_concurrency_test.txt) |
| Quiz expiration integration case | repo root; disposable SQL Server test DB | 0; expired window rejected; active attempt becomes `EXPIRED`, without Grade/Notification | [evidence/live_quiz_expiry_test.txt](evidence/live_quiz_expiry_test.txt) |
| Expired JWT adversarial test | repo root; disposable SQL Server test DB | 0; expired signed token rejected | [evidence/live_expired_token_test.txt](evidence/live_expired_token_test.txt) |
| `backend/venv/Scripts/python.exe -m py_compile` for changed Python modules and E2E script | repo root; Python 3.12 | 0 | [evidence/live_py_compile_final.txt](evidence/live_py_compile_final.txt) |
| `database/01_schema.sql` + `database/02_seed.sql` + `database/04_seed_validation.sql` | new DB `UniversityLms_Test_Repeat_20261021_1027` | pass; 12 domain tables, 10 seed rows each, referential checks pass | [evidence/live_fresh_repeat_bootstrap.txt](evidence/live_fresh_repeat_bootstrap.txt) |
| `backend/venv/Scripts/python.exe -m alembic -c backend/alembic.ini stamp head` | `UniversityLms_Test_Repeat_20261021_1027` | 0; revision `6f2d4db8312a` | [evidence/live_alembic_repeat_stamp.txt](evidence/live_alembic_repeat_stamp.txt) |
| `database/04_seed_validation.sql` after final SQL suite/E2E | E2E DB and repeat DB | pass; all 12 business tables >=10 rows, referential checks pass | [evidence/live_seed_validation_final.txt](evidence/live_seed_validation_final.txt), [evidence/live_seed_validation_repeat_final.txt](evidence/live_seed_validation_repeat_final.txt) |
| `GET /health`; `GET /openapi.json` | API `127.0.0.1:8001`, SQL Server-backed | 200; DB connected; OpenAPI exposes 51 operations | [evidence/live_http_health_openapi.txt](evidence/live_http_health_openapi.txt) |
| Live Chrome DevTools run `python scripts/run_live_crud_e2e.py` | visible Chrome at CDP 9333; Vite `127.0.0.1:5174`; API `127.0.0.1:8001`; DB `UniversityLms_Test_20261021_0124` | 0; 29 operations, 43 successful writes, 226 2xx API responses, 10 SQL persistence checks, 0 unexpected console errors | [evidence/crud-e2e/live_crud_e2e.log](evidence/crud-e2e/live_crud_e2e.log) and [stdout](evidence/crud-e2e/live_crud_e2e_verified.stdout.log) |
| Screenshot inspection | actual DOM main content in the same browser run | lesson content visible; quiz result shows `2.5 / 2.5`; question edit visible | [evidence/crud-e2e/student_published_lesson.png](evidence/crud-e2e/student_published_lesson.png), [student_quiz_result.png](evidence/crud-e2e/student_quiz_result.png), [lecturer_quiz_question_edit.png](evidence/crud-e2e/lecturer_quiz_question_edit.png) |

## Browser evidence by role

- **ADMIN:** login/reload/logout, user create/edit/deactivate/reactivate; course create/edit/archive/reactivate; enrollment add/drop/re-enroll. Browser writes returned 2xx and SQL rows were checked.
- **LECTURER:** login/reload/logout; module and lesson create/edit/publish/unpublish; assignment create/edit/close/reopen; quiz/question create/edit/publish/unpublish; view student submission, grade it, and view attempts.
- **STUDENT:** login/reload/logout; view course and published lesson; confirm closed assignment cannot be submitted; submit text assignment; start and submit timed quiz with same attempt UUID; see score/feedback/gradebook; expired token receives 401, clears local session and redirects to login.
- Two DevTools “Failed to load resource” entries are expected, and only expected, for GET `/api/auth/me` returning 401 in the expired-token test. The script matches each log against an actual API response. Any other non-2xx response, console exception or console error fails the run.
- Delete semantics tested are reversible lifecycle actions: deactivate, archive, drop, unpublish and close. Physical deletion of users/courses/modules/lessons/assignments/quizzes/questions is not an implemented API feature. File attachments are out of scope; the UI and API are text-only.

## Failed probes retained as evidence

The earlier files `evidence/independent_review.md` and `evidence/live_readonly_browser.md` record the initial pre-bootstrap state and say the write journeys were NOT RUN. They are historical baseline evidence, superseded by the successful full SQL Server suite and Chrome run recorded above; do not read their initial status as the final result.

Three retained failure/test outputs contained transient demo-password or JWT text from test diagnostics. Those credential strings have been redacted, and trailing whitespace in captured terminal output has been normalized, while preserving test outcomes and surrounding output; no password or token is included in the committed evidence.

- An initial reversed-order run against the older Bootstrap database returned 5 failures and 23 setup errors because the named database had no `Users` table at the time it was queried. A separately bootstrapped repeat DB was created and all schema/seed/validation/stamp steps were re-run there; the final clean repeat suite passed. The old Bootstrap DB was not used as final evidence and was not deleted.
- The first reversed-order full suite on the new repeat DB exposed an order dependency: the module-level TestClient tests depended on another module initializing sentinel passwords. It also exposed a boundary-sensitive expiry test that backdated exactly two minutes despite a one-minute limit plus grace. The test fixture now initializes seeded test passwords itself, and the expiry case uses a five-minute margin. Focused tests and the final reversed 44-test suite pass. See [evidence/live_backend_pytest_fresh_repeat.txt](evidence/live_backend_pytest_fresh_repeat.txt), [evidence/live_order_independence_focused.txt](evidence/live_order_independence_focused.txt), and [evidence/live_backend_pytest_fresh_repeat_final.txt](evidence/live_backend_pytest_fresh_repeat_final.txt).
- The initial E2E classified the two intentional expired-token resource 401s as console errors. The harness now whitelists only exact `/api/auth/me` 401 resource entries and checks their count against the actual responses. A transient CDP page-target handshake also led to bounded retry logic. The final browser run passed; diagnostics remain in `evidence/crud-e2e/`.
- The Chrome DevTools MCP service could not attach because its configured profile was already running. The live E2E used the dedicated Chrome CDP endpoint on port 9333 and inspected actual DOM, network responses, console events and SQL persistence. No mocked browser or API responses were used.

## Not run / limitations

- No production deployment, external uptime probe, paid service, or real stakeholder UAT approval was performed. PM approval marks and cost/EVM scenarios remain explicitly simulated planning artifacts.
- No hard-delete flow or file-upload flow exists in the MVP, so neither is claimed as tested.
- The test DBs are retained; no database was dropped or reset. API/frontend/Chrome sessions remain available for direct inspection.
