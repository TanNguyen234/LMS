import logging

from sqlalchemy.orm import Session

from backend.app.core.config import settings
from backend.app.core.security import get_password_hash
from backend.app.db.seed_demo import ensure_demo_seed
from backend.app.models.models import User

logger = logging.getLogger(__name__)


def init_development_passwords(db: Session) -> int:
    """
    Translates sentinel '__SET_ON_FIRST_RUN__' password hashes to real bcrypt hash of 'Demo@123'
    and ensures relative-date demo seed data in development environment.
    """
    if settings.APP_ENV != "development":
        logger.info("Skipping sentinel password initialization (not in development environment).")
        return 0

    sentinel_users = db.query(User).filter(User.PasswordHash == "__SET_ON_FIRST_RUN__").all()
    count = 0
    if sentinel_users:
        demo_hash = get_password_hash("Demo@123")
        for user in sentinel_users:
            user.PasswordHash = demo_hash
            count += 1
        db.commit()
        logger.info("Successfully initialized %d demo user passwords.", count)
    else:
        logger.info("No sentinel passwords found to initialize.")

    try:
        ensure_demo_seed(db)
    except Exception as exc:
        logger.warning("Demo seed sync skipped or partially applied: %s", exc)
        db.rollback()

    return count
