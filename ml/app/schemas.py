"""Pydantic schemas for request / response validation."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ── Generic wrapper ─────────────────────────────────────────────────────────


class PredictionMeta(BaseModel):
    model_pipeline: str
    record_count: int


# ── Risk ────────────────────────────────────────────────────────────────────


class RiskPredictionItem(BaseModel):
    unique_id: str | None = None
    pred_risk_tier: str = Field(..., description="12-month tier: LOW | MEDIUM | HIGH")
    pred_risk_tier_low_p: float
    pred_risk_tier_medium_p: float
    pred_risk_tier_high_p: float
    # Monthly risk scores (trajectory)
    pred_risk_score_1m: float
    pred_risk_score_2m: float
    pred_risk_score_3m: float
    pred_risk_score_4m: float
    pred_risk_score_5m: float
    pred_risk_score_6m: float
    pred_risk_score_7m: float
    pred_risk_score_8m: float
    pred_risk_score_9m: float
    pred_risk_score_10m: float
    pred_risk_score_11m: float
    pred_risk_score_12m: float
    # Monthly risk tiers
    pred_risk_tier_1m: str = Field(..., description="Month-1 tier")
    pred_risk_tier_2m: str = Field(..., description="Month-2 tier")
    pred_risk_tier_3m: str = Field(..., description="Month-3 tier")
    pred_risk_tier_4m: str = Field(..., description="Month-4 tier")
    pred_risk_tier_5m: str = Field(..., description="Month-5 tier")
    pred_risk_tier_6m: str = Field(..., description="Month-6 tier")
    pred_risk_tier_7m: str = Field(..., description="Month-7 tier")
    pred_risk_tier_8m: str = Field(..., description="Month-8 tier")
    pred_risk_tier_9m: str = Field(..., description="Month-9 tier")
    pred_risk_tier_10m: str = Field(..., description="Month-10 tier")
    pred_risk_tier_11m: str = Field(..., description="Month-11 tier")
    pred_risk_tier_12m: str = Field(..., description="Month-12 tier")


class RiskPredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[RiskPredictionItem]


# ── Employment ──────────────────────────────────────────────────────────────


class EmploymentPredictionItem(BaseModel):
    unique_id: str | None = None
    pred_jobs_created_1m: float
    pred_jobs_created_2m: float
    pred_jobs_created_3m: float
    pred_jobs_created_4m: float
    pred_jobs_created_5m: float
    pred_jobs_created_6m: float
    pred_jobs_created_7m: float
    pred_jobs_created_8m: float
    pred_jobs_created_9m: float
    pred_jobs_created_10m: float
    pred_jobs_created_11m: float
    pred_jobs_created_12m: float
    pred_jobs_lost_1m: float
    pred_jobs_lost_2m: float
    pred_jobs_lost_3m: float
    pred_jobs_lost_4m: float
    pred_jobs_lost_5m: float
    pred_jobs_lost_6m: float
    pred_jobs_lost_7m: float
    pred_jobs_lost_8m: float
    pred_jobs_lost_9m: float
    pred_jobs_lost_10m: float
    pred_jobs_lost_11m: float
    pred_jobs_lost_12m: float


class EmploymentPredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[EmploymentPredictionItem]


# ── Revenue ─────────────────────────────────────────────────────────────────


class RevenuePredictionItem(BaseModel):
    unique_id: str | None = None
    pred_revenue_1m: float
    pred_revenue_2m: float
    pred_revenue_3m: float
    pred_revenue_4m: float
    pred_revenue_5m: float
    pred_revenue_6m: float
    pred_revenue_7m: float
    pred_revenue_8m: float
    pred_revenue_9m: float
    pred_revenue_10m: float
    pred_revenue_11m: float
    pred_revenue_12m: float


class RevenuePredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[RevenuePredictionItem]


# ── Health / info ───────────────────────────────────────────────────────────


class HealthResponse(BaseModel):
    status: str
    version: str


class ModelInfoResponse(BaseModel):
    pipeline: str
    feature_count: int
    features: list[str]
