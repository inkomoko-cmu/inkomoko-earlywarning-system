"""Risk prediction endpoint.

Accepts a JSON array of client records (core-banking + impact fields already
merged, or raw features) and returns risk-tier classification plus continuous
risk score.
"""

from __future__ import annotations

import logging

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException

from app.config import HORIZONS, RISK_LABELS
from app.models import get_registry
from app.preprocessing import align_features
from app.schemas import (
    PredictionMeta,
    RiskPredictionItem,
    RiskPredictionResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/predict", tags=["risk"])


@router.post("/risk", response_model=RiskPredictionResponse)
async def predict_risk(records: list[dict]):
    """Score one or more client records through the full risk pipeline.

    Returns per-month risk tier and score predictions (1m through 12m)
    plus the max-horizon tier probabilities.
    """
    if not records:
        raise HTTPException(status_code=422, detail="Empty payload")

    reg = get_registry()
    df = pd.DataFrame(records)

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
    X = align_features(df, reg.risk_features)

    # Per-horizon predictions
    scores = {}
    tiers = {}
    for h in HORIZONS:
        scores[h] = np.clip(reg.risk_score[h].predict(X), 0, 1)
        tiers[h] = reg.risk_tier[h].predict(X)

    # Max-horizon tier probabilities (for the main classification)
    ref_h = max(HORIZONS)
    tier_proba_ref = reg.risk_tier[ref_h].predict_proba(X)

    items: list[RiskPredictionItem] = []
    for i in range(len(df)):
        payload: dict[str, str | float | None] = {
            "unique_id": ids[i],
            "pred_risk_tier": RISK_LABELS.get(int(tiers[ref_h][i]), "UNKNOWN"),
            "pred_risk_tier_low_p": round(float(tier_proba_ref[i, 0]), 6),
            "pred_risk_tier_medium_p": round(float(tier_proba_ref[i, 1]), 6),
            "pred_risk_tier_high_p": round(float(tier_proba_ref[i, 2]), 6),
        }
        for h in HORIZONS:
            payload[f"pred_risk_score_{h}m"] = round(float(scores[h][i]), 6)
            payload[f"pred_risk_tier_{h}m"] = RISK_LABELS.get(
                int(tiers[h][i]), "UNKNOWN"
            )
        items.append(RiskPredictionItem(**payload))

    return RiskPredictionResponse(
        meta=PredictionMeta(model_pipeline="risk", record_count=len(items)),
        predictions=items,
    )
