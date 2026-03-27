from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db, require_roles
from app.crud.scenario import (
    compare_runs,
    create_run,
    create_scenario,
    delete_all_runs_for_scenario,
    delete_run_for_scenario,
    delete_scenario,
    ensure_default_scenarios,
    execute_deterministic_run,
    get_run_enterprise_impacts,
    get_run_with_results,
    get_scenario,
    list_runs_for_scenario,
    list_scenarios,
    update_scenario,
)
from app.schemas.scenario import (
    ScenarioCreateRequest,
    ScenarioResponse,
    ScenarioUpdateRequest,
    RiskDistribution,
    SimulationComparisonResponse,
    SimulationEnterpriseImpactItem,
    SimulationEnterpriseImpactResponse,
    SimulationResultItem,
    SimulationResultResponse,
    SimulationRunListItem,
    SimulationRunListResponse,
    SimulationRunBulkDeleteResponse,
    SimulationRunDeleteResponse,
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
        created_at=row.created_at or datetime.now(timezone.utc),
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
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_scenarios(db)
    if not rows:
        rows = await ensure_default_scenarios(db)
    return [_to_scenario_response(r) for r in rows]


@router.get("/{scenario_id}", response_model=ScenarioResponse)
async def get_scenario_endpoint(
    scenario_id: UUID,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    row = await get_scenario(db, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return _to_scenario_response(row)


@router.patch(
    "/{scenario_id}",
    response_model=ScenarioResponse,
    dependencies=[Depends(require_roles("admin"))],
)
async def update_scenario_endpoint(
    scenario_id: UUID,
    payload: ScenarioUpdateRequest,
    _current=Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    row = await get_scenario(db, scenario_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    row = await update_scenario(
        db,
        scenario=row,
        scenario_name=payload.scenario_name,
        scenario_type=payload.scenario_type,
        description=payload.description,
        parameters=payload.parameters.model_dump() if payload.parameters else None,
    )
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
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    run = await create_run(
        db,
        scenario_id=scenario.scenario_id,
        model_version_id=payload.model_version_id,
        scope=payload.scope.model_dump(exclude_none=True),
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
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    run, results = await get_run_with_results(
        db,
        scenario_id=scenario_id,
        sim_run_id=sim_run_id,
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")

    # Compute risk distribution from risk_tier results
    baseline_risk: dict[str, int] = {}
    scenario_risk: dict[str, int] = {}
    for row in results:
        key = row.target_key.strip().lower()
        for suffix in ("_1m", "_3m", "_6m", "_12m"):
            if key.endswith(suffix):
                key = key[: -len(suffix)]
                break
        if key == "risk_tier":
            bl = (row.baseline_label or "MEDIUM").upper()
            sl = (row.scenario_label or "MEDIUM").upper()
            baseline_risk[bl] = baseline_risk.get(bl, 0) + 1
            scenario_risk[sl] = scenario_risk.get(sl, 0) + 1
    risk_dist = RiskDistribution(baseline=baseline_risk, scenario=scenario_risk)

    return SimulationResultResponse(
        sim_run_id=run.sim_run_id,
        scenario_id=run.scenario_id,
        run_status=run.run_status,
        started_at=run.started_at,
        finished_at=run.finished_at,
        horizon=horizon,
        result_count=len(results),
        enterprise_count=int((run.scope or {}).get("enterprise_count", 0)),
        risk_distribution=risk_dist,
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


@router.get("/{scenario_id}/runs", response_model=SimulationRunListResponse)
async def list_runs_endpoint(
    scenario_id: UUID,
    limit: int = 20,
    offset: int = 0,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func, select

    from app.models.simulation import SimResult

    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    total, rows = await list_runs_for_scenario(
        db,
        scenario_id=scenario_id,
        limit=max(1, min(limit, 200)),
        offset=max(0, offset),
    )

    run_ids = [row.sim_run_id for row in rows]
    counts_map: dict[UUID, int] = {}
    if run_ids:
        counts_res = await db.execute(
            select(SimResult.sim_run_id, func.count())
            .where(SimResult.sim_run_id.in_(run_ids))
            .group_by(SimResult.sim_run_id)
        )
        counts_map = {row[0]: int(row[1]) for row in counts_res.all()}

    return SimulationRunListResponse(
        scenario_id=scenario_id,
        total=total,
        runs=[
            SimulationRunListItem(
                sim_run_id=row.sim_run_id,
                scenario_id=row.scenario_id,
                run_status=row.run_status,
                started_at=row.started_at,
                finished_at=row.finished_at,
                result_count=counts_map.get(row.sim_run_id, 0),
                notes=row.notes,
                scope=row.scope or {},
            )
            for row in rows
        ],
    )


@router.delete("/{scenario_id}/runs/{sim_run_id}", response_model=SimulationRunDeleteResponse)
async def delete_run_endpoint(
    scenario_id: UUID,
    sim_run_id: UUID,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    exists, deleted_runs, deleted_results = await delete_run_for_scenario(
        db,
        scenario_id=scenario_id,
        sim_run_id=sim_run_id,
    )
    if not exists:
        raise HTTPException(status_code=404, detail="Simulation run not found")

    return SimulationRunDeleteResponse(
        scenario_id=scenario_id,
        sim_run_id=sim_run_id,
        deleted_runs=deleted_runs,
        deleted_results=deleted_results,
    )


@router.delete("/{scenario_id}/runs", response_model=SimulationRunBulkDeleteResponse)
async def delete_all_runs_endpoint(
    scenario_id: UUID,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        raise HTTPException(status_code=404, detail="Scenario not found")

    deleted_runs, deleted_results = await delete_all_runs_for_scenario(
        db,
        scenario_id=scenario_id,
    )

    return SimulationRunBulkDeleteResponse(
        scenario_id=scenario_id,
        deleted_runs=deleted_runs,
        deleted_results=deleted_results,
    )


@router.get(
    "/{scenario_id}/runs/{sim_run_id}/enterprises",
    response_model=SimulationEnterpriseImpactResponse,
)
async def get_run_enterprises_endpoint(
    scenario_id: UUID,
    sim_run_id: UUID,
    limit: int = 100,
    offset: int = 0,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    run, total, impacts = await get_run_enterprise_impacts(
        db,
        scenario_id=scenario_id,
        sim_run_id=sim_run_id,
        limit=max(1, min(limit, 500)),
        offset=max(0, offset),
    )
    if run is None:
        raise HTTPException(status_code=404, detail="Simulation run not found")

    return SimulationEnterpriseImpactResponse(
        sim_run_id=sim_run_id,
        scenario_id=scenario_id,
        total=total,
        impacts=[SimulationEnterpriseImpactItem(**row) for row in impacts],
    )


@router.get("/{scenario_id}/compare", response_model=SimulationComparisonResponse)
async def compare_runs_endpoint(
    scenario_id: UUID,
    run_a: UUID,
    run_b: UUID,
    top_n: int = 20,
    _current=Depends(require_roles("admin", "program_manager")),
    db: AsyncSession = Depends(get_db),
):
    result = await compare_runs(
        db,
        scenario_id=scenario_id,
        run_a_id=run_a,
        run_b_id=run_b,
        top_n=max(1, min(top_n, 100)),
    )
    if result is None:
        raise HTTPException(status_code=404, detail="One or both runs not found")

    return SimulationComparisonResponse(
        scenario_id=scenario_id,
        run_a_id=run_a,
        run_b_id=run_b,
        run_a=result["run_a"],
        run_b=result["run_b"],
        delta=result["delta"],
        top_movers=result["top_movers"],
    )
