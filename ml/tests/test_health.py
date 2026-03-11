"""Tests for the /health and /models/*/info endpoints."""

from __future__ import annotations

import pytest


class TestHealth:
    """GET /health — liveness probe."""

    async def test_health_returns_ok(self, client):
        r = await client.get("/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "version" in body

    async def test_health_version_matches_settings(self, client):
        from app.config import get_settings

        r = await client.get("/health")
        assert r.json()["version"] == get_settings().app_version


class TestModelInfo:
    """GET /models/{pipeline}/info — feature metadata."""

    @pytest.mark.parametrize("pipeline", ["risk", "employment", "revenue"])
    async def test_model_info_returns_features(self, client, pipeline):
        r = await client.get(f"/models/{pipeline}/info")
        assert r.status_code == 200
        body = r.json()
        assert body["pipeline"] == pipeline
        assert body["feature_count"] > 0
        assert isinstance(body["features"], list)
        assert len(body["features"]) == body["feature_count"]

    async def test_model_info_nonexistent_pipeline(self, client):
        r = await client.get("/models/nonexistent/info")
        assert r.status_code in (404, 422)
