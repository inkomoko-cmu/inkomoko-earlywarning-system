"""Centralized ML configuration for backend."""

from pathlib import Path

# ── directory layout ────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
ML_BASE_DIR = PROJECT_ROOT / "ml"
ARTIFACTS_DIR = ML_BASE_DIR / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
METRICS_DIR = ARTIFACTS_DIR / "metrics"
PREDICTIONS_DIR = ARTIFACTS_DIR / "predictions"
SYNTHETIC_DIR = ML_BASE_DIR / "synthetic_outputs"

# ── domain constants ────────────────────────────────────────────────────────
RISK_LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
HORIZONS = [1, 2, 3]  # month horizons
