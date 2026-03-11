# Risk & Impact Prediction Notebook — Detailed Documentation

## Overview

This notebook implements an end-to-end, **time-aware machine learning workflow** for early warning and impact forecasting.  
It builds, evaluates, calibrates, explains, and exports models for the following business targets:

1. **`risk_tier_3m`** — ordinal risk class (`LOW`, `MEDIUM`, `HIGH`)
2. **`risk_score_3m`** — continuous risk probability score in `[0, 1]`
3. **`jobs_created_3m`** — forecast of jobs created
4. **`jobs_lost_3m`** — forecast of jobs lost
5. **`revenue_3m`** — forecast of future revenue

The workflow is designed to be:

- **Leakage-aware** (time-based split and target/ID exclusions),
- **Reproducible** (fixed random seed, deterministic artifact export),
- **Portable** (CPU-first fallback when GPU libraries/devices are unavailable),
- **Operationalized** (batch inference + persisted model artifacts + reporting outputs).

---

## Notebook Architecture

### 1) Imports & Setup

Initializes dependencies, random seed, optional acceleration libraries, and filesystem paths.

**Key behavior**

- Attempts optional imports (`lightgbm`, `xgboost`, `shap`) with safe fallback.
- Detects NVIDIA GPU availability via `nvidia-smi`.
- Enables GPU runtime only when both hardware and package support exist.
- Creates output directories for:
  - `artifacts` (models, predictions, metrics),
  - `charts` (visual diagnostics).

---

### 2) Data Loading

Loads:

- `core_banking_loans.csv` (loan transaction/portfolio history),
- `impact_data.csv` (survey outcomes and target labels).

**Validation**

- Compares loaded schema against expected column lists.
- Prints missing columns to catch upstream data contract drift.

---

### 3) Data Cleaning

Standardizes data quality before feature generation.

**Transforms**

- Datetime coercion (`submissionDate`, `survey_date`, etc.).
- Identifier normalization (`clientId`, `unique_id` trimmed and cast to string).
- Numeric coercion with median imputation for continuous fields.
- Categorical fill with `UNKNOWN`.
- IQR clipping for selected high-variance continuous columns to reduce outlier sensitivity.

**Goal**

- Ensure model-ready, numerically stable training input without failing on malformed records.

---

### 4) Feature Engineering

Builds risk-relevant behavioral and contextual predictors from core loan history and survey data.

**Engineered signals**

- Repayment and utilization ratios,
- Past-due burden metrics,
- Client-level rolling means/std (3-observation windows),
- Arrears trend deltas,
- Payment volatility,
- Sector-relative arrears deviation,
- Revenue/expense ratio,
- Net promoter score transformation,
- Net jobs effect in 3-month horizon.

**Join strategy**

- Uses the latest known loan state per client and merges to survey records by client identity.

---

### 5) Time-Based Train/Test Split

Implements strict chronological partitioning.

**Protocol**

- Sort by `survey_date`,
- Use first 80% for training, last 20% for testing,
- Keep ordinal label mapping (`LOW < MEDIUM < HIGH`),
- Remove leakage-prone columns (targets, IDs, time columns, direct identifiers).

**Why this matters**

- Prevents future information from entering model training,
- Produces realistic out-of-time performance estimates.

---

### 6) Baseline Models

Establishes reference performance before advanced learners.

**Models**

- Risk tier baseline: multinomial logistic model over ordered encoded labels.
- Risk score baseline: linear regression.
- Impact baselines:
  - Poisson regression for count-like job outcomes,
  - Linear regression for revenue.

**Purpose**

- Provide interpretable benchmarks and sanity checks for later uplift.

---

### 7) Advanced Models & Tuning

Trains stronger learners with controlled search and fallback logic.

**Classifier for risk tier**

- Preferred: LightGBM multiclass,
- Alternative: XGBoost multiclass,
- Fallback: RandomForestClassifier.

**Regressors for risk score + impact**

- Preferred: LightGBMRegressor,
- Alternative: XGBRegressor,
- Fallback: RandomForestRegressor.

**Optimization**

- `RandomizedSearchCV` with `TimeSeriesSplit` CV.
- `FAST_TRAIN` mode optionally reduces search cost and sampled training volume.

**Operational guardrails**

- LightGBM GPU is forced to CPU if OpenCL is unavailable.
- XGBoost GPU is enabled only when runtime supports CUDA.

---

### 8) Feature Selection & Ranking

Combines complementary importance methods:

1. **LassoCV** (sparse linear signal on continuous proxy target),
2. **Tree-based feature importance** from tuned classifier,
3. **SHAP absolute contribution magnitude** (if available).

Outputs a ranked feature table with a combined importance view for model governance and interpretability.

---

### 9) Evaluation

Computes core classification and regression KPIs on out-of-time test data.

**Risk tier metrics**

- Macro AUC (OvR multiclass),
- Quadratic Weighted Kappa (ordinal agreement),
- Brier score for high-risk class reliability.

**Regression metrics**

- RMSE and MAE for:
  - `jobs_created_3m`,
  - `jobs_lost_3m`,
  - `revenue_3m`,
  - `risk_score_3m`.

**Visual backtests**

- Time-series actual vs predicted risk tier,
- Time-series actual vs predicted revenue trajectory.

---

### 10) Calibration

Improves probability reliability for high-risk detection using:

- Platt scaling (`sigmoid`),
- Isotonic regression.

Produces reliability curves comparing raw and calibrated probabilities against ideal calibration line.

---

### 11) Explainability

Provides model transparency artifacts.

**SHAP**

- Attempts runtime SHAP import if unavailable at kernel start.
- Supports multiclass summary plots (per class).
- Uses cleaned/pretty feature labels for readability.

**Partial Dependence**

- Generates PDP for selected numeric drivers with class target fixed to high-risk (`target=2`).

---

### 12) Inference Pipeline

Defines reusable batch scoring function and export flow.

**`score_batch(df_features)` outputs**

- Predicted risk tier label,
- Tier probabilities (`low/medium/high`),
- Predicted `risk_score_3m`,
- Predicted impact targets (`jobs_created_3m`, `jobs_lost_3m`, `revenue_3m`).

**Persistence**

- Saves trained models (`joblib`) per target.
- Exports test predictions to CSV for downstream evaluation and integration.

---

### 13) Reporting

Creates consumable summary outputs for decisioning and portfolio monitoring.

**Exports**

- `model_summary_metrics.csv`,
- `segment_summary.csv`,
- `predictions_test.csv`,
- model binaries (`*.joblib`).

**Dashboard plots**

- Risk score by predicted tier (predicted vs actual),
- Revenue by predicted tier (predicted vs actual),
- Error distribution for risk score prediction.

---

## Inputs, Outputs, and Paths

### Expected input files

- `ml/synthetic_outputs/core_banking_loans.csv`
- `ml/synthetic_outputs/impact_data.csv`

### Generated artifacts

- `ml/artifacts/risk_tier_model.joblib`
- `ml/artifacts/risk_score_3m_model.joblib`
- `ml/artifacts/jobs_created_3m_model.joblib`
- `ml/artifacts/jobs_lost_3m_model.joblib`
- `ml/artifacts/revenue_3m_model.joblib`
- `ml/artifacts/predictions_test.csv`
- `ml/artifacts/model_summary_metrics.csv`
- `ml/artifacts/segment_summary.csv`

### Generated charts

- `ml/charts/backtest_plots.png`
- `ml/charts/calibration_curve.png`
- `ml/charts/partial_dependence.png`
- `ml/charts/shap_summary*.png`
- `ml/charts/dashboard_plots.png`

---

## Data Leakage & Modeling Notes

- Time-based split is the primary anti-leakage control.
- Leakage columns (targets, IDs, key timestamps) are explicitly excluded from features.
- Feature engineering uses historical loan state aligned to survey rows via latest client snapshot.
- Categorical encoding uses `OrdinalEncoder` with unknown handling for inference robustness.
- Predictions are clipped/non-negative constrained where business semantics require it.

---

## Assumptions and Caveats

- `risk_tier_3m` values are normalized to `LOW`, `MEDIUM`, `HIGH` (with `MID -> MEDIUM` mapping).
- Job targets are modeled as non-negative outcomes; negative predictions are truncated to zero.
- IQR clipping can reduce sensitivity to extreme outliers but may dampen rare-event signal.
- Multinomial logistic is an approximation for ordinal risk structure, not a true proportional-odds model.
- If SHAP or GPU libraries are absent, notebook gracefully falls back without blocking pipeline completion.

---

## Recommended Production Hardening (Next Steps)

1. Add schema validation with strict types and ranges at ingest time.
2. Version datasets, features, and models for traceability (MLflow or equivalent).
3. Promote calibration model selection by comparing Brier/log-loss on validation folds.
4. Add drift monitoring (feature, prediction, and residual drift).
5. Implement threshold policy for high-risk alerts with precision/recall tradeoff review.
6. Create CI checks for notebook execution and artifact existence.
7. Externalize hyperparameters and toggles (`FAST_TRAIN`, sampling) into config files.

---

## Reproducibility

- Random seed is fixed (`SEED=42`).
- All artifacts are exported to deterministic paths.
- Fallback logic ensures training completes across heterogeneous environments.
- For strict reproducibility, pin package versions and capture runtime metadata alongside artifacts.
