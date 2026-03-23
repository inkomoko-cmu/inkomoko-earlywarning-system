"""Employment prediction endpoint.

Forecasts month-by-month jobs created / lost (1m, 2m, 3m) using the
dedicated employment pipeline.
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
    EmploymentPredictionItem,
    EmploymentPredictionResponse,
    PredictionMeta,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predict", tags=["employment"])


@router.post("/employment", response_model=EmploymentPredictionResponse)
async def predict_employment(records: list[dict]):
    """Score one or more records through the employment pipeline.

    Returns per-month predictions for jobs created and jobs lost (1m through 12m).
    """
    if not records:
        raise HTTPException(status_code=422, detail="Empty payload")

    reg = get_registry()
    df = pd.DataFrame(records)

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
    X = align_features(df, reg.employment_features)

    jc = {}
    jl = {}
    for h in HORIZONS:
        jc[h] = np.maximum(0, reg.employment_jobs_created[h].predict(X))
        jl[h] = np.maximum(0, reg.employment_jobs_lost[h].predict(X))

    items: list[EmploymentPredictionItem] = []
    for i in range(len(df)):
        payload: dict[str, float | str | None] = {"unique_id": ids[i]}
        for h in HORIZONS:
            payload[f"pred_jobs_created_{h}m"] = round(float(jc[h][i]), 2)
            payload[f"pred_jobs_lost_{h}m"] = round(float(jl[h][i]), 2)
        items.append(EmploymentPredictionItem(**payload))

    return EmploymentPredictionResponse(
        meta=PredictionMeta(model_pipeline="employment", record_count=len(items)),
        predictions=items,
    )
