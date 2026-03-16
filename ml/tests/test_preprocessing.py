"""Tests for preprocessing / feature engineering utilities."""

from __future__ import annotations

import pytest
import numpy as np
import pandas as pd

from app.preprocessing import (
    align_features,
    engineer_risk_features,
    engineer_employment_features,
    engineer_revenue_features,
)


class TestAlignFeatures:
    """align_features(df, expected_cols) — column alignment utility."""

    def test_exact_match(self):
        cols = ["a", "b", "c"]
        df = pd.DataFrame({"a": [1], "b": [2], "c": [3]})
        result = align_features(df, cols)
        assert list(result.columns) == cols
        assert result.shape == (1, 3)

    def test_missing_columns_filled_with_nan(self):
        df = pd.DataFrame({"a": [1]})
        result = align_features(df, ["a", "b", "c"])
        assert list(result.columns) == ["a", "b", "c"]
        assert result["a"].iloc[0] == 1
        assert pd.isna(result["b"].iloc[0])
        assert pd.isna(result["c"].iloc[0])

    def test_extra_columns_dropped(self):
        df = pd.DataFrame({"a": [1], "b": [2], "extra": [99]})
        result = align_features(df, ["a", "b"])
        assert list(result.columns) == ["a", "b"]
        assert "extra" not in result.columns

    def test_preserves_row_count(self):
        df = pd.DataFrame({"a": range(10), "b": range(10)})
        result = align_features(df, ["a", "b", "c"])
        assert len(result) == 10

    def test_column_order_preserved(self):
        df = pd.DataFrame({"c": [3], "a": [1], "b": [2]})
        expected = ["a", "b", "c"]
        result = align_features(df, expected)
        assert list(result.columns) == expected

    def test_empty_dataframe(self):
        df = pd.DataFrame()
        result = align_features(df, ["a", "b"])
        assert list(result.columns) == ["a", "b"]
        assert len(result) == 0


class TestEngineerRiskFeatures:
    """engineer_risk_features(core, impact) — derived column creation."""

    @pytest.fixture
    def core_df(self):
        return pd.DataFrame(
            {
                "clientId": ["C1", "C1", "C2"],
                "actualPaymentAmount": [100, 200, 150],
                "scheduledPaymentAmount": [120, 180, 160],
                "principalPaid": [80, 160, 130],
                "disbursedAmount": [1000, 1000, 1200],
                "approvedAmount": [1200, 1200, 1500],
                "amountPastDue": [20, 10, 5],
                "daysInArrears": [5, 3, 0],
                "industrySectorOfActivity": ["Retail", "Retail", "Agri"],
            }
        )

    @pytest.fixture
    def impact_df(self):
        return pd.DataFrame(
            {
                "unique_id": ["C1", "C2"],
                "revenue": [5000, 3000],
                "hh_expense": [2000, 1500],
                "nps_promoter": [0.8, 0.5],
                "nps_detractor": [0.1, 0.3],
                "jobs_created_3m": [2, 1],
                "jobs_lost_3m": [0, 1],
            }
        )

    def test_returns_dataframe(self, core_df, impact_df):
        result = engineer_risk_features(core_df, impact_df)
        assert isinstance(result, pd.DataFrame)

    def test_derived_ratios_created(self, core_df, impact_df):
        result = engineer_risk_features(core_df, impact_df)
        assert "repayment_ratio" in result.columns
        assert "principal_completion_ratio" in result.columns
        assert "utilization_ratio" in result.columns
        assert "past_due_ratio" in result.columns

    def test_rolling_features_created(self, core_df, impact_df):
        result = engineer_risk_features(core_df, impact_df)
        assert "daysInArrears_rolling_mean_3" in result.columns
        assert "daysInArrears_rolling_std_3" in result.columns

    def test_post_merge_features(self, core_df, impact_df):
        result = engineer_risk_features(core_df, impact_df)
        assert "revenue_to_expense_ratio" in result.columns
        assert "nps_net" in result.columns
        assert "jobs_net_3m" in result.columns

    def test_revenue_to_expense_ratio(self, core_df, impact_df):
        result = engineer_risk_features(core_df, impact_df)
        # C1: 5000/2000 = 2.5
        c1 = result[result["unique_id"] == "C1"].iloc[0]
        assert abs(c1["revenue_to_expense_ratio"] - 2.5) < 0.01

    def test_does_not_mutate_input(self, core_df, impact_df):
        original_cols = list(core_df.columns)
        engineer_risk_features(core_df, impact_df)
        assert list(core_df.columns) == original_cols


class TestEngineerEmploymentFeatures:
    """engineer_employment_features — simpler feature set."""

    @pytest.fixture
    def core_df(self):
        return pd.DataFrame(
            {
                "clientId": ["C1", "C2"],
                "actualPaymentAmount": [100, 150],
                "scheduledPaymentAmount": [120, 160],
                "disbursedAmount": [1000, 1200],
                "approvedAmount": [1200, 1500],
                "amountPastDue": [20, 5],
                "daysInArrears": [5, 0],
            }
        )

    @pytest.fixture
    def impact_df(self):
        return pd.DataFrame(
            {
                "unique_id": ["C1", "C2"],
                "revenue": [5000, 3000],
            }
        )

    def test_returns_dataframe(self, core_df, impact_df):
        result = engineer_employment_features(core_df, impact_df)
        assert isinstance(result, pd.DataFrame)

    def test_derived_ratios(self, core_df, impact_df):
        result = engineer_employment_features(core_df, impact_df)
        assert "repayment_ratio" in result.columns
        assert "utilization_ratio" in result.columns
        assert "past_due_ratio" in result.columns


class TestEngineerRevenueFeatures:
    """engineer_revenue_features is identical to engineer_risk_features."""

    def test_is_same_function(self):
        assert engineer_revenue_features is engineer_risk_features
