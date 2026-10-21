# Test matrix — 2026-10-21 forensic branch

All commands below were actually executed on this working tree. CWD and evidence are recorded per row. Full SQL integration and write-enabled browser journeys remain blocked; read-only role journeys are recorded below.

| Command | CWD / environment | Exit | Result | Evidence |
|---|---|---:|---|---|
| npm ci | frontend; Node/npm workspace runtime | 0 | 113 packages installed | evidence/final_npm_ci.txt |
| npm run build | frontend; after npm ci and final source edits | 0 | TypeScript check and Vite build passed | evidence/final_frontend_build.txt |
| npm run lint | frontend; after npm ci and final source edits | 0 | exit 0 with 17 warnings; warnings are not suppressed | evidence/final_frontend_lint.txt |
| backend/venv/Scripts/python.exe -m pytest backend/tests/test_forensic_contracts.py -q | repo root; local backend venv; pure contracts, no DB calls | 0 | 15 passed, 15 dependency/deprecation warnings | follow-up result in evidence/live_readonly_browser.md |
| backend/venv/Scripts/python.exe -m pytest --collect-only -q backend/tests | repo root; local backend venv | 0 | 41 collected: 26 pre-existing + 15 pure contract tests | follow-up result in evidence/live_readonly_browser.md |
| backend/venv/Scripts/python.exe -m pytest backend/tests -q | repo root; local backend venv; database fixture guard enabled | 1 | 15 passed, 6 skipped (direct-client module guard), 20 errors at shared integration fixture because configured DB is not UniversityLms_Test_<id>. No integration test body ran; this is a safety block, not a product assertion failure. | follow-up result in evidence/live_readonly_browser.md |
| backend/venv/Scripts/python.exe -m py_compile backend/app/api/routes/assignments.py backend/tests/test_forensic_contracts.py | repo root; backend venv | 0 | changed route and regression test parse | follow-up result in evidence/live_readonly_browser.md |
| Live browser role journeys | frontend `http://127.0.0.1:5173`, backend `http://127.0.0.1:8000`, `backend/.env` target; in-app Chromium UI and Uvicorn access logs | n/a | Actual ADMIN, LECTURER, STUDENT sign-ins and read-only pages loaded. Reproduced assignment GET 500 before fix; same endpoint returned 200 after fix. No create, submit, grade, quiz start, migration, or other DB write was made. | evidence/live_readonly_browser.md |
| backend/venv/Scripts/python.exe -c "from backend.app.main import app; ..." | repo root; builds local app.openapi(), no server or DB | 0 | 51 method/path operations enumerated | evidence/openapi_paths.txt |
| git diff --check | repo root; follow-up evidence changes | 0 | no whitespace errors in the follow-up diff | evidence/live_readonly_browser.md |

## Baseline evidence

At the original snapshot, frontend build passed, lint exited 0 with 16 warnings and the 26 existing backend test functions were collected but not run. See evidence/baseline_frontend.txt and 00_BASELINE.md.

## Not run / blocked

- All SQL Server integration cases were not run against a disposable database. The suite guard refused the configured UniversityLms database; the creation command for UniversityLms_Test_<id> was rejected by command policy.
- SQL schema creation, seed import, seed validation, Alembic migration/stamp, persistence checks and concurrency tests: NOT RUN.
- Dedicated HTTP /health and /openapi.json probes: NOT RUN. The app was exercised through real browser API requests; the 51-operation inventory was generated locally from app.openapi().
- Full mutating browser E2E: NOT RUN. The real-browser pass was limited to sign-in and GET-only role journeys because no disposable DB is available. Quiz Start→Submit, assignment submission, grading, and create/update actions remain UNKNOWN. `scripts/run_devtools_e2e.py` requires `LMS_E2E_TEST_DATABASE=UniversityLms_Test_<id>` and was not run.
- Chrome DevTools MCP could not open a page because its configured Chrome profile was already running. Browser interactions and DOM console logs were captured with the in-app Chromium browser; HTTP statuses came from the live Uvicorn access log. This is not recorded as a Chrome DevTools Network-panel run.
- No claim of 0 open P0/P1 defects is based on integration evidence. Static implementation is present; end-to-end state remains unverified.
