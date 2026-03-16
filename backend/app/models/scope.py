import uuid
from sqlalchemy import ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.models.auth import Base

class AuthScope(Base):
    __tablename__ = "auth_scope"

    scope_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("auth_user.user_id", ondelete="CASCADE"))
    country_code: Mapped[str | None] = mapped_column(nullable=True)
    program_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    cohort_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
