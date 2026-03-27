from __future__ import annotations

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


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


class ScenarioUpdateRequest(BaseModel):
    scenario_name: str | None = Field(default=None, min_length=3, max_length=120)
    scenario_type: str | None = Field(default=None, min_length=2, max_length=40)
    description: str | None = None
    parameters: ScenarioParams | None = None


class ScenarioResponse(BaseModel):
    scenario_id: UUID
    scenario_name: str
    scenario_type: str
    description: str | None
    parameters: ScenarioParams
    created_by: str | None
    created_at: datetime


class SimulationScope(BaseModel):
    model_config = ConfigDict(extra="allow")

    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    program_id: UUID | None = None
    cohort_id: UUID | None = None
    enterprise_ids: list[UUID] = Field(default_factory=list)

    @field_validator("country_code")
    @classmethod
    def normalize_country_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        return normalized or None


class SimulationRunRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_version_id: UUID | None = None
    as_of_date: date | None = None
    horizon: str = Field(default="3m", pattern=r"^(1m|3m|6m|12m)$")
    target_keys: list[str] | None = None
    scope: SimulationScope = Field(default_factory=SimulationScope)
    notes: str | None = None


class SimulationRunResponse(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    run_status: str
    started_at: datetime
    finished_at: datetime | None
    result_count: int = 0
    notes: str | None


class SimulationRunListItem(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    run_status: str
    started_at: datetime
    finished_at: datetime | None
    result_count: int = 0
    notes: str | None
    scope: dict = Field(default_factory=dict)


class SimulationRunListResponse(BaseModel):
    scenario_id: UUID
    total: int
    runs: list[SimulationRunListItem]


class SimulationRunDeleteResponse(BaseModel):
    scenario_id: UUID
    sim_run_id: UUID
    deleted_runs: int
    deleted_results: int


class SimulationRunBulkDeleteResponse(BaseModel):
    scenario_id: UUID
    deleted_runs: int
    deleted_results: int


class SimulationResultItem(BaseModel):
    enterprise_id: UUID | None
    target_key: str
    baseline_value: float | None
    scenario_value: float | None
    delta_value: float | None
    baseline_label: str | None
    scenario_label: str | None


class RiskDistribution(BaseModel):
    baseline: dict[str, int] = Field(default_factory=dict)
    scenario: dict[str, int] = Field(default_factory=dict)


class SimulationResultResponse(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    run_status: str
    started_at: datetime
    finished_at: datetime | None
    horizon: str
    result_count: int
    enterprise_count: int = 0
    risk_distribution: RiskDistribution = Field(default_factory=RiskDistribution)
    results: list[SimulationResultItem]


class SimulationEnterpriseImpactItem(BaseModel):
    enterprise_id: str | None
    baseline_risk_label: str | None
    scenario_risk_label: str | None
    baseline_revenue: float
    scenario_revenue: float
    revenue_delta: float
    baseline_jobs_net: float
    scenario_jobs_net: float
    jobs_net_delta: float


class SimulationEnterpriseImpactResponse(BaseModel):
    sim_run_id: UUID
    scenario_id: UUID
    total: int
    impacts: list[SimulationEnterpriseImpactItem]


class SimulationComparisonSummary(BaseModel):
    high_risk_count: int
    total_revenue: float
    total_jobs_net: float


class SimulationComparisonTopMover(BaseModel):
    enterprise_id: str
    revenue_delta_change: float
    jobs_net_delta_change: float
    run_a_risk_label: str | None
    run_b_risk_label: str | None


class SimulationComparisonResponse(BaseModel):
    scenario_id: UUID
    run_a_id: UUID
    run_b_id: UUID
    run_a: SimulationComparisonSummary
    run_b: SimulationComparisonSummary
    delta: SimulationComparisonSummary
    top_movers: list[SimulationComparisonTopMover]
