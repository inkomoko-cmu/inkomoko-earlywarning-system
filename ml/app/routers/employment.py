"""Employment prediction endpoint.

Forecasts month-by-month jobs created / lost (1m, 2m, 3m) using the
dedicated employment pipeline.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

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

    Returns per-month predictions for jobs created and jobs lost.
    """
    if not records:
        raise HTTPException(status_code=422, detail="Empty payload")

    reg = get_registry()
    df = pd.DataFrame(records)

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
    X = align_features(df, reg.employment_features)

    jc = {}
    jl = {}
    for h in [1, 2, 3]:
        jc[h] = np.maximum(0, reg.employment_jobs_created[h].predict(X))
        jl[h] = np.maximum(0, reg.employment_jobs_lost[h].predict(X))

    items = [
        EmploymentPredictionItem(
            unique_id=ids[i],
            pred_jobs_created_1m=round(float(jc[1][i]), 2),
            pred_jobs_created_2m=round(float(jc[2][i]), 2),
            pred_jobs_created_3m=round(float(jc[3][i]), 2),
            pred_jobs_lost_1m=round(float(jl[1][i]), 2),
            pred_jobs_lost_2m=round(float(jl[2][i]), 2),
            pred_jobs_lost_3m=round(float(jl[3][i]), 2),
        )
        for i in range(len(df))
    ]

    return EmploymentPredictionResponse(
        meta=PredictionMeta(model_pipeline="employment", record_count=len(items)),
        predictions=items,
    )
