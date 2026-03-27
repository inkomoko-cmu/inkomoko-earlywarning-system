"""Train all configured-horizon models (horizons × 5 model types) from anonymized data.

Produces:
    artifacts/models/risk_tier_{1,2,3}m_model.joblib
    artifacts/models/risk_score_{1,2,3}m_model.joblib
    artifacts/models/employment_jobs_created_{1,2,3}m_model.joblib
    artifacts/models/employment_jobs_lost_{1,2,3}m_model.joblib
    artifacts/models/revenue_{1,2,3}m_model.joblib

Also writes metrics CSVs used by the model-cards endpoint.
"""

from __future__ import annotations

import io
import os
import sys
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import psycopg
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

from app.config import HORIZONS, LEAKAGE_COLS, METRICS_DIR, MODELS_DIR, PREDICTIONS_DIR

warnings.filterwarnings("ignore")

# ── Paths ───────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent


def find_ml_dir(start: Path) -> Path:
    start = start.resolve()
    candidates = [start, *start.parents]
    for c in candidates:
        if (c / "ml" / "Anomynized data").exists():
            return c / "ml"
        if (c / "Anomynized data").exists():
            return c
    raise FileNotFoundError(
        f"Could not locate ML data directory from {start}. Expected an 'ml/Anomynized data' or 'Anomynized data' folder in current/parent paths."
    )


ML_DIR = find_ml_dir(BASE)

for d in [MODELS_DIR, METRICS_DIR, PREDICTIONS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# Target columns that must be excluded from features
ALL_TARGETS = set()
for h in HORIZONS:
    ALL_TARGETS |= {
        f"risk_tier_{h}m",
        f"risk_score_{h}m",
        f"jobs_created_{h}m",
        f"jobs_lost_{h}m",
        f"revenue_{h}m",
    }
LEAKAGE_COLS_TRAIN = (
    set(LEAKAGE_COLS)
    | ALL_TARGETS
    | {
        "survey_date",
        "survey_id",
        "loanNumber",
        "clientId",
        "unique_id",
        "ClientId",
        "client_id",
        "BaselineEndlineClientId",
        "baseline_survey_date",
        "endline_survey_date",
        "baseline_job_created",
        "endline_job_created",
        "baseline_revenue",
        "endline_revenue",
    }
)

RISK_LABELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
TIER_MAP = {"LOW": 0, "MEDIUM": 1, "MID": 1, "HIGH": 2}


def try_classifier():
    """Try LightGBM → XGBoost → RandomForest."""
    try:
        from lightgbm import LGBMClassifier

        return LGBMClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            num_leaves=31,
            random_state=42,
            n_jobs=2,
            verbose=-1,
        )
    except ImportError:
        pass
    try:
        from xgboost import XGBClassifier

        return XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.05,
            random_state=42,
            n_jobs=2,
            use_label_encoder=False,
            eval_metric="mlogloss",
        )
    except ImportError:
        pass
    return RandomForestClassifier(random_state=42, n_estimators=200, n_jobs=2)


def try_regressor(n_est=200):
    """Try LightGBM → XGBoost → RandomForest."""
    try:
        from lightgbm import LGBMRegressor

        return LGBMRegressor(
            n_estimators=n_est,
            max_depth=6,
            learning_rate=0.05,
            num_leaves=31,
            random_state=42,
            n_jobs=2,
            verbose=-1,
        )
    except ImportError:
        pass
    try:
        from xgboost import XGBRegressor

        return XGBRegressor(
            n_estimators=n_est,
            max_depth=6,
            learning_rate=0.05,
            random_state=42,
            n_jobs=2,
        )
    except ImportError:
        pass
    return RandomForestRegressor(random_state=42, n_estimators=n_est, n_jobs=2)


def build_preprocessor(num_cols, cat_cols):
    transformers = []
    if num_cols:
        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="median")),
                        ("scale", StandardScaler()),
                    ]
                ),
                num_cols,
            )
        )
    if cat_cols:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        (
                            "encode",
                            OrdinalEncoder(
                                handle_unknown="use_encoded_value", unknown_value=-1
                            ),
                        ),
                    ]
                ),
                cat_cols,
            )
        )
    return ColumnTransformer(transformers, remainder="drop")


def detect_columns(df):
    num = df.select_dtypes(include=["number"]).columns.tolist()
    cat = df.select_dtypes(exclude=["number"]).columns.tolist()
    return num, cat


def load_csv_with_fallback(path: Path) -> pd.DataFrame:
    for enc in ["utf-8", "latin-1", "cp1252"]:
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError:
            continue
    raw = path.read_bytes()
    text = raw.decode("utf-8", errors="replace")
    return pd.read_csv(io.StringIO(text))


def normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    cols = []
    seen = {}
    for c in df.columns:
        name = str(c).strip()
        if name in seen:
            seen[name] += 1
            name = f"{name}_{seen[name]}"
        else:
            seen[name] = 0
        cols.append(name)
    out = df.copy()
    out.columns = cols
    return out


def parse_dates(
    df: pd.DataFrame, date_cols: list[str], dayfirst: bool = False
) -> pd.DataFrame:
    out = df.copy()
    for c in date_cols:
        if c in out.columns:
            out[c] = pd.to_datetime(out[c], errors="coerce", dayfirst=dayfirst)
    return out


def to_num(df: pd.DataFrame, cols: list[str]) -> pd.DataFrame:
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = (
                out[c]
                .astype(str)
                .str.replace(",", "", regex=False)
                .str.replace("#REF!", "", regex=False)
                .str.replace("$", "", regex=False)
            )
            out[c] = pd.to_numeric(out[c], errors="coerce")
    return out


def _tier_from_score(score: pd.Series) -> pd.Series:
    out = pd.Series(index=score.index, dtype=object)
    out[score <= 0.33] = "LOW"
    out[(score > 0.33) & (score <= 0.66)] = "MEDIUM"
    out[score > 0.66] = "HIGH"
    return out.fillna("MEDIUM")


def _encode_tier_labels(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.upper().str.strip()
    return s.map(TIER_MAP).fillna(1).astype(int)


def normalize_db_url(url: str) -> str:
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _read_env_value(env_path: Path, key: str) -> str | None:
    if not env_path.exists():
        return None
    for raw_line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == key:
            return v.strip().strip('"').strip("'")
    return None


def resolve_db_url() -> str:
    env_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")
    if env_url:
        return normalize_db_url(env_url)

    backend_dir = BASE.parent / "backend"
    for env_candidate in (BASE.parent / ".env", backend_dir / ".env"):
        file_url = _read_env_value(env_candidate, "DATABASE_URL") or _read_env_value(
            env_candidate, "POSTGRES_URL"
        )
        if file_url:
            return normalize_db_url(file_url)

    if backend_dir.exists():
        sys.path.insert(0, str(backend_dir))
        try:
            from app.core.config import settings  # type: ignore

            if settings.DATABASE_URL:
                return normalize_db_url(settings.DATABASE_URL)
        except Exception:
            pass

    raise RuntimeError(
        "Database URL not found. Set DATABASE_URL/POSTGRES_URL or backend settings."
    )


def load_data():
    """Load curated anonymized data from Postgres and build training table."""
    db_url = resolve_db_url()

    query = """
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
      imp.client_id,
      imp.country_code,
      imp.survey_date,
      imp.business_sector,
      imp.business_sub_sector,
      imp.client_location,
      imp.nationality,
      imp.education_level,
      imp.strata,
      imp.revenue_3m,
      imp.jobs_created_3m,
      imp.jobs_lost_3m,
      imp.risk_score_3m,
      imp.risk_tier_3m,
      imp.nps_promoter,
      imp.nps_detractor,
      imp.satisfied_yes,
      imp.satisfied_no,
      loan.loan_number AS "loanNumber",
      loan.client_id AS "ClientId",
      loan.client_id AS "BaselineEndlineClientId",
      loan.days_in_arrears AS "daysInArrears",
      loan.installment_in_arrears AS "installmentInArrears",
      loan.approved_amount AS "approvedAmount",
      loan.disbursed_amount AS "disbursedAmount",
      loan.actual_payment_amount AS "actualPaymentAmount",
      loan.amount_past_due AS "amountPastDue",
      loan.principal_paid AS "principalPaid",
      loan.current_balance AS "currentBalance"
    FROM vw_anon_impact_curated imp
    LEFT JOIN latest_loan loan ON loan.client_id = imp.client_id
    """

    with psycopg.connect(db_url) as conn:
        model_df = pd.read_sql_query(query, conn)

    model_df["survey_date"] = pd.to_datetime(model_df["survey_date"], errors="coerce")
    model_df["revenue_3m"] = pd.to_numeric(model_df["revenue_3m"], errors="coerce").clip(lower=0)
    model_df["jobs_created_3m"] = pd.to_numeric(model_df["jobs_created_3m"], errors="coerce").clip(lower=0)
    model_df["jobs_lost_3m"] = pd.to_numeric(model_df["jobs_lost_3m"], errors="coerce").clip(lower=0)
    model_df["risk_score_3m"] = pd.to_numeric(model_df["risk_score_3m"], errors="coerce").clip(0, 1)
    model_df["risk_tier_3m"] = model_df["risk_tier_3m"].astype(str).str.upper().str.strip()

    model_df["repayment_ratio"] = pd.to_numeric(
        model_df.get("actualPaymentAmount"), errors="coerce"
    ) / pd.to_numeric(model_df.get("disbursedAmount"), errors="coerce").replace(0, np.nan)
    model_df["utilization_ratio"] = pd.to_numeric(
        model_df.get("disbursedAmount"), errors="coerce"
    ) / pd.to_numeric(model_df.get("approvedAmount"), errors="coerce").replace(0, np.nan)
    model_df["past_due_ratio"] = pd.to_numeric(
        model_df.get("amountPastDue"), errors="coerce"
    ) / pd.to_numeric(model_df.get("disbursedAmount"), errors="coerce").replace(0, np.nan)
    model_df["principal_completion_ratio"] = pd.to_numeric(
        model_df.get("principalPaid"), errors="coerce"
    ) / pd.to_numeric(model_df.get("disbursedAmount"), errors="coerce").replace(0, np.nan)

    model_df["revenue_to_expense_ratio"] = np.nan

    # Derive all configured horizons from 3m anchors as a compatibility bridge.
    # This keeps API contracts stable while true longitudinal labels are introduced.
    for h in HORIZONS:
        scale = max(0.1, h / 3.0)
        risk_scale = min(1.0, np.sqrt(scale))
        model_df[f"revenue_{h}m"] = (model_df["revenue_3m"] * scale).clip(lower=0)
        model_df[f"jobs_created_{h}m"] = (model_df["jobs_created_3m"] * scale).clip(
            lower=0
        )
        model_df[f"jobs_lost_{h}m"] = (model_df["jobs_lost_3m"] * scale).clip(lower=0)
        model_df[f"risk_score_{h}m"] = (model_df["risk_score_3m"] * risk_scale).clip(
            0, 1
        )
        model_df[f"risk_tier_{h}m"] = _tier_from_score(model_df[f"risk_score_{h}m"])

    join_coverage = model_df["ClientId"].notna().mean() if "ClientId" in model_df.columns else 0.0
    print(f"Join coverage (impact->latest loan): {join_coverage:.2%}")

    for c in model_df.columns:
        if hasattr(model_df[c], "dtype") and model_df[c].dtype.kind in "fiu":
            model_df[c] = model_df[c].replace([np.inf, -np.inf], np.nan)

    model_df = model_df.dropna(
        subset=["survey_date", "risk_score_3m", "revenue_3m", "jobs_created_3m"]
    ).copy()
    model_df["survey_date"] = pd.to_datetime(model_df["survey_date"], errors="coerce")
    model_df = (
        model_df.dropna(subset=["survey_date"])
        .sort_values("survey_date")
        .reset_index(drop=True)
    )

    if len(model_df) < 20:
        raise ValueError(
            "Not enough rows after anonymized merge and filtering to train models (need at least 20 rows)."
        )

    return model_df


def split_data(df):
    """80/20 split, time-ordered if survey_date exists."""
    if "survey_date" in df.columns:
        df = df.sort_values("survey_date")
    idx = int(len(df) * 0.8)
    return df.iloc[:idx].copy(), df.iloc[idx:].copy()


def get_features(df):
    """Drop leakage/target columns, return feature-only DataFrame."""
    drop = [c for c in df.columns if c in LEAKAGE_COLS_TRAIN]
    return df.drop(columns=drop, errors="ignore")


def target_available(train_df: pd.DataFrame, test_df: pd.DataFrame, col: str) -> bool:
    if col not in train_df.columns or col not in test_df.columns:
        return False
    return train_df[col].notna().sum() > 10 and test_df[col].notna().sum() > 5


def main():
    print("Loading and engineering curated anonymized DB data…")
    df = load_data()
    train_df, test_df = split_data(df)

    X_train = get_features(train_df)
    X_test = get_features(test_df)

    num_cols, cat_cols = detect_columns(X_train)
    feature_cols = X_train.columns.tolist()
    print(
        f"  {len(train_df)} train / {len(test_df)} test, {len(feature_cols)} features"
    )

    all_metrics = []

    # ═══ RISK PIPELINE ══════════════════════════════════════════════════════
    for h in HORIZONS:
        tier_col = f"risk_tier_{h}m"
        score_col = f"risk_score_{h}m"

        if not target_available(train_df, test_df, tier_col):
            print(f"  ! skipping {tier_col} (insufficient non-null labels)")
            continue
        if not target_available(train_df, test_df, score_col):
            print(f"  ! skipping {score_col} (insufficient non-null labels)")
            continue

        # ── Tier classifier ─────────────────────────────────────────────
        y_tier_train = _encode_tier_labels(train_df[tier_col])
        y_tier_test = _encode_tier_labels(test_df[tier_col])

        prep = build_preprocessor(num_cols, cat_cols)
        clf_pipe = Pipeline([("prep", prep), ("clf", try_classifier())])
        clf_pipe.fit(X_train, y_tier_train)

        tier_preds = clf_pipe.predict(X_test)
        tier_proba = clf_pipe.predict_proba(X_test)

        m = {
            "pipeline": "risk",
            "model": f"risk_tier_{h}m",
            "type": "classification",
            "algorithm": type(clf_pipe.named_steps["clf"]).__name__,
            "horizon": h,
        }
        try:
            m["auc_macro"] = round(
                float(
                    roc_auc_score(
                        y_tier_test, tier_proba, multi_class="ovr", average="macro"
                    )
                ),
                4,
            )
        except Exception:
            pass
        report = classification_report(y_tier_test, tier_preds, output_dict=True)
        m["accuracy"] = round(float(report.get("accuracy", 0)), 4)
        m["f1_weighted"] = round(
            float(report.get("weighted avg", {}).get("f1-score", 0)), 4
        )
        all_metrics.append(m)

        fname = f"risk_tier_{h}m_model.joblib"
        joblib.dump(clf_pipe, MODELS_DIR / fname)
        print(f"  ✓ {fname}  (acc={m['accuracy']:.4f})")

        # ── Score regressor ─────────────────────────────────────────────
        prep_r = build_preprocessor(num_cols, cat_cols)
        reg_pipe = Pipeline([("prep", prep_r), ("reg", try_regressor(150))])
        reg_pipe.fit(X_train, train_df[score_col])

        score_preds = reg_pipe.predict(X_test)
        rmse = float(np.sqrt(mean_squared_error(test_df[score_col], score_preds)))
        mae = float(mean_absolute_error(test_df[score_col], score_preds))

        mr = {
            "pipeline": "risk",
            "model": f"risk_score_{h}m",
            "type": "regression",
            "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
            "horizon": h,
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
        }
        all_metrics.append(mr)

        fname = f"risk_score_{h}m_model.joblib"
        joblib.dump(reg_pipe, MODELS_DIR / fname)
        print(f"  ✓ {fname}  (rmse={rmse:.4f})")

    # ═══ EMPLOYMENT PIPELINE ════════════════════════════════════════════════
    for h in HORIZONS:
        for tgt_prefix, label in [
            ("jobs_created", "employment_jobs_created"),
            ("jobs_lost", "employment_jobs_lost"),
        ]:
            tgt_col = f"{tgt_prefix}_{h}m"

            if not target_available(train_df, test_df, tgt_col):
                print(f"  ! skipping {tgt_col} (insufficient non-null labels)")
                continue

            prep_e = build_preprocessor(num_cols, cat_cols)
            reg_pipe = Pipeline([("prep", prep_e), ("reg", try_regressor(250))])
            reg_pipe.fit(X_train, train_df[tgt_col].fillna(0))

            preds = np.maximum(0, reg_pipe.predict(X_test))
            rmse = float(np.sqrt(mean_squared_error(test_df[tgt_col].fillna(0), preds)))
            mae = float(mean_absolute_error(test_df[tgt_col].fillna(0), preds))

            me = {
                "pipeline": "employment",
                "model": f"{label}_{h}m",
                "type": "regression",
                "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
                "horizon": h,
                "rmse": round(rmse, 4),
                "mae": round(mae, 4),
            }
            all_metrics.append(me)

            fname = f"{label}_{h}m_model.joblib"
            joblib.dump(reg_pipe, MODELS_DIR / fname)
            print(f"  ✓ {fname}  (rmse={rmse:.4f})")

    # ═══ REVENUE PIPELINE ═══════════════════════════════════════════════════
    for h in HORIZONS:
        tgt_col = f"revenue_{h}m"

        if not target_available(train_df, test_df, tgt_col):
            print(f"  ! skipping {tgt_col} (insufficient non-null labels)")
            continue

        prep_v = build_preprocessor(num_cols, cat_cols)
        reg_pipe = Pipeline([("prep", prep_v), ("reg", try_regressor(300))])
        reg_pipe.fit(X_train, train_df[tgt_col].fillna(0))

        preds = np.maximum(0, reg_pipe.predict(X_test))
        rmse = float(np.sqrt(mean_squared_error(test_df[tgt_col].fillna(0), preds)))
        mae = float(mean_absolute_error(test_df[tgt_col].fillna(0), preds))

        mv = {
            "pipeline": "revenue",
            "model": f"revenue_{h}m",
            "type": "regression",
            "algorithm": type(reg_pipe.named_steps["reg"]).__name__,
            "horizon": h,
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
        }
        all_metrics.append(mv)

        fname = f"revenue_{h}m_model.joblib"
        joblib.dump(reg_pipe, MODELS_DIR / fname)
        print(f"  ✓ {fname}  (rmse={rmse:.4f})")

    # ═══ SAVE METRICS ═══════════════════════════════════════════════════════
    metrics_df = pd.DataFrame(all_metrics)
    metrics_df.to_csv(METRICS_DIR / "model_summary_metrics.csv", index=False)

    # Per-pipeline metrics files for model cards
    for pipeline_name in ["risk", "employment", "revenue"]:
        sub = metrics_df[metrics_df["pipeline"] == pipeline_name]
        sub.to_csv(METRICS_DIR / f"{pipeline_name}_model_metrics.csv", index=False)

    # ═══ SAVE TEST PREDICTIONS ══════════════════════════════════════════════
    test_out = test_df.copy()
    test_out.to_csv(PREDICTIONS_DIR / "test.csv", index=False)

    print(
        f"\nDone! Trained {len(all_metrics)} models across {len(HORIZONS)} horizons, saved to {MODELS_DIR}"
    )
    print(f"Metrics saved to {METRICS_DIR}")
    print(metrics_df[["pipeline", "model", "type", "horizon"]].to_string(index=False))


if __name__ == "__main__":
    main()
