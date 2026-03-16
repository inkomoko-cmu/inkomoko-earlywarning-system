# Revenue Prediction Notebook Documentation (`revenue-pred-model.ipynb`)

## Overview

This notebook trains and evaluates a **single-target regression model** to predict **`revenue_3m`** (3‑month revenue) using merged synthetic core banking and impact survey data.  
It follows a **time-ordered split** (first 80% for training, last 20% for testing) to better simulate real-world forecasting conditions and avoid leakage from future observations.

---

## Objective

- Build a production-ready baseline model for `revenue_3m`.
- Generate and persist:
  - trained model artifact
  - evaluation metrics
  - test-set predictions
  - backtest visualization

---

## Data Inputs

### 1) Core banking loans dataset

- **Path**: `./ml/synthetic_outputs/core_banking_loans.csv`
- Used for loan, repayment, and arrears behavior signals.
- Includes multiple records per client over time.

### 2) Impact dataset

- **Path**: `./ml/synthetic_outputs/impact_data.csv`
- Contains survey-level features and prediction targets, including `revenue_3m`.

---

## Data Preparation Pipeline

### Datetime normalization

The notebook parses relevant date columns with safe coercion (`errors="coerce"`), ensuring invalid date strings become null rather than failing execution.

### Identifier cleanup

Client identifiers are cast to string and trimmed to maximize merge consistency:

- core side: `clientId`
- impact side: `unique_id`

### Temporal ordering

Core records are sorted by (`clientId`, `submissionDate`) so sequence-derived features (e.g., arrears trend) are consistent.

### Engineered financial features

Derived from core banking fields:

- **`repayment_ratio`** = actual payment / scheduled payment
- **`utilization_ratio`** = disbursed amount / approved amount
- **`past_due_ratio`** = amount past due / scheduled payment
- **`arrears_trend_delta`** = change in days in arrears from prior record per client

> Division-by-zero protections are applied by replacing denominator zeros with missing values before computation.

### Record selection for merge

Only the **latest core record per client** is retained and merged into the impact table (left join from impact), creating the modeling dataset.

### Modeling row filter

Rows missing either:

- `survey_date`, or
- target `revenue_3m`  
  are removed prior to training/evaluation.

---

## Train/Test Strategy

### Time-based split

- Dataset is sorted by `survey_date`.
- Split index = `int(0.8 * total_rows)`.
- Earlier 80% → training set.
- Most recent 20% → test/backtest set.

This preserves chronology and better approximates future inference behavior than random splitting.

---

## Feature Selection

### Explicitly excluded columns

The notebook drops identifiers, date keys, and non-feature target/related outputs (including future/risk outcomes) to reduce leakage and keep modeling scope focused on revenue prediction.

### Typed feature handling

- **Numeric columns**: median imputation + standard scaling
- **Categorical columns**: most-frequent imputation + ordinal encoding with unknown handling (`unknown_value=-1`)

All preprocessing is encapsulated in a `ColumnTransformer` and then attached to the model via an sklearn `Pipeline`.

---

## Model Configuration

### Algorithm

- `RandomForestRegressor`
- `n_estimators=300`
- fixed random seed (`SEED=42`) for reproducibility
- constrained parallelism (`n_jobs=2`)

### Prediction post-processing

Predictions are clipped with `max(0, pred)` to enforce non-negative revenue outputs.

---

## Evaluation

### Metrics reported

On the held-out time-based test set:

- **RMSE** (Root Mean Squared Error)
- **MAE** (Mean Absolute Error)

Metrics are saved in a one-row table keyed by target (`revenue_3m`).

---

## Visualization

A backtest chart compares:

- actual `revenue_3m`
- predicted `revenue_3m`

across test-set `survey_date` to inspect temporal fit and deviation patterns.

---

## Artifacts Produced

Saved under `./ml/artifacts`:

1. **Model binary**
   - `revenue_3m_model.joblib`
2. **Metrics CSV**
   - `revenue_model_metrics.csv`
3. **Prediction export (test only)**
   - `revenue_predictions_test.csv`  
     Includes:
   - `unique_id`
   - `survey_date`
   - actual `revenue_3m`
   - `pred_revenue_3m`

Saved under `./ml/charts`:

- `revenue_backtest.png`

---

## Reproducibility & Environment Notes

- Global warning suppression is enabled for cleaner notebook output.
- Random seed is fixed for deterministic sampling/model behavior where possible.
- Output directories are created automatically if missing.

---

## Assumptions and Constraints

- Input files exist and conform to expected schema.
- `survey_date` is a valid chronological proxy for forecasting timeline.
- Latest core record per client is representative of current state at survey time.
- Ordinal encoding is acceptable for categorical representation in tree ensembles.
- Synthetic data characteristics may differ from production distributions.

---

## Known Limitations

- No hyperparameter optimization or cross-validation is performed.
- Uses a single model family (Random Forest) without benchmark comparison.
- Potentially sensitive to temporal drift and feature shifts over time.
- No interval estimates/uncertainty quantification.
- Merge uses latest core snapshot only; no richer longitudinal aggregation window.

---

## Recommended Next Improvements

1. Add walk-forward validation for stronger temporal robustness.
2. Compare models (e.g., XGBoost/LightGBM/CatBoost, linear baseline).
3. Track feature importance and SHAP diagnostics.
4. Add outlier handling/log-transform options for skewed revenue.
5. Introduce experiment tracking (MLflow or equivalent).
6. Validate data quality rules pre-training (null rates, schema checks).
7. Add model versioning and inference contract tests.

---

## Expected Notebook Outcome

After successful execution, users obtain:

- a trained revenue prediction pipeline,
- objective error metrics on recent data,
- exportable predictions for downstream analysis,
- and persisted artifacts ready for integration into a broader early-warning system workflow.
