"""Pydantic schemas for ML request/response validation."""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


# ── Generic wrapper ─────────────────────────────────────────────────────────


class PredictionMeta(BaseModel):
    model_pipeline: str
    record_count: int


# ── Risk ────────────────────────────────────────────────────────────────────


class RiskPredictionItem(BaseModel):
    unique_id: Optional[str] = None
    pred_risk_tier: str = Field(..., description="3-month tier: LOW | MEDIUM | HIGH")
    pred_risk_tier_low_p: float
    pred_risk_tier_medium_p: float
    pred_risk_tier_high_p: float
    # Monthly risk scores (trajectory)
    pred_risk_score_1m: float
    pred_risk_score_2m: float
    pred_risk_score_3m: float
    # Monthly risk tiers
    pred_risk_tier_1m: str = Field(..., description="Month-1 tier")
    pred_risk_tier_2m: str = Field(..., description="Month-2 tier")
    pred_risk_tier_3m: str = Field(..., description="Month-3 tier")


class RiskPredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[RiskPredictionItem]


# ── Employment ──────────────────────────────────────────────────────────────


class EmploymentPredictionItem(BaseModel):
    unique_id: Optional[str] = None
    pred_jobs_created_1m: float
    pred_jobs_created_2m: float
    pred_jobs_created_3m: float
    pred_jobs_lost_1m: float
    pred_jobs_lost_2m: float
    pred_jobs_lost_3m: float


class EmploymentPredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[EmploymentPredictionItem]


# ── Revenue ─────────────────────────────────────────────────────────────────


class RevenuePredictionItem(BaseModel):
    unique_id: Optional[str] = None
    pred_revenue_1m: float
    pred_revenue_2m: float
    pred_revenue_3m: float


class RevenuePredictionResponse(BaseModel):
    meta: PredictionMeta
    predictions: list[RevenuePredictionItem]
