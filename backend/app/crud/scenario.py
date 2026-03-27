from __future__ import annotations

import logging
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import and_, delete, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ml.simulator import simulate_target
from app.models.business import ImpactData
from app.models.simulation import (
    DimEnterprise,
    FactKpiSnapshot,
    MLPrediction,
    SimResult,
    SimRun,
    SimScenario,
)

logger = logging.getLogger(__name__)

DEFAULT_SCENARIOS: list[dict] = [
    # ── Downside scenarios ──────────────────────────────────────
    {
        "scenario_name": "Baseline",
        "scenario_type": "downside",
        "description": "Reference baseline with mild macro pressure.",
        "parameters": {"inflation": 6, "fxDepreciation": 4, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Mild Inflation Uptick",
        "scenario_type": "downside",
        "description": "Moderate inflation increase with stable FX.",
        "parameters": {"inflation": 12, "fxDepreciation": 4, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Moderate Inflation + FX",
        "scenario_type": "downside",
        "description": "Elevated inflation paired with currency depreciation.",
        "parameters": {"inflation": 18, "fxDepreciation": 14, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Severe Inflation + FX",
        "scenario_type": "downside",
        "description": "Heavy inflation and significant FX depreciation.",
        "parameters": {"inflation": 30, "fxDepreciation": 22, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Mild Funding Cut",
        "scenario_type": "downside",
        "description": "Small reduction in external funding.",
        "parameters": {"inflation": 6, "fxDepreciation": 4, "fundingCut": 10, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Moderate Aid Reduction",
        "scenario_type": "downside",
        "description": "Significant contraction in donor funding.",
        "parameters": {"inflation": 9, "fxDepreciation": 6, "fundingCut": 25, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Severe Aid Withdrawal",
        "scenario_type": "downside",
        "description": "Major withdrawal of external aid and funding.",
        "parameters": {"inflation": 12, "fxDepreciation": 8, "fundingCut": 50, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Localised Conflict",
        "scenario_type": "downside",
        "description": "Low-intensity localised conflict disruption.",
        "parameters": {"inflation": 8, "fxDepreciation": 6, "fundingCut": 5, "conflictDisruption": 15},
    },
    {
        "scenario_name": "Regional Instability",
        "scenario_type": "downside",
        "description": "Broader regional instability with spillover effects.",
        "parameters": {"inflation": 14, "fxDepreciation": 12, "fundingCut": 15, "conflictDisruption": 30},
    },
    {
        "scenario_name": "Compound Crisis",
        "scenario_type": "downside",
        "description": "Combined inflation, FX, funding, and disruption stress.",
        "parameters": {"inflation": 22, "fxDepreciation": 16, "fundingCut": 30, "conflictDisruption": 15},
    },
    # ── Upside scenarios ────────────────────────────────────────
    {
        "scenario_name": "Baseline Recovery",
        "scenario_type": "upside",
        "description": "Marginal improvement in macro conditions.",
        "parameters": {"inflation": -2, "fxDepreciation": -1, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Disinflation Boost",
        "scenario_type": "upside",
        "description": "Notable drop in inflation easing business costs.",
        "parameters": {"inflation": -8, "fxDepreciation": -3, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Currency Strengthening",
        "scenario_type": "upside",
        "description": "Local currency appreciates, reducing import costs.",
        "parameters": {"inflation": -4, "fxDepreciation": -12, "fundingCut": 0, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Donor Surge (Small)",
        "scenario_type": "upside",
        "description": "Modest increase in external funding.",
        "parameters": {"inflation": 3, "fxDepreciation": 2, "fundingCut": -10, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Donor Surge (Large)",
        "scenario_type": "upside",
        "description": "Substantial new donor commitments flow in.",
        "parameters": {"inflation": 2, "fxDepreciation": 1, "fundingCut": -25, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Peace Dividend",
        "scenario_type": "upside",
        "description": "Ceasefire / peace deal reduces disruption and costs.",
        "parameters": {"inflation": -3, "fxDepreciation": -2, "fundingCut": -5, "conflictDisruption": -15},
    },
    {
        "scenario_name": "Post-Conflict Boom",
        "scenario_type": "upside",
        "description": "Strong recovery after sustained peace and reconstruction.",
        "parameters": {"inflation": -6, "fxDepreciation": -8, "fundingCut": -15, "conflictDisruption": -30},
    },
    {
        "scenario_name": "Green Growth Corridor",
        "scenario_type": "upside",
        "description": "Climate-smart investment unlocks new growth.",
        "parameters": {"inflation": -5, "fxDepreciation": -4, "fundingCut": -20, "conflictDisruption": -10},
    },
    {
        "scenario_name": "Export Boom",
        "scenario_type": "upside",
        "description": "Strong export demand strengthens currency and revenues.",
        "parameters": {"inflation": -3, "fxDepreciation": -15, "fundingCut": -5, "conflictDisruption": 0},
    },
    {
        "scenario_name": "Optimistic Convergence",
        "scenario_type": "upside",
        "description": "All macro factors improve simultaneously.",
        "parameters": {"inflation": -10, "fxDepreciation": -10, "fundingCut": -20, "conflictDisruption": -20},
    },
]

_HORIZON_SUFFIXES = ("_1m", "_3m", "_6m", "_12m")


class BaselinePredictionRow:
    """Wrapper to unify MLPrediction and ImpactData rows for scenario simulation."""
    
    def __init__(
        self,
        enterprise_id: UUID | str,
        target_key: str,
        predicted_value: float | None,
        predicted_label: str | None,
    ):
        if isinstance(enterprise_id, str):
            # ImpactData unique_ids don't exist in dim_enterprise;
            # keep enterprise_id=None for the DB FK, but remember the key.
            self.enterprise_id = None
            self.source_entity_key = enterprise_id
        else:
            self.enterprise_id = enterprise_id
            self.source_entity_key = str(enterprise_id)
        
        self.target_key = target_key
        self.predicted_value = predicted_value
        self.predicted_label = predicted_label


def _expand_target_keys(target_keys: list[str], horizon: str) -> set[str]:
    suffix = f"_{horizon.strip().lower()}"
    expanded: set[str] = set()
    for item in target_keys:
        raw = item.strip().lower()
        normalized = _normalize_target_key(raw)
        if not normalized:
            continue
        expanded.add(raw)
        expanded.add(normalized)
        expanded.add(f"{normalized}{suffix}")
    return expanded



def _normalize_target_key(target_key: str | None) -> str:
    if not target_key:
        return ""
    key = target_key.strip().lower()
    for suffix in _HORIZON_SUFFIXES:
        if key.endswith(suffix):
            return key[: -len(suffix)]
    return key


def _normalize_scope(scope: dict | None) -> dict:
    if not isinstance(scope, dict):
        return {}

    normalized: dict = {}

    country_code = scope.get("country_code")
    if isinstance(country_code, str) and country_code.strip():
        normalized["country_code"] = country_code.strip().upper()

    for key in ("program_id", "cohort_id"):
        value = scope.get(key)
        if value is None or value == "":
            continue
        try:
            normalized[key] = UUID(str(value))
        except (TypeError, ValueError):
            continue

    enterprise_ids = scope.get("enterprise_ids")
    if isinstance(enterprise_ids, list):
        deduped: list[UUID] = []
        seen: set[UUID] = set()
        for raw_id in enterprise_ids:
            try:
                ent_id = UUID(str(raw_id))
            except (TypeError, ValueError):
                continue
            if ent_id in seen:
                continue
            seen.add(ent_id)
            deduped.append(ent_id)
        if deduped:
            normalized["enterprise_ids"] = deduped

    return normalized


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


async def ensure_default_scenarios(db: AsyncSession) -> list[SimScenario]:
    existing = await list_scenarios(db)
    existing_names = {s.scenario_name for s in existing}

    new_rows = [
        SimScenario(
            scenario_name=item["scenario_name"],
            scenario_type=item["scenario_type"],
            description=item["description"],
            parameters=item["parameters"],
            created_by="system",
        )
        for item in DEFAULT_SCENARIOS
        if item["scenario_name"] not in existing_names
    ]
    if new_rows:
        db.add_all(new_rows)
        await db.commit()
        return await list_scenarios(db)
    return existing


async def get_scenario(db: AsyncSession, scenario_id: UUID) -> SimScenario | None:
    res = await db.execute(
        select(SimScenario).where(SimScenario.scenario_id == scenario_id)
    )
    return res.scalar_one_or_none()


async def delete_scenario(db: AsyncSession, scenario: SimScenario) -> None:
    await db.delete(scenario)
    await db.commit()


async def update_scenario(
    db: AsyncSession,
    *,
    scenario: SimScenario,
    scenario_name: str | None,
    scenario_type: str | None,
    description: str | None,
    parameters: dict | None,
) -> SimScenario:
    if scenario_name is not None:
        scenario.scenario_name = scenario_name
    if scenario_type is not None:
        scenario.scenario_type = scenario_type
    if description is not None:
        scenario.description = description
    if parameters is not None:
        scenario.parameters = parameters

    await db.commit()
    await db.refresh(scenario)
    return scenario


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
) -> list[BaselinePredictionRow]:
    """
    Fetch baseline predictions from the impact curated view.
    
    Maps target_keys to ImpactData columns (which only have 3m horizon data).
    Returns BaselinePredictionRow objects compatible with scenario simulation.
    """
    normalized_scope = _normalize_scope(scope)
    logger.debug(f"fetch_baseline_predictions: horizon={horizon}, target_keys={target_keys}, scope={normalized_scope}")
    
    # Start with base query
    stmt = select(ImpactData)
    
    # Add country filter if specified in scope
    country_code = normalized_scope.get("country_code")
    if country_code:
        stmt = stmt.where(ImpactData.country_code == country_code)
    
    # Order by recent survey_date first
    stmt = stmt.order_by(
        ImpactData.unique_id,
        desc(ImpactData.survey_date),
    )
    
    result = await db.execute(stmt)
    rows = result.scalars().all()
    logger.debug(f"fetch_baseline_predictions: Found {len(rows)} rows from ImpactData query")
    
    if not rows:
        logger.warning("fetch_baseline_predictions: No rows found in ImpactData")
        return []
    
    # Deduplicate by unique_id (keep latest survey_date)
    latest: dict[str, ImpactData] = {}
    for row in rows:
        if row.unique_id not in latest:
            latest[row.unique_id] = row
    
    logger.debug(f"fetch_baseline_predictions: Deduplicated to {len(latest)} unique enterprises")
    
    # Transform ImpactData rows to baseline predictions
    # Map target_keys to columns
    predictions: list[BaselinePredictionRow] = []
    
    # Normalized target keys to look for
    requested_keys = set()
    if target_keys:
        for key in target_keys:
            normalized = _normalize_target_key(key)
            if normalized:
                requested_keys.add(normalized)
    
    # If no specific keys requested, use all available
    if not requested_keys:
        requested_keys = {"risk_tier", "revenue", "jobs_created", "jobs_lost"}
    
    logger.debug(f"fetch_baseline_predictions: Requested keys: {requested_keys}")
    
    # Map each target_key to the corresponding ImpactData column attribute names
    # (main_value_attr, label_attr)
    key_to_column = {
        "risk_tier": ("risk_score_3m", "risk_tier_3m"),  # Score for value, tier for label
        "revenue": ("revenue_3m", None),
        "jobs_created": ("jobs_created_3m", None),
        "jobs_lost": ("jobs_lost_3m", None),
    }
    
    for unique_id, impact_row in latest.items():
        for target_key in requested_keys:
            if target_key not in key_to_column:
                continue
            
            col_main_attr, col_label_attr = key_to_column[target_key]
            
            # Extract value and label directly from the object
            if col_main_attr is None:
                continue
            
            value = getattr(impact_row, col_main_attr, None)
            label = None
            if col_label_attr is not None:
                label = getattr(impact_row, col_label_attr, None)
            elif target_key == "risk_tier":
                label = getattr(impact_row, "risk_tier_3m", None)
            
            # Convert to float for predicted_value
            predicted_value = None
            if value is not None:
                try:
                    predicted_value = float(value)
                except (TypeError, ValueError):
                    logger.debug(f"Could not convert {col_main_attr}={value} to float")
                    predicted_value = None
            
            # Create baseline prediction row
            pred = BaselinePredictionRow(
                enterprise_id=unique_id,  # Using unique_id from ImpactData
                target_key=f"{target_key}_3m",  # Add horizon suffix for consistency
                predicted_value=predicted_value,
                predicted_label=label,
            )
            predictions.append(pred)
    
    logger.debug(f"fetch_baseline_predictions: Created {len(predictions)} predictions")
    return predictions



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
        normalized_target_key = _normalize_target_key(pred.target_key)
        baseline_value = (
            float(pred.predicted_value) if pred.predicted_value is not None else None
        )
        scenario_base, scenario_value, scenario_label = simulate_target(
            normalized_target_key,
            baseline_value,
            pred.predicted_label,
            scenario.parameters,
            horizon,
        )
        delta = None
        if scenario_base is not None and scenario_value is not None:
            delta = float(scenario_value - scenario_base)

        result_rows.append(
            SimResult(
                sim_run_id=run.sim_run_id,
                enterprise_id=pred.enterprise_id,
                target_key=normalized_target_key,
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

    # Persist horizon & enterprise count in scope so enterprise impacts
    # can be re-derived later without needing the horizon parameter again.
    entity_keys = {pred.source_entity_key for pred in baseline_rows if pred.source_entity_key}
    scope = dict(run.scope or {})
    scope["horizon"] = horizon
    scope["enterprise_count"] = len(entity_keys)
    run.scope = scope

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


async def list_runs_for_scenario(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    limit: int = 20,
    offset: int = 0,
) -> tuple[int, list[SimRun]]:
    total_res = await db.execute(
        select(func.count())
        .select_from(SimRun)
        .where(SimRun.scenario_id == scenario_id)
    )
    total = int(total_res.scalar_one() or 0)

    runs_res = await db.execute(
        select(SimRun)
        .where(SimRun.scenario_id == scenario_id)
        .order_by(desc(SimRun.started_at))
        .offset(offset)
        .limit(limit)
    )
    return total, list(runs_res.scalars().all())


async def delete_run_for_scenario(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    sim_run_id: UUID,
) -> tuple[bool, int, int]:
    run_res = await db.execute(
        select(SimRun).where(
            and_(
                SimRun.scenario_id == scenario_id,
                SimRun.sim_run_id == sim_run_id,
            )
        )
    )
    run = run_res.scalar_one_or_none()
    if run is None:
        return False, 0, 0

    results_delete_res = await db.execute(
        delete(SimResult).where(SimResult.sim_run_id == sim_run_id)
    )
    runs_delete_res = await db.execute(
        delete(SimRun).where(SimRun.sim_run_id == sim_run_id)
    )
    await db.commit()

    deleted_results = int(results_delete_res.rowcount or 0)
    deleted_runs = int(runs_delete_res.rowcount or 0)
    return True, deleted_runs, deleted_results


async def delete_all_runs_for_scenario(
    db: AsyncSession,
    *,
    scenario_id: UUID,
) -> tuple[int, int]:
    run_ids_res = await db.execute(
        select(SimRun.sim_run_id).where(SimRun.scenario_id == scenario_id)
    )
    run_ids = list(run_ids_res.scalars().all())
    if not run_ids:
        return 0, 0

    results_delete_res = await db.execute(
        delete(SimResult).where(SimResult.sim_run_id.in_(run_ids))
    )
    runs_delete_res = await db.execute(
        delete(SimRun).where(SimRun.scenario_id == scenario_id)
    )
    await db.commit()

    deleted_results = int(results_delete_res.rowcount or 0)
    deleted_runs = int(runs_delete_res.rowcount or 0)
    return deleted_runs, deleted_results


def _build_enterprise_impact_rows_from_predictions(
    predictions: list[BaselinePredictionRow],
    scenario_params: dict,
    horizon: str,
) -> list[dict]:
    """Simulate each prediction and group results by source_entity_key."""
    aggregated: dict[str, dict] = {}

    for pred in predictions:
        entity_key = pred.source_entity_key
        if not entity_key:
            continue

        bucket = aggregated.setdefault(
            entity_key,
            {
                "enterprise_id": entity_key,
                "baseline_risk_label": None,
                "scenario_risk_label": None,
                "baseline_revenue": 0.0,
                "scenario_revenue": 0.0,
                "baseline_jobs_net": 0.0,
                "scenario_jobs_net": 0.0,
            },
        )

        key = _normalize_target_key(pred.target_key)
        baseline_value = (
            float(pred.predicted_value) if pred.predicted_value is not None else None
        )
        scenario_base, scenario_value, scenario_label = simulate_target(
            key,
            baseline_value,
            pred.predicted_label,
            scenario_params,
            horizon,
        )

        if key == "risk_tier":
            bucket["baseline_risk_label"] = pred.predicted_label
            bucket["scenario_risk_label"] = scenario_label
        elif key == "revenue":
            bucket["baseline_revenue"] += float(scenario_base or 0.0)
            bucket["scenario_revenue"] += float(scenario_value or 0.0)
        elif key == "jobs_created":
            bucket["baseline_jobs_net"] += float(scenario_base or 0.0)
            bucket["scenario_jobs_net"] += float(scenario_value or 0.0)
        elif key == "jobs_lost":
            bucket["baseline_jobs_net"] -= float(scenario_base or 0.0)
            bucket["scenario_jobs_net"] -= float(scenario_value or 0.0)

    normalized: list[dict] = []
    for item in aggregated.values():
        item["revenue_delta"] = float(item["scenario_revenue"] - item["baseline_revenue"])
        item["jobs_net_delta"] = float(item["scenario_jobs_net"] - item["baseline_jobs_net"])
        normalized.append(item)
    return normalized


async def get_run_enterprise_impacts(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    sim_run_id: UUID,
    limit: int = 100,
    offset: int = 0,
) -> tuple[SimRun | None, int, list[dict]]:
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
        return None, 0, []

    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        return None, 0, []

    scope = run.scope or {}
    horizon = scope.get("horizon", "3m")

    baseline_rows = await fetch_baseline_predictions(
        db,
        horizon=horizon,
        as_of_date=None,
        model_version_id=run.model_version_id,
        target_keys=None,
        scope=scope,
    )

    impacts = _build_enterprise_impact_rows_from_predictions(
        baseline_rows, scenario.parameters, horizon,
    )
    impacts.sort(key=lambda r: abs(float(r["revenue_delta"])), reverse=True)
    total = len(impacts)
    return run, total, impacts[offset : offset + limit]


def _summary_from_impact_rows(rows: list[dict]) -> dict:
    return {
        "high_risk_count": sum(1 for r in rows if (r.get("scenario_risk_label") or "").upper() == "HIGH"),
        "total_revenue": float(sum(float(r.get("scenario_revenue") or 0.0) for r in rows)),
        "total_jobs_net": float(sum(float(r.get("scenario_jobs_net") or 0.0) for r in rows)),
    }


async def _derive_enterprise_impacts(
    db: AsyncSession,
    run: SimRun,
    scenario: SimScenario,
) -> list[dict]:
    """Re-derive enterprise impacts for a run from ImpactData."""
    scope = run.scope or {}
    horizon = scope.get("horizon", "3m")
    baseline_rows = await fetch_baseline_predictions(
        db,
        horizon=horizon,
        as_of_date=None,
        model_version_id=run.model_version_id,
        target_keys=None,
        scope=scope,
    )
    return _build_enterprise_impact_rows_from_predictions(
        baseline_rows, scenario.parameters, horizon,
    )


async def compare_runs(
    db: AsyncSession,
    *,
    scenario_id: UUID,
    run_a_id: UUID,
    run_b_id: UUID,
    top_n: int = 20,
) -> dict | None:
    run_a_res = await db.execute(
        select(SimRun).where(and_(SimRun.sim_run_id == run_a_id, SimRun.scenario_id == scenario_id))
    )
    run_a = run_a_res.scalar_one_or_none()
    run_b_res = await db.execute(
        select(SimRun).where(and_(SimRun.sim_run_id == run_b_id, SimRun.scenario_id == scenario_id))
    )
    run_b = run_b_res.scalar_one_or_none()
    if run_a is None or run_b is None:
        return None

    scenario = await get_scenario(db, scenario_id)
    if scenario is None:
        return None

    impacts_a = await _derive_enterprise_impacts(db, run_a, scenario)
    impacts_b = await _derive_enterprise_impacts(db, run_b, scenario)

    by_ent_a = {r["enterprise_id"]: r for r in impacts_a}
    by_ent_b = {r["enterprise_id"]: r for r in impacts_b}
    shared = sorted(set(by_ent_a.keys()) & set(by_ent_b.keys()), key=str)

    top_movers: list[dict] = []
    for ent_id in shared:
        ra = by_ent_a[ent_id]
        rb = by_ent_b[ent_id]
        top_movers.append(
            {
                "enterprise_id": ent_id,
                "revenue_delta_change": float((rb["scenario_revenue"] - ra["scenario_revenue"])),
                "jobs_net_delta_change": float((rb["scenario_jobs_net"] - ra["scenario_jobs_net"])),
                "run_a_risk_label": ra.get("scenario_risk_label"),
                "run_b_risk_label": rb.get("scenario_risk_label"),
            }
        )
    top_movers.sort(key=lambda r: abs(float(r["revenue_delta_change"])), reverse=True)

    summary_a = _summary_from_impact_rows(impacts_a)
    summary_b = _summary_from_impact_rows(impacts_b)
    delta = {
        "high_risk_count": int(summary_b["high_risk_count"] - summary_a["high_risk_count"]),
        "total_revenue": float(summary_b["total_revenue"] - summary_a["total_revenue"]),
        "total_jobs_net": float(summary_b["total_jobs_net"] - summary_a["total_jobs_net"]),
    }

    return {
        "run_a": summary_a,
        "run_b": summary_b,
        "delta": delta,
        "top_movers": top_movers[:top_n],
    }
