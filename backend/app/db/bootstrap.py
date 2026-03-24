import json

from sqlalchemy import text

from app.crud.settings import DEFAULT_SETTINGS
from app.db.session import _build_engine


async def ensure_settings_tables() -> None:
    """Create MVP settings table and a default singleton row if missing."""
    engine_factory = _build_engine()

    async with engine_factory() as db:
        await db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS app_settings (
                    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
                    risk_thresholds JSONB NOT NULL,
                    prediction_horizons JSONB NOT NULL,
                    retraining JSONB NOT NULL,
                    cron_jobs JSONB NOT NULL,
                    alert_rules JSONB NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_by UUID NULL REFERENCES auth_user(user_id) ON DELETE SET NULL
                );
                """
            )
        )

        await db.execute(
            text(
                """
                INSERT INTO app_settings (
                    id,
                    risk_thresholds,
                    prediction_horizons,
                    retraining,
                    cron_jobs,
                    alert_rules
                )
                VALUES (
                    1,
                    CAST(:risk_thresholds AS jsonb),
                    CAST(:prediction_horizons AS jsonb),
                    CAST(:retraining AS jsonb),
                    CAST(:cron_jobs AS jsonb),
                    CAST(:alert_rules AS jsonb)
                )
                ON CONFLICT (id) DO NOTHING;
                """
            ),
            {
                "risk_thresholds": json.dumps(DEFAULT_SETTINGS["risk_thresholds"]),
                "prediction_horizons": json.dumps(DEFAULT_SETTINGS["prediction_horizons"]),
                "retraining": json.dumps(DEFAULT_SETTINGS["retraining"]),
                "cron_jobs": json.dumps(DEFAULT_SETTINGS["cron_jobs"]),
                "alert_rules": json.dumps(DEFAULT_SETTINGS["alert_rules"]),
            },
        )
        await db.commit()


async def ensure_ai_insights_tables() -> None:
    """Create AI insight cache/queue tables if they do not exist."""
    engine_factory = _build_engine()

    async with engine_factory() as db:
        await db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ai_insight_snapshots (
                    snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    scope_type TEXT NOT NULL,
                    scope_id TEXT NULL,
                    context_hash TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    status TEXT NOT NULL DEFAULT 'ready',
                    error_message TEXT NULL,
                    generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    expires_at TIMESTAMPTZ NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    UNIQUE (scope_type, scope_id, context_hash, prompt_version)
                );
                """
            )
        )

        await db.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ai_insight_jobs (
                    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    scope_type TEXT NOT NULL,
                    scope_id TEXT NULL,
                    context_hash TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    prompt_version TEXT NOT NULL,
                    context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    status TEXT NOT NULL DEFAULT 'queued',
                    priority SMALLINT NOT NULL DEFAULT 100,
                    attempts INT NOT NULL DEFAULT 0,
                    error_message TEXT NULL,
                    requested_by UUID NULL REFERENCES auth_user(user_id) ON DELETE SET NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                    started_at TIMESTAMPTZ NULL,
                    finished_at TIMESTAMPTZ NULL
                );
                """
            )
        )

        await db.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_ai_snapshot_scope_hash
                    ON ai_insight_snapshots(scope_type, scope_id, context_hash, generated_at DESC);
                """
            )
        )
        await db.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_ai_jobs_queue
                    ON ai_insight_jobs(status, priority, created_at);
                """
            )
        )
        await db.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_jobs_active
                    ON ai_insight_jobs(scope_type, COALESCE(scope_id, ''), context_hash, prompt_version)
                    WHERE status IN ('queued', 'running');
                """
            )
        )

        await db.commit()
