import datetime
import uuid

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import text

from app.models.auth import Base


class MLPrediction(Base):
    __tablename__ = "ml_prediction"

    prediction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    model_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ml_model_version.model_version_id", ondelete="RESTRICT"),
        nullable=False,
    )
    enterprise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dim_enterprise.enterprise_id", ondelete="CASCADE"),
        nullable=False,
    )
    as_of_date: Mapped[datetime.date] = mapped_column(Date, nullable=False)
    horizon: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    target_key: Mapped[str] = mapped_column(Text, nullable=False)
    predicted_value: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    predicted_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Numeric(6, 5), nullable=True)
    explanation: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    input_snapshot_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class SimScenario(Base):
    __tablename__ = "sim_scenario"

    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    scenario_name: Mapped[str] = mapped_column(Text, nullable=False)
    scenario_type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'shock'"),
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    parameters: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )


class SimRun(Base):
    __tablename__ = "sim_run"

    sim_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    scenario_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sim_scenario.scenario_id", ondelete="CASCADE"),
        nullable=False,
    )
    model_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ml_model_version.model_version_id", ondelete="SET NULL"),
        nullable=True,
    )
    scope: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        server_default=text("'{}'::jsonb"),
    )
    run_status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'running'"),
    )
    started_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
    finished_at: Mapped[datetime.datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class SimResult(Base):
    __tablename__ = "sim_result"

    sim_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    sim_run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sim_run.sim_run_id", ondelete="CASCADE"),
        nullable=False,
    )
    enterprise_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dim_enterprise.enterprise_id", ondelete="CASCADE"),
        nullable=True,
    )
    target_key: Mapped[str] = mapped_column(Text, nullable=False)
    baseline_value: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    scenario_value: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    delta_value: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    baseline_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    scenario_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )
