"""Revenue prediction endpoint.

Forecasts month-by-month revenue (1m, 2m, 3m) using the dedicated revenue pipeline.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.config import HORIZONS
from app.models import get_registry
from app.preprocessing import align_features
from app.schemas import (
    PredictionMeta,
    RevenuePredictionItem,
    RevenuePredictionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predict", tags=["revenue"])


@router.post("/revenue", response_model=RevenuePredictionResponse)
async def predict_revenue(records: list[dict]):
    """Score one or more records through the revenue pipeline.

    Returns per-month revenue predictions (1m through 12m).
    """
    if not records:
        raise HTTPException(status_code=422, detail="Empty payload")

    reg = get_registry()
    df = pd.DataFrame(records)

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
    X = align_features(df, reg.revenue_features)

    rev = {}
    for h in HORIZONS:
        rev[h] = np.maximum(0, reg.revenue[h].predict(X))

    items: list[RevenuePredictionItem] = []
    for i in range(len(df)):
        payload: dict[str, float | str | None] = {"unique_id": ids[i]}
        for h in HORIZONS:
            payload[f"pred_revenue_{h}m"] = round(float(rev[h][i]), 2)
        items.append(RevenuePredictionItem(**payload))

    return RevenuePredictionResponse(
        meta=PredictionMeta(model_pipeline="revenue", record_count=len(items)),
        predictions=items,
    )
