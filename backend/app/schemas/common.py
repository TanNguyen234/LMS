from typing import Generic, List, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    page: int
    pageSize: int
    total: int


class MessageResponse(BaseModel):
    message: str
    detail: str = ""
