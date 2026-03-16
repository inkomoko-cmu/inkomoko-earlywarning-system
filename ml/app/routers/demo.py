"""Demo UI router — serves the single-page demo interface."""

from __future__ import annotations

import datetime
import json
import math
import os
import random
import traceback
from io import BytesIO
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, File, Query, UploadFile
from fastapi.responses import HTMLResponse, Response
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    classification_report,
    mean_absolute_error,
    mean_squared_error,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OrdinalEncoder, StandardScaler

from app.config import (
    HORIZONS,
    LEAKAGE_COLS,
    METRICS_DIR,
    MODELS_DIR,
    PREDICTIONS_DIR,
    RISK_LABELS,
)
from app.models import get_registry, load_models
from app.preprocessing import align_features

router = APIRouter(prefix="/demo", tags=["demo"])

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "Docs"

# ── In-memory data store (shared across all pipeline tabs) ──────────────────
_stored_data: dict = {
    "records": [],  # list[dict] — the cleaned rows
    "filename": None,  # original filename
    "row_count": 0,
}

# ── In-memory audit log for traceability ────────────────────────────────────
_audit_log: list[dict] = []
_AUDIT_MAX = 5000  # cap to prevent unbounded growth


def _log_event(
    action: str,
    category: str = "system",
    severity: str = "info",
    actor: str = "system",
    details: str = "",
    meta: dict | None = None,
) -> None:
    """Append an event to the in-memory audit trail.

    Parameters
    ----------
    action : str   — Short description of the event (e.g. "Data uploaded").
    category : str — One of: data, prediction, model, advisory, system.
    severity : str — One of: info, warning, error, critical.
    actor : str    — Who triggered the action (default "system").
    details : str  — Human-readable extra context.
    meta : dict    — Machine-readable metadata (counts, ids, etc.).
    """
    entry = {
        "id": len(_audit_log) + 1,
        "timestamp": datetime.datetime.now(tz=datetime.timezone.utc).isoformat(),
        "action": action,
        "category": category,
        "severity": severity,
        "actor": actor,
        "details": details,
        "meta": meta or {},
    }
    _audit_log.append(entry)
    # Evict oldest entries if we exceed the cap
    if len(_audit_log) > _AUDIT_MAX:
        _audit_log[:] = _audit_log[-_AUDIT_MAX:]


def _clean_value(v):
    """Convert NaN / inf / numpy types to JSON-safe Python primitives."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        f = float(v)
        return None if (math.isnan(f) or math.isinf(f)) else f
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def _clean_records(records: list[dict]) -> list[dict]:
    return [{k: _clean_value(v) for k, v in row.items()} for row in records]


@router.get("", response_class=HTMLResponse, summary="Demo UI")
async def demo_page():
    """Serve the single-page demo interface."""
    html_path = TEMPLATE_DIR / "demo.html"
    return HTMLResponse(content=html_path.read_text(encoding="utf-8"))


@router.get("/sample-data", summary="Random sample rows for the demo form")
async def sample_data(n: int = Query(default=1, ge=1, le=10)):
    """Return *n* random rows from the test predictions file (input features only).

    Target / leakage columns are stripped so the payload is ready
    to POST straight to ``/predict/*``.
    """
    csv_path = PREDICTIONS_DIR / "test.csv"
    df = pd.read_csv(csv_path)

    # Drop target / leakage columns that should not be sent as input
    _target_names = set()
    for h in HORIZONS:
        _target_names |= {
            f"risk_tier_{h}m",
            f"risk_score_{h}m",
            f"jobs_created_{h}m",
            f"jobs_lost_{h}m",
            f"revenue_{h}m",
        }
    drop_cols = [
        c
        for c in df.columns
        if c.startswith("pred_")
        or c in _target_names
        or c in {"survey_date", "survey_id", "loanNumber", "clientId"}
    ]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    n = min(n, len(df))
    sample = df.sample(n=n, random_state=random.randint(0, 99999))

    records = _clean_records(sample.to_dict(orient="records"))
    body = json.dumps(records, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.post(
    "/upload-excel", summary="Parse an uploaded Excel/CSV file into JSON records"
)
async def upload_excel(file: UploadFile = File(...)):
    """Accept an Excel (.xlsx/.xls) or CSV file upload and return its rows
    as a JSON array ready to paste into the prediction editor.

    Target / leakage columns are automatically stripped.
    """
    contents = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith((".xlsx", ".xls")):
        df = pd.read_excel(BytesIO(contents))
    elif filename.endswith(".csv"):
        df = pd.read_csv(BytesIO(contents))
    else:
        return Response(
            content=json.dumps(
                {"detail": "Unsupported file type. Upload .xlsx, .xls, or .csv"}
            ),
            status_code=400,
            media_type="application/json",
        )

    # Drop target / leakage columns (same list as sample-data)
    _target_names = set()
    for h in HORIZONS:
        _target_names |= {
            f"risk_tier_{h}m",
            f"risk_score_{h}m",
            f"jobs_created_{h}m",
            f"jobs_lost_{h}m",
            f"revenue_{h}m",
        }
    drop_cols = [
        c
        for c in df.columns
        if c.startswith("pred_")
        or c in _target_names
        or c in {"survey_date", "survey_id", "loanNumber", "clientId"}
    ]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    records = _clean_records(df.to_dict(orient="records"))

    # Auto-store in memory so all pipelines can reuse
    _stored_data["records"] = records
    _stored_data["filename"] = file.filename
    _stored_data["row_count"] = len(records)

    _log_event(
        action="Data uploaded",
        category="data",
        severity="info",
        actor="user",
        details=f"Uploaded {file.filename} with {len(records)} records.",
        meta={"filename": file.filename, "row_count": len(records)},
    )

    body = json.dumps(records, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.get("/stored-data", summary="Retrieve data currently held in memory")
async def get_stored_data():
    """Return the records previously uploaded via /upload-excel.

    Returns an object with ``records``, ``filename``, and ``row_count``.
    If nothing has been stored yet, ``records`` will be an empty list.
    """
    body = json.dumps(_stored_data, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.delete("/stored-data", summary="Clear the in-memory data store")
async def clear_stored_data():
    """Remove all records from the in-memory store."""
    prev_name = _stored_data["filename"]
    prev_count = _stored_data["row_count"]
    _stored_data["records"] = []
    _stored_data["filename"] = None
    _stored_data["row_count"] = 0
    _log_event(
        action="Data cleared",
        category="data",
        severity="warning",
        actor="user",
        details=f"Cleared {prev_count} records (was: {prev_name}).",
        meta={"previous_filename": prev_name, "cleared_rows": prev_count},
    )
    return {"status": "cleared"}


@router.post("/client-profile", summary="Run all 3 pipelines on a single client")
async def client_profile(record: dict):
    """Accept a single client record and return predictions from all three
    model pipelines (risk, employment, revenue) combined into one response.
    """
    reg = get_registry()
    df = pd.DataFrame([record])
    uid = record.get("unique_id")

    profile: dict = {"unique_id": uid, "input": record}

    # ── Risk pipeline ───────────────────────────────────────────────────
    try:
        X_r = align_features(df.copy(), reg.risk_features)
        tier_proba_3m = reg.risk_tier[3].predict_proba(X_r)
        risk_data: dict = {
            "pred_risk_tier_low_p": round(float(tier_proba_3m[0, 0]), 6),
            "pred_risk_tier_medium_p": round(float(tier_proba_3m[0, 1]), 6),
            "pred_risk_tier_high_p": round(float(tier_proba_3m[0, 2]), 6),
        }
        for h in HORIZONS:
            score = float(np.clip(reg.risk_score[h].predict(X_r), 0, 1)[0])
            tier = int(reg.risk_tier[h].predict(X_r)[0])
            risk_data[f"pred_risk_score_{h}m"] = round(score, 6)
            risk_data[f"pred_risk_tier_{h}m"] = RISK_LABELS.get(tier, "UNKNOWN")
        risk_data["pred_risk_tier"] = risk_data["pred_risk_tier_3m"]
        profile["risk"] = risk_data
    except Exception as exc:
        profile["risk"] = {"error": str(exc)}

    # ── Employment pipeline ─────────────────────────────────────────────
    try:
        X_e = align_features(df.copy(), reg.employment_features)
        emp_data: dict = {}
        for h in HORIZONS:
            jc = float(np.maximum(0, reg.employment_jobs_created[h].predict(X_e))[0])
            jl = float(np.maximum(0, reg.employment_jobs_lost[h].predict(X_e))[0])
            emp_data[f"pred_jobs_created_{h}m"] = round(jc, 2)
            emp_data[f"pred_jobs_lost_{h}m"] = round(jl, 2)
        emp_data["pred_net_employment"] = round(
            emp_data["pred_jobs_created_3m"] - emp_data["pred_jobs_lost_3m"], 2
        )
        profile["employment"] = emp_data
    except Exception as exc:
        profile["employment"] = {"error": str(exc)}

    # ── Revenue pipeline ────────────────────────────────────────────────
    try:
        X_v = align_features(df.copy(), reg.revenue_features)
        rev_data: dict = {}
        for h in HORIZONS:
            rev = float(np.maximum(0, reg.revenue[h].predict(X_v))[0])
            rev_data[f"pred_revenue_{h}m"] = round(rev, 2)
        profile["revenue"] = rev_data
    except Exception as exc:
        profile["revenue"] = {"error": str(exc)}

    cleaned = _clean_records([profile])[0]

    _log_event(
        action="Client profile scored",
        category="prediction",
        severity="info",
        actor="user",
        details=f"Single-client prediction for {uid}.",
        meta={"unique_id": uid, "pipelines": ["risk", "employment", "revenue"]},
    )

    body = json.dumps(cleaned, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.post("/predict-all", summary="Run all 3 pipelines on a batch of records")
async def predict_all(records: list[dict]):
    """Accept an array of client records and run **all three** model pipelines
    (risk, employment, revenue) in one call.  Returns a dict keyed by pipeline
    name, each containing a ``predictions`` list and ``meta`` object that match
    the format of the individual ``/predict/*`` endpoints.
    """
    if not records:
        return Response(
            content=json.dumps({"detail": "Empty payload"}),
            status_code=422,
            media_type="application/json",
        )

    reg = get_registry()
    df = pd.DataFrame(records)
    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)

    result: dict = {}

    # ── Risk pipeline ───────────────────────────────────────────────────
    try:
        X_r = align_features(df.copy(), reg.risk_features)
        scores = {}
        tiers = {}
        for h in HORIZONS:
            scores[h] = np.clip(reg.risk_score[h].predict(X_r), 0, 1)
            tiers[h] = reg.risk_tier[h].predict(X_r)
        tier_proba_3m = reg.risk_tier[3].predict_proba(X_r)

        risk_items = []
        for i in range(len(df)):
            item = {
                "unique_id": ids[i],
                "pred_risk_tier": RISK_LABELS.get(int(tiers[3][i]), "UNKNOWN"),
                "pred_risk_tier_low_p": round(float(tier_proba_3m[i, 0]), 6),
                "pred_risk_tier_medium_p": round(float(tier_proba_3m[i, 1]), 6),
                "pred_risk_tier_high_p": round(float(tier_proba_3m[i, 2]), 6),
            }
            for h in HORIZONS:
                item[f"pred_risk_score_{h}m"] = round(float(scores[h][i]), 6)
                item[f"pred_risk_tier_{h}m"] = RISK_LABELS.get(
                    int(tiers[h][i]), "UNKNOWN"
                )
            risk_items.append(item)
        result["risk"] = {
            "meta": {"model_pipeline": "risk", "record_count": len(risk_items)},
            "predictions": risk_items,
        }
    except Exception as exc:
        result["risk"] = {"error": str(exc)}

    # ── Employment pipeline ─────────────────────────────────────────────
    try:
        X_e = align_features(df.copy(), reg.employment_features)
        jc = {}
        jl = {}
        for h in HORIZONS:
            jc[h] = np.maximum(0, reg.employment_jobs_created[h].predict(X_e))
            jl[h] = np.maximum(0, reg.employment_jobs_lost[h].predict(X_e))

        emp_items = []
        for i in range(len(df)):
            item = {"unique_id": ids[i]}
            for h in HORIZONS:
                item[f"pred_jobs_created_{h}m"] = round(float(jc[h][i]), 2)
                item[f"pred_jobs_lost_{h}m"] = round(float(jl[h][i]), 2)
            emp_items.append(item)
        result["employment"] = {
            "meta": {"model_pipeline": "employment", "record_count": len(emp_items)},
            "predictions": emp_items,
        }
    except Exception as exc:
        result["employment"] = {"error": str(exc)}

    # ── Revenue pipeline ────────────────────────────────────────────────
    try:
        X_v = align_features(df.copy(), reg.revenue_features)
        rev = {}
        for h in HORIZONS:
            rev[h] = np.maximum(0, reg.revenue[h].predict(X_v))

        rev_items = []
        for i in range(len(df)):
            item = {"unique_id": ids[i]}
            for h in HORIZONS:
                item[f"pred_revenue_{h}m"] = round(float(rev[h][i]), 2)
            rev_items.append(item)
        result["revenue"] = {
            "meta": {"model_pipeline": "revenue", "record_count": len(rev_items)},
            "predictions": rev_items,
        }
    except Exception as exc:
        result["revenue"] = {"error": str(exc)}

    cleaned = _clean_records([result])[0]

    _log_event(
        action="Batch prediction completed",
        category="prediction",
        severity="info",
        actor="user",
        details=f"Ran all 3 pipelines on {len(records)} records.",
        meta={
            "record_count": len(records),
            "pipelines": ["risk", "employment", "revenue"],
        },
    )

    body = json.dumps(cleaned, allow_nan=False)
    return Response(content=body, media_type="application/json")


# ── Analytics helpers ───────────────────────────────────────────────────────
def _value_counts(series: pd.Series, top_n: int = 10) -> dict:
    """Return {label: count} for the top-N values."""
    vc = series.dropna().value_counts().head(top_n)
    return {str(k): int(v) for k, v in vc.items()}


def _numeric_stats(series: pd.Series) -> dict:
    s = series.dropna()
    if len(s) == 0:
        return {}
    return {
        "count": int(len(s)),
        "mean": round(float(s.mean()), 2),
        "median": round(float(s.median()), 2),
        "std": round(float(s.std()), 2),
        "min": round(float(s.min()), 2),
        "max": round(float(s.max()), 2),
        "q25": round(float(s.quantile(0.25)), 2),
        "q75": round(float(s.quantile(0.75)), 2),
    }


def _histogram(series: pd.Series, bins: int = 12) -> dict:
    """Return histogram {labels, counts} for a numeric column."""
    s = series.dropna()
    if len(s) == 0:
        return {"labels": [], "counts": []}
    counts_arr, edges = np.histogram(s, bins=bins)
    labels = [
        f"{round(float(edges[i]),1)}-{round(float(edges[i+1]),1)}"
        for i in range(len(counts_arr))
    ]
    return {"labels": labels, "counts": [int(c) for c in counts_arr]}


def _cross_tab(df: pd.DataFrame, cat_col: str, num_col: str, agg: str = "mean") -> dict:
    """Return {category: aggregated_value} for a categorical x numeric pair."""
    if cat_col not in df.columns or num_col not in df.columns:
        return {}
    grouped = (
        df.groupby(cat_col)[num_col]
        .agg(agg)
        .dropna()
        .sort_values(ascending=False)
        .head(10)
    )
    return {str(k): round(float(v), 2) for k, v in grouped.items()}


# ── Portfolio endpoint ──────────────────────────────────────────────────────


def _recommend_action(tier: str) -> str:
    """Return a recommended action string based on the predicted risk tier."""
    actions = {
        "LOW": "Growth planning + market linkage support",
        "MEDIUM": "Targeted mentoring + inventory optimization",
        "HIGH": "Immediate coaching + cashflow review + weekly follow-up",
    }
    return actions.get(tier, "Monitor and assess")


@router.get("/portfolio", summary="Score all enterprises and return portfolio table")
async def portfolio():
    """Run all 3 model pipelines on either the stored data or the built-in
    test dataset and return a flat table suitable for the Portfolio view.

    Each row contains: unique_id, country, program, sector, risk_tier,
    risk_score (3m), revenue_3m, jobs_created_3m, jobs_lost_3m,
    and a recommended_action derived from the risk tier.
    """
    reg = get_registry()

    # Use stored data if available, otherwise fall back to test CSV
    if _stored_data["row_count"] > 0:
        df = pd.DataFrame(_stored_data["records"])
        data_source = _stored_data["filename"]
    else:
        csv_path = PREDICTIONS_DIR / "test.csv"
        df = pd.read_csv(csv_path)
        data_source = "test.csv (built-in)"

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)

    # ── Run risk models ─────────────────────────────────────────────────
    try:
        X_r = align_features(df.copy(), reg.risk_features)
        risk_scores_3m = np.clip(reg.risk_score[3].predict(X_r), 0, 1)
        risk_tiers_3m = reg.risk_tier[3].predict(X_r)
    except Exception:
        risk_scores_3m = np.full(len(df), 0.0)
        risk_tiers_3m = np.full(len(df), 0)

    # ── Run employment models ───────────────────────────────────────────
    try:
        X_e = align_features(df.copy(), reg.employment_features)
        jc_3m = np.maximum(0, reg.employment_jobs_created[3].predict(X_e))
        jl_3m = np.maximum(0, reg.employment_jobs_lost[3].predict(X_e))
    except Exception:
        jc_3m = np.zeros(len(df))
        jl_3m = np.zeros(len(df))

    # ── Run revenue models ──────────────────────────────────────────────
    try:
        X_v = align_features(df.copy(), reg.revenue_features)
        rev_3m = np.maximum(0, reg.revenue[3].predict(X_v))
    except Exception:
        rev_3m = np.zeros(len(df))

    # ── Build rows ──────────────────────────────────────────────────────
    enterprises = []
    raw_records = []  # full input records for profile lookups
    for i in range(len(df)):
        tier = RISK_LABELS.get(int(risk_tiers_3m[i]), "UNKNOWN")
        row = {
            "unique_id": ids[i],
            "country": (
                str(df.iloc[i].get("country", "")) if "country" in df.columns else ""
            ),
            "program": (
                str(df.iloc[i].get("program_enrolled", ""))
                if "program_enrolled" in df.columns
                else ""
            ),
            "sector": (
                str(df.iloc[i].get("business_sector", ""))
                if "business_sector" in df.columns
                else ""
            ),
            "risk_tier": tier,
            "risk_score": round(float(risk_scores_3m[i]), 6),
            "revenue_3m": round(float(rev_3m[i]), 2),
            "jobs_created_3m": round(float(jc_3m[i]), 2),
            "jobs_lost_3m": round(float(jl_3m[i]), 2),
            "recommended_action": _recommend_action(tier),
        }
        enterprises.append(row)
        # Store the full raw input record for client-profile lookups
        raw_rec = {}
        for col in df.columns:
            v = df.iloc[i][col]
            if pd.isna(v):
                raw_rec[col] = None
            elif hasattr(v, "item"):  # numpy scalar
                raw_rec[col] = v.item()
            else:
                raw_rec[col] = v
        raw_records.append(raw_rec)

    result = {
        "source": data_source,
        "total": len(enterprises),
        "enterprises": _clean_records(enterprises),
        "raw_records": _clean_records(raw_records),
    }

    _log_event(
        action="Portfolio generated",
        category="prediction",
        severity="info",
        actor="user",
        details=f"Scored {len(enterprises)} enterprises from {data_source}.",
        meta={"enterprise_count": len(enterprises), "source": data_source},
    )

    body = json.dumps(result, allow_nan=False)
    return Response(content=body, media_type="application/json")


# ── Advisory Plan — governance-aware recommendations ────────────────────────

# Governance frameworks mapping
_GOVERNANCE_FRAMEWORKS = {
    "Rwanda": {
        "name": "Rwanda SME Policy & MSME Development Strategy",
        "regulator": "Rwanda Development Board (RDB)",
        "tax_note": "Flat 3% turnover tax for micro-enterprises; VAT threshold RWF 20M",
        "labor_note": "Minimum wage review pending; social security (RSSB) mandatory for 1+ employees",
        "lending_note": "BNR interest rate cap guidelines; microfinance regulated under BNR",
        "compliance": [
            "Annual business registration renewal (RDB)",
            "RSSB social security contributions",
            "RRA tax filing obligations",
            "District trade license renewal",
        ],
    },
    "Kenya": {
        "name": "Kenya Micro and Small Enterprises Act 2012",
        "regulator": "Micro and Small Enterprises Authority (MSEA)",
        "tax_note": "Turnover tax 1% for income < KES 25M; iTax digital filing mandatory",
        "labor_note": "Minimum wage set by Labour Cabinet Secretary; NSSF/NHIF mandatory",
        "lending_note": "Interest rate environment liberalized; Credit Guarantee Scheme for MSMEs",
        "compliance": [
            "KRA tax compliance certificate",
            "County single business permit",
            "NSSF and NHIF remittances",
            "OSHA workplace registration (5+ employees)",
        ],
    },
    "South Sudan": {
        "name": "South Sudan Investment Promotion Act",
        "regulator": "South Sudan Investment Authority",
        "tax_note": "Personal income tax 10-20%; business profit tax 10-20% progressive",
        "labor_note": "Labour Act 2017; limited formal social security infrastructure",
        "lending_note": "Central Bank oversight; limited formal credit infrastructure",
        "compliance": [
            "Business registration with Ministry of Justice",
            "State-level trade license",
            "Tax registration certificate",
            "Annual returns filing",
        ],
    },
}

_DEFAULT_GOVERNANCE = {
    "name": "General MSME Best Practice Framework",
    "regulator": "National MSME Authority",
    "tax_note": "Follow local tax filing requirements and deadlines",
    "labor_note": "Ensure compliance with local labor regulations and social security",
    "lending_note": "Review central bank lending guidelines before taking additional credit",
    "compliance": [
        "Maintain current business registration",
        "File taxes on schedule",
        "Keep employment records updated",
        "Renew operating permits annually",
    ],
}


def _build_advisory_plan(
    tier: str,
    risk_score: float,
    revenue_3m: float,
    jobs_created_3m: float,
    jobs_lost_3m: float,
    country: str,
    sector: str,
    program: str,
    has_loan: bool,
    revenue_last_month: float,
) -> dict:
    """Build a structured advisory plan for a single enterprise."""

    gov = _GOVERNANCE_FRAMEWORKS.get(country, _DEFAULT_GOVERNANCE)
    net_jobs = jobs_created_3m - jobs_lost_3m

    # ── Priority level ──────────────────────────────────────────────────
    if tier == "HIGH":
        priority = "CRITICAL"
        priority_color = "#dc2626"
        timeline = "Immediate (within 1 week)"
    elif tier == "MEDIUM":
        priority = "ELEVATED"
        priority_color = "#d97706"
        timeline = "Short-term (within 2-4 weeks)"
    else:
        priority = "ROUTINE"
        priority_color = "#059669"
        timeline = "Standard cycle (next quarter)"

    # ── Recommendations by domain ───────────────────────────────────────
    financial_recs = []
    operational_recs = []
    growth_recs = []
    governance_recs = []
    employment_recs = []

    # Financial recommendations
    if tier == "HIGH":
        financial_recs.append(
            {
                "action": "Emergency cashflow analysis",
                "detail": "Conduct weekly cash-in / cash-out tracking for at least 4 weeks to identify liquidity gaps.",
                "urgency": "critical",
            }
        )
        financial_recs.append(
            {
                "action": "Expense reduction review",
                "detail": "Identify non-essential costs that can be deferred or eliminated to extend runway.",
                "urgency": "critical",
            }
        )
        if has_loan:
            financial_recs.append(
                {
                    "action": "Loan restructuring consultation",
                    "detail": f"Engage lender for potential payment holiday or term extension. ({gov['lending_note']})",
                    "urgency": "high",
                }
            )
    elif tier == "MEDIUM":
        financial_recs.append(
            {
                "action": "Financial health check",
                "detail": "Review profit margins, receivables aging, and working capital adequacy.",
                "urgency": "medium",
            }
        )
        if revenue_3m < revenue_last_month * 2.5:
            financial_recs.append(
                {
                    "action": "Revenue diversification",
                    "detail": "Explore adding complementary products/services to reduce single-source dependency.",
                    "urgency": "medium",
                }
            )
    else:
        financial_recs.append(
            {
                "action": "Growth investment planning",
                "detail": "With stable finances, consider reinvesting 10-15% of profits into capacity expansion.",
                "urgency": "low",
            }
        )
        financial_recs.append(
            {
                "action": "Savings buffer target",
                "detail": "Build an emergency fund covering 3 months of operating expenses.",
                "urgency": "low",
            }
        )

    # Tax & compliance (governance-aware)
    governance_recs.append(
        {
            "action": f"Regulatory compliance check ({gov['regulator']})",
            "detail": f"Verify standing under {gov['name']}. {gov['tax_note']}",
            "urgency": "medium" if tier != "LOW" else "low",
        }
    )
    for item in gov["compliance"]:
        governance_recs.append(
            {
                "action": item,
                "detail": "Ensure current status and upcoming deadlines are tracked.",
                "urgency": "low",
            }
        )

    # Employment recommendations
    if net_jobs < -1:
        employment_recs.append(
            {
                "action": "Workforce retention strategy",
                "detail": f"Projected net loss of {abs(round(net_jobs))} jobs. Assess whether losses are voluntary or due to financial pressure. {gov['labor_note']}",
                "urgency": "high" if tier == "HIGH" else "medium",
            }
        )
        employment_recs.append(
            {
                "action": "Skills redeployment assessment",
                "detail": "Before layoffs, evaluate if staff can be redeployed to revenue-generating roles.",
                "urgency": "medium",
            }
        )
    elif net_jobs > 2:
        employment_recs.append(
            {
                "action": "Hiring readiness plan",
                "detail": f"Projected to add ~{round(net_jobs)} positions. Ensure onboarding processes and social security registration are in place. {gov['labor_note']}",
                "urgency": "low",
            }
        )
    else:
        employment_recs.append(
            {
                "action": "Team stability check",
                "detail": "Workforce is projected stable. Invest in training to improve productivity per employee.",
                "urgency": "low",
            }
        )

    # Operational recommendations
    if tier in ("HIGH", "MEDIUM"):
        operational_recs.append(
            {
                "action": "Inventory and supply chain review",
                "detail": "Audit stock levels and supplier reliability. Reduce excess inventory to free up working capital.",
                "urgency": "medium",
            }
        )
        operational_recs.append(
            {
                "action": "Customer retention outreach",
                "detail": "Proactively contact top 20% of customers to solidify relationships and secure repeat revenue.",
                "urgency": "medium",
            }
        )
    if sector:
        operational_recs.append(
            {
                "action": f"Sector benchmarking ({sector})",
                "detail": f"Compare key metrics against {sector} sector peers in {country or 'the region'} to identify performance gaps.",
                "urgency": "low",
            }
        )

    # Growth recommendations
    if tier == "LOW":
        growth_recs.append(
            {
                "action": "Market expansion assessment",
                "detail": "Evaluate adjacent markets or customer segments for revenue growth potential.",
                "urgency": "low",
            }
        )
        growth_recs.append(
            {
                "action": "Digital presence development",
                "detail": "Strengthen online visibility through social media and digital sales channels.",
                "urgency": "low",
            }
        )
        if program:
            growth_recs.append(
                {
                    "action": f"Advanced program enrollment ({program})",
                    "detail": "Leverage current program participation for mentorship and market linkage opportunities.",
                    "urgency": "low",
                }
            )
    elif tier == "MEDIUM":
        growth_recs.append(
            {
                "action": "Stabilize before scaling",
                "detail": "Focus on fixing operational inefficiencies before pursuing new growth initiatives.",
                "urgency": "medium",
            }
        )

    return {
        "priority": priority,
        "priority_color": priority_color,
        "timeline": timeline,
        "governance_framework": gov["name"],
        "regulator": gov["regulator"],
        "domains": {
            "financial": financial_recs,
            "governance": governance_recs,
            "employment": employment_recs,
            "operational": operational_recs,
            "growth": growth_recs,
        },
        "total_actions": (
            len(financial_recs)
            + len(governance_recs)
            + len(employment_recs)
            + len(operational_recs)
            + len(growth_recs)
        ),
    }


@router.get("/advisory", summary="Governance-aware advisory plans for all enterprises")
async def advisory():
    """Score all enterprises and generate per-tier advisory plans with
    governance-aware (country-specific) recommendations.

    Returns aggregate statistics plus per-enterprise advisory details.
    """
    reg = get_registry()

    if _stored_data["row_count"] > 0:
        df = pd.DataFrame(_stored_data["records"])
        data_source = _stored_data["filename"]
    else:
        csv_path = PREDICTIONS_DIR / "test.csv"
        df = pd.read_csv(csv_path)
        data_source = "test.csv (built-in)"

    ids = df["unique_id"].tolist() if "unique_id" in df.columns else [None] * len(df)

    # Run models
    try:
        X_r = align_features(df.copy(), reg.risk_features)
        risk_scores = np.clip(reg.risk_score[3].predict(X_r), 0, 1)
        risk_tiers = reg.risk_tier[3].predict(X_r)
    except Exception:
        risk_scores = np.full(len(df), 0.0)
        risk_tiers = np.full(len(df), 0)

    try:
        X_e = align_features(df.copy(), reg.employment_features)
        jc = np.maximum(0, reg.employment_jobs_created[3].predict(X_e))
        jl = np.maximum(0, reg.employment_jobs_lost[3].predict(X_e))
    except Exception:
        jc = np.zeros(len(df))
        jl = np.zeros(len(df))

    try:
        X_v = align_features(df.copy(), reg.revenue_features)
        rev = np.maximum(0, reg.revenue[3].predict(X_v))
    except Exception:
        rev = np.zeros(len(df))

    # Build advisory per enterprise
    plans = []
    tier_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
    total_actions = 0

    for i in range(len(df)):
        tier = RISK_LABELS.get(int(risk_tiers[i]), "UNKNOWN")
        tier_counts[tier] = tier_counts.get(tier, 0) + 1
        country = str(df.iloc[i].get("country", "")) if "country" in df.columns else ""
        sector = (
            str(df.iloc[i].get("business_sector", ""))
            if "business_sector" in df.columns
            else ""
        )
        program = (
            str(df.iloc[i].get("program_enrolled", ""))
            if "program_enrolled" in df.columns
            else ""
        )
        has_loan = (
            bool(df.iloc[i].get("has_loan", 0)) if "has_loan" in df.columns else False
        )
        rev_lm = (
            float(df.iloc[i].get("revenue_last_month", 0))
            if "revenue_last_month" in df.columns
            else 0.0
        )

        plan = _build_advisory_plan(
            tier=tier,
            risk_score=float(risk_scores[i]),
            revenue_3m=float(rev[i]),
            jobs_created_3m=float(jc[i]),
            jobs_lost_3m=float(jl[i]),
            country=country,
            sector=sector,
            program=program,
            has_loan=has_loan,
            revenue_last_month=rev_lm,
        )
        total_actions += plan["total_actions"]

        plans.append(
            {
                "unique_id": ids[i],
                "country": country,
                "sector": sector,
                "program": program,
                "risk_tier": tier,
                "risk_score": round(float(risk_scores[i]), 6),
                "revenue_3m": round(float(rev[i]), 2),
                "jobs_created_3m": round(float(jc[i]), 2),
                "jobs_lost_3m": round(float(jl[i]), 2),
                "advisory": plan,
            }
        )

    # Aggregate governance summary
    countries_seen = list({p["country"] for p in plans if p["country"]})
    gov_summaries = []
    for c in sorted(countries_seen):
        gov = _GOVERNANCE_FRAMEWORKS.get(c, _DEFAULT_GOVERNANCE)
        count = sum(1 for p in plans if p["country"] == c)
        high = sum(1 for p in plans if p["country"] == c and p["risk_tier"] == "HIGH")
        gov_summaries.append(
            {
                "country": c,
                "framework": gov["name"],
                "regulator": gov["regulator"],
                "enterprise_count": count,
                "high_risk_count": high,
            }
        )

    result = {
        "source": data_source,
        "total": len(plans),
        "tier_distribution": tier_counts,
        "total_actions": total_actions,
        "governance_summaries": gov_summaries,
        "plans": _clean_records(plans),
    }

    _log_event(
        action="Advisory plans generated",
        category="advisory",
        severity="info",
        actor="user",
        details=f"Generated {len(plans)} advisory plans with {total_actions} total actions.",
        meta={
            "plan_count": len(plans),
            "total_actions": total_actions,
            "tier_distribution": tier_counts,
        },
    )

    body = json.dumps(result, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.get("/analytics", summary="Compute analytics from stored or test data")
async def analytics(source: str = Query(default="stored", enum=["stored", "test"])):
    """Compute comprehensive analytics for the dashboard.

    - ``source=stored`` — use the in-memory uploaded data
    - ``source=test`` — use the test predictions CSV (has target columns)
    """
    if source == "stored" and _stored_data["row_count"] > 0:
        df = pd.DataFrame(_stored_data["records"])
        data_source = _stored_data["filename"]
    else:
        csv_path = PREDICTIONS_DIR / "test.csv"
        df = pd.read_csv(csv_path)
        data_source = "test.csv (built-in)"

    result: dict = {
        "source": data_source,
        "total_records": len(df),
        "total_columns": len(df.columns),
    }

    # ── Impact Overview — model-driven KPIs ─────────────────────────────
    # Run all models to get predictions across horizons
    reg = get_registry()
    impact: dict = {
        "total_enterprises": len(df),
    }

    # Unique clients
    if "unique_id" in df.columns:
        impact["unique_clients"] = int(df["unique_id"].nunique())

    # ── Risk predictions per horizon ────────────────────────────────────
    risk_by_horizon: dict = {}
    for h in HORIZONS:
        try:
            X_r = align_features(df.copy(), reg.risk_features)
            scores = np.clip(reg.risk_score[h].predict(X_r), 0, 1)
            tiers = reg.risk_tier[h].predict(X_r)
            tier_labels = [RISK_LABELS.get(int(t), "UNKNOWN") for t in tiers]
            tier_counts = {}
            for lbl in tier_labels:
                tier_counts[lbl] = tier_counts.get(lbl, 0) + 1
            risk_by_horizon[str(h)] = {
                "avg_risk_score": round(float(scores.mean()), 4),
                "tier_distribution": tier_counts,
                "high_risk_count": tier_counts.get("HIGH", 0),
                "medium_risk_count": tier_counts.get("MEDIUM", 0),
                "low_risk_count": tier_counts.get("LOW", 0),
            }
        except Exception:
            risk_by_horizon[str(h)] = {
                "avg_risk_score": 0,
                "tier_distribution": {},
                "high_risk_count": 0,
                "medium_risk_count": 0,
                "low_risk_count": 0,
            }
    impact["risk_by_horizon"] = risk_by_horizon

    # Primary risk tier distribution (3m)
    impact["high_risk_enterprises"] = risk_by_horizon.get("3", {}).get(
        "high_risk_count", 0
    )
    impact["risk_tier_distribution"] = risk_by_horizon.get("3", {}).get(
        "tier_distribution", {}
    )

    # ── Revenue predictions per horizon ─────────────────────────────────
    revenue_by_horizon: dict = {}
    for h in HORIZONS:
        try:
            X_v = align_features(df.copy(), reg.revenue_features)
            rev = np.maximum(0, reg.revenue[h].predict(X_v))
            revenue_by_horizon[str(h)] = {
                "total": round(float(rev.sum()), 2),
                "avg": round(float(rev.mean()), 2),
                "median": round(float(np.median(rev)), 2),
                "min": round(float(rev.min()), 2),
                "max": round(float(rev.max()), 2),
            }
        except Exception:
            revenue_by_horizon[str(h)] = {
                "total": 0,
                "avg": 0,
                "median": 0,
                "min": 0,
                "max": 0,
            }
    impact["revenue_by_horizon"] = revenue_by_horizon
    impact["total_projected_revenue"] = revenue_by_horizon.get("3", {}).get("total", 0)

    # ── Employment predictions per horizon ──────────────────────────────
    employment_by_horizon: dict = {}
    for h in HORIZONS:
        try:
            X_e = align_features(df.copy(), reg.employment_features)
            jc = np.maximum(0, reg.employment_jobs_created[h].predict(X_e))
            jl = np.maximum(0, reg.employment_jobs_lost[h].predict(X_e))
            employment_by_horizon[str(h)] = {
                "total_jobs_created": round(float(jc.sum()), 0),
                "total_jobs_lost": round(float(jl.sum()), 0),
                "net_jobs": round(float(jc.sum() - jl.sum()), 0),
                "avg_created": round(float(jc.mean()), 2),
                "avg_lost": round(float(jl.mean()), 2),
            }
        except Exception:
            employment_by_horizon[str(h)] = {
                "total_jobs_created": 0,
                "total_jobs_lost": 0,
                "net_jobs": 0,
                "avg_created": 0,
                "avg_lost": 0,
            }
    impact["employment_by_horizon"] = employment_by_horizon

    # Jobs safeguarded = total created at 3m horizon
    emp_3 = employment_by_horizon.get("3", {})
    impact["total_jobs_safeguarded"] = emp_3.get("total_jobs_created", 0)
    impact["total_jobs_created"] = emp_3.get("total_jobs_created", 0)
    impact["total_jobs_lost"] = emp_3.get("total_jobs_lost", 0)
    impact["net_jobs"] = emp_3.get("net_jobs", 0)

    # ── Trend deltas (1m → 3m) ──────────────────────────────────────────
    trends: dict = {}
    # Revenue trend
    rev_1 = revenue_by_horizon.get("1", {}).get("total", 0)
    rev_3 = revenue_by_horizon.get("3", {}).get("total", 0)
    if rev_1 > 0:
        trends["revenue_growth_pct"] = round((rev_3 - rev_1) / rev_1 * 100, 1)
    else:
        trends["revenue_growth_pct"] = 0
    trends["revenue_delta"] = round(rev_3 - rev_1, 2)

    # Jobs trend
    jc_1 = employment_by_horizon.get("1", {}).get("total_jobs_created", 0)
    jc_3 = employment_by_horizon.get("3", {}).get("total_jobs_created", 0)
    if jc_1 > 0:
        trends["jobs_growth_pct"] = round((jc_3 - jc_1) / jc_1 * 100, 1)
    else:
        trends["jobs_growth_pct"] = 0

    # Risk trend (lower risk score = better)
    rs_1 = risk_by_horizon.get("1", {}).get("avg_risk_score", 0)
    rs_3 = risk_by_horizon.get("3", {}).get("avg_risk_score", 0)
    if rs_1 > 0:
        trends["risk_change_pct"] = round((rs_3 - rs_1) / rs_1 * 100, 1)
    else:
        trends["risk_change_pct"] = 0

    # High-risk trend
    hr_1 = risk_by_horizon.get("1", {}).get("high_risk_count", 0)
    hr_3 = risk_by_horizon.get("3", {}).get("high_risk_count", 0)
    trends["high_risk_delta"] = hr_3 - hr_1

    impact["trends"] = trends

    # ── Sector breakdown ────────────────────────────────────────────────
    if "business_sector" in df.columns:
        try:
            X_r = align_features(df.copy(), reg.risk_features)
            scores_3 = np.clip(reg.risk_score[3].predict(X_r), 0, 1)
            tiers_3 = [
                RISK_LABELS.get(int(t), "UNKNOWN")
                for t in reg.risk_tier[3].predict(X_r)
            ]
            X_v = align_features(df.copy(), reg.revenue_features)
            rev_3_arr = np.maximum(0, reg.revenue[3].predict(X_v))
            sector_df = pd.DataFrame(
                {
                    "sector": df["business_sector"],
                    "risk_score": scores_3,
                    "risk_tier": tiers_3,
                    "revenue_3m": rev_3_arr,
                }
            )
            sector_agg = (
                sector_df.groupby("sector")
                .agg(
                    count=("risk_score", "size"),
                    avg_risk=("risk_score", "mean"),
                    high_risk=("risk_tier", lambda x: (x == "HIGH").sum()),
                    total_revenue=("revenue_3m", "sum"),
                )
                .reset_index()
            )
            impact["sector_breakdown"] = [
                {
                    "sector": row["sector"],
                    "count": int(row["count"]),
                    "avg_risk": round(float(row["avg_risk"]), 4),
                    "high_risk": int(row["high_risk"]),
                    "total_revenue": round(float(row["total_revenue"]), 2),
                }
                for _, row in sector_agg.iterrows()
            ]
        except Exception:
            impact["sector_breakdown"] = []

    result["impact"] = impact

    # ── Overview KPIs ───────────────────────────────────────────────────
    kpis: dict = {}
    if "age" in df.columns:
        kpis["avg_age"] = round(float(df["age"].mean()), 1)
    if "revenue" in df.columns:
        kpis["avg_revenue"] = round(float(df["revenue"].mean()), 2)
        kpis["total_revenue"] = round(float(df["revenue"].sum()), 2)
    if "hh_expense" in df.columns:
        kpis["avg_expenses"] = round(float(df["hh_expense"].mean()), 2)
    if "revenue_to_expense_ratio" in df.columns:
        s = df["revenue_to_expense_ratio"].dropna()
        if len(s) > 0:
            kpis["avg_rev_expense_ratio"] = round(float(s.mean()), 2)
    if "job_created" in df.columns:
        kpis["total_jobs_created"] = int(df["job_created"].sum())
    if "unique_id" in df.columns:
        kpis["unique_clients"] = int(df["unique_id"].nunique())
    result["kpis"] = kpis

    # ── Categorical distributions ───────────────────────────────────────
    cat_fields = [
        "gender",
        "strata_impact",
        "nationality",
        "education_level",
        "business_sector",
        "client_location",
        "business_sub_sector",
        "only_income_earner",
        "is_business_registered",
        "has_access_to_finance_in_past_6months",
        "have_bank_account",
        "kept_sales_record",
        "bz_have_new_practices",
        "bz_have_new_product",
        "survey_name",
        "risk_tier_3m",
        "countrySpecific_impact",
        "business_challenges",
        "plan_after_program",
    ]
    distributions: dict = {}
    for col in cat_fields:
        if col in df.columns:
            distributions[col] = _value_counts(df[col])
    result["distributions"] = distributions

    # ── Numeric distributions / histograms ──────────────────────────────
    num_fields = [
        "age",
        "revenue",
        "hh_expense",
        "monthly_customer",
        "number_of_people_reponsible",
        "job_created",
        "revenue_to_expense_ratio",
    ]
    # Include target cols if present (test data)
    for tc in ["risk_score_3m", "jobs_created_3m", "jobs_lost_3m", "revenue_3m"]:
        if tc in df.columns and df[tc].notna().sum() > 0:
            num_fields.append(tc)

    numeric_stats: dict = {}
    histograms: dict = {}
    for col in num_fields:
        if col in df.columns:
            numeric_stats[col] = _numeric_stats(df[col])
            histograms[col] = _histogram(df[col])
    result["numeric_stats"] = numeric_stats
    result["histograms"] = histograms

    # ── Cross-tabulations ───────────────────────────────────────────────
    cross: dict = {}
    if "business_sector" in df.columns:
        if "revenue" in df.columns:
            cross["sector_avg_revenue"] = _cross_tab(df, "business_sector", "revenue")
        if "job_created" in df.columns:
            cross["sector_avg_jobs"] = _cross_tab(df, "business_sector", "job_created")
    if "gender" in df.columns:
        if "revenue" in df.columns:
            cross["gender_avg_revenue"] = _cross_tab(df, "gender", "revenue")
        if "risk_score_3m" in df.columns and df["risk_score_3m"].notna().sum() > 0:
            cross["gender_avg_risk_score"] = _cross_tab(df, "gender", "risk_score_3m")
    if "education_level" in df.columns and "revenue" in df.columns:
        cross["education_avg_revenue"] = _cross_tab(df, "education_level", "revenue")
    if "client_location" in df.columns and "revenue" in df.columns:
        cross["location_avg_revenue"] = _cross_tab(df, "client_location", "revenue")
    if "nationality" in df.columns and "revenue" in df.columns:
        cross["nationality_avg_revenue"] = _cross_tab(df, "nationality", "revenue")
    if "strata_impact" in df.columns:
        if "revenue" in df.columns:
            cross["strata_avg_revenue"] = _cross_tab(df, "strata_impact", "revenue")
        if "risk_score_3m" in df.columns and df["risk_score_3m"].notna().sum() > 0:
            cross["strata_avg_risk_score"] = _cross_tab(
                df, "strata_impact", "risk_score_3m"
            )
    result["cross_tabs"] = cross

    # ── Correlation matrix (top numeric columns) ────────────────────────
    corr_cols = [
        c
        for c in [
            "age",
            "revenue",
            "hh_expense",
            "monthly_customer",
            "job_created",
            "revenue_to_expense_ratio",
            "risk_score_3m",
            "revenue_3m",
            "jobs_created_3m",
        ]
        if c in df.columns and df[c].notna().sum() > 5
    ]
    if len(corr_cols) >= 2:
        corr_df = df[corr_cols].corr()
        result["correlation"] = {
            "columns": corr_cols,
            "matrix": [
                [round(float(corr_df.iloc[i, j]), 3) for j in range(len(corr_cols))]
                for i in range(len(corr_cols))
            ],
        }

    cleaned = _clean_records([result])[0]
    body = json.dumps(cleaned, allow_nan=False)
    return Response(content=body, media_type="application/json")


# ── Data Quality Contracts ──────────────────────────────────────────────────

# Define data contracts: expected schema, allowed values, ranges, etc.
_DATA_CONTRACTS: list[dict] = [
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
    # ── Targets (test data only) ───────────────────────────────────────
    {
        "column": "risk_score_3m",
        "type": "numeric",
        "required": False,
        "min": 0,
        "max": 1,
    },
    {
        "column": "risk_tier_3m",
        "type": "categorical",
        "required": False,
        "allowed": ["LOW", "MEDIUM", "HIGH"],
    },
    {"column": "revenue_3m", "type": "numeric", "required": False},
    {"column": "jobs_created_3m", "type": "numeric", "required": False},
    {"column": "jobs_lost_3m", "type": "numeric", "required": False},
]


def _evaluate_contracts(df: pd.DataFrame) -> dict:
    """Run every data contract against the given DataFrame."""
    total_rows = len(df)
    total_cols = len(df.columns)
    actual_cols = set(df.columns)

    column_profiles: list[dict] = []
    violations: list[dict] = []
    missing_required: list[str] = []
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
        profile: dict = {
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

                # Outlier check (>3σ from mean) — informational
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


@router.get("/data-quality", summary="Data quality contracts — profiling & validation")
async def data_quality(source: str = Query(default="stored", enum=["stored", "test"])):
    """Run data quality contracts against stored or test data.

    Returns column-level profiling, contract violation details,
    completeness metrics, and an overall quality score.
    """
    if source == "stored" and _stored_data["row_count"] > 0:
        df = pd.DataFrame(_stored_data["records"])
        data_source = _stored_data["filename"]
    else:
        csv_path = PREDICTIONS_DIR / "test.csv"
        df = pd.read_csv(csv_path)
        data_source = "test.csv (built-in)"

    result = _evaluate_contracts(df)
    result["source"] = data_source

    _log_event(
        action="Data quality audit executed",
        category="data",
        severity="info",
        actor="user",
        details=f"Quality score {result['quality_score']}% — {len(result['violations'])} violations across {result['total_columns']} columns.",
        meta={
            "quality_score": result["quality_score"],
            "violation_count": len(result["violations"]),
            "checks_passed": result["checks_passed"],
            "checks_total": result["checks_total"],
        },
    )

    body = json.dumps(_clean_records([result])[0], allow_nan=False)
    return Response(content=body, media_type="application/json")


# ── Retraining helpers ──────────────────────────────────────────────────────

# Store the results of the last retrain for model cards
_retrain_history: dict = {}


def _build_preprocessor(num_cols: list[str], cat_cols: list[str]) -> ColumnTransformer:
    """Build the same ColumnTransformer used in the notebooks."""
    return ColumnTransformer(
        transformers=[
            (
                "num",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                num_cols,
            ),
            (
                "cat",
                Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        (
                            "enc",
                            OrdinalEncoder(
                                handle_unknown="use_encoded_value", unknown_value=-1
                            ),
                        ),
                    ]
                ),
                cat_cols,
            ),
        ],
        remainder="drop",
    )


def _detect_columns(X: pd.DataFrame):
    """Split columns into numeric and categorical."""
    num_cols = X.select_dtypes(include=[np.number]).columns.tolist()
    cat_cols = [c for c in X.columns if c not in num_cols]
    return num_cols, cat_cols


def _try_build_classifier():
    """Try LightGBM → XGBoost → RandomForest for classification."""
    try:
        import lightgbm as lgb

        return lgb.LGBMClassifier(
            random_state=42,
            objective="multiclass",
            num_class=3,
            device_type="cpu",
            n_estimators=200,
            learning_rate=0.1,
            num_leaves=31,
            verbose=-1,
        )
    except ImportError:
        pass
    try:
        from xgboost import XGBClassifier

        return XGBClassifier(
            random_state=42,
            objective="multi:softprob",
            eval_metric="mlogloss",
            num_class=3,
            tree_method="hist",
            n_estimators=200,
        )
    except ImportError:
        pass
    return RandomForestClassifier(random_state=42, n_estimators=200, n_jobs=2)


def _try_build_regressor(n_estimators: int = 200):
    """Try LightGBM → XGBoost → RandomForest for regression."""
    try:
        import lightgbm as lgb

        return lgb.LGBMRegressor(
            random_state=42,
            device_type="cpu",
            n_estimators=n_estimators,
            learning_rate=0.08,
            verbose=-1,
        )
    except ImportError:
        pass
    try:
        from xgboost import XGBRegressor

        return XGBRegressor(
            random_state=42,
            eval_metric="rmse",
            n_estimators=n_estimators,
            max_depth=4,
            tree_method="hist",
        )
    except ImportError:
        pass
    return RandomForestRegressor(random_state=42, n_estimators=n_estimators, n_jobs=2)


@router.post("/retrain", summary="Retrain a model pipeline with uploaded data")
async def retrain_model(
    pipeline: str = Query(..., enum=["risk", "employment", "revenue"]),
    file: UploadFile = File(...),
):
    """Upload a CSV/Excel file with target columns and retrain the specified
    pipeline.  The new model replaces the current one in memory and on disk.

    Required target columns per pipeline:
    - **risk**: ``risk_tier_{1,2,3}m``, ``risk_score_{1,2,3}m``
    - **employment**: ``jobs_created_{1,2,3}m``, ``jobs_lost_{1,2,3}m``
    - **revenue**: ``revenue_{1,2,3}m``
    """
    # ── Parse uploaded file ─────────────────────────────────────────────
    contents = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith((".xlsx", ".xls")):
        df = pd.read_excel(BytesIO(contents))
    elif filename.endswith(".csv"):
        df = pd.read_csv(BytesIO(contents))
    else:
        return Response(
            content=json.dumps(
                {"detail": "Unsupported file type. Upload .xlsx, .xls, or .csv"}
            ),
            status_code=400,
            media_type="application/json",
        )

    # ── Validate required target columns ────────────────────────────────
    target_map = {
        "risk": [f"risk_tier_{h}m" for h in HORIZONS]
        + [f"risk_score_{h}m" for h in HORIZONS],
        "employment": [f"jobs_created_{h}m" for h in HORIZONS]
        + [f"jobs_lost_{h}m" for h in HORIZONS],
        "revenue": [f"revenue_{h}m" for h in HORIZONS],
    }

    required_targets = target_map[pipeline]
    missing = [c for c in required_targets if c not in df.columns]
    if missing:
        return Response(
            content=json.dumps(
                {
                    "detail": f"Missing required target column(s): {', '.join(missing)}. "
                    f"The {pipeline} pipeline requires: {', '.join(required_targets)}"
                }
            ),
            status_code=400,
            media_type="application/json",
        )

    # ── Drop rows with missing targets ──────────────────────────────────
    df = df.dropna(subset=required_targets)
    if len(df) < 10:
        return Response(
            content=json.dumps(
                {
                    "detail": f"Not enough valid rows after dropping NaN targets — got {len(df)}, need at least 10."
                }
            ),
            status_code=400,
            media_type="application/json",
        )

    # ── Train/test split (80/20, time-based if survey_date exists) ──────
    if "survey_date" in df.columns:
        df = df.sort_values("survey_date")
    split_idx = int(len(df) * 0.8)
    train_df = df.iloc[:split_idx].copy()
    test_df = df.iloc[split_idx:].copy()

    # ── Separate features / targets ─────────────────────────────────────
    drop_cols = [c for c in LEAKAGE_COLS if c in df.columns]
    feature_cols = [c for c in df.columns if c not in drop_cols]

    X_train = train_df[feature_cols]
    X_test = test_df[feature_cols]

    num_cols, cat_cols = _detect_columns(X_train)

    # ── Build & train pipeline(s) ───────────────────────────────────────
    results: dict = {
        "pipeline": pipeline,
        "train_rows": len(train_df),
        "test_rows": len(test_df),
        "feature_count": len(feature_cols),
        "features": feature_cols,
        "models_trained": [],
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    models_saved: dict = {}

    try:
        if pipeline == "risk":
            # ── Risk tier (classification) — one model per horizon ──────
            tier_map = {"LOW": 0, "MEDIUM": 1, "MID": 1, "HIGH": 2}
            for h in HORIZONS:
                tgt = f"risk_tier_{h}m"
                fname = f"risk_tier_{h}m_model.joblib"
                y_train = train_df[tgt].map(tier_map).fillna(train_df[tgt]).astype(int)
                y_test = test_df[tgt].map(tier_map).fillna(test_df[tgt]).astype(int)

                preprocess = _build_preprocessor(num_cols, cat_cols)
                clf_pipe = Pipeline(
                    [("prep", preprocess), ("clf", _try_build_classifier())]
                )
                clf_pipe.fit(X_train, y_train)

                tier_preds = clf_pipe.predict(X_test)
                tier_proba = clf_pipe.predict_proba(X_test)

                tier_metrics = {
                    "model": tgt,
                    "type": "classification",
                    "algorithm": type(clf_pipe.named_steps["clf"]).__name__,
                }
                try:
                    tier_metrics["auc_macro"] = round(
                        float(
                            roc_auc_score(
                                y_test, tier_proba, multi_class="ovr", average="macro"
                            )
                        ),
                        4,
                    )
                except Exception:
                    pass
                report = classification_report(y_test, tier_preds, output_dict=True)
                tier_metrics["accuracy"] = round(float(report.get("accuracy", 0)), 4)
                tier_metrics["f1_weighted"] = round(
                    float(report.get("weighted avg", {}).get("f1-score", 0)), 4
                )
                results["models_trained"].append(tier_metrics)

                joblib.dump(clf_pipe, MODELS_DIR / fname)
                models_saved[tgt] = fname

            # ── Risk score regressors — one per horizon ─────────────────
            for h in HORIZONS:
                tgt = f"risk_score_{h}m"
                fname = f"risk_score_{h}m_model.joblib"
                preprocess_r = _build_preprocessor(num_cols, cat_cols)
                reg_pipe = Pipeline(
                    [("prep", preprocess_r), ("reg", _try_build_regressor(150))]
                )
                reg_pipe.fit(X_train, train_df[tgt])

                preds = reg_pipe.predict(X_test)
                rmse = float(np.sqrt(mean_squared_error(test_df[tgt], preds)))
                mae = float(mean_absolute_error(test_df[tgt], preds))

                results["models_trained"].append(
                    {
                        "model": tgt,
                        "type": "regression",
                        "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
                        "rmse": round(rmse, 4),
                        "mae": round(mae, 4),
                    }
                )

                joblib.dump(reg_pipe, MODELS_DIR / fname)
                models_saved[tgt] = fname

        elif pipeline == "employment":
            for h in HORIZONS:
                emp_targets = {
                    f"jobs_created_{h}m": f"employment_jobs_created_{h}m_model.joblib",
                    f"jobs_lost_{h}m": f"employment_jobs_lost_{h}m_model.joblib",
                }
                for tgt, fname in emp_targets.items():
                    preprocess_e = _build_preprocessor(num_cols, cat_cols)
                    reg_pipe = Pipeline(
                        [("prep", preprocess_e), ("reg", _try_build_regressor(250))]
                    )
                    reg_pipe.fit(X_train, train_df[tgt])

                    preds = np.maximum(0, reg_pipe.predict(X_test))
                    rmse = float(np.sqrt(mean_squared_error(test_df[tgt], preds)))
                    mae = float(mean_absolute_error(test_df[tgt], preds))

                    results["models_trained"].append(
                        {
                            "model": tgt,
                            "type": "regression",
                            "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
                            "rmse": round(rmse, 4),
                            "mae": round(mae, 4),
                        }
                    )

                    joblib.dump(reg_pipe, MODELS_DIR / fname)
                    models_saved[tgt] = fname

        elif pipeline == "revenue":
            for h in HORIZONS:
                tgt = f"revenue_{h}m"
                fname = f"revenue_{h}m_model.joblib"
                preprocess_v = _build_preprocessor(num_cols, cat_cols)
                reg_pipe = Pipeline(
                    [("prep", preprocess_v), ("reg", _try_build_regressor(300))]
                )
                reg_pipe.fit(X_train, train_df[tgt])

                preds = np.maximum(0, reg_pipe.predict(X_test))
                rmse = float(np.sqrt(mean_squared_error(test_df[tgt], preds)))
                mae = float(mean_absolute_error(test_df[tgt], preds))

                results["models_trained"].append(
                    {
                        "model": tgt,
                        "type": "regression",
                        "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
                        "rmse": round(rmse, 4),
                        "mae": round(mae, 4),
                    }
                )

                joblib.dump(reg_pipe, MODELS_DIR / fname)
                models_saved[tgt] = fname

    except Exception as exc:
        return Response(
            content=json.dumps(
                {
                    "detail": f"Training failed: {exc}",
                    "traceback": traceback.format_exc(),
                }
            ),
            status_code=500,
            media_type="application/json",
        )

    # ── Reload models into the global registry ──────────────────────────
    try:
        load_models()
        results["models_reloaded"] = True
    except Exception:
        results["models_reloaded"] = False

    results["models_saved"] = models_saved

    # ── Store retrain metadata for model cards ──────────────────────────
    _retrain_history[pipeline] = {
        "timestamp": results["timestamp"],
        "filename": file.filename,
        "train_rows": results["train_rows"],
        "test_rows": results["test_rows"],
        "feature_count": results["feature_count"],
        "features": results["features"],
        "models_trained": results["models_trained"],
    }

    _log_event(
        action="Model retrained",
        category="model",
        severity="warning",
        actor="user",
        details=f"Retrained '{pipeline}' pipeline from {file.filename} ({results.get('train_rows', '?')} train rows).",
        meta={
            "pipeline": pipeline,
            "filename": file.filename,
            "train_rows": results.get("train_rows"),
            "test_rows": results.get("test_rows"),
            "models_trained": len(results.get("models_trained", [])),
        },
    )

    body = json.dumps(results, allow_nan=False)
    return Response(content=body, media_type="application/json")


# ── Model Cards endpoint ────────────────────────────────────────────────────


def _get_feature_importance(
    model_obj, feature_names: list[str], top_n: int = 20
) -> list[dict]:
    """Extract feature importance from a fitted pipeline."""
    try:
        last_step = model_obj
        # Walk through pipeline to get the actual estimator
        if hasattr(model_obj, "named_steps"):
            steps = list(model_obj.named_steps.values())
            last_step = steps[-1]

        # Get the preprocessor to find transformed feature names
        prep = (
            model_obj.named_steps.get("prep")
            if hasattr(model_obj, "named_steps")
            else None
        )

        if hasattr(last_step, "feature_importances_"):
            importances = last_step.feature_importances_
            # Try to get transformed feature names
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


# ── Audit Log endpoints ────────────────────────────────────────────────────


@router.get("/audit-log", summary="Retrieve the audit trail")
async def get_audit_log(
    category: str = Query(default=None),
    severity: str = Query(default=None),
    limit: int = Query(default=200, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    """Return the in-memory audit log with optional filters.

    Query parameters:
    - **category**: Filter by event category (data, prediction, model, advisory, system).
    - **severity**: Filter by severity (info, warning, error, critical).
    - **limit**: Max rows per page (default 200).
    - **offset**: Skip this many rows (for pagination).
    """
    filtered = list(reversed(_audit_log))  # newest-first
    if category:
        filtered = [e for e in filtered if e["category"] == category]
    if severity:
        filtered = [e for e in filtered if e["severity"] == severity]

    total = len(filtered)
    page = filtered[offset : offset + limit]

    # Summary stats
    cat_counts = {}
    sev_counts = {}
    for e in _audit_log:
        cat_counts[e["category"]] = cat_counts.get(e["category"], 0) + 1
        sev_counts[e["severity"]] = sev_counts.get(e["severity"], 0) + 1

    payload = {
        "total": total,
        "offset": offset,
        "limit": limit,
        "page_count": len(page),
        "category_counts": cat_counts,
        "severity_counts": sev_counts,
        "events": page,
    }
    body = json.dumps(payload, allow_nan=False)
    return Response(content=body, media_type="application/json")


@router.delete("/audit-log", summary="Clear the audit trail")
async def clear_audit_log():
    """Remove all entries from the in-memory audit log."""
    count = len(_audit_log)
    _audit_log.clear()
    _log_event(
        action="Audit log cleared",
        category="system",
        severity="warning",
        details=f"Cleared {count} previous entries.",
    )
    return {"status": "cleared", "cleared_count": count}


def _model_file_info(filename: str) -> dict:
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


def _estimator_params(model_obj) -> dict:
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


@router.get("/model-cards", summary="Get model card information for all pipelines")
async def model_cards():
    """Return comprehensive model card information including:
    - Model type and algorithm
    - Feature names and count
    - Feature importance (top 20)
    - Performance metrics from training
    - Hyperparameters
    - File metadata (size, last modified)
    - Retrain history (if retrained via the API)

    All pipelines now contain per-horizon models (1m, 2m, 3m).
    """
    reg = get_registry()

    def _algo_name(model_obj):
        """Extract the algorithm class name from a model or pipeline."""
        if hasattr(model_obj, "named_steps"):
            for key in model_obj.named_steps:
                if key != "prep":
                    return type(model_obj.named_steps[key]).__name__
        return type(model_obj).__name__

    cards: dict = {}

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
        "description": "Per-month pipeline predicting credit risk tier (LOW/MEDIUM/HIGH) "
        "and continuous risk score (0–1) at 1-month, 2-month, and 3-month horizons.",
        "purpose": (
            "Identifies clients most likely to face financial distress over "
            "the next 1–3 months so that advisors can intervene early. "
            "Month-by-month trajectories reveal whether risk is increasing."
        ),
        "what_it_predicts": [
            {
                "target": f"risk_tier_{h}m",
                "label": f"Risk Tier ({h}m)",
                "explanation": f"Classifies each client into LOW, MEDIUM, or HIGH "
                f"risk at the {h}-month horizon.",
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
                "explanation": "Area Under the ROC Curve averaged across all "
                "risk tiers. Measures how well the model distinguishes between "
                "LOW, MEDIUM, and HIGH risk clients.",
                "interpretation": {"excellent": 0.90, "good": 0.80, "fair": 0.70},
            },
            "qwk": {
                "label": "QWK",
                "explanation": "Quadratic Weighted Kappa measures agreement "
                "between predicted and actual risk tiers, penalising "
                "larger misclassifications more heavily.",
                "interpretation": {"excellent": 0.80, "good": 0.60, "fair": 0.40},
            },
            "brier_high_risk": {
                "label": "Brier (High-Risk)",
                "explanation": "Calibration score for the high-risk probability. "
                "Lower is better.",
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
        "retrain_info": _retrain_history.get("risk"),
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
        "description": "Per-month regressors forecasting jobs created and jobs lost "
        "at 1-month, 2-month, and 3-month horizons (6 models).",
        "purpose": (
            "Estimates the employment impact month by month, helping track "
            "job-creation goals and flag clients whose businesses may be shrinking."
        ),
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
                "explanation": "Root Mean Squared Error — average magnitude of "
                "prediction errors. Lower is better.",
            },
            "mae": {
                "label": "MAE",
                "explanation": "Mean Absolute Error — average of absolute "
                "differences. Less sensitive to outliers than RMSE.",
            },
        },
        "num_models": len(emp_models_info),
        "feature_count": len(reg.employment_features),
        "features": reg.employment_features,
        "training_metrics": emp_metrics,
        "models": emp_models_info,
        "retrain_info": _retrain_history.get("employment"),
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
        "description": "Per-month regressors forecasting revenue at 1-month, "
        "2-month, and 3-month horizons (3 models).",
        "purpose": (
            "Forecasts month-by-month revenue for each client, enabling "
            "early identification of revenue decline trajectories."
        ),
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
                "explanation": "Root Mean Squared Error — average magnitude of "
                "prediction errors. Lower is better.",
            },
            "mae": {
                "label": "MAE",
                "explanation": "Mean Absolute Error — average of absolute "
                "differences. Less sensitive to outliers than RMSE.",
            },
        },
        "num_models": len(rev_models_info),
        "feature_count": len(reg.revenue_features),
        "features": reg.revenue_features,
        "training_metrics": rev_metrics,
        "models": rev_models_info,
        "retrain_info": _retrain_history.get("revenue"),
    }

    cleaned = _clean_records([cards])[0]
    body = json.dumps(cleaned, allow_nan=False, default=str)
    return Response(content=body, media_type="application/json")


# ── Documentation endpoint ──────────────────────────────────────────────────

_DOC_FILES = {
    "overview": "APP_OVERVIEW.md",
    "risk": "APP_RISK.md",
    "employment": "APP_EMPLOYMENT.md",
    "revenue": "APP_REVENUE.md",
    "portfolio": "APP_PORTFOLIO.md",
    "advisory": "APP_ADVISORY.md",
    "reports": "APP_REPORTS.md",
}


@router.get("/documentation", summary="App documentation (raw Markdown)")
async def get_documentation():
    """Read app documentation from the Docs/ folder and return raw Markdown."""
    docs: dict[str, str | None] = {}
    for key, filename in _DOC_FILES.items():
        path = DOCS_DIR / filename
        if path.is_file():
            docs[key] = path.read_text(encoding="utf-8")
        else:
            docs[key] = None
    body = json.dumps(docs, allow_nan=False, default=str)
    return Response(content=body, media_type="application/json")


# ── RAG Agent — AI Insights (pre-configured demo) ───────────────────────────

_RAG_INSIGHTS: dict[str, dict[str, str]] = {
    # ── Dashboard sections ──────────────────────────────────────────────────
    "dashboard_kpi": {
        "title": "Portfolio Health Summary",
        "insight": (
            "These KPIs provide a high-level snapshot of your client portfolio. "
            "Watch for a declining Revenue/Expense ratio — it often signals emerging "
            "financial stress 1-2 months before risk scores visibly increase. "
            "A healthy portfolio typically maintains a ratio above 1.5x."
        ),
    },
    "dashboard_distributions": {
        "title": "Distribution Analysis",
        "insight": (
            "The distribution charts reveal the composition and balance of your portfolio. "
            "Highly skewed distributions (e.g., most clients in one sector) indicate "
            "concentration risk. The Risk Tier doughnut is your primary alert — if the "
            "HIGH segment exceeds 15%, consider targeted intervention programs."
        ),
    },
    "dashboard_statistics": {
        "title": "Statistical Pattern Insights",
        "insight": (
            "Examine the standard deviation relative to the mean for each metric. "
            "A high coefficient of variation (std/mean > 1) suggests significant inequality "
            "among clients for that feature. Revenue columns with large gaps between Q25 "
            "and Q75 indicate a bimodal distribution — your portfolio may contain two "
            "distinct client segments that benefit from different support strategies."
        ),
    },
    "dashboard_correlation": {
        "title": "Feature Relationship Analysis",
        "insight": (
            "The correlation matrix highlights which features move together. "
            "Strong positive correlations (dark blue, > 0.7) suggest redundant signals. "
            "Negative correlations (red) between revenue and risk scores confirm the "
            "model is capturing the expected inverse relationship — lower revenue "
            "associates with higher risk. Use this to validate model behavior."
        ),
    },
    # ── Prediction sections ─────────────────────────────────────────────────
    "risk_single": {
        "title": "Risk Trajectory Interpretation",
        "insight": (
            "The month-by-month risk trajectory reveals the client's projected risk path. "
            "An increasing score from 1m → 3m suggests deteriorating conditions and may "
            "warrant early intervention. Tier probabilities show confidence — if the "
            "model is split between MEDIUM and HIGH, the client is on a critical boundary."
        ),
    },
    "risk_batch": {
        "title": "Portfolio Risk Overview",
        "insight": (
            "In the batch view, focus on clients with rising trajectories (upward sparklines). "
            "Sort mentally by the '1m → 3m Change' column to find the fastest-deteriorating "
            "cases. Clients transitioning from LOW → MEDIUM deserve proactive outreach "
            "before they escalate to HIGH risk."
        ),
    },
    "employment_single": {
        "title": "Employment Impact Assessment",
        "insight": (
            "Net employment change is the key metric — it reflects whether this client's "
            "business is growing or shrinking its workforce. A positive net with declining "
            "trajectory signals slowing growth. Jobs lost increasing over the 3-month "
            "horizon is a leading indicator of business distress."
        ),
    },
    "employment_batch": {
        "title": "Employment Trends Analysis",
        "insight": (
            "The batch employment view helps identify which businesses are the strongest "
            "job creators in the portfolio. Look for divergent patterns — high jobs created "
            "alongside high jobs lost may indicate high workforce turnover rather than "
            "genuine growth. Focus support on clients with stable or growing net employment."
        ),
    },
    "revenue_single": {
        "title": "Revenue Forecast Interpretation",
        "insight": (
            "The revenue trajectory shows the projected earning path over 3 months. "
            "A declining curve paired with increasing risk scores is a strong warning signal. "
            "Compare predicted revenue to the client's expenses — if the trajectory drops "
            "below the break-even point, immediate financial advisory support is recommended."
        ),
    },
    "revenue_batch": {
        "title": "Revenue Portfolio Analysis",
        "insight": (
            "Batch revenue predictions reveal the overall financial health trajectory "
            "of your portfolio. Look for clusters of declining trends — they may share "
            "common characteristics (sector, location) that point to systemic issues. "
            "Clients with the largest negative 1m → 3m changes need the most urgent attention."
        ),
    },
    # ── Profile modal ───────────────────────────────────────────────────────
    "profile_overview": {
        "title": "Client Profile Intelligence",
        "insight": (
            "This 360° view combines demographic, business, and predictive information. "
            "Cross-reference the risk trajectory with revenue trajectory — convergent "
            "negative signals across pipelines indicate compounding distress and should "
            "trigger priority case management escalation."
        ),
    },
    # ── Advisory Plans ──────────────────────────────────────────────────────
    "advisory_plans": {
        "title": "Governance-Aware Advisory Intelligence",
        "insight": (
            "Advisory plans are generated by combining model predictions with country-specific "
            "regulatory frameworks. Recommendations are prioritized by risk tier: CRITICAL "
            "plans address immediate distress signals, ELEVATED plans target stabilization, "
            "and ROUTINE plans focus on growth. Each plan includes compliance obligations "
            "from the enterprise's jurisdiction — Rwanda (RDB/RRA), Kenya (MSEA/KRA), or "
            "South Sudan (Investment Authority). Review high-risk plans first and verify "
            "governance compliance items are current before scheduling interventions."
        ),
    },
    # ── Audit Log ───────────────────────────────────────────────────────────
    "audit_log": {
        "title": "Audit & Traceability Intelligence",
        "insight": (
            "The audit log captures every significant action in the system — data uploads, "
            "prediction runs, model retraining, advisory generation, and data management events. "
            "Each entry records a timestamp, actor, category, severity, and structured metadata. "
            "Use filters to investigate specific event categories or severity levels. "
            "Warning-level events (model retraining, data clearing) indicate actions that "
            "altered system state. Regular review of the audit trail supports SOC 2 compliance, "
            "internal governance, and donor reporting requirements."
        ),
    },
    # ── Model Cards ─────────────────────────────────────────────────────────
    "model_cards": {
        "title": "Model Explainability Note",
        "insight": (
            "All 15 models use LightGBM gradient boosting, chosen for its strong "
            "performance on tabular data with mixed feature types. Feature importances "
            "are computed using split-based gain — higher values indicate features the "
            "model relies on most. Retrain periodically to capture evolving client behavior "
            "patterns and maintain prediction accuracy."
        ),
    },
    # ── Data Quality Contracts ──────────────────────────────────────────────
    "data_quality": {
        "title": "Data Quality & Contract Intelligence",
        "insight": (
            "Data quality contracts define the expected schema, types, ranges, and "
            "completeness thresholds for every pipeline input. The audit scores each column "
            "against its contract — checking for missing required fields, out-of-range values, "
            "type mismatches, uniqueness violations, and statistical outliers (>3σ). "
            "A quality score below 85% typically degrades model accuracy. Focus remediation "
            "on critical and error-severity violations first — especially missing identifiers "
            "and negative financial values. Columns below 90% fill rate should be investigated "
            "for systemic data collection gaps before retraining models."
        ),
    },
}


@router.get(
    "/reports",
    summary="Generate structured reports (Donor Pack / Program Brief)",
)
async def reports(
    report_type: str = Query(
        default="donor_pack",
        enum=["donor_pack", "program_brief"],
    ),
    source: str = Query(default="stored", enum=["stored", "test"]),
):
    """Aggregate portfolio, risk, revenue, employment and advisory data into
    a publication-ready report payload.

    ``report_type=donor_pack``  — Comprehensive impact report for donors /
    investors with KPIs, sector breakdown, success narratives, and financial
    projections.

    ``report_type=program_brief`` — Concise executive summary for program
    managers with risk overview, actionable recommendations, and headline
    metrics.
    """
    reg = get_registry()

    if source == "stored" and _stored_data["row_count"] > 0:
        df = pd.DataFrame(_stored_data["records"])
        data_source = _stored_data["filename"]
    else:
        csv_path = PREDICTIONS_DIR / "test.csv"
        df = pd.read_csv(csv_path)
        data_source = "test.csv (built-in)"

    total = len(df)
    generated_at = datetime.datetime.now(tz=datetime.timezone.utc).isoformat()

    # ── Run models (3-month horizon) ────────────────────────────────────
    try:
        X_r = align_features(df.copy(), reg.risk_features)
        risk_scores = np.clip(reg.risk_score[3].predict(X_r), 0, 1)
        risk_tiers = reg.risk_tier[3].predict(X_r)
    except Exception:
        risk_scores = np.full(total, 0.0)
        risk_tiers = np.full(total, 0)

    try:
        X_v = align_features(df.copy(), reg.revenue_features)
        rev = np.maximum(0, reg.revenue[3].predict(X_v))
    except Exception:
        rev = np.zeros(total)

    try:
        X_e = align_features(df.copy(), reg.employment_features)
        jc = np.maximum(0, reg.employment_jobs_created[3].predict(X_e))
        jl = np.maximum(0, reg.employment_jobs_lost[3].predict(X_e))
    except Exception:
        jc = np.zeros(total)
        jl = np.zeros(total)

    tier_labels = [RISK_LABELS.get(int(t), "UNKNOWN") for t in risk_tiers]
    tier_counts = {}
    for lbl in tier_labels:
        tier_counts[lbl] = tier_counts.get(lbl, 0) + 1

    # ── Multi-horizon projections for trend analysis ────────────────────
    horizon_summary = {}
    for h in HORIZONS:
        hs: dict = {}
        try:
            Xr = align_features(df.copy(), reg.risk_features)
            s = np.clip(reg.risk_score[h].predict(Xr), 0, 1)
            hs["avg_risk_score"] = round(float(s.mean()), 4)
        except Exception:
            hs["avg_risk_score"] = 0
        try:
            Xv = align_features(df.copy(), reg.revenue_features)
            r = np.maximum(0, reg.revenue[h].predict(Xv))
            hs["total_revenue"] = round(float(r.sum()), 2)
            hs["avg_revenue"] = round(float(r.mean()), 2)
        except Exception:
            hs["total_revenue"] = 0
            hs["avg_revenue"] = 0
        try:
            Xe = align_features(df.copy(), reg.employment_features)
            c_ = np.maximum(0, reg.employment_jobs_created[h].predict(Xe))
            l_ = np.maximum(0, reg.employment_jobs_lost[h].predict(Xe))
            hs["jobs_created"] = round(float(c_.sum()), 0)
            hs["jobs_lost"] = round(float(l_.sum()), 0)
            hs["net_jobs"] = round(float(c_.sum() - l_.sum()), 0)
        except Exception:
            hs["jobs_created"] = 0
            hs["jobs_lost"] = 0
            hs["net_jobs"] = 0
        horizon_summary[str(h)] = hs

    # ── Headline KPIs ───────────────────────────────────────────────────
    kpis = {
        "total_enterprises": total,
        "unique_clients": (
            int(df["unique_id"].nunique()) if "unique_id" in df.columns else total
        ),
        "avg_risk_score": round(float(risk_scores.mean()), 4),
        "high_risk_count": tier_counts.get("HIGH", 0),
        "medium_risk_count": tier_counts.get("MEDIUM", 0),
        "low_risk_count": tier_counts.get("LOW", 0),
        "tier_distribution": tier_counts,
        "total_projected_revenue": round(float(rev.sum()), 2),
        "avg_projected_revenue": round(float(rev.mean()), 2),
        "median_projected_revenue": round(float(np.median(rev)), 2),
        "total_jobs_created": round(float(jc.sum()), 0),
        "total_jobs_lost": round(float(jl.sum()), 0),
        "net_jobs": round(float((jc - jl).sum()), 0),
    }

    # ── Sector breakdown ────────────────────────────────────────────────
    sector_breakdown = []
    if "business_sector" in df.columns:
        sec_df = pd.DataFrame(
            {
                "sector": df["business_sector"],
                "risk": risk_scores,
                "tier": tier_labels,
                "revenue": rev,
                "jc": jc,
            }
        )
        for sec, g in sec_df.groupby("sector"):
            sector_breakdown.append(
                {
                    "sector": str(sec),
                    "count": int(len(g)),
                    "avg_risk": round(float(g["risk"].mean()), 4),
                    "high_risk": int((g["tier"] == "HIGH").sum()),
                    "total_revenue": round(float(g["revenue"].sum()), 2),
                    "total_jobs_created": round(float(g["jc"].sum()), 0),
                }
            )
        sector_breakdown.sort(key=lambda x: x["total_revenue"], reverse=True)

    # ── Country breakdown ───────────────────────────────────────────────
    country_breakdown = []
    if "country" in df.columns:
        cdf = pd.DataFrame(
            {
                "country": df["country"],
                "risk": risk_scores,
                "tier": tier_labels,
                "rev": rev,
                "jc": jc,
            }
        )
        for c, g in cdf.groupby("country"):
            country_breakdown.append(
                {
                    "country": str(c),
                    "count": int(len(g)),
                    "avg_risk": round(float(g["risk"].mean()), 4),
                    "high_risk": int((g["tier"] == "HIGH").sum()),
                    "total_revenue": round(float(g["rev"].sum()), 2),
                    "total_jobs_created": round(float(g["jc"].sum()), 0),
                }
            )

    # ── Gender breakdown ────────────────────────────────────────────────
    gender_breakdown = {}
    if "gender" in df.columns:
        for g_val, g_df in df.groupby("gender"):
            idx = g_df.index
            gender_breakdown[str(g_val)] = {
                "count": int(len(g_df)),
                "avg_risk": round(float(risk_scores[idx].mean()), 4),
                "total_revenue": round(float(rev[idx].sum()), 2),
                "total_jobs": round(float(jc[idx].sum()), 0),
            }

    # ── Top-risk enterprises (for donor pack spotlight) ─────────────────
    top_risk = []
    risk_order = np.argsort(risk_scores)[::-1][:10]
    for i in risk_order:
        uid = (
            str(df.iloc[i].get("unique_id", f"ENT-{i}"))
            if "unique_id" in df.columns
            else f"ENT-{i}"
        )
        top_risk.append(
            {
                "unique_id": uid,
                "risk_score": round(float(risk_scores[i]), 4),
                "risk_tier": tier_labels[i],
                "revenue_3m": round(float(rev[i]), 2),
                "sector": (
                    str(df.iloc[i].get("business_sector", ""))
                    if "business_sector" in df.columns
                    else ""
                ),
                "country": (
                    str(df.iloc[i].get("country", ""))
                    if "country" in df.columns
                    else ""
                ),
            }
        )

    # ── Success stories (lowest risk) ───────────────────────────────────
    success_stories = []
    low_order = np.argsort(risk_scores)[:5]
    for i in low_order:
        uid = (
            str(df.iloc[i].get("unique_id", f"ENT-{i}"))
            if "unique_id" in df.columns
            else f"ENT-{i}"
        )
        success_stories.append(
            {
                "unique_id": uid,
                "risk_score": round(float(risk_scores[i]), 4),
                "risk_tier": tier_labels[i],
                "revenue_3m": round(float(rev[i]), 2),
                "jobs_created_3m": round(float(jc[i]), 2),
                "sector": (
                    str(df.iloc[i].get("business_sector", ""))
                    if "business_sector" in df.columns
                    else ""
                ),
                "country": (
                    str(df.iloc[i].get("country", ""))
                    if "country" in df.columns
                    else ""
                ),
            }
        )

    # ── Program breakdown ───────────────────────────────────────────────
    program_breakdown = []
    if "program_enrolled" in df.columns:
        pdf = pd.DataFrame(
            {
                "program": df["program_enrolled"],
                "risk": risk_scores,
                "tier": tier_labels,
                "rev": rev,
                "jc": jc,
            }
        )
        for p, g in pdf.groupby("program"):
            program_breakdown.append(
                {
                    "program": str(p),
                    "count": int(len(g)),
                    "avg_risk": round(float(g["risk"].mean()), 4),
                    "high_risk": int((g["tier"] == "HIGH").sum()),
                    "total_revenue": round(float(g["rev"].sum()), 2),
                    "total_jobs_created": round(float(g["jc"].sum()), 0),
                }
            )

    # ── Assemble report payload ─────────────────────────────────────────
    report = {
        "report_type": report_type,
        "generated_at": generated_at,
        "source": data_source,
        "kpis": kpis,
        "horizon_summary": horizon_summary,
        "sector_breakdown": sector_breakdown,
        "country_breakdown": country_breakdown,
        "gender_breakdown": gender_breakdown,
        "program_breakdown": program_breakdown,
        "top_risk_enterprises": top_risk,
        "success_stories": success_stories,
    }

    # ── Report-type-specific narrative ──────────────────────────────────
    high_pct = round(kpis["high_risk_count"] / total * 100, 1) if total else 0
    low_pct = round(kpis["low_risk_count"] / total * 100, 1) if total else 0

    if report_type == "donor_pack":
        report["title"] = "Donor Impact Report"
        report["subtitle"] = (
            "Inkomoko Early Warning System — Portfolio Impact Assessment"
        )
        report["executive_summary"] = (
            f"This report summarizes the impact portfolio of {total:,} enterprises monitored "
            f"by the Inkomoko Early Warning System. Our ML-driven models project "
            f"RWF {kpis['total_projected_revenue']:,.0f} in aggregate 3-month revenue across the portfolio, "
            f"with {kpis['total_jobs_created']:,.0f} jobs safeguarded. "
            f"{kpis['high_risk_count']} enterprises ({high_pct}%) are flagged as high-risk, "
            f"triggering targeted advisory interventions. "
            f"{kpis['low_risk_count']} enterprises ({low_pct}%) demonstrate strong resilience indicators."
        )
        report["sections"] = [
            "executive_summary",
            "kpi_dashboard",
            "risk_distribution",
            "revenue_projections",
            "employment_impact",
            "sector_analysis",
            "country_analysis",
            "gender_lens",
            "program_performance",
            "success_spotlight",
            "risk_watchlist",
            "methodology",
        ]
    else:
        report["title"] = "Program Brief"
        report["subtitle"] = "Inkomoko EWS — Executive Program Summary"
        report["executive_summary"] = (
            f"Portfolio of {total:,} enterprises scored across risk, revenue, and employment models. "
            f"Average risk score: {kpis['avg_risk_score']:.2%}. "
            f"High-risk: {kpis['high_risk_count']} ({high_pct}%). "
            f"Projected 3-month revenue: RWF {kpis['total_projected_revenue']:,.0f}. "
            f"Net jobs impact: {kpis['net_jobs']:+,.0f}. "
            f"Immediate attention needed for {kpis['high_risk_count']} high-risk enterprises."
        )
        report["sections"] = [
            "executive_summary",
            "kpi_summary",
            "risk_overview",
            "action_items",
            "sector_snapshot",
            "horizon_trends",
        ]
        # Generate action items for program brief
        actions = []
        if kpis["high_risk_count"] > 0:
            actions.append(
                {
                    "priority": "CRITICAL",
                    "action": f"Schedule intervention reviews for {kpis['high_risk_count']} high-risk enterprises",
                    "deadline": "Within 2 weeks",
                }
            )
        if kpis["net_jobs"] < 0:
            actions.append(
                {
                    "priority": "HIGH",
                    "action": f"Investigate negative net job projection ({kpis['net_jobs']:+,.0f}) — potential layoff risk",
                    "deadline": "Within 1 month",
                }
            )
        if high_pct > 30:
            actions.append(
                {
                    "priority": "HIGH",
                    "action": f"Portfolio risk concentration at {high_pct}% — review admission criteria",
                    "deadline": "Within 1 month",
                }
            )
        if kpis["medium_risk_count"] > kpis["low_risk_count"]:
            actions.append(
                {
                    "priority": "MEDIUM",
                    "action": "More enterprises in medium-risk than low-risk — increase mentoring frequency",
                    "deadline": "Ongoing",
                }
            )
        actions.append(
            {
                "priority": "LOW",
                "action": "Run updated projections after next quarterly data refresh",
                "deadline": "Next quarter",
            }
        )
        report["action_items"] = actions

    _log_event(
        action=f"Report generated: {report_type}",
        category="system",
        severity="info",
        actor="user",
        details=f"Generated {report_type} report for {total} enterprises.",
        meta={"report_type": report_type, "total": total},
    )

    body = json.dumps(report, allow_nan=False, default=str)
    return Response(content=body, media_type="application/json")


@router.get("/ai-insights", summary="RAG Agent — pre-configured AI insights")
async def get_ai_insights(section: str = Query(default=None)):
    """Return pre-configured AI insights for the requested section(s).

    - If ``section`` is provided, return the single insight for that key.
    - If omitted, return all available insights keyed by section name.

    This is a lightweight demo of RAG-style AI integration — in production
    this would call an LLM with retrieved context from the knowledge base.
    """
    if section:
        insight = _RAG_INSIGHTS.get(section)
        if not insight:
            return Response(
                content=json.dumps({"error": f"Unknown section: {section}"}),
                media_type="application/json",
                status_code=404,
            )
        payload = {"section": section, **insight, "agent": "ews-rag-v1"}
        return Response(
            content=json.dumps(payload, default=str),
            media_type="application/json",
        )

    # Return all insights
    payload = {
        k: {**v, "section": k, "agent": "ews-rag-v1"} for k, v in _RAG_INSIGHTS.items()
    }
    return Response(
        content=json.dumps(payload, default=str),
        media_type="application/json",
    )
