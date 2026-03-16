<!--
Employment Prediction Notebook Documentation
File: ml/notebooks/employment-pred-model.ipynb
-->

# Employment Prediction Notebook — Documentation

## Overview

This notebook builds and evaluates **employment-outcome forecasting models** for two 3‑month targets:

- `jobs_created_3m`
- `jobs_lost_3m`

It uses merged survey and core loan data, performs **time-ordered train/test splitting**, trains one model per target, evaluates performance on a holdout set, produces a backtest chart, and exports model artifacts and prediction files.

---

## Objectives

1. Predict short-term employment changes for each surveyed business/client.
2. Use only historical data for training and reserve later observations for testing.
3. Produce reusable artifacts for downstream scoring/reporting:
   - Trained model files
   - Evaluation metrics
   - Test-set predictions
   - Backtest chart

---

## Input Data Requirements

The notebook expects the following CSV files under:

- `./ml/synthetic_outputs/core_banking_loans.csv`
- `./ml/synthetic_outputs/impact_data.csv`

### Required linkage fields

- Core dataset: `clientId`
- Impact dataset: `unique_id`

These are normalized as trimmed strings and used for joining.

### Key temporal fields

- Core side: submission/approval/disbursement/payment/date-of-birth fields are parsed to datetime.
- Impact side: `survey_date` is parsed to datetime and used for chronological ordering.

### Required targets

- `jobs_created_3m`
- `jobs_lost_3m`

Rows missing `survey_date` or either target are excluded from modeling.

---

## High-Level Pipeline

### 1) Environment and paths

- Sets random seed for reproducibility.
- Creates output directories if missing:
  - `./ml/artifacts`
  - `./ml/charts`

### 2) Data loading and cleaning

- Reads both source files.
- Converts configured date columns to datetime with coercion for invalid values.
- Standardizes identifier fields for robust matching.

### 3) Feature engineering (from core loan data)

Derived numeric signals include:

- `repayment_ratio`
- `utilization_ratio`
- `past_due_ratio`
- `arrears_trend_delta` (within-client change in arrears)

These are designed to reflect repayment discipline, funding utilization, delinquency pressure, and arrears trajectory.

### 4) Record consolidation and merge

- Keeps the latest core record per client.
- Left-joins impact records to latest core features on ID.
- Produces a modeling frame sorted by `survey_date`.

### 5) Time-based split

- Uses the first 80% (earlier dates) for training.
- Uses the final 20% (later dates) for test/backtest.
- This avoids random leakage from future to past and better simulates deployment.

### 6) Feature selection and preprocessing

Excludes identifiers, direct targets, and non-employment target columns from predictors.

Preprocessing strategy:

- Numeric columns:
  - Median imputation
  - Standard scaling
- Categorical columns:
  - Most-frequent imputation
  - Ordinal encoding with unknown-category handling

### 7) Modeling

Trains **one independent pipeline per target** with:

- Shared preprocessing block
- `RandomForestRegressor` as estimator

Predictions are clipped at zero to enforce non-negative employment outputs.

### 8) Evaluation

For each target on the test set:

- RMSE
- MAE

Metrics are assembled into a tabular summary.

### 9) Diagnostics chart

Creates a two-panel line chart over test `survey_date`:

- Actual vs predicted `jobs_created_3m`
- Actual vs predicted `jobs_lost_3m`

Saved to:

- `./ml/charts/employment_backtest.png`

### 10) Artifact export

Writes:

- `./ml/artifacts/employment_model_metrics.csv`
- `./ml/artifacts/employment_predictions_test.csv`
- `./ml/artifacts/employment_jobs_created_3m_model.joblib`
- `./ml/artifacts/employment_jobs_lost_3m_model.joblib`

Prediction export includes:

- identity/date fields (`unique_id`, `survey_date`)
- actual employment targets
- predicted target columns prefixed with `pred_`

---

## Output Schema Notes

### `employment_model_metrics.csv`

Expected columns:

- `target`
- `rmse`
- `mae`

### `employment_predictions_test.csv`

Expected columns include:

- `unique_id`
- `survey_date`
- `jobs_created_3m`
- `jobs_lost_3m`
- `pred_jobs_created_3m`
- `pred_jobs_lost_3m`

---

## Reproducibility

- Random seed is fixed.
- Deterministic preprocessing configuration is used.
- Model randomness is controlled via estimator seed.

> Note: Full reproducibility can still vary slightly across library versions/hardware due to low-level parallelism and implementation details.

---

## Assumptions and Constraints

1. The latest core loan snapshot is representative for each impact record after merge.
2. Survey target labels are available and valid for supervised training.
3. Employment outcomes are non-negative (enforced post-prediction).
4. Ordinal encoding is acceptable for categorical variables in tree-based models.
5. Time split by sorted survey date is sufficient for backtesting.

---

## Known Risks / Caveats

- **Potential temporal mismatch** between latest core record and survey timing if not strictly aligned.
- **Category drift** in production may degrade encoded categorical performance.
- **Class/scale imbalance** may affect `jobs_lost_3m` if sparse or low magnitude.
- **Random forest extrapolation limits** can underperform for extreme unseen ranges.

---

## Suggested Enhancements

1. Replace single holdout with rolling/expanding-window backtests (e.g., `TimeSeriesSplit`) for more robust temporal validation.
2. Add feature importance reporting (per target) and SHAP-style interpretability.
3. Introduce hyperparameter tuning with time-aware CV.
4. Add baseline comparisons (naive persistence / median model).
5. Validate and enforce timestamp-consistent joins (core features available at survey time only).
6. Add model/version metadata file for traceability.
7. Include confidence intervals or quantile models for uncertainty-aware outputs.

---

## Operational Usage

Use the exported `.joblib` model files for inference by loading the target-specific model and passing a feature frame with the same input schema as training predictors (excluding dropped fields/targets). Persist predictions with timestamp and entity IDs for monitoring.

---

## Monitoring Recommendations

Track over time:

- RMSE/MAE drift by cohort and period
- Missingness and schema changes in incoming data
- Distribution shifts in key engineered ratios
- Prediction bias across segments (e.g., client type, geography, loan profile)

Set alerts for significant degradation and trigger retraining when thresholds are crossed.

---

## Quick Checklist Before Running

- [ ] Input CSV files exist under `./ml/synthetic_outputs/`
- [ ] Required columns are present (IDs, dates, targets, core financial fields)
- [ ] Output directories are writable
- [ ] Python environment has required packages installed
- [ ] Date parsing and row counts look sensible after cleaning

---
