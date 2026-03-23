"""Centralised configuration — paths, constants, settings."""

from pathlib import Path
from functools import lru_cache

from pydantic_settings import BaseSettings


# ── directory layout ────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).resolve().parent.parent  # …/ml
ARTIFACTS_DIR = BASE_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
METRICS_DIR = ARTIFACTS_DIR / "metrics"
PREDICTIONS_DIR = ARTIFACTS_DIR / "predictions"
SYNTHETIC_DIR = BASE_DIR / "synthetic_outputs"


# ── domain constants ────────────────────────────────────────────────────────
RISK_LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
HORIZONS = list(range(1, 13))  # month horizons

# Per-horizon target names
TARGET_RISK_SCORE = {h: f"risk_score_{h}m" for h in HORIZONS}
TARGET_RISK_TIER = {h: f"risk_tier_{h}m" for h in HORIZONS}
TARGETS_EMPLOYMENT_CREATED = {h: f"jobs_created_{h}m" for h in HORIZONS}
TARGETS_EMPLOYMENT_LOST = {h: f"jobs_lost_{h}m" for h in HORIZONS}
TARGET_REVENUE = {h: f"revenue_{h}m" for h in HORIZONS}

# Legacy flat names (kept for backward compat)
TARGETS_EMPLOYMENT = ["jobs_created_3m", "jobs_lost_3m"]

LEAKAGE_COLS = frozenset(
    {
        *(f"risk_tier_{h}m" for h in HORIZONS),
        *(f"risk_score_{h}m" for h in HORIZONS),
        *(f"jobs_created_{h}m" for h in HORIZONS),
        *(f"jobs_lost_{h}m" for h in HORIZONS),
        *(f"revenue_{h}m" for h in HORIZONS),
        "survey_date",
        "survey_id",
        "loanNumber",
        "clientId",
        "unique_id",
    }
)


class Settings(BaseSettings):
    """Runtime settings (overridable via env vars)."""

    app_name: str = "Inkomoko Early Warning System"
    app_version: str = "1.0.0"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_prefix = "EWS_"


@lru_cache
def get_settings() -> Settings:
    return Settings()
