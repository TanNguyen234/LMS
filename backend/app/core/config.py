import hmac
import json
from pathlib import Path
from typing import Annotated, List, Optional, Sequence
from urllib.parse import parse_qsl, quote_plus, urlencode

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

DEFAULT_DEMO_JWT_SECRET = "university-lms-super-secret-jwt-key-2026-pm-academic"
KNOWN_PLACEHOLDER_JWT_SECRETS = {
    DEFAULT_DEMO_JWT_SECRET,
    "change-this-dev-secret-at-least-32-chars",
    "change-me",
}
PREFERRED_ODBC_DRIVERS: tuple[str, ...] = (
    "ODBC Driver 18 for SQL Server",
    "ODBC Driver 17 for SQL Server",
    "SQL Server",
    "SQL Server Native Client RDA 11.0",
)
_BACKEND_DIR = Path(__file__).resolve().parents[2]


def _get_installed_odbc_drivers() -> List[str]:
    try:
        import pyodbc

        return list(pyodbc.drivers())
    except Exception:
        return []


def resolve_database_url(
    database_url: str,
    available_drivers: Optional[Sequence[str]] = None,
) -> str:
    """Ensure SQL Server pyodbc URLs select an installed Windows ODBC driver."""
    if not database_url or not database_url.lower().startswith("mssql+pyodbc://"):
        return database_url
    if "?" not in database_url:
        return database_url

    drivers = list(available_drivers) if available_drivers is not None else _get_installed_odbc_drivers()
    if not drivers:
        return database_url

    base_url, query = database_url.split("?", 1)
    pairs = parse_qsl(query, keep_blank_values=True)
    driver_index = next((idx for idx, (key, _) in enumerate(pairs) if key.lower() == "driver"), None)
    configured_driver = pairs[driver_index][1].strip() if driver_index is not None else ""

    installed_by_lower = {name.lower(): name for name in drivers}
    if configured_driver and configured_driver.lower() in installed_by_lower:
        return database_url

    fallback_driver = next(
        (installed_by_lower[candidate.lower()] for candidate in PREFERRED_ODBC_DRIVERS if candidate.lower() in installed_by_lower),
        None,
    )
    if not fallback_driver:
        return database_url

    if driver_index is not None:
        key = pairs[driver_index][0]
        pairs[driver_index] = (key, fallback_driver)
    else:
        pairs.append(("driver", fallback_driver))

    return f"{base_url}?{urlencode(pairs, quote_via=quote_plus)}"


def validate_jwt_secret(app_env: str, jwt_secret: str) -> None:
    env = (app_env or "").strip().lower()
    if env in {"development", "test"}:
        return

    secret = (jwt_secret or "").strip()
    if len(secret) < 32 or any(hmac.compare_digest(secret, placeholder) for placeholder in KNOWN_PLACEHOLDER_JWT_SECRETS):
        raise RuntimeError(
            "JWT_SECRET must be configured with a non-demo value of at least 32 characters outside development and test environments"
        )


class Settings(BaseSettings):
    APP_NAME: str = "University LMS API"
    APP_ENV: str = "development"
    DEBUG: bool = True
    API_V1_STR: str = "/api"

    # Database
    DATABASE_URL: str = (
        "mssql+pyodbc://localhost\\SQLEXPRESS/UniversityLms?"
        "driver=SQL+Server&trusted_connection=yes&TrustServerCertificate=yes"
    )

    # JWT
    JWT_SECRET: str = DEFAULT_DEMO_JWT_SECRET
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120

    # CORS
    CORS_ORIGINS: Annotated[List[str], NoDecode] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # AI Tutor / Grading Assistant (optional; empty triggers local extractive fallback)
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # Local File Vault
    FILE_MAX_SIZE_MB: int = 25
    FILE_VAULT_DIR: str = "backend/storage/vault"

    @field_validator("APP_ENV", mode="before")
    @classmethod
    def normalize_app_env(cls, value: str) -> str:
        env = str(value or "development").strip().lower()
        if env not in {"development", "production", "test"}:
            raise ValueError("APP_ENV must be one of: development, production, test")
        return env

    @field_validator("DATABASE_URL", mode="after")
    @classmethod
    def apply_available_odbc_driver(cls, value: str) -> str:
        return resolve_database_url(value)

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> List[str]:
        if isinstance(value, str):
            raw = value.strip()
            if not raw:
                return []
            if raw.startswith("["):
                parsed = json.loads(raw)
                return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]
        return []

    model_config = SettingsConfigDict(
        env_file=(str(_BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
