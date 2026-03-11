"""Tests for the model registry and model loading infrastructure."""

from __future__ import annotations

import pytest
from pathlib import Path

from app.models import ModelRegistry, get_registry, load_models
from app.config import MODELS_DIR, HORIZONS


class TestModelRegistry:
    """Verify the model registry loads correctly with all 15 models."""

    def test_registry_is_populated(self, registry):
        assert registry is not None
        assert isinstance(registry, ModelRegistry)

    def test_risk_tier_models_loaded(self, registry):
        for h in HORIZONS:
            assert h in registry.risk_tier
            assert registry.risk_tier[h] is not None

    def test_risk_score_models_loaded(self, registry):
        for h in HORIZONS:
            assert h in registry.risk_score
            assert registry.risk_score[h] is not None

    def test_employment_created_models_loaded(self, registry):
        for h in HORIZONS:
            assert h in registry.employment_jobs_created
            assert registry.employment_jobs_created[h] is not None

    def test_employment_lost_models_loaded(self, registry):
        for h in HORIZONS:
            assert h in registry.employment_jobs_lost
            assert registry.employment_jobs_lost[h] is not None

    def test_revenue_models_loaded(self, registry):
        for h in HORIZONS:
            assert h in registry.revenue
            assert registry.revenue[h] is not None

    def test_total_model_count(self, registry):
        """15 models total: 3 horizons × (risk_tier + risk_score + jobs_created + jobs_lost + revenue)."""
        total = (
            len(registry.risk_tier)
            + len(registry.risk_score)
            + len(registry.employment_jobs_created)
            + len(registry.employment_jobs_lost)
            + len(registry.revenue)
        )
        assert total == 15

    def test_feature_lists_populated(self, registry):
        assert len(registry.risk_features) > 0
        assert len(registry.employment_features) > 0
        assert len(registry.revenue_features) > 0

    def test_feature_lists_are_strings(self, registry):
        for feat in registry.risk_features:
            assert isinstance(feat, str)
        for feat in registry.employment_features:
            assert isinstance(feat, str)
        for feat in registry.revenue_features:
            assert isinstance(feat, str)


class TestModelFiles:
    """Verify all .joblib model files exist on disk."""

    @pytest.mark.parametrize("h", HORIZONS)
    def test_risk_tier_file_exists(self, h):
        assert (MODELS_DIR / f"risk_tier_{h}m_model.joblib").exists()

    @pytest.mark.parametrize("h", HORIZONS)
    def test_risk_score_file_exists(self, h):
        assert (MODELS_DIR / f"risk_score_{h}m_model.joblib").exists()

    @pytest.mark.parametrize("h", HORIZONS)
    def test_employment_jobs_created_file_exists(self, h):
        assert (MODELS_DIR / f"employment_jobs_created_{h}m_model.joblib").exists()

    @pytest.mark.parametrize("h", HORIZONS)
    def test_employment_jobs_lost_file_exists(self, h):
        assert (MODELS_DIR / f"employment_jobs_lost_{h}m_model.joblib").exists()

    @pytest.mark.parametrize("h", HORIZONS)
    def test_revenue_file_exists(self, h):
        assert (MODELS_DIR / f"revenue_{h}m_model.joblib").exists()


class TestModelPredictions:
    """Verify each model can actually produce predictions."""

    def test_risk_tier_predicts(self, registry):
        import pandas as pd
        import numpy as np

        X = pd.DataFrame(
            np.zeros((1, len(registry.risk_features))),
            columns=registry.risk_features,
        )
        for h in HORIZONS:
            pred = registry.risk_tier[h].predict(X)
            assert len(pred) == 1
            assert pred[0] in (0, 1, 2)  # LOW=0, MEDIUM=1, HIGH=2

    def test_risk_tier_predict_proba(self, registry):
        import pandas as pd
        import numpy as np

        X = pd.DataFrame(
            np.zeros((1, len(registry.risk_features))),
            columns=registry.risk_features,
        )
        for h in HORIZONS:
            proba = registry.risk_tier[h].predict_proba(X)
            assert proba.shape == (1, 3)
            assert abs(proba.sum() - 1.0) < 0.01

    def test_risk_score_predicts(self, registry):
        import pandas as pd
        import numpy as np

        X = pd.DataFrame(
            np.zeros((1, len(registry.risk_features))),
            columns=registry.risk_features,
        )
        for h in HORIZONS:
            pred = registry.risk_score[h].predict(X)
            assert len(pred) == 1
            assert isinstance(float(pred[0]), float)

    def test_employment_predicts(self, registry):
        import pandas as pd
        import numpy as np

        X = pd.DataFrame(
            np.zeros((1, len(registry.employment_features))),
            columns=registry.employment_features,
        )
        for h in HORIZONS:
            jc = registry.employment_jobs_created[h].predict(X)
            jl = registry.employment_jobs_lost[h].predict(X)
            assert len(jc) == 1
            assert len(jl) == 1

    def test_revenue_predicts(self, registry):
        import pandas as pd
        import numpy as np

        X = pd.DataFrame(
            np.zeros((1, len(registry.revenue_features))),
            columns=registry.revenue_features,
        )
        for h in HORIZONS:
            pred = registry.revenue[h].predict(X)
            assert len(pred) == 1

    def test_batch_prediction_consistency(self, registry):
        """Predicting 5 rows should return 5 results."""
        import pandas as pd
        import numpy as np

        n = 5
        X = pd.DataFrame(
            np.random.randn(n, len(registry.risk_features)),
            columns=registry.risk_features,
        )
        for h in HORIZONS:
            assert len(registry.risk_tier[h].predict(X)) == n
            assert len(registry.risk_score[h].predict(X)) == n
            assert registry.risk_tier[h].predict_proba(X).shape[0] == n
