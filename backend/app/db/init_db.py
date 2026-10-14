import logging
from sqlalchemy.orm import Session
from backend.app.core.config import settings
from backend.app.core.security import get_password_hash
from backend.app.models.models import User

logger = logging.getLogger(__name__)


def init_development_passwords(db: Session) -> int:
    """
    Translates sentinel '__SET_ON_FIRST_RUN__' password hashes to real bcrypt hash of 'Demo@123'.
    Only permitted in development environment.
    """
    if settings.APP_ENV != "development":
        logger.info("Skipping sentinel password initialization (not in development environment).")
        return 0

    sentinel_users = db.query(User).filter(User.PasswordHash == "__SET_ON_FIRST_RUN__").all()
    if not sentinel_users:
        logger.info("No sentinel passwords found to initialize.")
        return 0

    demo_hash = get_password_hash("Demo@123")
    count = 0
    for u in sentinel_users:
        u.PasswordHash = demo_hash
        count += 1

    db.commit()
    logger.info(f"Successfully initialized {count} demo user passwords to hash of 'Demo@123'.")
    return count
