from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.simulator import simulate_target
from app.models.simulation import MLPrediction, SimResult, SimRun, SimScenario


async def create_scenario(
    db: AsyncSession,
    *,
    scenario_name: str,
    scenario_type: str,
    description: str | None,
    parameters: dict,
    created_by: str | None,
) -> SimScenario:
    row = SimScenario(
        scenario_name=scenario_name,
        scenario_type=scenario_type,
        description=description,
        parameters=parameters,
        created_by=created_by,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_scenarios(db: AsyncSession) -> list[SimScenario]:
    res = await db.execute(select(SimScenario).order_by(desc(SimScenario.created_at)))
    return list(res.scalars().all())


async def get_scenario(db: AsyncSession, scenario_id: UUID) -> SimScenario | None:
    res = await db.execute(
        select(SimScenario).where(SimScenario.scenario_id == scenario_id)
    )
    return res.scalar_one_or_none()


async def delete_scenario(db: AsyncSession, scenario: SimScenario) -> None:
    await db.delete(scenario)
    await db.commit()


async def create_run(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    model_version_id: UUID | None,
    scope: dict,
    notes: str | None,
) -> SimRun:
    run = SimRun(
        scenario_id=scenario_id,
        model_version_id=model_version_id,
        scope=scope,
        notes=notes,
        run_status="running",
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)
    return run


async def mark_run_failed(db: AsyncSession, run: SimRun, message: str) -> SimRun:
    run.run_status = "failed"
    run.notes = message
    run.finished_at = datetime.utcnow()
    await db.commit()
    await db.refresh(run)
    return run


async def fetch_baseline_predictions(
    db: AsyncSession,
    *,
    horizon: str,
    as_of_date: date | None,
    model_version_id: UUID | None,
    target_keys: list[str] | None,
    scope: dict,
) -> list[MLPrediction]:
    stmt = select(MLPrediction).where(MLPrediction.horizon == horizon)

    if as_of_date is not None:
        stmt = stmt.where(MLPrediction.as_of_date == as_of_date)
    if model_version_id is not None:
        stmt = stmt.where(MLPrediction.model_version_id == model_version_id)
    if target_keys:
        stmt = stmt.where(MLPrediction.target_key.in_(target_keys))

    enterprise_ids = scope.get("enterprise_ids") if isinstance(scope, dict) else None
    if enterprise_ids:
        stmt = stmt.where(MLPrediction.enterprise_id.in_(enterprise_ids))

    stmt = stmt.order_by(
        MLPrediction.enterprise_id,
        MLPrediction.target_key,
        desc(MLPrediction.as_of_date),
        desc(MLPrediction.created_at),
    )

    rows = (await db.execute(stmt)).scalars().all()
    latest: dict[tuple[UUID, str], MLPrediction] = {}
    for row in rows:
        key = (row.enterprise_id, row.target_key)
        if key not in latest:
            latest[key] = row
    return list(latest.values())


async def execute_deterministic_run(
    db: AsyncSession,
    *,
    run: SimRun,
    scenario: SimScenario,
    horizon: str,
    as_of_date: date | None,
    target_keys: list[str] | None,
) -> tuple[SimRun, int]:
    baseline_rows = await fetch_baseline_predictions(
        db,
        horizon=horizon,
        as_of_date=as_of_date,
        model_version_id=run.model_version_id,
        target_keys=target_keys,
        scope=run.scope or {},
    )

    if not baseline_rows:
        updated = await mark_run_failed(db, run, "No baseline predictions found")
        return updated, 0

    result_rows: list[SimResult] = []
    for pred in baseline_rows:
        baseline_value = (
            float(pred.predicted_value) if pred.predicted_value is not None else None
        )
        scenario_base, scenario_value, scenario_label = simulate_target(
            pred.target_key,
            baseline_value,
            pred.predicted_label,
            scenario.parameters,
        )
        delta = None
        if scenario_base is not None and scenario_value is not None:
            delta = float(scenario_value - scenario_base)

        result_rows.append(
            SimResult(
                sim_run_id=run.sim_run_id,
                enterprise_id=pred.enterprise_id,
                target_key=pred.target_key,
                baseline_value=scenario_base,
                scenario_value=scenario_value,
                delta_value=delta,
                baseline_label=pred.predicted_label,
                scenario_label=scenario_label,
            )
        )

    db.add_all(result_rows)
    run.run_status = "succeeded"
    run.finished_at = datetime.utcnow()
    await db.commit()
    await db.refresh(run)
    return run, len(result_rows)


async def get_run_with_results(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    sim_run_id: UUID,
) -> tuple[SimRun | None, list[SimResult]]:
    run_res = await db.execute(
        select(SimRun).where(
            and_(
                SimRun.sim_run_id == sim_run_id,
                SimRun.scenario_id == scenario_id,
            )
        )
    )
    run = run_res.scalar_one_or_none()
    if run is None:
        return None, []

    result_res = await db.execute(
        select(SimResult)
        .where(SimResult.sim_run_id == sim_run_id)
        .order_by(SimResult.target_key)
    )
    return run, list(result_res.scalars().all())
