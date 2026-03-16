import datetime
import uuid
from typing import Any, Optional

from pydantic import BaseModel, Field


class AuditLogBase(BaseModel):
    action: str
    category: str = "system"
    severity: str = "info"
    actor: Optional[str] = None
    details: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[uuid.UUID] = None
    request_context: dict = Field(default_factory=dict)
    success: bool = True
    error_message: Optional[str] = None
    meta: dict = Field(default_factory=dict)
    source: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    user_id: Optional[uuid.UUID] = None
    created_at: Optional[datetime.datetime] = None


class AuditLogOut(AuditLogBase):
    audit_id: uuid.UUID
    created_at: datetime.datetime


class AuditLogResponse(BaseModel):
    total: int
    offset: int
    limit: int
    page_count: int
    category_counts: dict[str, int]
    severity_counts: dict[str, int]
    source_counts: dict[str, int]
    ml_available: bool
    events: list[dict[str, Any]]
