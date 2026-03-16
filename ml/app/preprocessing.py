"""Feature engineering helpers that mirror the notebook preprocessing.

Each pipeline's .joblib already includes the ColumnTransformer (imputation +
scaling / encoding), so we only need to replicate *derived columns* that were
created **before** fitting.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


# ── Risk-model feature engineering (matches risk-model.ipynb) ───────────────


def engineer_risk_features(core: pd.DataFrame, impact: pd.DataFrame) -> pd.DataFrame:
    """Merge core-banking + impact data and add all derived columns the risk
    pipeline expects.  Returns the merged DataFrame (one row per client)."""

    core = core.copy()

    # — Derived ratios on the loan side —
    core["repayment_ratio"] = (
        core["actualPaymentAmount"] / core["scheduledPaymentAmount"]
    )
    core["principal_completion_ratio"] = core["principalPaid"] / core["disbursedAmount"]
    core["utilization_ratio"] = core["disbursedAmount"] / core["approvedAmount"]
    core["past_due_ratio"] = core["amountPastDue"] / core["scheduledPaymentAmount"]

    # Rolling windows per client (window=3)
    for col in ["daysInArrears", "amountPastDue", "repayment_ratio"]:
        grp = core.groupby("clientId")[col]
        core[f"{col}_rolling_mean_3"] = grp.transform(
            lambda s: s.rolling(3, min_periods=1).mean()
        )
        core[f"{col}_rolling_std_3"] = grp.transform(
            lambda s: s.rolling(3, min_periods=1).std()
        )

    core["arrears_trend_delta"] = core.groupby("clientId")["daysInArrears"].diff()
    core["payment_volatility_3"] = core.groupby("clientId")[
        "actualPaymentAmount"
    ].transform(lambda s: s.rolling(3, min_periods=1).std())

    sector_med = core.groupby("industrySectorOfActivity")["daysInArrears"].transform(
        "median"
    )
    core["sector_daysInArrears_median"] = sector_med
    core["relative_arrears_vs_sector"] = core["daysInArrears"] - sector_med

    # Keep latest loan snapshot per client
    core_latest = core.groupby("clientId", as_index=False).tail(1)

    # — Merge —
    merged = impact.merge(
        core_latest,
        left_on="unique_id",
        right_on="clientId",
        how="left",
        suffixes=("_impact", "_core"),
    )

    # — Post-merge derived cols —
    merged["revenue_to_expense_ratio"] = merged["revenue"] / merged["hh_expense"]
    merged["nps_net"] = merged["nps_promoter"] - merged["nps_detractor"]
    if "jobs_created_3m" in merged.columns and "jobs_lost_3m" in merged.columns:
        merged["jobs_net_3m"] = merged["jobs_created_3m"] - merged["jobs_lost_3m"]

    return merged


# ── Employment-model feature engineering (matches employment-pred-model.ipynb)


def engineer_employment_features(
    core: pd.DataFrame, impact: pd.DataFrame
) -> pd.DataFrame:
    """Simpler feature set used by the employment-only pipeline."""

    core = core.copy()

    core["repayment_ratio"] = (
        core["actualPaymentAmount"] / core["scheduledPaymentAmount"]
    )
    core["utilization_ratio"] = core["disbursedAmount"] / core["approvedAmount"]
    core["past_due_ratio"] = core["amountPastDue"] / core["scheduledPaymentAmount"]
    core["arrears_trend_delta"] = core.groupby("clientId")["daysInArrears"].diff()

    core_latest = core.groupby("clientId", as_index=False).tail(1)

    merged = impact.merge(
        core_latest,
        left_on="unique_id",
        right_on="clientId",
        how="left",
        suffixes=("_impact", "_core"),
    )
    return merged


# Revenue-model reuses the *same* engineering as the risk model
engineer_revenue_features = engineer_risk_features


# ── Align columns to model expectations ────────────────────────────────────


def align_features(df: pd.DataFrame, expected_cols: list[str]) -> pd.DataFrame:
    """Ensure *df* has exactly the columns the model was trained on, in order.

    Missing columns are filled with ``NaN``; extra columns are dropped.
    """
    out = df.reindex(columns=expected_cols)
    return out
