import hmac
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_DEMO_JWT_SECRET = "university-lms-super-secret-jwt-key-2026-pm-academic"


def validate_jwt_secret(app_env: str, jwt_secret: str) -> None:
    if app_env.strip().lower() not in {"development", "test"} and hmac.compare_digest(
        jwt_secret, DEFAULT_DEMO_JWT_SECRET
    ):
        raise RuntimeError("JWT_SECRET must be configured with a non-demo value outside development and test environments")


class Settings(BaseSettings):
    APP_NAME: str = "University LMS API"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api"

    # Database
    # Using SQL Server driver installed on the system (e.g., 'SQL Server' or 'ODBC Driver 18 for SQL Server')
    DATABASE_URL: str = (
        "mssql+pyodbc://localhost\\SQLEXPRESS/UniversityLms?"
        "driver=SQL+Server&trusted_connection=yes&TrustServerCertificate=yes"
    )

    # JWT
    JWT_SECRET: str = DEFAULT_DEMO_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
