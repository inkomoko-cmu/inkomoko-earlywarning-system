"""Train all 15 models (3 horizons × 5 model types) from synthetic data.

Produces:
  artifacts/models/risk_tier_{1,2,3}m_model.joblib
  artifacts/models/risk_score_{1,2,3}m_model.joblib
  artifacts/models/employment_jobs_created_{1,2,3}m_model.joblib
  artifacts/models/employment_jobs_lost_{1,2,3}m_model.joblib
  artifacts/models/revenue_{1,2,3}m_model.joblib

Also writes metrics CSVs used by the model-cards endpoint.
"""

from __future__ import annotations

import os
import warnings
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
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

warnings.filterwarnings("ignore")

# ── Paths ───────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent
SYNTHETIC = BASE / "synthetic_outputs"
MODELS_DIR = BASE / "artifacts" / "models"
METRICS_DIR = BASE / "artifacts" / "metrics"
PREDICTIONS_DIR = BASE / "artifacts" / "predictions"

for d in [MODELS_DIR, METRICS_DIR, PREDICTIONS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

HORIZONS = [1, 2, 3]

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
LEAKAGE_COLS = ALL_TARGETS | {
    "survey_date",
    "survey_id",
    "loanNumber",
    "clientId",
    "unique_id",
}

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


def load_data():
    """Load & merge impact + banking, engineer features, return merged DF."""
    impact = pd.read_csv(SYNTHETIC / "impact_data.csv")
    bank = pd.read_csv(SYNTHETIC / "core_banking_loans.csv")

    # Minimal feature engineering (same as preprocessing.py)
    bank["repayment_ratio"] = (
        bank["actualPaymentAmount"] / bank["scheduledPaymentAmount"]
    )
    bank["principal_completion_ratio"] = bank["principalPaid"] / bank["disbursedAmount"]
    bank["utilization_ratio"] = bank["disbursedAmount"] / bank["approvedAmount"]
    bank["past_due_ratio"] = bank["amountPastDue"] / bank["scheduledPaymentAmount"]

    for col in ["daysInArrears", "amountPastDue", "repayment_ratio"]:
        grp = bank.groupby("clientId")[col]
        bank[f"{col}_rolling_mean_3"] = grp.transform(
            lambda s: s.rolling(3, min_periods=1).mean()
        )
        bank[f"{col}_rolling_std_3"] = grp.transform(
            lambda s: s.rolling(3, min_periods=1).std()
        )

    bank["arrears_trend_delta"] = bank.groupby("clientId")["daysInArrears"].diff()
    bank["payment_volatility_3"] = bank.groupby("clientId")[
        "actualPaymentAmount"
    ].transform(lambda s: s.rolling(3, min_periods=1).std())
    sector_med = bank.groupby("industrySectorOfActivity")["daysInArrears"].transform(
        "median"
    )
    bank["sector_daysInArrears_median"] = sector_med
    bank["relative_arrears_vs_sector"] = bank["daysInArrears"] - sector_med

    bank_latest = bank.groupby("clientId", as_index=False).tail(1)

    merged = impact.merge(
        bank_latest,
        left_on="unique_id",
        right_on="clientId",
        how="left",
        suffixes=("_impact", "_core"),
    )

    merged["revenue_to_expense_ratio"] = merged["revenue"] / merged["hh_expense"]
    merged["nps_net"] = merged["nps_promoter"] - merged["nps_detractor"]

    return merged


def split_data(df):
    """80/20 split, time-ordered if survey_date exists."""
    if "survey_date" in df.columns:
        df = df.sort_values("survey_date")
    idx = int(len(df) * 0.8)
    return df.iloc[:idx].copy(), df.iloc[idx:].copy()


def get_features(df):
    """Drop leakage/target columns, return feature-only DataFrame."""
    drop = [c for c in df.columns if c in LEAKAGE_COLS]
    return df.drop(columns=drop, errors="ignore")


def main():
    print("Loading and engineering data…")
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

        # ── Tier classifier ─────────────────────────────────────────────
        y_tier_train = (
            train_df[tier_col].map(TIER_MAP).fillna(train_df[tier_col]).astype(int)
        )
        y_tier_test = (
            test_df[tier_col].map(TIER_MAP).fillna(test_df[tier_col]).astype(int)
        )

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

            prep_e = build_preprocessor(num_cols, cat_cols)
            reg_pipe = Pipeline([("prep", prep_e), ("reg", try_regressor(250))])
            reg_pipe.fit(X_train, train_df[tgt_col])

            preds = np.maximum(0, reg_pipe.predict(X_test))
            rmse = float(np.sqrt(mean_squared_error(test_df[tgt_col], preds)))
            mae = float(mean_absolute_error(test_df[tgt_col], preds))

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

        prep_v = build_preprocessor(num_cols, cat_cols)
        reg_pipe = Pipeline([("prep", prep_v), ("reg", try_regressor(300))])
        reg_pipe.fit(X_train, train_df[tgt_col])

        preds = np.maximum(0, reg_pipe.predict(X_test))
        rmse = float(np.sqrt(mean_squared_error(test_df[tgt_col], preds)))
        mae = float(mean_absolute_error(test_df[tgt_col], preds))

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

    print(f"\nDone! Trained {len(all_metrics)} models, saved to {MODELS_DIR}")
    print(f"Metrics saved to {METRICS_DIR}")
    print(metrics_df[["pipeline", "model", "type", "horizon"]].to_string(index=False))


if __name__ == "__main__":
    main()
