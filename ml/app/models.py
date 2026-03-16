"""Model registry — loads .joblib artefacts once at startup."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import joblib

from app.config import MODELS_DIR

logger = logging.getLogger(__name__)


@dataclass
class ModelRegistry:
    """Holds all loaded sklearn/LGBM pipelines and exposes their feature lists.

    Each pipeline now stores **per-horizon** models (1m, 2m, 3m).
    The dict keys are the integer horizon: {1: model, 2: model, 3: model}.
    """

    # ── risk pipeline (per horizon) ─────────────────────────────────────────
    risk_tier: dict[int, Any] = field(default_factory=dict)  # {1: clf, 2: clf, 3: clf}
    risk_score: dict[int, Any] = field(default_factory=dict)  # {1: reg, 2: reg, 3: reg}

    # ── employment pipeline (per horizon) ───────────────────────────────────
    employment_jobs_created: dict[int, Any] = field(default_factory=dict)
    employment_jobs_lost: dict[int, Any] = field(default_factory=dict)

    # ── revenue pipeline (per horizon) ──────────────────────────────────────
    revenue: dict[int, Any] = field(default_factory=dict)

    # derived feature lists (populated at load time)
    risk_features: list[str] = field(default_factory=list)
    employment_features: list[str] = field(default_factory=list)
    revenue_features: list[str] = field(default_factory=list)


_registry: ModelRegistry | None = None


def _load(filename: str) -> Any:
    path = MODELS_DIR / filename
    logger.info("Loading %s", path)
    return joblib.load(path)


HORIZONS = [1, 2, 3]


def load_models() -> ModelRegistry:
    """Eagerly load every model into memory.  Called once during app lifespan.

    Loads 15 models total: 3 horizons x (risk_tier + risk_score +
    jobs_created + jobs_lost + revenue).
    """
    global _registry

    reg = ModelRegistry()

    for h in HORIZONS:
        # Risk pipeline (tier classifier + score regressor per horizon)
        reg.risk_tier[h] = _load(f"risk_tier_{h}m_model.joblib")
        reg.risk_score[h] = _load(f"risk_score_{h}m_model.joblib")

        # Employment pipeline (2 regressors per horizon)
        reg.employment_jobs_created[h] = _load(
            f"employment_jobs_created_{h}m_model.joblib"
        )
        reg.employment_jobs_lost[h] = _load(f"employment_jobs_lost_{h}m_model.joblib")

        # Revenue pipeline (1 regressor per horizon)
        reg.revenue[h] = _load(f"revenue_{h}m_model.joblib")

    # Feature lists from the 3m models (all horizons share the same features)
    reg.risk_features = list(getattr(reg.risk_tier[3], "feature_names_in_", []))
    reg.employment_features = list(
        getattr(reg.employment_jobs_created[3], "feature_names_in_", [])
    )
    reg.revenue_features = list(getattr(reg.revenue[3], "feature_names_in_", []))

    _registry = reg
    logger.info(
        "All models loaded (15 total) — risk(%d feats), employment(%d feats), revenue(%d feats)",
        len(reg.risk_features),
        len(reg.employment_features),
        len(reg.revenue_features),
    )
    return reg


def get_registry() -> ModelRegistry:
    """Return the already-loaded registry (call after startup)."""
    if _registry is None:
        raise RuntimeError("Models not loaded — was the app lifespan executed?")
    return _registry
