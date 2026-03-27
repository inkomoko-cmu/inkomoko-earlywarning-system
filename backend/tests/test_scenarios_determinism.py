from __future__ import annotations

import asyncio
from datetime import date
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.crud import scenario as scenario_crud
from app.ml.simulator import _pressure, simulate_target


class FakeSession:
    def __init__(self):
        self.added_rows = []

    def add_all(self, rows):
        self.added_rows.extend(rows)

    async def commit(self):
        return None

    async def refresh(self, _):
        return None


def _result_signature(rows):
    return sorted(
        (
            r.enterprise_id,
            r.target_key,
            float(r.baseline_value) if r.baseline_value is not None else None,
            float(r.scenario_value) if r.scenario_value is not None else None,
            float(r.delta_value) if r.delta_value is not None else None,
            r.baseline_label,
            r.scenario_label,
        )
        for r in rows
    )


def test_pressure_is_deterministic():
    params = {
        "inflation": 18,
        "fxDepreciation": 14,
        "fundingCut": 10,
        "conflictDisruption": 6,
    }
    first = _pressure(params)
    second = _pressure(params)
    assert first == second
    assert first == pytest.approx(0.248)


def test_simulate_target_is_deterministic_for_same_input():
    params = {
        "inflation": 20,
        "fxDepreciation": 15,
        "fundingCut": 0,
        "conflictDisruption": 0,
    }
    first = simulate_target("revenue", 1200.0, None, params)
    second = simulate_target("revenue", 1200.0, None, params)
    assert first == second


def test_execute_deterministic_run_same_inputs_same_values(monkeypatch):
    enterprise_id = uuid4()
    baseline_rows = [
        SimpleNamespace(
            enterprise_id=enterprise_id,
            target_key="revenue",
            predicted_value=1000.0,
            predicted_label=None,
        ),
        SimpleNamespace(
            enterprise_id=enterprise_id,
            target_key="risk_tier",
            predicted_value=None,
            predicted_label="MEDIUM",
        ),
    ]

    async def fake_fetch(*_args, **_kwargs):
        return baseline_rows

    monkeypatch.setattr(scenario_crud, "fetch_baseline_predictions", fake_fetch)

    scenario = SimpleNamespace(
        parameters={
            "inflation": 18,
            "fxDepreciation": 14,
            "fundingCut": 10,
            "conflictDisruption": 6,
        }
    )

    run_one = SimpleNamespace(
        sim_run_id=uuid4(),
        model_version_id=None,
        scope={},
        run_status="running",
        finished_at=None,
    )
    run_two = SimpleNamespace(
        sim_run_id=uuid4(),
        model_version_id=None,
        scope={},
        run_status="running",
        finished_at=None,
    )

    db_one = FakeSession()
    db_two = FakeSession()

    completed_one, count_one = asyncio.run(
        scenario_crud.execute_deterministic_run(
            db_one,
            run=run_one,
            scenario=scenario,
            horizon="3m",
            as_of_date=date(2026, 3, 1),
            target_keys=["revenue", "risk_tier"],
        )
    )
    completed_two, count_two = asyncio.run(
        scenario_crud.execute_deterministic_run(
            db_two,
            run=run_two,
            scenario=scenario,
            horizon="3m",
            as_of_date=date(2026, 3, 1),
            target_keys=["revenue", "risk_tier"],
        )
    )

    assert completed_one.run_status == "succeeded"
    assert completed_two.run_status == "succeeded"
    assert count_one == count_two == 2
    assert _result_signature(db_one.added_rows) == _result_signature(db_two.added_rows)


def test_normalize_scope_supports_country_program_cohort_and_enterprise_ids():
    enterprise_id = uuid4()
    program_id = uuid4()
    cohort_id = uuid4()

    normalized = scenario_crud._normalize_scope(
        {
            "country_code": " rw ",
            "program_id": str(program_id),
            "cohort_id": str(cohort_id),
            "enterprise_ids": [str(enterprise_id), str(enterprise_id), "bad-id"],
        }
    )

    assert normalized["country_code"] == "RW"
    assert normalized["program_id"] == program_id
    assert normalized["cohort_id"] == cohort_id
    assert normalized["enterprise_ids"] == [enterprise_id]
