import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, SmallInteger
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.auth import Base


class AppSettings(Base):
    __tablename__ = "app_settings"

    # Singleton row: id=1
    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    risk_thresholds: Mapped[dict] = mapped_column(JSONB, nullable=False)
    prediction_horizons: Mapped[dict] = mapped_column(JSONB, nullable=False)
    retraining: Mapped[dict] = mapped_column(JSONB, nullable=False)
    cron_jobs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    alert_rules: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("auth_user.user_id", ondelete="SET NULL"),
        nullable=True,
    )
