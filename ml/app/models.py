"""Model registry — loads .joblib artefacts once at startup."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import joblib

from app.config import HORIZONS, MODELS_DIR

logger = logging.getLogger(__name__)


@dataclass
class ModelRegistry:
    """Holds all loaded sklearn/LGBM pipelines and exposes their feature lists.

    Each pipeline stores per-horizon models.
    The dict keys are integer horizons, for example {1: model, ..., 12: model}.
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


def load_models() -> ModelRegistry:
    """Eagerly load every model into memory.  Called once during app lifespan.

    Loads all task models for every configured horizon.
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

    # Feature lists from the max-horizon models (all horizons share the same features)
    ref_h = max(HORIZONS)
    reg.risk_features = list(getattr(reg.risk_tier[ref_h], "feature_names_in_", []))
    reg.employment_features = list(
        getattr(reg.employment_jobs_created[ref_h], "feature_names_in_", [])
    )
    reg.revenue_features = list(getattr(reg.revenue[ref_h], "feature_names_in_", []))

    _registry = reg
    logger.info(
        "All models loaded (%d horizons) — risk(%d feats), employment(%d feats), revenue(%d feats)",
        len(HORIZONS),
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
