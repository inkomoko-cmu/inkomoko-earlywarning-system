# Employment Prediction Pipeline

## Purpose

The employment pipeline forecasts the **job-creation and job-loss impact** of Inkomoko-supported businesses at **three monthly horizons** (1-month, 2-month, and 3-month ahead). This helps the organisation:

- **Track impact goals** — Inkomoko's mission includes measurable job creation; monthly trajectory predictions provide forward-looking estimates that reveal whether impact is accelerating or stalling.
- **Flag shrinking businesses** — A spike in predicted job losses, especially one that grows across horizons, can signal deeper operational trouble before it appears in revenue or loan data.
- **Prioritise support** — Businesses predicted to lose jobs may benefit from targeted capacity-building or market linkage interventions. Monthly granularity helps time the intervention.

---

## Models

The pipeline runs **six independent LightGBM regressors** — a jobs-created model and a jobs-lost model at each of the three horizons:

| Model                           | Horizon | Type       | Target            | Output                                          |
| ------------------------------- | ------- | ---------- | ----------------- | ----------------------------------------------- |
| **Jobs Created Regressor (1m)** | 1 month | Regression | `jobs_created_1m` | Predicted new jobs in 1 month (floored at 0).   |
| **Jobs Created Regressor (2m)** | 2 month | Regression | `jobs_created_2m` | Predicted new jobs in 2 months (floored at 0).  |
| **Jobs Created Regressor (3m)** | 3 month | Regression | `jobs_created_3m` | Predicted new jobs in 3 months (floored at 0).  |
| **Jobs Lost Regressor (1m)**    | 1 month | Regression | `jobs_lost_1m`    | Predicted jobs lost in 1 month (floored at 0).  |
| **Jobs Lost Regressor (2m)**    | 2 month | Regression | `jobs_lost_2m`    | Predicted jobs lost in 2 months (floored at 0). |
| **Jobs Lost Regressor (3m)**    | 3 month | Regression | `jobs_lost_3m`    | Predicted jobs lost in 3 months (floored at 0). |

All outputs are **non-negative** — the app clips any raw model predictions below zero to 0, since negative job counts are not meaningful.

---

## API Usage

### Endpoint

```
POST /predict/employment
Content-Type: application/json
```

### Request Body

```json
[
  {
    "unique_id": "CLI-00456",
    "age": 28,
    "gender": "Male",
    "number_of_employees": 12,
    "loan_amount": 300000,
    "outstanding_balance": 95000,
    ...
  }
]
```

### Response

```json
{
  "meta": {
    "model_pipeline": "employment",
    "record_count": 1
  },
  "predictions": [
    {
      "unique_id": "CLI-00456",
      "pred_jobs_created_1m": 0.8,
      "pred_jobs_created_2m": 1.6,
      "pred_jobs_created_3m": 2.4,
      "pred_jobs_lost_1m": 0.1,
      "pred_jobs_lost_2m": 0.2,
      "pred_jobs_lost_3m": 0.3
    }
  ]
}
```

### Response Fields

| Field                        | Description                                                                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pred_jobs_created_1m/2m/3m` | Predicted number of new jobs at each horizon. Fractional values reflect the model's average expectation (e.g., 2.4 means "about 2 to 3 jobs").                  |
| `pred_jobs_lost_1m/2m/3m`    | Predicted number of jobs lost at each horizon. A value near 0 indicates stable employment. Rising values across horizons signal accelerating workforce decline. |

---

## Performance Metrics

Both target models are evaluated on held-out test data using standard regression metrics **at each horizon** (1m, 2m, 3m):

| Metric                             | What It Measures                                                                                           | How to Interpret                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **RMSE** (Root Mean Squared Error) | Average magnitude of prediction errors, in the same units as the target (i.e., number of jobs).            | Lower is better. An RMSE of 0.5 means predictions are typically off by about half a job.         |
| **MAE** (Mean Absolute Error)      | Average of absolute differences between predicted and actual values. Less sensitive to outliers than RMSE. | Lower is better. Directly interpretable as "on average, how many jobs is the prediction off by?" |

> **Why both metrics?** RMSE penalises large errors more heavily, so if RMSE is much larger than MAE, the model occasionally makes big mistakes even though it's usually close. If RMSE ≈ MAE, errors are consistently small.

Metrics are reported per horizon on the **Model Cards** tab — shorter horizons typically show lower error than longer-horizon forecasts.

---

## Feature Engineering

The employment pipeline uses a lighter feature engineering step than the risk pipeline, focused on financial health indicators:

| Feature               | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `repayment_ratio`     | `amount_paid / loan_amount` — Loan repayment progress.       |
| `utilization_ratio`   | `outstanding_balance / loan_amount` — Credit utilisation.    |
| `past_due_ratio`      | `arrears_amount / outstanding_balance` — Overdue proportion. |
| `arrears_trend_delta` | Recent change direction in arrears — improving or worsening? |

These computed features are combined with raw client attributes (demographics, loan terms, business size, geographic region). The pipeline typically uses **~103 input features**.

---

## Interpreting Results

### Net Employment Direction

A useful derived insight is the **net jobs figure** at each horizon:

```
net_jobs_{h}m = pred_jobs_created_{h}m − pred_jobs_lost_{h}m
```

| Net Jobs Trajectory                    | Interpretation                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| **Positive and growing** (1m→3m)       | Business is expected to accelerate workforce growth — strong positive impact signal.  |
| **Positive but shrinking**             | Growth is decelerating — may still be healthy, but monitor for a trend reversal.      |
| **Approximately zero at all horizons** | Stable employment — no significant change expected.                                   |
| **Negative and worsening** (1m→3m)     | Business may be shrinking with acceleration — consider proactive support immediately. |

> The Demo UI displays trajectory sparklines for jobs created and jobs lost, making rising/falling patterns immediately visible.

### Practical Thresholds

- **jobs_created > 3 at any horizon**: High-growth prediction — this client's business may be scaling. Useful for success-story identification.
- **jobs_lost > 1 at any horizon**: Potential concern — even 1–2 predicted lost jobs in a small business may indicate operational stress.
- **Rising jobs_lost across horizons**: Accelerating workforce decline — a stronger warning signal than a single high value.
- **Both near 0 at all horizons**: Stable/micro business — typical for sole proprietors or very small operations.

### Caveats

- Predictions reflect average expectations based on historical patterns. Individual outcomes will vary.
- The model cannot account for sudden external shocks (e.g., policy changes, natural disasters) not present in historical data.
- Very small or very large job changes are harder to predict accurately due to their rarity in training data.
