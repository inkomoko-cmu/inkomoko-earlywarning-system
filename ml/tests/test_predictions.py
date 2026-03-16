"""Tests for the direct prediction endpoints (/predict/risk, /predict/employment, /predict/revenue)."""

from __future__ import annotations

import pytest


# ═══════════════════════════════════════════════════════════════════════════════
# POST /predict/risk
# ═══════════════════════════════════════════════════════════════════════════════


class TestPredictRisk:
    """Risk prediction endpoint — tier classification + score regression."""

    async def test_single_record(self, client, sample_record):
        r = await client.post("/predict/risk", json=[sample_record])
        assert r.status_code == 200
        body = r.json()
        assert body["meta"]["model_pipeline"] == "risk"
        assert body["meta"]["record_count"] == 1

        pred = body["predictions"][0]
        # 3-month tier + probabilities
        assert pred["pred_risk_tier"] in ("LOW", "MEDIUM", "HIGH")
        assert 0 <= pred["pred_risk_tier_low_p"] <= 1
        assert 0 <= pred["pred_risk_tier_medium_p"] <= 1
        assert 0 <= pred["pred_risk_tier_high_p"] <= 1
        # Probabilities should roughly sum to 1
        prob_sum = (
            pred["pred_risk_tier_low_p"]
            + pred["pred_risk_tier_medium_p"]
            + pred["pred_risk_tier_high_p"]
        )
        assert abs(prob_sum - 1.0) < 0.01

        # Per-horizon scores & tiers
        for h in (1, 2, 3):
            assert 0 <= pred[f"pred_risk_score_{h}m"] <= 1
            assert pred[f"pred_risk_tier_{h}m"] in ("LOW", "MEDIUM", "HIGH")

    async def test_batch(self, client, sample_records):
        r = await client.post("/predict/risk", json=sample_records)
        assert r.status_code == 200
        body = r.json()
        assert body["meta"]["record_count"] == len(sample_records)
        assert len(body["predictions"]) == len(sample_records)

    async def test_empty_payload_returns_422(self, client):
        r = await client.post("/predict/risk", json=[])
        assert r.status_code == 422

    async def test_missing_fields_still_predicts(self, client):
        """Models handle missing features via imputation — should not crash."""
        minimal = {"unique_id": "test-001", "age": 30}
        r = await client.post("/predict/risk", json=[minimal])
        assert r.status_code == 200


# ═══════════════════════════════════════════════════════════════════════════════
# POST /predict/employment
# ═══════════════════════════════════════════════════════════════════════════════


class TestPredictEmployment:
    """Employment prediction — jobs created & lost per horizon."""

    async def test_single_record(self, client, sample_record):
        r = await client.post("/predict/employment", json=[sample_record])
        assert r.status_code == 200
        body = r.json()
        assert body["meta"]["model_pipeline"] == "employment"
        assert body["meta"]["record_count"] == 1

        pred = body["predictions"][0]
        for h in (1, 2, 3):
            assert pred[f"pred_jobs_created_{h}m"] >= 0
            assert pred[f"pred_jobs_lost_{h}m"] >= 0

    async def test_batch(self, client, sample_records):
        r = await client.post("/predict/employment", json=sample_records)
        assert r.status_code == 200
        assert len(r.json()["predictions"]) == len(sample_records)

    async def test_empty_payload_returns_422(self, client):
        r = await client.post("/predict/employment", json=[])
        assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# POST /predict/revenue
# ═══════════════════════════════════════════════════════════════════════════════


class TestPredictRevenue:
    """Revenue prediction — 3-month trajectory."""

    async def test_single_record(self, client, sample_record):
        r = await client.post("/predict/revenue", json=[sample_record])
        assert r.status_code == 200
        body = r.json()
        assert body["meta"]["model_pipeline"] == "revenue"
        assert body["meta"]["record_count"] == 1

        pred = body["predictions"][0]
        for h in (1, 2, 3):
            assert pred[f"pred_revenue_{h}m"] >= 0

    async def test_batch(self, client, sample_records):
        r = await client.post("/predict/revenue", json=sample_records)
        assert r.status_code == 200
        assert len(r.json()["predictions"]) == len(sample_records)

    async def test_empty_payload_returns_422(self, client):
        r = await client.post("/predict/revenue", json=[])
        assert r.status_code == 422
