from datetime import datetime, timezone
from typing import Annotated, Generic, List, Optional, TypeVar

from pydantic import AfterValidator, BaseModel, PlainSerializer

T = TypeVar("T")


def as_utc_datetime(value: datetime | str) -> datetime:
    """Parse ISO strings or attach/convert datetime values to timezone-aware UTC."""
    if isinstance(value, str):
        raw = value.strip()
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        value = datetime.fromisoformat(raw)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def to_utc_iso(value: Optional[datetime | str]) -> Optional[str]:
    """Serialize any datetime/ISO string as a canonical UTC ISO 8601 string with 'Z'."""
    if value is None:
        return None
    return as_utc_datetime(value).isoformat().replace("+00:00", "Z")


UtcDateTime = Annotated[
    datetime,
    AfterValidator(as_utc_datetime),
    PlainSerializer(
        lambda dt: as_utc_datetime(dt).isoformat().replace("+00:00", "Z"),
        return_type=str,
        when_used="json",
    ),
]


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    page: int
    pageSize: int
    total: int


class MessageResponse(BaseModel):
    message: str
    detail: str = ""
