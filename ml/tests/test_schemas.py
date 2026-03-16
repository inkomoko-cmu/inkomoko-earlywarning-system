"""Tests for Pydantic schemas — response validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas import (
    HealthResponse,
    ModelInfoResponse,
    PredictionMeta,
    RiskPredictionItem,
    RiskPredictionResponse,
    EmploymentPredictionItem,
    EmploymentPredictionResponse,
    RevenuePredictionItem,
    RevenuePredictionResponse,
)


class TestPredictionMeta:
    def test_valid(self):
        m = PredictionMeta(model_pipeline="risk", record_count=5)
        assert m.model_pipeline == "risk"
        assert m.record_count == 5

    def test_missing_fields_raises(self):
        with pytest.raises(ValidationError):
            PredictionMeta()


class TestRiskPredictionItem:
    def test_valid_item(self):
        item = RiskPredictionItem(
            unique_id="C1",
            pred_risk_tier="HIGH",
            pred_risk_tier_low_p=0.1,
            pred_risk_tier_medium_p=0.2,
            pred_risk_tier_high_p=0.7,
            pred_risk_score_1m=0.3,
            pred_risk_score_2m=0.5,
            pred_risk_score_3m=0.7,
            pred_risk_tier_1m="LOW",
            pred_risk_tier_2m="MEDIUM",
            pred_risk_tier_3m="HIGH",
        )
        assert item.pred_risk_tier == "HIGH"
        assert item.unique_id == "C1"

    def test_optional_unique_id(self):
        item = RiskPredictionItem(
            pred_risk_tier="LOW",
            pred_risk_tier_low_p=0.9,
            pred_risk_tier_medium_p=0.05,
            pred_risk_tier_high_p=0.05,
            pred_risk_score_1m=0.1,
            pred_risk_score_2m=0.1,
            pred_risk_score_3m=0.1,
            pred_risk_tier_1m="LOW",
            pred_risk_tier_2m="LOW",
            pred_risk_tier_3m="LOW",
        )
        assert item.unique_id is None

    def test_missing_required_field_raises(self):
        with pytest.raises(ValidationError):
            RiskPredictionItem(pred_risk_tier="LOW")


class TestEmploymentPredictionItem:
    def test_valid_item(self):
        item = EmploymentPredictionItem(
            pred_jobs_created_1m=2.0,
            pred_jobs_created_2m=3.0,
            pred_jobs_created_3m=4.0,
            pred_jobs_lost_1m=0.5,
            pred_jobs_lost_2m=1.0,
            pred_jobs_lost_3m=1.5,
        )
        assert item.pred_jobs_created_3m == 4.0

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            EmploymentPredictionItem(pred_jobs_created_1m=1.0)


class TestRevenuePredictionItem:
    def test_valid_item(self):
        item = RevenuePredictionItem(
            pred_revenue_1m=1000.0,
            pred_revenue_2m=1200.0,
            pred_revenue_3m=1500.0,
        )
        assert item.pred_revenue_3m == 1500.0

    def test_missing_field_raises(self):
        with pytest.raises(ValidationError):
            RevenuePredictionItem(pred_revenue_1m=1000.0)


class TestRiskPredictionResponse:
    def test_valid_response(self):
        resp = RiskPredictionResponse(
            meta=PredictionMeta(model_pipeline="risk", record_count=1),
            predictions=[
                RiskPredictionItem(
                    pred_risk_tier="LOW",
                    pred_risk_tier_low_p=0.8,
                    pred_risk_tier_medium_p=0.15,
                    pred_risk_tier_high_p=0.05,
                    pred_risk_score_1m=0.2,
                    pred_risk_score_2m=0.2,
                    pred_risk_score_3m=0.2,
                    pred_risk_tier_1m="LOW",
                    pred_risk_tier_2m="LOW",
                    pred_risk_tier_3m="LOW",
                )
            ],
        )
        assert resp.meta.record_count == 1
        assert len(resp.predictions) == 1


class TestEmploymentPredictionResponse:
    def test_valid_response(self):
        resp = EmploymentPredictionResponse(
            meta=PredictionMeta(model_pipeline="employment", record_count=1),
            predictions=[
                EmploymentPredictionItem(
                    pred_jobs_created_1m=1.0,
                    pred_jobs_created_2m=2.0,
                    pred_jobs_created_3m=3.0,
                    pred_jobs_lost_1m=0.0,
                    pred_jobs_lost_2m=0.5,
                    pred_jobs_lost_3m=1.0,
                )
            ],
        )
        assert resp.meta.model_pipeline == "employment"


class TestRevenuePredictionResponse:
    def test_valid_response(self):
        resp = RevenuePredictionResponse(
            meta=PredictionMeta(model_pipeline="revenue", record_count=1),
            predictions=[
                RevenuePredictionItem(
                    pred_revenue_1m=500.0,
                    pred_revenue_2m=600.0,
                    pred_revenue_3m=700.0,
                )
            ],
        )
        assert resp.meta.model_pipeline == "revenue"


class TestHealthResponse:
    def test_valid(self):
        h = HealthResponse(status="ok", version="1.0.0")
        assert h.status == "ok"


class TestModelInfoResponse:
    def test_valid(self):
        info = ModelInfoResponse(
            pipeline="risk",
            feature_count=10,
            features=["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f9", "f10"],
        )
        assert info.feature_count == 10
        assert len(info.features) == 10
