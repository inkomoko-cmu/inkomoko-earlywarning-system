"""End-to-end integration tests — full request lifecycle."""

from __future__ import annotations

import pytest


class TestEndToEndSingleClient:
    """Full lifecycle: sample data → client profile → verify all outputs."""

    async def test_sample_then_profile(self, client):
        """Fetch a sample row, then run it through client-profile."""
        # 1. Get sample data
        r1 = await client.get("/demo/sample-data?n=1")
        assert r1.status_code == 200
        record = r1.json()[0]

        # 2. Run through all pipelines
        r2 = await client.post("/demo/client-profile", json=record)
        assert r2.status_code == 200
        body = r2.json()

        # 3. Verify all pipelines returned results
        assert "risk" in body
        assert "employment" in body
        assert "revenue" in body

        # 4. Verify risk details
        risk = body["risk"]
        assert risk["pred_risk_tier"] in ("LOW", "MEDIUM", "HIGH")

        # 5. Verify employment details
        emp = body["employment"]
        for h in (1, 2, 3):
            assert emp[f"pred_jobs_created_{h}m"] >= 0

        # 6. Verify revenue details
        rev = body["revenue"]
        for h in (1, 2, 3):
            assert rev[f"pred_revenue_{h}m"] >= 0


class TestEndToEndBatch:
    """Full lifecycle: sample data → batch predict → analytics."""

    async def test_sample_then_batch_predict(self, client):
        # 1. Get multiple samples
        r1 = await client.get("/demo/sample-data?n=5")
        records = r1.json()

        # 2. Batch predict all pipelines
        r2 = await client.post("/demo/predict-all", json=records)
        assert r2.status_code == 200
        body = r2.json()

        for pipeline in ("risk", "employment", "revenue"):
            assert body[pipeline]["meta"]["record_count"] == 5
            assert len(body[pipeline]["predictions"]) == 5

    async def test_upload_then_analytics(self, client):
        """Upload data, then request analytics on stored data."""
        import io
        import pandas as pd
        from app.config import PREDICTIONS_DIR

        # 1. Upload a small CSV
        df = pd.read_csv(PREDICTIONS_DIR / "test.csv", nrows=20)
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        buf.seek(0)

        r1 = await client.post(
            "/demo/upload-excel",
            files={"file": ("test.csv", buf, "text/csv")},
        )
        assert r1.status_code == 200

        # 2. Get analytics on stored data
        r2 = await client.get("/demo/analytics?source=stored")
        assert r2.status_code == 200
        body = r2.json()
        assert body["total_records"] > 0
        assert "kpis" in body

    async def test_full_dashboard_flow(self, client):
        """Verify all dashboard-supporting endpoints respond correctly."""
        # Analytics
        r1 = await client.get("/demo/analytics?source=test")
        assert r1.status_code == 200

        # Model cards
        r2 = await client.get("/demo/model-cards")
        assert r2.status_code == 200

        # Documentation
        r3 = await client.get("/demo/documentation")
        assert r3.status_code == 200

        # AI insights
        r4 = await client.get("/demo/ai-insights")
        assert r4.status_code == 200

        # Health
        r5 = await client.get("/health")
        assert r5.status_code == 200


class TestEndToEndPredictionConsistency:
    """Verify predictions are deterministic for the same input."""

    async def test_same_input_same_output(self, client, sample_record):
        """Two identical requests should produce identical predictions."""
        r1 = await client.post("/predict/risk", json=[sample_record])
        r2 = await client.post("/predict/risk", json=[sample_record])

        pred1 = r1.json()["predictions"][0]
        pred2 = r2.json()["predictions"][0]

        assert pred1["pred_risk_tier"] == pred2["pred_risk_tier"]
        assert pred1["pred_risk_score_1m"] == pred2["pred_risk_score_1m"]
        assert pred1["pred_risk_score_2m"] == pred2["pred_risk_score_2m"]
        assert pred1["pred_risk_score_3m"] == pred2["pred_risk_score_3m"]

    async def test_direct_vs_profile_consistency(self, client, sample_record):
        """Direct /predict/risk and /demo/client-profile risk should agree."""
        r_direct = await client.post("/predict/risk", json=[sample_record])
        r_profile = await client.post("/demo/client-profile", json=sample_record)

        direct_pred = r_direct.json()["predictions"][0]
        profile_risk = r_profile.json()["risk"]

        # The 3-month tier should match
        assert direct_pred["pred_risk_tier"] == profile_risk["pred_risk_tier"]
