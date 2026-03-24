from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.crud.scenario import (
    create_run,
    create_scenario,
    delete_scenario,
    execute_deterministic_run,
    get_run_with_results,
    get_scenario,
    list_scenarios,
)
from app.schemas.scenario import (
    ScenarioCreateRequest,
    ScenarioResponse,
    SimulationResultItem,
    SimulationResultResponse,
    SimulationRunRequest,
    SimulationRunResponse,
)

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def _to_scenario_response(row) -> ScenarioResponse:
    return ScenarioResponse(
        scenario_id=row.scenario_id,
        scenario_name=row.scenario_name,
        scenario_type=row.scenario_type,
        description=row.description,
        parameters=row.parameters,
        created_by=row.created_by,
        created_at=row.created_at,
    )


@router.post(
    "", response_model=ScenarioResponse, dependencies=[Depends(require_roles("admin"))]
)
async def create_scenario_endpoint(
    payload: ScenarioCreateRequest,
    current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    user, _ = current
    created_by = user.email if user else None
    row = await create_scenario(
        db,
        scenario_name=payload.scenario_name,
        scenario_type=payload.scenario_type,
        description=payload.description,
        parameters=payload.parameters.model_dump(),
        created_by=created_by,
    )
    return _to_scenario_response(row)


@router.get("", response_model=list[ScenarioResponse])
async def list_scenarios_endpoint(
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_scenarios(db)
    return [_to_scenario_response(r) for r in rows]


@router.get("/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario_endpoint(
    scenario_id: UUID,
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    row = await get_scenario(db, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _to_scenario_response(row)


@router.delete("/{scenario_id}")
async def delete_scenario_endpoint(
    scenario_id: UUID,
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    row = await get_scenario(db, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    await delete_scenario(db, row)
    return {"status": "deleted", "scenario_id": scenario_id}


@router.post("/{scenario_id}/run", response_model=SimulationRunResponse)
async def run_scenario_endpoint(
    scenario_id: UUID,
    payload: SimulationRunRequest,
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    run = await create_run(
        db,
        scenario_id=scenario.scenario_id,
        model_version_id=payload.model_version_id,
        scope=payload.scope,
        notes=payload.notes,
    )
    run, count = await execute_deterministic_run(
        db,
        run=run,
        scenario=scenario,
        horizon=payload.horizon,
        as_of_date=payload.as_of_date,
        target_keys=payload.target_keys,
    )

    return SimulationRunResponse(
        sim_run_id=run.sim_run_id,
        scenario_id=run.scenario_id,
        run_status=run.run_status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        result_count=count,
        notes=run.notes,
    )


@router.get("/{scenario_id}/runs/{sim_run_id}", response_model=SimulationResultResponse)
async def get_run_results_endpoint(
    scenario_id: UUID,
    sim_run_id: UUID,
    horizon: str = "3m",
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    run, results = await get_run_with_results(
        db,
        scenario_id=scenario_id,
        sim_run_id=sim_run_id,
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")

    return SimulationResultResponse(
        sim_run_id=run.sim_run_id,
        scenario_id=run.scenario_id,
        run_status=run.run_status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        horizon=horizon,
        result_count=len(results),
        results=[
            SimulationResultItem(
                enterprise_id=row.enterprise_id,
                target_key=row.target_key,
                baseline_value=(
                    float(row.baseline_value)
                    if row.baseline_value is not None
                    else None
                ),
                scenario_value=(
                    float(row.scenario_value)
                    if row.scenario_value is not None
                    else None
                ),
                delta_value=(
                    float(row.delta_value) if row.delta_value is not None else None
                ),
                baseline_label=row.baseline_label,
                scenario_label=row.scenario_label,
            )
            for row in results
        ],
    )
