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
from backend.app.api.routes.upload import router as upload_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    validate_jwt_secret(settings.APP_ENV, settings.JWT_SECRET)

    # Initialize demo passwords if in development
    db = SessionLocal()
    try:
        init_development_passwords(db)
    finally:
        db.close()
    
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
app.include_router(upload_router, prefix=api_prefix)



# Static directories for materials, assignments, submissions
frontend_public = (Path(__file__).resolve().parents[2] / "frontend" / "public").resolve()
materials_dir = frontend_public / "materials"
assignments_dir = frontend_public / "assignments"
submissions_dir = frontend_public / "submissions"

if materials_dir.exists():
    app.mount("/materials", StaticFiles(directory=str(materials_dir)), name="materials")
if assignments_dir.exists():
    app.mount("/assignments", StaticFiles(directory=str(assignments_dir)), name="assignments")
if submissions_dir.exists():
    app.mount("/submissions", StaticFiles(directory=str(submissions_dir)), name="submissions")

# Serve Built React Frontend (SPA fallback)
frontend_dist = (Path(__file__).resolve().parents[2] / "frontend" / "dist").resolve()


def resolve_spa_file(root: Path, requested_path: str) -> Path | None:
    try:
        resolved_root = root.resolve()
        candidate = (resolved_root / requested_path).resolve()
        candidate.relative_to(resolved_root)
    except (OSError, RuntimeError, ValueError):
        return None
    return candidate if candidate.is_file() else None


if frontend_dist.exists():
    assets_dir = frontend_dist / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if (
            full_path.startswith("api/")
            or full_path == "api"
            or full_path.startswith("docs")
            or full_path.startswith("openapi.json")
            or full_path == "health"
        ):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        
        file_path = resolve_spa_file(frontend_dist, full_path)
        if file_path:
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
