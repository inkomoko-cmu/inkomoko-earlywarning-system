from __future__ import annotations

import asyncio
from datetime import datetime
from types import SimpleNamespace
from uuid import UUID, uuid4

from app.api.routes import scenarios as scenarios_route
from app.schemas.scenario import ScenarioCreateRequest, ScenarioParams, SimulationRunRequest


def test_create_run_and_get_results_persistence_flow(monkeypatch):
    state = {
        "scenarios": {},
        "runs": {},
        "results": {},
    }

    async def fake_create_scenario(
        _db,
        *,
        scenario_name,
        scenario_type,
        description,
        parameters,
        created_by,
    ):
        scenario_id = uuid4()
        scenario = SimpleNamespace(
            scenario_id=scenario_id,
            scenario_name=scenario_name,
            scenario_type=scenario_type,
            description=description,
            parameters=parameters,
            created_by=created_by,
            created_at=datetime.utcnow(),
        )
        state["scenarios"][scenario_id] = scenario
        return scenario

    async def fake_get_scenario(_db, scenario_id):
        return state["scenarios"].get(scenario_id)

    async def fake_create_run(_db, *, scenario_id, model_version_id, scope, notes):
        run = SimpleNamespace(
            sim_run_id=uuid4(),
            scenario_id=scenario_id,
            model_version_id=model_version_id,
            scope=scope,
            notes=notes,
            run_status="running",
            started_at=datetime.utcnow(),
            finished_at=None,
        )
        state["runs"][run.sim_run_id] = run
        return run

    async def fake_execute_deterministic_run(_db, *, run, scenario, horizon, as_of_date, target_keys):
        _ = (scenario, horizon, as_of_date, target_keys)
        enterprise_ids = run.scope.get("enterprise_ids") or [uuid4()]
        first_id = UUID(str(enterprise_ids[0]))

        rows = [
            SimpleNamespace(
                sim_run_id=run.sim_run_id,
                enterprise_id=first_id,
                target_key="revenue",
                baseline_value=1000.0,
                scenario_value=860.0,
                delta_value=-140.0,
                baseline_label=None,
                scenario_label=None,
            ),
            SimpleNamespace(
                sim_run_id=run.sim_run_id,
                enterprise_id=first_id,
                target_key="risk_tier",
                baseline_value=2.0,
                scenario_value=3.0,
                delta_value=1.0,
                baseline_label="MEDIUM",
                scenario_label="HIGH",
            ),
        ]
        state["results"][run.sim_run_id] = rows

        run.run_status = "succeeded"
        run.finished_at = datetime.utcnow()
        return run, len(rows)

    async def fake_get_run_with_results(_db, *, scenario_id, sim_run_id):
        run = state["runs"].get(sim_run_id)
        if run is None or run.scenario_id != scenario_id:
            return None, []
        return run, state["results"].get(sim_run_id, [])

    monkeypatch.setattr(scenarios_route, "create_scenario", fake_create_scenario)
    monkeypatch.setattr(scenarios_route, "get_scenario", fake_get_scenario)
    monkeypatch.setattr(scenarios_route, "create_run", fake_create_run)
    monkeypatch.setattr(scenarios_route, "execute_deterministic_run", fake_execute_deterministic_run)
    monkeypatch.setattr(scenarios_route, "get_run_with_results", fake_get_run_with_results)

    db = object()
    current = (SimpleNamespace(email="admin@admin.com"), ["admin"])

    created = asyncio.run(
        scenarios_route.create_scenario_endpoint(
            ScenarioCreateRequest(
                scenario_name="Integration Flow Scenario",
                scenario_type="shock",
                description="Test scenario",
                parameters=ScenarioParams(
                    inflation=18,
                    fxDepreciation=12,
                    fundingCut=8,
                    conflictDisruption=5,
                ),
            ),
            current=current,
            db=db,
        )
    )

    enterprise_id = str(uuid4())
    run_payload = SimulationRunRequest(
        horizon="3m",
        target_keys=["risk_tier", "revenue"],
        scope={
            "country_code": "RW",
            "program_id": str(uuid4()),
            "cohort_id": str(uuid4()),
            "enterprise_ids": [enterprise_id],
        },
        notes="Integration run",
    )

    run = asyncio.run(
        scenarios_route.run_scenario_endpoint(
            UUID(str(created.scenario_id)),
            run_payload,
            _current=current,
            db=db,
        )
    )

    assert run.run_status == "succeeded"
    assert run.result_count == 2

    persisted_scope = state["runs"][UUID(str(run.sim_run_id))].scope
    assert persisted_scope["country_code"] == "RW"
    assert persisted_scope["program_id"] == run_payload.scope.program_id
    assert persisted_scope["cohort_id"] == run_payload.scope.cohort_id
    assert persisted_scope["enterprise_ids"] == [UUID(enterprise_id)]

    details = asyncio.run(
        scenarios_route.get_run_results_endpoint(
            UUID(str(created.scenario_id)),
            UUID(str(run.sim_run_id)),
            _current=current,
            db=db,
        )
    )

    assert details.result_count == 2
    assert {r.target_key for r in details.results} == {"risk_tier", "revenue"}
    assert {str(r.enterprise_id) for r in details.results} == {enterprise_id}

    second_run = asyncio.run(
        scenarios_route.run_scenario_endpoint(
            UUID(str(created.scenario_id)),
            run_payload,
            _current=current,
            db=db,
        )
    )
    second_details = asyncio.run(
        scenarios_route.get_run_results_endpoint(
            UUID(str(created.scenario_id)),
            UUID(str(second_run.sim_run_id)),
            _current=current,
            db=db,
        )
    )

    first_values = sorted(
        (r.target_key, r.baseline_value, r.scenario_value, r.delta_value, r.scenario_label)
        for r in details.results
    )
    second_values = sorted(
        (r.target_key, r.baseline_value, r.scenario_value, r.delta_value, r.scenario_label)
        for r in second_details.results
    )
    assert first_values == second_values
