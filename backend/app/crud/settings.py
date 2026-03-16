from datetime import datetime
from typing import Any
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.settings import AppSettings


DEFAULT_SETTINGS: dict[str, Any] = {
    "risk_thresholds": {
        "low": {
            "score_min": 0,
            "score_max": 30,
            "arrears_days": 7,
            "revenue_decline_pct": 10,
            "jobs_lost_pct": 5,
        },
        "medium": {
            "score_min": 31,
            "score_max": 70,
            "arrears_days": 30,
            "revenue_decline_pct": 25,
            "jobs_lost_pct": 15,
        },
        "high": {
            "score_min": 71,
            "score_max": 100,
            "arrears_days": 31,
            "revenue_decline_pct": 40,
            "jobs_lost_pct": 25,
        },
        "high_if_any_triggered": True,
    },
    "prediction_horizons": {
        "one_month": {"enabled": True, "confidence_interval": 95, "min_confidence_pct": 75},
        "two_month": {"enabled": True, "confidence_interval": 90, "min_confidence_pct": 70},
        "three_month": {"enabled": True, "confidence_interval": 85, "min_confidence_pct": 65},
        "recompute_frequency": "daily",
    },
    "retraining": {
        "enabled": True,
        "frequency": "monthly",
        "run_time_utc": "02:00",
        "training_window_months": 24,
        "auto_deploy": False,
        "min_improvement_pct": 2.0,
    },
    "cron_jobs": {
        "loan_import": {
            "enabled": True,
            "frequency": "daily",
            "run_time_utc": "01:00",
            "max_retries": 3,
        },
        "impact_import": {
            "enabled": True,
            "frequency": "weekly",
            "run_time_utc": "01:30",
            "max_retries": 3,
        },
        "retraining_job": {
            "enabled": True,
            "frequency": "monthly",
            "run_time_utc": "02:00",
            "max_retries": 1,
        },
    },
    "alert_rules": {
        "high_risk_enabled": True,
        "high_risk_threshold_count": 10,
        "par30_enabled": True,
        "par30_threshold_pct": 20,
        "import_failure_enabled": True,
        "delivery_channel": "in_app",
        "recipient_email": None,
    },
}


async def get_or_create_settings(db: AsyncSession) -> AppSettings:
    res = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = res.scalar_one_or_none()
    if settings:
        return settings

    settings = AppSettings(
        id=1,
        risk_thresholds=DEFAULT_SETTINGS["risk_thresholds"],
        prediction_horizons=DEFAULT_SETTINGS["prediction_horizons"],
        retraining=DEFAULT_SETTINGS["retraining"],
        cron_jobs=DEFAULT_SETTINGS["cron_jobs"],
        alert_rules=DEFAULT_SETTINGS["alert_rules"],
    )
    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings


def serialize_settings(settings: AppSettings) -> dict[str, Any]:
    return {
        "risk_thresholds": settings.risk_thresholds,
        "prediction_horizons": settings.prediction_horizons,
        "retraining": settings.retraining,
        "cron_jobs": settings.cron_jobs,
        "alert_rules": settings.alert_rules,
        "updated_at": settings.updated_at.isoformat() if settings.updated_at else None,
    }


async def update_settings(
    db: AsyncSession,
    updates: dict[str, Any],
    updated_by: uuid.UUID | None,
) -> AppSettings:
    settings = await get_or_create_settings(db)

    for key in ("risk_thresholds", "prediction_horizons", "retraining", "cron_jobs", "alert_rules"):
        if updates.get(key) is not None:
            setattr(settings, key, updates[key])

    settings.updated_by = updated_by
    settings.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(settings)
    return settings
