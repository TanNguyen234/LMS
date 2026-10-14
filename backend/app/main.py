import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from backend.app.core.config import settings
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure upload directory exists
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    
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

# Uploads directory static serving
if not os.path.exists(settings.UPLOAD_DIR):
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/storage/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")


# Health check
@app.get("/health", tags=["System"])
def health_check():
    """Health check endpoint confirming API status and database connectivity."""
    db_ok = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception as e:
        db_ok = False

    return {
        "status": "healthy" if db_ok else "unhealthy",
        "app": settings.APP_NAME,
        "environment": settings.APP_ENV,
        "database_connected": db_ok
    }


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


# Serve Built React Frontend (SPA fallback)
frontend_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist"))
if os.path.exists(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        if (
            full_path.startswith("api/")
            or full_path == "api"
            or full_path.startswith("docs")
            or full_path.startswith("openapi.json")
            or full_path == "health"
            or full_path.startswith("storage/")
        ):
            return JSONResponse(status_code=404, content={"detail": "Not found"})
        
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(frontend_dist, "index.html"))
