"""Training and model management endpoints for ML service."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

# Import the training script's main function
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

logger = logging.getLogger(__name__)

router = APIRouter(tags=["training"])


class TrainResponse(BaseModel):
    status: str
    message: str
    models_trained: int | None = None


class ReloadResponse(BaseModel):
    status: str
    message: str
    models_loaded: int


@router.post("/train", response_model=TrainResponse)
async def train_models():
    """
    Train all ML models by executing train_all_models.py.
    This runs synchronously and may take 2-5 minutes.
    """
    try:
        # Import and run the training script
        import train_all_models

        logger.info("Starting model training...")
        train_all_models.main()
        logger.info("Model training completed successfully")

        return TrainResponse(
            status="success",
            message="All models trained successfully",
            models_trained=15,  # 3 horizons × 5 model types
        )
    except Exception as e:
        logger.error(f"Training failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model training failed: {str(e)}")


@router.post("/reload", response_model=ReloadResponse)
async def reload_models():
    """
    Reload all ML models from disk without restarting the service.
    Useful after training new models.
    """
    try:
        from app.models import load_models, _registry

        logger.info("Reloading ML models...")
        registry = load_models()
        logger.info("Models reloaded successfully")

        # Count loaded models
        model_count = 0
        for h in [1, 2, 3]:
            if h in registry.risk_tier:
                model_count += 1
            if h in registry.risk_score:
                model_count += 1
            if h in registry.employment_jobs_created:
                model_count += 1
            if h in registry.employment_jobs_lost:
                model_count += 1
            if h in registry.revenue:
                model_count += 1

        return ReloadResponse(
            status="success",
            message="Models reloaded from disk",
            models_loaded=model_count,
        )
    except Exception as e:
        logger.error(f"Model reload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Model reload failed: {str(e)}")
