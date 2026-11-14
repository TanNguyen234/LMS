import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.app.core.config import settings, validate_jwt_secret
from backend.app.db.session import engine, SessionLocal
from backend.app.db.init_db import init_development_passwords
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.users import router as users_router
from backend.app.api.routes.courses import router as courses_router
from backend.app.api.routes.content import router as content_router
from backend.app.api.routes.assignments import router as assignments_router
from backend.app.api.routes.quizzes import router as quizzes_router
from backend.app.api.routes.grades import router as grades_router
from backend.app.api.routes.notifications import router as notifications_router
from backend.app.api.routes.dashboard import router as dashboard_router
from backend.app.api.routes.meetings import router as meetings_router
from backend.app.api.routes.messages import router as messages_router
from backend.app.api.routes.files import router as files_router
from backend.app.api.routes.ws import router as ws_router
from backend.app.api.routes.progress import router as progress_router
from backend.app.api.routes.ai import router as ai_router


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_jwt_secret(settings.APP_ENV, settings.JWT_SECRET)

    # Initialize demo passwords if in development; tolerate transient DB unavailability at startup
    db = None
    try:
        db = SessionLocal()
        init_development_passwords(db)
    except Exception as exc:
        logger.warning("Skipping development password warmup during startup: %s", exc)
    finally:
        if db is not None:
            try:
                db.close()
            except Exception as exc:
                logger.warning("Failed closing startup warmup DB session: %s", exc)

    yield


app = FastAPI(
    title="University LMS API",
    description="Backend API for University Learning Management System (Software Project Management)",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    openapi_url="/openapi.json",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint confirming API status and database connectivity."""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    payload = {
        "status": "ok" if db_ok else "error",
        "status_detail": "healthy" if db_ok else "unhealthy",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database_connected": db_ok
    }
    if not db_ok:
        return JSONResponse(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, content=payload)
    return payload


# Include routers under /api
api_prefix = settings.API_V1_STR
app.include_router(auth_router, prefix=api_prefix)
app.include_router(users_router, prefix=api_prefix)
app.include_router(courses_router, prefix=api_prefix)
app.include_router(content_router, prefix=api_prefix)
app.include_router(assignments_router, prefix=api_prefix)
app.include_router(quizzes_router, prefix=api_prefix)
app.include_router(grades_router, prefix=api_prefix)
app.include_router(notifications_router, prefix=api_prefix)
app.include_router(dashboard_router, prefix=api_prefix)
app.include_router(meetings_router, prefix=api_prefix)
app.include_router(messages_router, prefix=api_prefix)
app.include_router(files_router, prefix=api_prefix)
app.include_router(ws_router, prefix=api_prefix)
app.include_router(progress_router, prefix=api_prefix)
app.include_router(ai_router, prefix=api_prefix)


# Serve Built React Frontend (SPA fallback)
frontend_dist = (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()

NON_SPA_PREFIXES = ("api/", "uploads/", "assets/", "docs")
NON_SPA_EXACT = ("api", "uploads", "assets", "openapi.json", "health")
NON_SPA_ASSET_EXTENSIONS = {
    ".pdf",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".js",
    ".css",
    ".ico",
    ".map",
    ".woff2",
    ".json",
}


def resolve_spa_file(root: Path, requested_path: str) -> Path | None:
    try:
        resolved_root = root.resolve()
        candidate = (resolved_root / requested_path).resolve()
        candidate.relative_to(resolved_root)
    except (OSError, RuntimeError, ValueError):
        return None
    return candidate if candidate.is_file() else None


def is_reserved_non_spa_path(requested_path: str) -> bool:
    normalized = requested_path.lstrip("/").lower()
    if normalized in NON_SPA_EXACT:
        return True
    if any(normalized.startswith(prefix) for prefix in NON_SPA_PREFIXES):
        return True
    return False


def has_non_spa_asset_extension(requested_path: str) -> bool:
    normalized = requested_path.lstrip("/")
    if not normalized:
        return False
    return Path(normalized).suffix.lower() in NON_SPA_ASSET_EXTENSIONS


def build_spa_response(dist_root: Path, full_path: str):
    if is_reserved_non_spa_path(full_path):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    file_path = resolve_spa_file(dist_root, full_path)
    if file_path is not None:
        return FileResponse(file_path)

    if has_non_spa_asset_extension(full_path):
        return JSONResponse(status_code=404, content={"detail": "Not found"})

    index_file = resolve_spa_file(dist_root, "index.html")
    if index_file is None:
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    return FileResponse(index_file)


def register_spa_routes(target_app: FastAPI, dist_root: Path) -> None:
    if not dist_root.exists():
        return
    assets_dir = dist_root / "assets"
    if assets_dir.exists():
        target_app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @target_app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        return build_spa_response(dist_root, full_path)


register_spa_routes(app, frontend_dist)
