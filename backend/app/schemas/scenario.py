from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ScenarioParams(BaseModel):
    inflation: float = Field(default=0.0, ge=-100, le=300)
    fxDepreciation: float = Field(default=0.0, ge=-100, le=300)
    fundingCut: float = Field(default=0.0, ge=-100, le=300)
    conflictDisruption: float = Field(default=0.0, ge=-100, le=300)


class ScenarioCreateRequest(BaseModel):
    scenario_name: str = Field(min_length=3, max_length=120)
    scenario_type: str = Field(default="shock", min_length=2, max_length=40)
    description: str | None = None
    parameters: ScenarioParams


class ScenarioResponse(BaseModel):
    scenario_id: UUID
    scenario_name: str
    scenario_type: str
    description: str | None
    parameters: ScenarioParams
    created_by: str | None
    created_at: datetime


class SimulationRunRequest(BaseModel):
    model_version_id: UUID | None = None
    as_of_date: date | None = None
    horizon: str = Field(default="3m", pattern=r"^(1m|3m|6m|12m)$")
    target_keys: list[str] | None = None
    scope: dict = Field(default_factory=dict)
    notes: str | None = None


class SimulationRunResponse(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    run_status: str
    started_at: datetime
    finished_at: datetime | None
    result_count: int = 0
    notes: str | None


class SimulationResultItem(BaseModel):
    enterprise_id: UUID | None
    target_key: str
    baseline_value: float | None
    scenario_value: float | None
    delta_value: float | None
    baseline_label: str | None
    scenario_label: str | None


class SimulationResultResponse(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    run_status: str
    started_at: datetime
    finished_at: datetime | None
    horizon: str
    result_count: int
    results: list[SimulationResultItem]
