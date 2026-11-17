"""Read-only SQL Server & Alembic state probe invoked by START_SYSTEM.bat."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def main() -> int:
    srv = r"localhost\SQLEXPRESS"
    dbn = "UniversityLms"
    try:
        from sqlalchemy import create_engine, inspect, text
        from sqlalchemy.engine import make_url

        from backend.app.core.config import settings
        from backend.app.db.session import engine

        url = make_url(settings.DATABASE_URL)
        srv = f"{url.host},{url.port}" if url.host and url.port else (url.host or srv)
        dbn = url.database or dbn

        master_engine = create_engine(url.set(database="master"), use_setinputsizes=False)
        try:
            with master_engine.connect() as master_conn:
                db_exists = master_conn.execute(
                    text("SELECT DB_ID(:db_name)"),
                    {"db_name": dbn},
                ).scalar()
        finally:
            master_engine.dispose()

        if db_exists is None:
            print(f"NO_TABLES~{srv}~{dbn}")
            return 0

        insp = inspect(engine)
        tables = set(insp.get_table_names())
        if "Users" not in tables:
            print(f"NO_TABLES~{srv}~{dbn}")
            return 0

        with engine.connect() as conn:
            ver = (
                conn.execute(text("SELECT COUNT(*) FROM alembic_version")).scalar()
                if "alembic_version" in tables
                else 0
            )

        if ver == 0:
            if "CourseSessions" in tables and "AcademicSemesters" in tables:
                state = "STAMP_HEAD"
            elif "Meetings" in tables:
                state = "STAMP_20261113"
            else:
                state = "STAMP_BASELINE"
        else:
            state = "READY"

        print(f"{state}~{srv}~{dbn}")
        return 0
    except Exception:
        print(f"ERROR~{srv}~{dbn}")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
