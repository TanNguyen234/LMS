"""Run the local API only against an explicitly named disposable test database."""

import os

from sqlalchemy.engine import make_url

from backend.app.core.config import settings


database_name = os.environ.get("LMS_E2E_TEST_DATABASE", "")
if not database_name.casefold().startswith("universitylms_test_"):
    raise SystemExit("Set LMS_E2E_TEST_DATABASE to an approved UniversityLms_Test_<id> database.")

settings.DATABASE_URL = str(make_url(settings.DATABASE_URL).set(database=database_name))

from backend.app.db.session import engine  # noqa: E402

if engine.url.database != database_name:
    raise SystemExit("API database boundary mismatch; refusing to start.")

print(f"Serving local API against {database_name} on 127.0.0.1:8001.", flush=True)

import uvicorn  # noqa: E402

uvicorn.run("backend.app.main:app", host="127.0.0.1", port=8001, log_level="warning")
