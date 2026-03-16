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
