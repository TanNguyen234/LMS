# Test matrix — 2026-10-21 forensic branch

All commands below were actually executed on this working tree. CWD and evidence are recorded per row. Full SQL integration and browser journeys remain blocked.

| Command | CWD / environment | Exit | Result | Evidence |
|---|---|---:|---|---|
| npm ci | frontend; Node/npm workspace runtime | 0 | 113 packages installed | evidence/final_npm_ci.txt |
| npm run build | frontend; after npm ci and final source edits | 0 | TypeScript check and Vite build passed | evidence/final_frontend_build.txt |
| npm run lint | frontend; after npm ci and final source edits | 0 | exit 0 with 17 warnings; warnings are not suppressed | evidence/final_frontend_lint.txt |
| backend/venv/Scripts/python.exe -m pytest backend/tests/test_forensic_contracts.py -q | repo root; local backend venv; pure contracts, no DB calls | 0 | 14 passed, 15 dependency/deprecation warnings | evidence/final_unit_tests.txt |
| backend/venv/Scripts/python.exe -m pytest --collect-only -q backend/tests | repo root; local backend venv | 0 | 40 collected: 26 pre-existing + 14 new pure contract tests | evidence/pytest_collection.txt |
| backend/venv/Scripts/python.exe -m pytest backend/tests -q | repo root; local backend venv; database fixture guard enabled | 1 | 14 passed, 6 skipped (direct-client module guard), 20 errors at shared integration fixture because configured DB is not UniversityLms_Test_<id>. No integration test body ran; this is a safety block, not a product assertion failure. | evidence/full_pytest.txt |
| backend/venv/Scripts/python.exe -m py_compile ... | repo root; backend venv | 0 | changed Python modules, migration and tests parse | evidence/py_compile.txt |
| backend/venv/Scripts/python.exe -c "from backend.app.main import app; ..." | repo root; builds local app.openapi(), no server or DB | 0 | 51 method/path operations enumerated | evidence/openapi_paths.txt |
| git diff --check + untracked artifact hygiene scan | repo root; after final source/docs edits | 0 | no whitespace, conflict-marker or extra-EOF-blank issues in tracked diff or 21 untracked text/source files | evidence/artifact_hygiene.txt |

## Baseline evidence

At the original snapshot, frontend build passed, lint exited 0 with 16 warnings and the 26 existing backend test functions were collected but not run. See evidence/baseline_frontend.txt and 00_BASELINE.md.

## Not run / blocked

- All 26 pre-existing SQL Server integration cases were not run against a disposable database. The suite guard refused the configured UniversityLms database; the creation command for UniversityLms_Test_<id> was rejected by command policy.
- SQL schema creation, seed import, seed validation, Alembic migration/stamp, persistence checks and concurrency tests: NOT RUN.
- Live FastAPI /health and HTTP /openapi.json: NOT RUN. The recorded 51-operation inventory was generated locally from app.openapi().
- Browser E2E: NOT RUN. No test database/API session was available. The script now requires LMS_E2E_TEST_DATABASE=UniversityLms_Test_<id>, asserts the quiz Start→Submit attempt identity and API statuses, and does not kill or close Chrome processes.
- No claim of 0 open P0/P1 defects is based on integration evidence. Static implementation is present; end-to-end state remains unverified.
