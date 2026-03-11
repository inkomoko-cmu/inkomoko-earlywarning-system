"""Health and model-info endpoints."""

from fastapi import APIRouter

from app.config import get_settings
from app.models import get_registry
from app.schemas import HealthResponse, ModelInfoResponse

router = APIRouter(tags=["meta"])


@router.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(status="ok", version=get_settings().app_version)


@router.get("/models/risk/info", response_model=ModelInfoResponse)
async def risk_model_info():
    reg = get_registry()
    return ModelInfoResponse(
        pipeline="risk",
        feature_count=len(reg.risk_features),
        features=reg.risk_features,
    )


@router.get("/models/employment/info", response_model=ModelInfoResponse)
async def employment_model_info():
    reg = get_registry()
    return ModelInfoResponse(
        pipeline="employment",
        feature_count=len(reg.employment_features),
        features=reg.employment_features,
    )


@router.get("/models/revenue/info", response_model=ModelInfoResponse)
async def revenue_model_info():
    reg = get_registry()
    return ModelInfoResponse(
        pipeline="revenue",
        feature_count=len(reg.revenue_features),
        features=reg.revenue_features,
    )
