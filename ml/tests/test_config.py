"""Tests for application configuration."""

from __future__ import annotations

from pathlib import Path

from app.config import (
    BASE_DIR,
    ARTIFACTS_DIR,
    MODELS_DIR,
    METRICS_DIR,
    PREDICTIONS_DIR,
    SYNTHETIC_DIR,
    RISK_LABELS,
    HORIZONS,
    LEAKAGE_COLS,
    TARGET_RISK_SCORE,
    TARGET_RISK_TIER,
    TARGETS_EMPLOYMENT_CREATED,
    TARGETS_EMPLOYMENT_LOST,
    TARGET_REVENUE,
    Settings,
    get_settings,
)


class TestPaths:
    """Verify all configured paths exist."""

    def test_base_dir_exists(self):
        assert BASE_DIR.exists()

    def test_artifacts_dir_exists(self):
        assert ARTIFACTS_DIR.exists()

    def test_models_dir_exists(self):
        assert MODELS_DIR.exists()

    def test_metrics_dir_exists(self):
        assert METRICS_DIR.exists()

    def test_predictions_dir_exists(self):
        assert PREDICTIONS_DIR.exists()

    def test_synthetic_dir_exists(self):
        assert SYNTHETIC_DIR.exists()


class TestConstants:
    """Domain constants sanity checks."""

    def test_risk_labels(self):
        assert RISK_LABELS == {0: "LOW", 1: "MEDIUM", 2: "HIGH"}

    def test_horizons(self):
        assert HORIZONS == [1, 2, 3]

    def test_target_names_per_horizon(self):
        for h in HORIZONS:
            assert TARGET_RISK_SCORE[h] == f"risk_score_{h}m"
            assert TARGET_RISK_TIER[h] == f"risk_tier_{h}m"
            assert TARGETS_EMPLOYMENT_CREATED[h] == f"jobs_created_{h}m"
            assert TARGETS_EMPLOYMENT_LOST[h] == f"jobs_lost_{h}m"
            assert TARGET_REVENUE[h] == f"revenue_{h}m"

    def test_leakage_cols_is_frozenset(self):
        assert isinstance(LEAKAGE_COLS, frozenset)

    def test_leakage_cols_contains_targets(self):
        for h in HORIZONS:
            assert f"risk_tier_{h}m" in LEAKAGE_COLS
            assert f"risk_score_{h}m" in LEAKAGE_COLS
            assert f"jobs_created_{h}m" in LEAKAGE_COLS
            assert f"jobs_lost_{h}m" in LEAKAGE_COLS
            assert f"revenue_{h}m" in LEAKAGE_COLS

    def test_leakage_cols_contains_ids(self):
        assert "unique_id" in LEAKAGE_COLS
        assert "clientId" in LEAKAGE_COLS
        assert "survey_id" in LEAKAGE_COLS


class TestSettings:
    def test_defaults(self):
        s = Settings()
        assert s.app_name == "Inkomoko Early Warning System"
        assert s.app_version == "1.0.0"
        assert s.debug is False
        assert s.host == "0.0.0.0"
        assert s.port == 8000

    def test_get_settings_cached(self):
        s1 = get_settings()
        s2 = get_settings()
        assert s1 is s2
