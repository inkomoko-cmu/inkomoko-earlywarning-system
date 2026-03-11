"""Tests for all /demo/* endpoints."""

from __future__ import annotations

import io
import pytest
import pandas as pd

from app.config import PREDICTIONS_DIR, HORIZONS


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo — HTML page
# ═══════════════════════════════════════════════════════════════════════════════


class TestDemoPage:
    async def test_serves_html(self, client):
        r = await client.get("/demo")
        assert r.status_code == 200
        assert "text/html" in r.headers["content-type"]

    async def test_html_contains_key_elements(self, client):
        r = await client.get("/demo")
        html = r.text
        assert "Inkomoko Early Warning System" in html
        assert "renderDashboard" in html
        assert "aiInsightCard" in html


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo/sample-data
# ═══════════════════════════════════════════════════════════════════════════════


class TestSampleData:
    async def test_default_returns_one_record(self, client):
        r = await client.get("/demo/sample-data")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) == 1

    async def test_n_parameter(self, client):
        r = await client.get("/demo/sample-data?n=5")
        assert r.status_code == 200
        assert len(r.json()) == 5

    async def test_max_n(self, client):
        r = await client.get("/demo/sample-data?n=10")
        assert r.status_code == 200
        assert len(r.json()) == 10

    async def test_exceeding_max_n_returns_422(self, client):
        r = await client.get("/demo/sample-data?n=11")
        assert r.status_code == 422

    async def test_zero_n_returns_422(self, client):
        r = await client.get("/demo/sample-data?n=0")
        assert r.status_code == 422

    async def test_no_target_columns_in_response(self, client):
        r = await client.get("/demo/sample-data?n=1")
        record = r.json()[0]
        keys = set(record.keys())
        # Should not contain prediction or target columns
        for h in HORIZONS:
            assert f"risk_tier_{h}m" not in keys
            assert f"risk_score_{h}m" not in keys
            assert f"jobs_created_{h}m" not in keys
            assert f"jobs_lost_{h}m" not in keys
            assert f"revenue_{h}m" not in keys
        assert not any(k.startswith("pred_") for k in keys)


# ═══════════════════════════════════════════════════════════════════════════════
# POST /demo/upload-excel
# ═══════════════════════════════════════════════════════════════════════════════


class TestUploadExcel:
    async def test_upload_csv(self, client):
        df = pd.read_csv(PREDICTIONS_DIR / "test.csv", nrows=10)
        buf = io.BytesIO()
        df.to_csv(buf, index=False)
        buf.seek(0)

        r = await client.post(
            "/demo/upload-excel",
            files={"file": ("test.csv", buf, "text/csv")},
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) <= 10  # may have fewer cols after drop

    async def test_upload_unsupported_format(self, client):
        r = await client.post(
            "/demo/upload-excel",
            files={"file": ("data.json", b'{"a":1}', "application/json")},
        )
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════════
# GET/DELETE /demo/stored-data
# ═══════════════════════════════════════════════════════════════════════════════


class TestStoredData:
    async def test_get_stored_data(self, client):
        r = await client.get("/demo/stored-data")
        assert r.status_code == 200
        body = r.json()
        assert "records" in body
        assert "row_count" in body

    async def test_clear_stored_data(self, client):
        r = await client.delete("/demo/stored-data")
        assert r.status_code == 200
        assert r.json()["status"] == "cleared"

        # Confirm cleared
        r2 = await client.get("/demo/stored-data")
        assert r2.json()["row_count"] == 0


# ═══════════════════════════════════════════════════════════════════════════════
# POST /demo/client-profile  — all pipelines, single client
# ═══════════════════════════════════════════════════════════════════════════════


class TestClientProfile:
    async def test_returns_all_pipelines(self, client, sample_record):
        r = await client.post("/demo/client-profile", json=sample_record)
        assert r.status_code == 200
        body = r.json()
        assert "risk" in body
        assert "employment" in body
        assert "revenue" in body

    async def test_risk_section(self, client, sample_record):
        r = await client.post("/demo/client-profile", json=sample_record)
        risk = r.json()["risk"]
        assert risk["pred_risk_tier"] in ("LOW", "MEDIUM", "HIGH")
        for h in (1, 2, 3):
            assert f"pred_risk_score_{h}m" in risk
            assert f"pred_risk_tier_{h}m" in risk

    async def test_employment_section(self, client, sample_record):
        r = await client.post("/demo/client-profile", json=sample_record)
        emp = r.json()["employment"]
        for h in (1, 2, 3):
            assert f"pred_jobs_created_{h}m" in emp
            assert f"pred_jobs_lost_{h}m" in emp

    async def test_revenue_section(self, client, sample_record):
        r = await client.post("/demo/client-profile", json=sample_record)
        rev = r.json()["revenue"]
        for h in (1, 2, 3):
            assert f"pred_revenue_{h}m" in rev

    async def test_input_data_returned(self, client, sample_record):
        r = await client.post("/demo/client-profile", json=sample_record)
        body = r.json()
        assert "input" in body


# ═══════════════════════════════════════════════════════════════════════════════
# POST /demo/predict-all  — all pipelines, batch
# ═══════════════════════════════════════════════════════════════════════════════


class TestPredictAll:
    async def test_returns_all_pipelines(self, client, sample_records):
        r = await client.post("/demo/predict-all", json=sample_records)
        assert r.status_code == 200
        body = r.json()
        for pipeline in ("risk", "employment", "revenue"):
            assert pipeline in body
            assert "meta" in body[pipeline]
            assert "predictions" in body[pipeline]
            assert body[pipeline]["meta"]["record_count"] == len(sample_records)

    async def test_empty_payload_returns_422(self, client):
        r = await client.post("/demo/predict-all", json=[])
        assert r.status_code == 422

    async def test_risk_predictions_structure(self, client, sample_records):
        r = await client.post("/demo/predict-all", json=sample_records)
        preds = r.json()["risk"]["predictions"]
        for pred in preds:
            assert pred["pred_risk_tier"] in ("LOW", "MEDIUM", "HIGH")
            prob_sum = (
                pred["pred_risk_tier_low_p"]
                + pred["pred_risk_tier_medium_p"]
                + pred["pred_risk_tier_high_p"]
            )
            assert abs(prob_sum - 1.0) < 0.01

    async def test_employment_predictions_non_negative(self, client, sample_records):
        r = await client.post("/demo/predict-all", json=sample_records)
        preds = r.json()["employment"]["predictions"]
        for pred in preds:
            for h in (1, 2, 3):
                assert pred[f"pred_jobs_created_{h}m"] >= 0
                assert pred[f"pred_jobs_lost_{h}m"] >= 0

    async def test_revenue_predictions_non_negative(self, client, sample_records):
        r = await client.post("/demo/predict-all", json=sample_records)
        preds = r.json()["revenue"]["predictions"]
        for pred in preds:
            for h in (1, 2, 3):
                assert pred[f"pred_revenue_{h}m"] >= 0


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo/analytics
# ═══════════════════════════════════════════════════════════════════════════════


class TestAnalytics:
    async def test_test_source(self, client):
        r = await client.get("/demo/analytics?source=test")
        assert r.status_code == 200
        body = r.json()
        assert "test" in body["source"].lower()  # e.g. "test.csv (built-in)"
        assert body["total_records"] > 0
        assert body["total_columns"] > 0

    async def test_kpis_present(self, client):
        r = await client.get("/demo/analytics?source=test")
        kpis = r.json()["kpis"]
        expected_keys = {
            "avg_age",
            "avg_revenue",
            "total_revenue",
            "avg_expenses",
            "avg_rev_expense_ratio",
            "total_jobs_created",
            "unique_clients",
        }
        assert expected_keys <= set(kpis.keys())

    async def test_distributions_present(self, client):
        r = await client.get("/demo/analytics?source=test")
        dists = r.json()["distributions"]
        assert isinstance(dists, dict)
        assert len(dists) > 0

    async def test_numeric_stats_present(self, client):
        r = await client.get("/demo/analytics?source=test")
        stats = r.json()["numeric_stats"]
        assert isinstance(stats, dict)
        for col_name, col_stats in stats.items():
            assert "mean" in col_stats
            assert "count" in col_stats

    async def test_histograms_present(self, client):
        r = await client.get("/demo/analytics?source=test")
        hists = r.json()["histograms"]
        assert isinstance(hists, dict)
        for col_name, hist in hists.items():
            assert "labels" in hist
            assert "counts" in hist

    async def test_correlation_matrix(self, client):
        r = await client.get("/demo/analytics?source=test")
        corr = r.json()["correlation"]
        assert "columns" in corr
        assert "matrix" in corr
        assert len(corr["columns"]) > 0

    async def test_cross_tabs_present(self, client):
        r = await client.get("/demo/analytics?source=test")
        tabs = r.json()["cross_tabs"]
        assert isinstance(tabs, dict)
        assert len(tabs) > 0

    async def test_stored_source_fallback(self, client):
        """When no data is stored, source=stored should fall back to test."""
        # Clear stored data first
        await client.delete("/demo/stored-data")
        r = await client.get("/demo/analytics?source=stored")
        assert r.status_code == 200
        # Should still return data (falls back to test.csv)
        assert r.json()["total_records"] > 0


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo/model-cards
# ═══════════════════════════════════════════════════════════════════════════════


class TestModelCards:
    async def test_returns_all_pipelines(self, client):
        r = await client.get("/demo/model-cards")
        assert r.status_code == 200
        body = r.json()
        for pipeline in ("risk", "employment", "revenue"):
            assert pipeline in body

    async def test_risk_card_structure(self, client):
        r = await client.get("/demo/model-cards")
        risk = r.json()["risk"]
        assert risk["pipeline"].lower() == "risk"
        assert "description" in risk
        assert "purpose" in risk
        assert "what_it_predicts" in risk
        assert "num_models" in risk
        assert risk["num_models"] > 0
        assert "feature_count" in risk
        assert "features" in risk
        assert isinstance(risk["features"], list)
        assert "training_metrics" in risk
        assert "models" in risk

    async def test_employment_card_structure(self, client):
        r = await client.get("/demo/model-cards")
        emp = r.json()["employment"]
        assert emp["pipeline"].lower() == "employment"
        assert "models" in emp
        assert emp["num_models"] > 0

    async def test_revenue_card_structure(self, client):
        r = await client.get("/demo/model-cards")
        rev = r.json()["revenue"]
        assert rev["pipeline"].lower() == "revenue"
        assert "models" in rev
        assert rev["num_models"] > 0

    async def test_model_details(self, client):
        r = await client.get("/demo/model-cards")
        for pipeline in ("risk", "employment", "revenue"):
            models = r.json()[pipeline]["models"]
            assert len(models) > 0
            for model in models:
                assert "name" in model
                assert "target" in model
                assert "horizon" in model
                assert "type" in model
                assert "feature_count" in model

    async def test_metric_explanations(self, client):
        r = await client.get("/demo/model-cards")
        for pipeline in ("risk", "employment", "revenue"):
            card = r.json()[pipeline]
            assert "metric_explanations" in card
            assert isinstance(card["metric_explanations"], dict)


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo/documentation
# ═══════════════════════════════════════════════════════════════════════════════


class TestDocumentation:
    async def test_returns_all_docs(self, client):
        r = await client.get("/demo/documentation")
        assert r.status_code == 200
        body = r.json()
        for key in ("overview", "risk", "employment", "revenue"):
            assert key in body

    async def test_docs_are_strings(self, client):
        r = await client.get("/demo/documentation")
        body = r.json()
        for key in ("overview", "risk", "employment", "revenue"):
            # Each doc should be a string (markdown) or None
            assert body[key] is None or isinstance(body[key], str)

    async def test_docs_contain_markdown(self, client):
        r = await client.get("/demo/documentation")
        body = r.json()
        # At least the overview should have content
        if body["overview"]:
            assert "#" in body["overview"]  # markdown heading


# ═══════════════════════════════════════════════════════════════════════════════
# GET /demo/ai-insights  — RAG Agent
# ═══════════════════════════════════════════════════════════════════════════════


class TestAiInsights:
    async def test_returns_all_insights(self, client):
        r = await client.get("/demo/ai-insights")
        assert r.status_code == 200
        body = r.json()
        expected_sections = {
            "dashboard_kpi",
            "dashboard_distributions",
            "dashboard_statistics",
            "dashboard_correlation",
            "risk_single",
            "risk_batch",
            "employment_single",
            "employment_batch",
            "revenue_single",
            "revenue_batch",
            "profile_overview",
            "model_cards",
        }
        assert expected_sections <= set(body.keys())

    async def test_insight_structure(self, client):
        r = await client.get("/demo/ai-insights")
        body = r.json()
        for key, insight in body.items():
            assert "title" in insight
            assert "insight" in insight
            assert "section" in insight
            assert "agent" in insight
            assert insight["agent"] == "ews-rag-v1"
            assert insight["section"] == key

    async def test_single_section_query(self, client):
        r = await client.get("/demo/ai-insights?section=dashboard_kpi")
        assert r.status_code == 200
        body = r.json()
        assert body["section"] == "dashboard_kpi"
        assert "title" in body
        assert "insight" in body

    async def test_nonexistent_section_returns_404(self, client):
        r = await client.get("/demo/ai-insights?section=nonexistent")
        assert r.status_code == 404

    @pytest.mark.parametrize(
        "section",
        [
            "dashboard_kpi",
            "risk_single",
            "employment_batch",
            "revenue_single",
            "profile_overview",
            "model_cards",
        ],
    )
    async def test_each_section_accessible(self, client, section):
        r = await client.get(f"/demo/ai-insights?section={section}")
        assert r.status_code == 200
        assert r.json()["section"] == section
