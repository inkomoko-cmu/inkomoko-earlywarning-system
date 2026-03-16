# Revenue Prediction Pipeline

## Purpose

The revenue pipeline forecasts the **total revenue** a client's business is expected to generate at **three monthly horizons** (1-month, 2-month, and 3-month ahead). This enables:

- **Early decline detection** — A falling revenue trajectory across horizons, paired with rising risk, confirms a deteriorating situation before it becomes critical.
- **Portfolio segmentation** — Group clients by revenue trajectory shape (growing, flat, declining) to allocate advisory resources where they'll have the most impact.
- **Financial planning support** — Monthly revenue projections help advisors have informed conversations about cash-flow management and loan repayment capacity at different time frames.

---

## Models

The pipeline uses **three LightGBM regressors**, one at each horizon:

| Model                      | Horizon | Type       | Target       | Output                                        |
| -------------------------- | ------- | ---------- | ------------ | --------------------------------------------- |
| **Revenue Regressor (1m)** | 1 month | Regression | `revenue_1m` | Predicted revenue in 1 month (floored at 0).  |
| **Revenue Regressor (2m)** | 2 month | Regression | `revenue_2m` | Predicted revenue in 2 months (floored at 0). |
| **Revenue Regressor (3m)** | 3 month | Regression | `revenue_3m` | Predicted revenue in 3 months (floored at 0). |

All outputs are **non-negative**: any raw predictions below zero are clipped to 0, since negative revenue is not a meaningful business outcome.

---

## API Usage

### Endpoint

```
POST /predict/revenue
Content-Type: application/json
```

### Request Body

```json
[
  {
    "unique_id": "CLI-00789",
    "age": 42,
    "gender": "Female",
    "monthly_revenue": 120000,
    "monthly_expenses": 85000,
    "loan_amount": 750000,
    "outstanding_balance": 200000,
    ...
  }
]
```

### Response

```json
{
  "meta": {
    "model_pipeline": "revenue",
    "record_count": 1
  },
  "predictions": [
    {
      "unique_id": "CLI-00789",
      "pred_revenue_1m": 112500.25,
      "pred_revenue_2m": 228300.5,
      "pred_revenue_3m": 342150.75
    }
  ]
}
```

### Response Fields

| Field                   | Description                                                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pred_revenue_1m/2m/3m` | Predicted cumulative revenue the client's business will generate at each horizon, in the same currency units as the training data. Enables trajectory analysis. |

---

## Performance Metrics

Each horizon model is evaluated on held-out test data using standard regression metrics:

| Metric                             | What It Measures                                                                                               | How to Interpret                                                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **RMSE** (Root Mean Squared Error) | Average magnitude of prediction errors, in the same currency units as revenue. Heavily penalises large errors. | Lower is better. Read as "on average, the prediction is off by roughly this amount." |
| **MAE** (Mean Absolute Error)      | Average absolute difference between predicted and actual revenue. More robust to outliers.                     | Lower is better. Directly interpretable in business terms.                           |

> **Contextual reading:** An RMSE of 68 on a dataset where average revenue is 500 means the model is typically off by about 14% — reasonable for a forward forecast. Always compare error magnitudes to the scale of the target.

Metrics are reported per horizon on the **Model Cards** tab — shorter horizons (1m) typically show lower error than longer-horizon (3m) forecasts.

---

## Feature Engineering

The revenue pipeline reuses the same comprehensive feature set as the risk pipeline:

| Feature Category     | Examples                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------- |
| **Financial ratios** | `repayment_ratio`, `utilization_ratio`, `past_due_ratio`, `principal_completion_ratio`      |
| **Trend indicators** | `arrears_trend_delta`, `payment_volatility_3`, rolling-window arrears and payment stats     |
| **Business metrics** | `revenue_to_expense_ratio`, `number_of_employees`, `monthly_revenue`, `monthly_expenses`    |
| **Demographics**     | `age`, `gender`, `client_type`, `geographic_region`                                         |
| **Loan profile**     | `loan_amount`, `principal_amount`, `outstanding_balance`, `loan_term_months`, `loan_status` |

The pipeline typically uses **~103 input features** in total.

---

## Interpreting Results

### Revenue Trend Analysis

With month-by-month predictions, revenue trajectory analysis is built directly into a single API call. Compare the three horizons for the same client:

| Trajectory Shape                           | Interpretation                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| **Rising** (1m < 2m < 3m)                  | Business appears healthy and growing — maintain current advisory approach.                                      |
| **Declining** (1m > 2m > 3m)               | Potential concern — cross-reference with risk score. If both are worsening, escalate to proactive intervention. |
| **Flat** (similar across horizons)         | Stable business — consistent revenue expected.                                                                  |
| **Volatile** (up then down, or vice versa) | May indicate seasonal business or model uncertainty. Investigate further before acting.                         |

> The Demo UI displays trajectory sparklines for each client's revenue, making rising/falling patterns immediately visible.

### Cross-Pipeline Insights

Revenue predictions are most useful in combination with the other two pipelines:

- **Rising risk trajectory + declining revenue trajectory** → Strongest early warning signal. Prioritise immediate advisory contact.
- **Low risk at all horizons + strong/rising revenue** → Healthy client. Good candidate for expanded services or success-story documentation.
- **Growing employment + flat revenue** → Business may be investing and expanding — revenue could follow. Monitor, don't alarm.
- **Declining revenue + rising job losses across horizons** → Compounding signals of distress accelerating over time. Consider comprehensive business health assessment.

### Caveats

- Revenue predictions are based on historical patterns and financial ratios. They cannot anticipate sudden market changes, new contracts, or loss of a major customer.
- Predictions are point estimates with no built-in confidence interval. Treat them as directional guidance, not exact forecasts.
- The model was trained on synthetic data representative of Inkomoko's client base. Production accuracy will depend on how closely real data matches training distribution.
- Extremely high or low revenue values are harder to predict accurately because they are rare in the training data.
