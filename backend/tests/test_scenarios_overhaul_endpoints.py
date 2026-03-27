from __future__ import annotations

import asyncio
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

from fastapi import HTTPException

from app.api.routes import scenarios as scenarios_route
from app.schemas.scenario import ScenarioUpdateRequest


class _FakeExecuteResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class _FakeSession:
    def __init__(self, count_rows=None):
        self.count_rows = count_rows or []

    async def execute(self, _query):
        return _FakeExecuteResult(self.count_rows)


def test_update_scenario_endpoint_updates_fields(monkeypatch):
    scenario_id = uuid4()
    row = SimpleNamespace(
        scenario_id=scenario_id,
        scenario_name="Original",
        scenario_type="shock",
        description="old",
        parameters={
            "inflation": 0,
            "fxDepreciation": 0,
            "fundingCut": 0,
            "conflictDisruption": 0,
        },
        created_by="admin@admin.com",
        created_at=datetime.utcnow(),
    )

    async def fake_get_scenario(_db, requested_id):
        return row if requested_id == scenario_id else None

    async def fake_update_scenario(_db, *, scenario, **updates):
        for key, value in updates.items():
            if value is not None:
                setattr(scenario, key, value)
        return scenario

    monkeypatch.setattr(scenarios_route, "get_scenario", fake_get_scenario)
    monkeypatch.setattr(scenarios_route, "update_scenario", fake_update_scenario)

    updated = asyncio.run(
        scenarios_route.update_scenario_endpoint(
            scenario_id,
            ScenarioUpdateRequest(
                scenario_name="Updated Name",
                description="new",
            ),
            _current=(SimpleNamespace(email="admin@admin.com"), ["admin"]),
            db=_FakeSession(),
        )
    )

    assert updated.scenario_name == "Updated Name"
    assert updated.description == "new"


def test_list_runs_endpoint_returns_counts(monkeypatch):
    scenario_id = uuid4()
    run_id = uuid4()

    async def fake_get_scenario(_db, requested_id):
        return SimpleNamespace(scenario_id=requested_id) if requested_id == scenario_id else None

    async def fake_list_runs_for_scenario(_db, *, scenario_id, limit, offset):
        _ = (limit, offset)
        return 1, [
            SimpleNamespace(
                sim_run_id=run_id,
                scenario_id=scenario_id,
                run_status="succeeded",
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow(),
                notes="ok",
                scope={"country_code": "RW"},
            )
        ]

    monkeypatch.setattr(scenarios_route, "get_scenario", fake_get_scenario)
    monkeypatch.setattr(scenarios_route, "list_runs_for_scenario", fake_list_runs_for_scenario)

    result = asyncio.run(
        scenarios_route.list_runs_endpoint(
            scenario_id,
            _current=(SimpleNamespace(email="admin@admin.com"), ["admin"]),
            db=_FakeSession(count_rows=[(run_id, 4)]),
        )
    )

    assert result.total == 1
    assert len(result.runs) == 1
    assert result.runs[0].result_count == 4


def test_get_run_enterprises_endpoint_returns_impacts(monkeypatch):
    scenario_id = uuid4()
    run_id = uuid4()
    enterprise_id = uuid4()

    async def fake_get_run_enterprise_impacts(
        _db,
        *,
        scenario_id,
        sim_run_id,
        limit,
        offset,
    ):
        _ = (limit, offset)
        return (
            SimpleNamespace(sim_run_id=sim_run_id, scenario_id=scenario_id),
            1,
            [
                {
                    "enterprise_id": enterprise_id,
                    "baseline_risk_label": "MEDIUM",
                    "scenario_risk_label": "HIGH",
                    "baseline_revenue": 100.0,
                    "scenario_revenue": 90.0,
                    "revenue_delta": -10.0,
                    "baseline_jobs_net": 4.0,
                    "scenario_jobs_net": 2.0,
                    "jobs_net_delta": -2.0,
                }
            ],
        )

    monkeypatch.setattr(
        scenarios_route,
        "get_run_enterprise_impacts",
        fake_get_run_enterprise_impacts,
    )

    result = asyncio.run(
        scenarios_route.get_run_enterprises_endpoint(
            scenario_id,
            run_id,
            _current=(SimpleNamespace(email="pm@pm.com"), ["program_manager"]),
            db=_FakeSession(),
        )
    )

    assert result.total == 1
    assert result.impacts[0].enterprise_id == enterprise_id
    assert result.impacts[0].scenario_risk_label == "HIGH"


def test_compare_runs_endpoint_404_when_missing(monkeypatch):
    scenario_id = uuid4()
    run_a = uuid4()
    run_b = uuid4()

    async def fake_compare_runs(_db, *, scenario_id, run_a_id, run_b_id, top_n):
        _ = (scenario_id, run_a_id, run_b_id, top_n)
        return None

    monkeypatch.setattr(scenarios_route, "compare_runs", fake_compare_runs)

    try:
        asyncio.run(
            scenarios_route.compare_runs_endpoint(
                scenario_id,
                run_a=run_a,
                run_b=run_b,
                _current=(SimpleNamespace(email="pm@pm.com"), ["program_manager"]),
                db=_FakeSession(),
            )
        )
        raised = False
    except HTTPException as exc:
        raised = True
        assert exc.status_code == 404

    assert raised
