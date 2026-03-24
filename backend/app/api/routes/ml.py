"""ML model coordination endpoints - training, status checks, and predictions."""

import asyncio
import datetime
import logging
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles, get_db
from app.ml import get_registry, models_are_loaded
from app.ml.config import RISK_LABELS, HORIZONS
from app.ml.preprocessing import align_features
from app.ml.schemas import (
    RiskPredictionResponse,
    RiskPredictionItem,
    EmploymentPredictionResponse,
    EmploymentPredictionItem,
    RevenuePredictionResponse,
    RevenuePredictionItem,
    PredictionMeta,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ml", tags=["ML"])

# Paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
ML_DIR = PROJECT_ROOT / "ml"
MODELS_DIR = ML_DIR / "artifacts" / "models"
METRICS_DIR = ML_DIR / "artifacts" / "metrics"
TRAIN_SCRIPT = ML_DIR / "train_all_models.py"

# Expected 15 model files (3 horizons × 5 model types)
EXPECTED_MODELS = [
    "risk_tier_1m_model.joblib",
    "risk_tier_2m_model.joblib",
    "risk_tier_3m_model.joblib",
    "risk_score_1m_model.joblib",
    "risk_score_2m_model.joblib",
    "risk_score_3m_model.joblib",
    "employment_jobs_created_1m_model.joblib",
    "employment_jobs_created_2m_model.joblib",
    "employment_jobs_created_3m_model.joblib",
    "employment_jobs_lost_1m_model.joblib",
    "employment_jobs_lost_2m_model.joblib",
    "employment_jobs_lost_3m_model.joblib",
    "revenue_1m_model.joblib",
    "revenue_2m_model.joblib",
    "revenue_3m_model.joblib",
]


class ModelStatusResponse(BaseModel):
    models_exist: bool
    model_count: int
    expected_count: int
    missing_models: List[str]
    models_dir: str
    models_loaded_in_memory: bool


class TrainResponse(BaseModel):
    status: str
    message: str
    models_trained: Optional[int] = None
    metrics_file: Optional[str] = None
    error: Optional[str] = None


class PredictionRequest(BaseModel):
    data: List[Dict[str, Any]]


@router.get("/status", response_model=ModelStatusResponse)
async def check_model_status():
    """
    Check if ML models are trained and available.
    Returns count of existing models and list of missing ones.
    No authentication required - used for health checks.
    """
    if not MODELS_DIR.exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)

    existing_models = []
    missing_models = []

    for model_file in EXPECTED_MODELS:
        model_path = MODELS_DIR / model_file
        if model_path.exists():
            existing_models.append(model_file)
        else:
            missing_models.append(model_file)

    models_exist = len(missing_models) == 0

    return ModelStatusResponse(
        models_exist=models_exist,
        model_count=len(existing_models),
        expected_count=len(EXPECTED_MODELS),
        missing_models=missing_models,
        models_dir=str(MODELS_DIR),
        models_loaded_in_memory=models_are_loaded(),
    )


@router.post(
    "/train",
    response_model=TrainResponse,
    dependencies=[Depends(require_roles(["Admin"]))],
)
async def train_models():
    """
    Train all ML models by running train_all_models.py script.
    This may take 2-5 minutes. Requires Admin role.
    After training, reloads models into backend memory.
    """
    if not TRAIN_SCRIPT.exists():
        raise HTTPException(
            status_code=500, detail=f"Training script not found at {TRAIN_SCRIPT}"
        )

    try:
        # Run training script synchronously
        result = subprocess.run(
            [sys.executable, str(TRAIN_SCRIPT)],
            cwd=str(ML_DIR),
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout
        )

        if result.returncode == 0:
            # Check if models were created
            status_check = await check_model_status()

            # Check for metrics file
            metrics_file = METRICS_DIR / "model_summary_metrics.csv"
            metrics_path = str(metrics_file) if metrics_file.exists() else None

            # Reload models into memory
            try:
                from app.ml import load_models

                load_models()
                logger.info("✅ Backend models reloaded successfully")
            except Exception as e:
                logger.error(f"⚠️ Could not reload models into backend: {e}")
                # Don't fail the training if reload fails

            return TrainResponse(
                status="success",
                message="Model training completed successfully. Backend models reloaded.",
                models_trained=status_check.model_count,
                metrics_file=metrics_path,
            )
        else:
            return TrainResponse(
                status="error",
                message="Model training failed",
                error=result.stderr or result.stdout,
            )

    except subprocess.TimeoutExpired:
        return TrainResponse(
            status="error",
            message="Model training timed out (>10 minutes)",
            error="Training process exceeded maximum allowed time",
        )
    except Exception as e:
        return TrainResponse(
            status="error",
            message="Model training failed with exception",
            error=str(e),
        )


@router.post("/predict/risk", response_model=RiskPredictionResponse)
async def predict_risk(
    request: PredictionRequest,
    _user_data=Depends(get_current_user),
):
    """
    Risk predictions using directly loaded models.
    Returns risk tier classification and continuous risk scores for 1m, 2m, 3m horizons.
    Requires authentication.
    """
    if not request.data:
        raise HTTPException(status_code=422, detail="Empty payload")

    if not models_are_loaded():
        raise HTTPException(
            status_code=503,
            detail="ML models not loaded. Please train models first or restart the backend.",
        )

    try:
        reg = get_registry()
        df = pd.DataFrame(request.data)

        ids = (
            df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
        )
        X = align_features(df, reg.risk_features)

        # Per-horizon predictions
        scores = {}
        tiers = {}
        for h in [1, 2, 3]:
            scores[h] = np.clip(reg.risk_score[h].predict(X), 0, 1)
            tiers[h] = reg.risk_tier[h].predict(X)

        # 3-month tier probabilities (for the main classification)
        tier_proba_3m = reg.risk_tier[3].predict_proba(X)

        items: list[RiskPredictionItem] = []
        for i in range(len(df)):
            items.append(
                RiskPredictionItem(
                    unique_id=ids[i],
                    pred_risk_tier=RISK_LABELS.get(int(tiers[3][i]), "UNKNOWN"),
                    pred_risk_tier_low_p=round(float(tier_proba_3m[i, 0]), 6),
                    pred_risk_tier_medium_p=round(float(tier_proba_3m[i, 1]), 6),
                    pred_risk_tier_high_p=round(float(tier_proba_3m[i, 2]), 6),
                    pred_risk_score_1m=round(float(scores[1][i]), 6),
                    pred_risk_score_2m=round(float(scores[2][i]), 6),
                    pred_risk_score_3m=round(float(scores[3][i]), 6),
                    pred_risk_tier_1m=RISK_LABELS.get(int(tiers[1][i]), "UNKNOWN"),
                    pred_risk_tier_2m=RISK_LABELS.get(int(tiers[2][i]), "UNKNOWN"),
                    pred_risk_tier_3m=RISK_LABELS.get(int(tiers[3][i]), "UNKNOWN"),
                )
            )

        return RiskPredictionResponse(
            meta=PredictionMeta(model_pipeline="risk", record_count=len(items)),
            predictions=items,
        )
    except Exception as e:
        logger.error(f"Risk prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/predict/employment", response_model=EmploymentPredictionResponse)
async def predict_employment(
    request: PredictionRequest,
    _user_data=Depends(get_current_user),
):
    """
    Employment predictions using directly loaded models.
    Returns jobs created and jobs lost for 1m, 2m, 3m horizons.
    Requires authentication.
    """
    if not request.data:
        raise HTTPException(status_code=422, detail="Empty payload")

    if not models_are_loaded():
        raise HTTPException(
            status_code=503,
            detail="ML models not loaded. Please train models first or restart the backend.",
        )

    try:
        reg = get_registry()
        df = pd.DataFrame(request.data)

        ids = (
            df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
        )
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
    except Exception as e:
        logger.error(f"Employment prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


@router.post("/predict/revenue", response_model=RevenuePredictionResponse)
async def predict_revenue(
    request: PredictionRequest,
    _user_data=Depends(get_current_user),
):
    """
    Revenue predictions using directly loaded models.
    Returns revenue predictions for 1m, 2m, 3m horizons.
    Requires authentication.
    """
    if not request.data:
        raise HTTPException(status_code=422, detail="Empty payload")

    if not models_are_loaded():
        raise HTTPException(
            status_code=503,
            detail="ML models not loaded. Please train models first or restart the backend.",
        )

    try:
        reg = get_registry()
        df = pd.DataFrame(request.data)

        ids = (
            df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)
        )
        X = align_features(df, reg.revenue_features)

        rev = {}
        for h in [1, 2, 3]:
            rev[h] = np.maximum(0, reg.revenue[h].predict(X))

        items = [
            RevenuePredictionItem(
                unique_id=ids[i],
                pred_revenue_1m=round(float(rev[1][i]), 2),
                pred_revenue_2m=round(float(rev[2][i]), 2),
                pred_revenue_3m=round(float(rev[3][i]), 2),
            )
            for i in range(len(df))
        ]

        return RevenuePredictionResponse(
            meta=PredictionMeta(model_pipeline="revenue", record_count=len(items)),
            predictions=items,
        )
    except Exception as e:
        logger.error(f"Revenue prediction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")


# ══════════════════════════════════════════════════════════════════════════════
# Model Cards Endpoint
# ══════════════════════════════════════════════════════════════════════════════


def _get_feature_importance(
    model_obj, feature_names: List[str], top_n: int = 20
) -> List[Dict]:
    """Extract feature importance from a fitted pipeline."""
    try:
        last_step = model_obj
        # Walk through pipeline to get the actual estimator
        if hasattr(model_obj, "named_steps"):
            steps = list(model_obj.named_steps.values())
            last_step = steps[-1]

        if hasattr(last_step, "feature_importances_"):
            importances = last_step.feature_importances_
            # Try to get transformed feature names
            prep = (
                model_obj.named_steps.get("prep")
                if hasattr(model_obj, "named_steps")
                else None
            )

            if prep and hasattr(prep, "get_feature_names_out"):
                try:
                    fnames = list(prep.get_feature_names_out())
                except Exception:
                    fnames = [f"feature_{i}" for i in range(len(importances))]
            else:
                fnames = [f"feature_{i}" for i in range(len(importances))]

            # Sort by importance
            pairs = sorted(zip(fnames, importances), key=lambda x: x[1], reverse=True)
            return [
                {"feature": str(n), "importance": round(float(v), 6)}
                for n, v in pairs[:top_n]
            ]
    except Exception:
        pass
    return []


def _model_file_info(filename: str) -> Dict:
    """Get file size and modification time for a model file."""
    path = MODELS_DIR / filename
    if not path.exists():
        return {}
    stat = path.stat()
    return {
        "file": filename,
        "size_mb": round(stat.st_size / (1024 * 1024), 2),
        "last_modified": datetime.datetime.fromtimestamp(
            stat.st_mtime, tz=datetime.timezone.utc
        ).isoformat(),
    }


def _estimator_params(model_obj) -> Dict:
    """Extract hyperparameters from the final estimator in a pipeline."""
    try:
        last_step = model_obj
        if hasattr(model_obj, "named_steps"):
            steps = list(model_obj.named_steps.values())
            last_step = steps[-1]
        params = last_step.get_params()
        # Filter out nested objects for cleaner display
        return {
            k: v
            for k, v in params.items()
            if not hasattr(v, "get_params") and "__" not in k
        }
    except Exception:
        return {}


def _algo_name(model_obj):
    """Extract the algorithm class name from a model or pipeline."""
    if hasattr(model_obj, "named_steps"):
        for key in model_obj.named_steps:
            if key != "prep":
                return type(model_obj.named_steps[key]).__name__
    return type(model_obj).__name__


@router.get("/model-cards")
async def get_model_cards():
    """
    Get comprehensive model card information for all pipelines.
    Includes model metadata, metrics, feature importance, and hyperparameters.
    No authentication required - frontend handles access control.
    """
    if not models_are_loaded():
        raise HTTPException(
            status_code=503,
            detail="ML models not loaded. Please train models first or restart the backend.",
        )

    try:
        reg = get_registry()
        cards = {}

        # ── Risk Pipeline ───────────────────────────────────────────────────
        risk_models_info = []

        for h in HORIZONS:
            # risk_tier classifier
            tier_model = reg.risk_tier[h]
            fname = f"risk_tier_{h}m_model.joblib"
            risk_models_info.append(
                {
                    "name": fname.replace(".joblib", ""),
                    "target": f"risk_tier_{h}m",
                    "horizon": h,
                    "type": "classification",
                    "algorithm": _algo_name(tier_model),
                    "feature_count": len(reg.risk_features),
                    "feature_importance": _get_feature_importance(
                        tier_model, reg.risk_features
                    ),
                    "hyperparameters": _estimator_params(tier_model),
                    **_model_file_info(fname),
                }
            )

            # risk_score regressor
            score_model = reg.risk_score[h]
            fname = f"risk_score_{h}m_model.joblib"
            risk_models_info.append(
                {
                    "name": fname.replace(".joblib", ""),
                    "target": f"risk_score_{h}m",
                    "horizon": h,
                    "type": "regression",
                    "algorithm": _algo_name(score_model),
                    "feature_count": len(reg.risk_features),
                    "feature_importance": _get_feature_importance(
                        score_model, reg.risk_features
                    ),
                    "hyperparameters": _estimator_params(score_model),
                    **_model_file_info(fname),
                }
            )

        # Load saved metrics
        risk_metrics = {}
        try:
            mdf = pd.read_csv(METRICS_DIR / "model_summary_metrics.csv")
            risk_metrics["auc_macro"] = round(float(mdf["auc_macro"].iloc[0]), 4)
            risk_metrics["qwk"] = round(float(mdf["qwk"].iloc[0]), 4)
            risk_metrics["brier_high_risk"] = round(
                float(mdf["brier_high_risk"].iloc[0]), 4
            )
        except Exception:
            pass

        cards["risk"] = {
            "pipeline": "Risk",
            "description": "Per-month pipeline predicting credit risk tier (LOW/MEDIUM/HIGH) and continuous risk score (0–1) at 1-month, 2-month, and 3-month horizons.",
            "purpose": "Identifies clients most likely to face financial distress over the next 1–3 months so that advisors can intervene early. Month-by-month trajectories reveal whether risk is increasing.",
            "what_it_predicts": [
                {
                    "target": f"risk_tier_{h}m",
                    "label": f"Risk Tier ({h}m)",
                    "explanation": f"Classifies each client into LOW, MEDIUM, or HIGH risk at the {h}-month horizon.",
                }
                for h in HORIZONS
            ]
            + [
                {
                    "target": f"risk_score_{h}m",
                    "label": f"Risk Score ({h}m)",
                    "explanation": f"Continuous score 0–1 at the {h}-month horizon.",
                }
                for h in HORIZONS
            ],
            "metric_explanations": {
                "auc_macro": {
                    "label": "AUC (macro)",
                    "explanation": "Area Under the ROC Curve averaged across all risk tiers. Measures how well the model distinguishes between LOW, MEDIUM, and HIGH risk clients.",
                    "interpretation": {"excellent": 0.90, "good": 0.80, "fair": 0.70},
                },
                "qwk": {
                    "label": "QWK",
                    "explanation": "Quadratic Weighted Kappa measures agreement between predicted and actual risk tiers, penalising larger misclassifications more heavily.",
                    "interpretation": {"excellent": 0.80, "good": 0.60, "fair": 0.40},
                },
                "brier_high_risk": {
                    "label": "Brier (High-Risk)",
                    "explanation": "Calibration score for the high-risk probability. Lower is better.",
                    "interpretation": {
                        "excellent": 0.10,
                        "good": 0.20,
                        "fair": 0.30,
                        "lower_is_better": True,
                    },
                },
            },
            "num_models": len(risk_models_info),
            "feature_count": len(reg.risk_features),
            "features": reg.risk_features,
            "training_metrics": risk_metrics,
            "models": risk_models_info,
        }

        # ── Employment Pipeline ─────────────────────────────────────────────
        emp_models_info = []
        for h in HORIZONS:
            for attr, tgt_prefix, fname_prefix in [
                ("employment_jobs_created", "jobs_created", "employment_jobs_created"),
                ("employment_jobs_lost", "jobs_lost", "employment_jobs_lost"),
            ]:
                model_obj = getattr(reg, attr)[h]
                fname = f"{fname_prefix}_{h}m_model.joblib"
                emp_models_info.append(
                    {
                        "name": fname.replace(".joblib", ""),
                        "target": f"{tgt_prefix}_{h}m",
                        "horizon": h,
                        "type": "regression",
                        "algorithm": _algo_name(model_obj),
                        "feature_count": len(reg.employment_features),
                        "feature_importance": _get_feature_importance(
                            model_obj, reg.employment_features
                        ),
                        "hyperparameters": _estimator_params(model_obj),
                        **_model_file_info(fname),
                    }
                )

        emp_metrics = {}
        try:
            mdf = pd.read_csv(METRICS_DIR / "employment_model_metrics.csv")
            for _, row in mdf.iterrows():
                emp_metrics[row["target"]] = {
                    "rmse": round(float(row["rmse"]), 4),
                    "mae": round(float(row["mae"]), 4),
                }
        except Exception:
            pass

        cards["employment"] = {
            "pipeline": "Employment",
            "description": "Per-month regressors forecasting jobs created and jobs lost at 1-month, 2-month, and 3-month horizons (6 models).",
            "purpose": "Estimates the employment impact month by month, helping track job-creation goals and flag clients whose businesses may be shrinking.",
            "what_it_predicts": [
                {
                    "target": f"jobs_created_{h}m",
                    "label": f"Jobs Created ({h}m)",
                    "explanation": f"Predicted new jobs at the {h}-month horizon.",
                }
                for h in HORIZONS
            ]
            + [
                {
                    "target": f"jobs_lost_{h}m",
                    "label": f"Jobs Lost ({h}m)",
                    "explanation": f"Predicted jobs lost at the {h}-month horizon.",
                }
                for h in HORIZONS
            ],
            "metric_explanations": {
                "rmse": {
                    "label": "RMSE",
                    "explanation": "Root Mean Squared Error — average magnitude of prediction errors. Lower is better.",
                },
                "mae": {
                    "label": "MAE",
                    "explanation": "Mean Absolute Error — average of absolute differences. Less sensitive to outliers than RMSE.",
                },
            },
            "num_models": len(emp_models_info),
            "feature_count": len(reg.employment_features),
            "features": reg.employment_features,
            "training_metrics": emp_metrics,
            "models": emp_models_info,
        }

        # ── Revenue Pipeline ────────────────────────────────────────────────
        rev_models_info = []
        for h in HORIZONS:
            model_obj = reg.revenue[h]
            fname = f"revenue_{h}m_model.joblib"
            rev_models_info.append(
                {
                    "name": fname.replace(".joblib", ""),
                    "target": f"revenue_{h}m",
                    "horizon": h,
                    "type": "regression",
                    "algorithm": _algo_name(model_obj),
                    "feature_count": len(reg.revenue_features),
                    "feature_importance": _get_feature_importance(
                        model_obj, reg.revenue_features
                    ),
                    "hyperparameters": _estimator_params(model_obj),
                    **_model_file_info(fname),
                }
            )

        rev_metrics = {}
        try:
            mdf = pd.read_csv(METRICS_DIR / "revenue_model_metrics.csv")
            for _, row in mdf.iterrows():
                rev_metrics[row["target"]] = {
                    "rmse": round(float(row["rmse"]), 4),
                    "mae": round(float(row["mae"]), 4),
                }
        except Exception:
            pass

        cards["revenue"] = {
            "pipeline": "Revenue",
            "description": "Per-month regressors forecasting revenue at 1-month, 2-month, and 3-month horizons (3 models).",
            "purpose": "Forecasts month-by-month revenue for each client, enabling early identification of revenue decline trajectories.",
            "what_it_predicts": [
                {
                    "target": f"revenue_{h}m",
                    "label": f"Revenue ({h}m)",
                    "explanation": f"Predicted revenue at the {h}-month horizon.",
                }
                for h in HORIZONS
            ],
            "metric_explanations": {
                "rmse": {
                    "label": "RMSE",
                    "explanation": "Root Mean Squared Error — average magnitude of prediction errors. Lower is better.",
                },
                "mae": {
                    "label": "MAE",
                    "explanation": "Mean Absolute Error — average of absolute differences. Less sensitive to outliers than RMSE.",
                },
            },
            "num_models": len(rev_models_info),
            "feature_count": len(reg.revenue_features),
            "features": reg.revenue_features,
            "training_metrics": rev_metrics,
            "models": rev_models_info,
        }

        return JSONResponse(content=cards)

    except Exception as e:
        logger.error(f"Model cards retrieval failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to retrieve model cards: {str(e)}"
        )


# ══════════════════════════════════════════════════════════════════════════════
# Data Quality Contracts Endpoint
# ══════════════════════════════════════════════════════════════════════════════

# Data contracts definition
_DATA_CONTRACTS: List[Dict] = [
    # ── Identifiers ─────────────────────────────────────────────────────
    {"column": "unique_id", "type": "id", "required": True, "unique": True},
    # ── Demographics ────────────────────────────────────────────────────
    {"column": "age", "type": "numeric", "required": True, "min": 15, "max": 120},
    {
        "column": "gender",
        "type": "categorical",
        "required": True,
        "allowed": ["Male", "Female", "Other"],
    },
    {"column": "nationality", "type": "categorical", "required": True},
    {"column": "education_level", "type": "categorical", "required": True},
    # ── Business ────────────────────────────────────────────────────────
    {"column": "revenue", "type": "numeric", "required": True, "min": 0},
    {"column": "hh_expense", "type": "numeric", "required": True, "min": 0},
    {"column": "monthly_customer", "type": "numeric", "required": False, "min": 0},
    {"column": "job_created", "type": "numeric", "required": False, "min": 0},
    {"column": "business_sector", "type": "categorical", "required": True},
    {"column": "business_sub_sector", "type": "categorical", "required": False},
    {"column": "client_location", "type": "categorical", "required": True},
    {"column": "is_business_registered", "type": "categorical", "required": True},
    {"column": "kept_sales_record", "type": "categorical", "required": False},
    {
        "column": "revenue_to_expense_ratio",
        "type": "numeric",
        "required": False,
        "min": 0,
    },
    # ── Loan / Banking ─────────────────────────────────────────────────
    {
        "column": "has_access_to_finance_in_past_6months",
        "type": "categorical",
        "required": False,
    },
    {"column": "have_bank_account", "type": "categorical", "required": False},
    {"column": "disbursedAmount", "type": "numeric", "required": False, "min": 0},
    {"column": "currentBalance", "type": "numeric", "required": False, "min": 0},
    {"column": "daysInArrears", "type": "numeric", "required": False, "min": 0},
    {
        "column": "repayment_ratio",
        "type": "numeric",
        "required": False,
        "min": 0,
        "max": 5,
    },
    # ── NPS / Survey ───────────────────────────────────────────────────
    {"column": "nps_net", "type": "numeric", "required": False, "min": -1, "max": 1},
    {"column": "survey_name", "type": "categorical", "required": False},
]


def _evaluate_contracts(df: pd.DataFrame) -> Dict:
    """Run data quality contracts against the given DataFrame."""
    total_rows = len(df)
    total_cols = len(df.columns)
    actual_cols = set(df.columns)

    column_profiles: List[Dict] = []
    violations: List[Dict] = []
    missing_required: List[str] = []
    overall_pass = 0
    overall_total = 0

    for contract in _DATA_CONTRACTS:
        col = contract["column"]
        present = col in actual_cols

        # Track missing required columns
        if contract.get("required") and not present:
            missing_required.append(col)
            violations.append(
                {
                    "column": col,
                    "rule": "required_column",
                    "severity": "critical",
                    "message": f"Required column '{col}' is missing from dataset",
                    "affected_rows": total_rows,
                }
            )
            overall_total += 1
            continue

        if not present:
            overall_total += 1
            overall_pass += 1  # optional column absent is OK
            continue

        series = df[col]
        profile: Dict = {
            "column": col,
            "type": contract["type"],
            "required": contract.get("required", False),
            "present": True,
            "total_rows": total_rows,
            "null_count": int(series.isna().sum()),
            "null_pct": round(float(series.isna().mean()) * 100, 1),
            "fill_rate": round(float(series.notna().mean()) * 100, 1),
            "distinct_count": int(series.nunique()),
            "checks_passed": 0,
            "checks_total": 0,
        }

        checks_ok = 0
        checks_n = 0

        # 1. Completeness check (required columns must have ≥90% filled)
        if contract.get("required"):
            checks_n += 1
            if profile["fill_rate"] >= 90:
                checks_ok += 1
            else:
                violations.append(
                    {
                        "column": col,
                        "rule": "completeness",
                        "severity": "warning",
                        "message": f"'{col}' fill rate {profile['fill_rate']}% is below 90% threshold",
                        "affected_rows": profile["null_count"],
                    }
                )

        # 2. Uniqueness check
        if contract.get("unique"):
            checks_n += 1
            dup_count = int(series.dropna().duplicated().sum())
            profile["duplicate_count"] = dup_count
            if dup_count == 0:
                checks_ok += 1
            else:
                violations.append(
                    {
                        "column": col,
                        "rule": "uniqueness",
                        "severity": "error",
                        "message": f"'{col}' has {dup_count} duplicate values",
                        "affected_rows": dup_count,
                    }
                )

        # 3. Range checks (numeric)
        if contract["type"] == "numeric" and series.notna().sum() > 0:
            numeric_s = pd.to_numeric(series, errors="coerce").dropna()
            if len(numeric_s) > 0:
                profile["min"] = round(float(numeric_s.min()), 4)
                profile["max"] = round(float(numeric_s.max()), 4)
                profile["mean"] = round(float(numeric_s.mean()), 4)
                profile["std"] = round(float(numeric_s.std()), 4)

                if "min" in contract:
                    checks_n += 1
                    below = int((numeric_s < contract["min"]).sum())
                    if below == 0:
                        checks_ok += 1
                    else:
                        violations.append(
                            {
                                "column": col,
                                "rule": "range_min",
                                "severity": "warning",
                                "message": f"'{col}' has {below} values below minimum {contract['min']}",
                                "affected_rows": below,
                            }
                        )

                if "max" in contract:
                    checks_n += 1
                    above = int((numeric_s > contract["max"]).sum())
                    if above == 0:
                        checks_ok += 1
                    else:
                        violations.append(
                            {
                                "column": col,
                                "rule": "range_max",
                                "severity": "warning",
                                "message": f"'{col}' has {above} values above maximum {contract['max']}",
                                "affected_rows": above,
                            }
                        )

                # Outlier check (>3σ from mean)
                if numeric_s.std() > 0:
                    checks_n += 1
                    mean_v = numeric_s.mean()
                    std_v = numeric_s.std()
                    outliers = int(((numeric_s - mean_v).abs() > 3 * std_v).sum())
                    profile["outlier_count"] = outliers
                    if outliers <= max(1, int(total_rows * 0.05)):
                        checks_ok += 1
                    else:
                        violations.append(
                            {
                                "column": col,
                                "rule": "outlier",
                                "severity": "info",
                                "message": f"'{col}' has {outliers} statistical outliers (>3σ)",
                                "affected_rows": outliers,
                            }
                        )

        # 4. Allowed-values check (categorical)
        if contract["type"] == "categorical" and "allowed" in contract:
            checks_n += 1
            actual_vals = set(series.dropna().unique())
            invalid = actual_vals - set(contract["allowed"])
            if len(invalid) == 0:
                checks_ok += 1
            else:
                inv_count = int(series.isin(invalid).sum())
                violations.append(
                    {
                        "column": col,
                        "rule": "allowed_values",
                        "severity": "warning",
                        "message": f"'{col}' has {len(invalid)} unexpected value(s): {', '.join(str(v) for v in sorted(invalid)[:5])}",
                        "affected_rows": inv_count,
                    }
                )

        # 5. Type consistency check
        if contract["type"] == "numeric":
            checks_n += 1
            non_null = series.dropna()
            if len(non_null) > 0:
                coerced = pd.to_numeric(non_null, errors="coerce")
                non_numeric = int(coerced.isna().sum())
                if non_numeric == 0:
                    checks_ok += 1
                else:
                    violations.append(
                        {
                            "column": col,
                            "rule": "type_check",
                            "severity": "error",
                            "message": f"'{col}' has {non_numeric} non-numeric values in a numeric column",
                            "affected_rows": non_numeric,
                        }
                    )
            else:
                checks_ok += 1  # all null — no type violations

        profile["checks_passed"] = checks_ok
        profile["checks_total"] = checks_n
        overall_pass += checks_ok
        overall_total += checks_n
        column_profiles.append(profile)

    # Overall quality score
    quality_score = (
        round((overall_pass / overall_total * 100), 1) if overall_total > 0 else 100.0
    )

    # Column completeness overview
    completeness_summary = []
    for c in df.columns:
        fill = round(float(df[c].notna().mean()) * 100, 1)
        completeness_summary.append({"column": c, "fill_rate": fill})
    completeness_summary.sort(key=lambda x: x["fill_rate"])

    # Severity distribution
    sev_counts = {"critical": 0, "error": 0, "warning": 0, "info": 0}
    for v in violations:
        sev_counts[v["severity"]] = sev_counts.get(v["severity"], 0) + 1

    return {
        "total_rows": total_rows,
        "total_columns": total_cols,
        "contracted_columns": len(_DATA_CONTRACTS),
        "present_contracted": sum(1 for p in column_profiles if p.get("present")),
        "missing_required": missing_required,
        "quality_score": quality_score,
        "checks_passed": overall_pass,
        "checks_total": overall_total,
        "violations": violations,
        "violation_severity": sev_counts,
        "column_profiles": column_profiles,
        "completeness_summary": completeness_summary,
    }


@router.get("/data-quality")
async def get_data_quality(db: AsyncSession = Depends(get_db)):
    """
        Run data quality contracts against curated anonymized data in Postgres.
    Returns column-level profiling, contract violations, and quality score.
    No authentication required - frontend handles access control.
    """
    try:
        dq_sql = text(
            """
            WITH latest_loan AS (
                SELECT *
                FROM (
                    SELECT
                        i.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY i.client_id
                            ORDER BY i.disbursement_date DESC NULLS LAST, i.loan_number
                        ) AS rn
                    FROM vw_anon_investment_curated i
                ) ranked
                WHERE rn = 1
            )
            SELECT
                imp.unique_id,
                imp.survey_date,
                imp.country_code,
                NULL::numeric AS age,
                NULL::text AS gender,
                imp.nationality,
                imp.education_level,
                imp.revenue::numeric AS revenue,
                NULL::numeric AS hh_expense,
                NULL::numeric AS monthly_customer,
                imp.jobs_created_3m::numeric AS job_created,
                imp.business_sector,
                imp.business_sub_sector,
                imp.client_location,
                NULL::text AS is_business_registered,
                NULL::text AS kept_sales_record,
                NULL::text AS has_access_to_finance_in_past_6months,
                NULL::text AS have_bank_account,
                loan.disbursed_amount::numeric AS "disbursedAmount",
                loan.current_balance::numeric AS "currentBalance",
                loan.days_in_arrears::numeric AS "daysInArrears",
                CASE
                    WHEN COALESCE(loan.disbursed_amount, 0) = 0 THEN NULL
                    ELSE COALESCE(loan.actual_payment_amount, 0) / NULLIF(loan.disbursed_amount, 0)
                END::numeric AS repayment_ratio,
                (
                    CASE WHEN imp.nps_promoter THEN 1 ELSE 0 END
                    - CASE WHEN imp.nps_detractor THEN 1 ELSE 0 END
                )::numeric AS nps_net,
                NULL::text AS survey_name,
                NULL::numeric AS revenue_to_expense_ratio
            FROM vw_anon_impact_curated imp
            LEFT JOIN latest_loan loan ON loan.client_id = imp.client_id
            ORDER BY imp.survey_date DESC NULLS LAST
            LIMIT 5000
            """
        )

        rows = (await db.execute(dq_sql)).mappings().all()
        df = pd.DataFrame(rows)

        result = _evaluate_contracts(df)
        result["source"] = "vw_anon_impact_curated + vw_anon_investment_curated"

        return JSONResponse(content=result)
    except Exception as e:
        logger.error(f"Data quality check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Data quality check failed: {str(e)}"
        )
