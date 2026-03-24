from __future__ import annotations

import asyncio
from types import SimpleNamespace
from uuid import uuid4

from app.api.routes import scenarios as scenarios_route


class _FakeSession:
    pass


def test_list_scenarios_seeds_defaults_when_empty(monkeypatch):
    seeded_rows = [
        SimpleNamespace(
            scenario_id=uuid4(),
            scenario_name="Baseline",
            scenario_type="shock",
            description="seeded",
            parameters={"inflation": 6, "fxDepreciation": 4, "fundingCut": 0, "conflictDisruption": 0},
            created_by="system",
            created_at=None,
        )
    ]

    state = {"calls": 0}

    async def fake_list_scenarios(_db):
        state["calls"] += 1
        return [] if state["calls"] == 1 else seeded_rows

    async def fake_ensure_default_scenarios(_db):
        return seeded_rows

    monkeypatch.setattr(scenarios_route, "list_scenarios", fake_list_scenarios)
    monkeypatch.setattr(scenarios_route, "ensure_default_scenarios", fake_ensure_default_scenarios)

    result = asyncio.run(
        scenarios_route.list_scenarios_endpoint(
            _current=(SimpleNamespace(email="admin@admin.com"), ["admin"]),
            db=_FakeSession(),
        )
    )

    assert len(result) == 1
    assert result[0].scenario_name == "Baseline"
