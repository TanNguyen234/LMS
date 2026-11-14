import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

import bcrypt
from jose import jwt

from backend.app.core.config import settings

_WS_TICKET_LOCK = threading.Lock()
_WS_TICKETS: dict[str, tuple[uuid.UUID, float]] = {}


def validate_password_bytes(password: str) -> str:
    """Validate password length in UTF-8 bytes (6..72) for bcrypt compatibility."""
    if not isinstance(password, str):
        raise ValueError("Mật khẩu phải là chuỗi ký tự hợp lệ.")
    byte_length = len(password.encode("utf-8"))
    if byte_length < 6:
        raise ValueError("Mật khẩu phải có ít nhất 6 ký tự.")
    if byte_length > 72:
        raise ValueError("Mật khẩu không được vượt quá 72 byte UTF-8.")
    return password


def get_password_hash(password: str) -> str:
    """Hash password using bcrypt."""
    encoded = password.encode("utf-8")
    if len(encoded) > 72:
        raise ValueError("Mật khẩu không được vượt quá 72 byte UTF-8.")
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(encoded, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash."""
    if not hashed_password or hashed_password == "__SET_ON_FIRST_RUN__":
        return False
    try:
        plain_bytes = plain_password.encode("utf-8")
        if len(plain_bytes) > 72:
            return False
        return bcrypt.checkpw(plain_bytes, hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(
    subject: Union[str, Any],
    role: str,
    email: str,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Generate JWT access token."""
    now = datetime.now(timezone.utc)
    expire = now + expires_delta if expires_delta else now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        "sub": str(subject),
        "role": role,
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return jwt.encode(
        to_encode,
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )


def decode_access_token(token: str) -> Optional[dict]:
    """Decode and validate JWT access token."""
    try:
        return jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except Exception:
        return None


def _prune_expired_tickets(now_monotonic: float) -> None:
    expired = [key for key, (_, expires_at) in _WS_TICKETS.items() if expires_at < now_monotonic]
    for key in expired:
        _WS_TICKETS.pop(key, None)


def create_ws_ticket(user_id: uuid.UUID, ttl_seconds: int = 30) -> str:
    """Create a thread-safe, single-use short-lived WebSocket auth ticket."""
    if ttl_seconds <= 0:
        raise ValueError("ttl_seconds must be positive")
    ticket = secrets.token_urlsafe(32)
    now = time.monotonic()
    with _WS_TICKET_LOCK:
        _prune_expired_tickets(now)
        _WS_TICKETS[ticket] = (user_id, now + ttl_seconds)
    return ticket


def consume_ws_ticket(ticket: str) -> Optional[uuid.UUID]:
    """Consume a single-use WebSocket auth ticket and return user_id if valid."""
    if not ticket:
        return None
    now = time.monotonic()
    with _WS_TICKET_LOCK:
        _prune_expired_tickets(now)
        entry = _WS_TICKETS.pop(ticket, None)
    if entry is None:
        return None
    user_id, expires_at = entry
    if expires_at < now:
        return None
    return user_id
