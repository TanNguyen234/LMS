import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    JWT_SECRET: str = "university-lms-super-secret-jwt-key-2026-pm-academic"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # Storage
    UPLOAD_DIR: str = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "storage", "uploads")
    MAX_UPLOAD_SIZE_MB: int = 10

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
