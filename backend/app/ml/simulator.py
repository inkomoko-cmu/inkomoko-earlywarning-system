from __future__ import annotations


def _pressure(params: dict) -> float:
    inflation = float(params.get("inflation", 0.0)) / 100.0
    fx = float(params.get("fxDepreciation", 0.0)) / 100.0
    funding = float(params.get("fundingCut", 0.0)) / 100.0
    conflict = float(params.get("conflictDisruption", 0.0)) / 100.0
    # Weighted deterministic pressure score.
    return (inflation * 0.6) + (fx * 0.5) + (funding * 0.4) + (conflict * 0.5)


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _risk_tier_to_level(label: str | None) -> int:
    if not label:
        return 2
    normalized = label.strip().upper()
    if normalized == "LOW":
        return 1
    if normalized == "MEDIUM":
        return 2
    if normalized == "HIGH":
        return 3
    return 2


def _level_to_risk_tier(level: int) -> str:
    if level <= 1:
        return "LOW"
    if level >= 3:
        return "HIGH"
    return "MEDIUM"


def simulate_target(
    target_key: str,
    baseline_value: float | None,
    baseline_label: str | None,
    scenario_params: dict,
) -> tuple[float | None, float | None, str | None]:
    pressure = _pressure(scenario_params)
    key = target_key.strip().lower()

    if key == "risk_tier":
        baseline_level = _risk_tier_to_level(baseline_label)
        shift = 0
        if pressure >= 0.35:
            shift = 2
        elif pressure >= 0.15:
            shift = 1
        elif pressure <= -0.20:
            shift = -1
        scenario_level = int(_clamp(float(baseline_level + shift), 1, 3))
        scenario_label = _level_to_risk_tier(scenario_level)
        base_num = float(baseline_level)
        scen_num = float(scenario_level)
        return base_num, scen_num, scenario_label

    if baseline_value is None:
        return None, None, None

    if key == "risk_score":
        scenario_value = _clamp(float(baseline_value) * (1 + pressure), 0.0, 1.0)
    elif key in {"revenue", "jobs_created"}:
        scenario_value = float(baseline_value) * (1 - pressure)
    elif key == "jobs_lost":
        scenario_value = float(baseline_value) * (1 + pressure)
    else:
        scenario_value = float(baseline_value) * (1 + pressure)

    return float(baseline_value), float(scenario_value), None
