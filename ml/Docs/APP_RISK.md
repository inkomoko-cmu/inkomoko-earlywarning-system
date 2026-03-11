# Risk Prediction Pipeline

## Purpose

The risk pipeline is the core of the early warning system. It answers two questions for every client **at each of three monthly horizons** (1-month, 2-month, and 3-month ahead):

1. **What risk tier will this client fall into?** — A categorical classification: **LOW**, **MEDIUM**, or **HIGH** risk.
2. **How severe is the predicted risk?** — A continuous score from **0** (lowest risk) to **1** (highest risk).

By producing predictions at three horizons, the pipeline reveals **risk trajectories**: a client moving from LOW at 1m to HIGH at 3m is on a deteriorating path, even if they appear safe today. This enables advisors to triage their portfolio with forward-looking trajectory analysis.

---

## Models

The pipeline uses **six models** — a tier classifier and a score regressor at each of the three horizons:

| Model                         | Horizon | Type                       | Target          | Output                                               | Algorithm |
| ----------------------------- | ------- | -------------------------- | --------------- | ---------------------------------------------------- | --------- |
| **Risk Tier Classifier (1m)** | 1 month | Multi-class classification | `risk_tier_1m`  | One of `LOW`, `MEDIUM`, `HIGH` + class probabilities | LightGBM  |
| **Risk Tier Classifier (2m)** | 2 month | Multi-class classification | `risk_tier_2m`  | One of `LOW`, `MEDIUM`, `HIGH` + class probabilities | LightGBM  |
| **Risk Tier Classifier (3m)** | 3 month | Multi-class classification | `risk_tier_3m`  | One of `LOW`, `MEDIUM`, `HIGH` + class probabilities | LightGBM  |
| **Risk Score Regressor (1m)** | 1 month | Regression                 | `risk_score_1m` | Continuous value clipped to [0, 1]                   | LightGBM  |
| **Risk Score Regressor (2m)** | 2 month | Regression                 | `risk_score_2m` | Continuous value clipped to [0, 1]                   | LightGBM  |
| **Risk Score Regressor (3m)** | 3 month | Regression                 | `risk_score_3m` | Continuous value clipped to [0, 1]                   | LightGBM  |

All six models run in parallel on the same set of input features.

### Why Two Model Types?

- The **tier classifiers** optimise for correctly separating the three risk categories and provide per-class probability estimates (e.g., "72% chance of HIGH risk").
- The **score regressors** capture finer-grained risk magnitude. Two clients both classified as HIGH might have scores of 0.71 vs 0.95 — the score helps prioritise within a tier.

### Why Three Horizons?

Month-by-month predictions reveal **trajectory direction**:

- A client with scores [0.3, 0.5, 0.8] across 1m→3m is rapidly deteriorating — **escalate now**.
- A client with scores [0.7, 0.5, 0.3] is **recovering** — current interventions may be working.
- A flat trajectory [0.6, 0.6, 0.6] suggests **persistent moderate risk** — investigate root causes.

---

## API Usage

### Endpoint

```
POST /predict/risk
Content-Type: application/json
```

### Request Body

A JSON array of client record objects:

```json
[
  {
    "unique_id": "CLI-00123",
    "age": 34,
    "gender": "Female",
    "loan_amount": 500000,
    "outstanding_balance": 125000,
    "arrears_amount": 15000,
    "monthly_revenue": 80000,
    ...
  }
]
```

### Response

```json
{
  "meta": {
    "model_pipeline": "risk",
    "record_count": 1
  },
  "predictions": [
    {
      "unique_id": "CLI-00123",
      "pred_risk_tier_1m": "MEDIUM",
      "pred_risk_tier_2m": "MEDIUM",
      "pred_risk_tier_3m": "HIGH",
      "prob_low": 0.08,
      "prob_medium": 0.2,
      "prob_high": 0.72,
      "pred_risk_score_1m": 0.45,
      "pred_risk_score_2m": 0.62,
      "pred_risk_score_3m": 0.81
    }
  ]
}
```

### Response Fields

| Field                                    | Description                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pred_risk_tier_1m/2m/3m`                | The predicted risk category at each horizon: `LOW`, `MEDIUM`, or `HIGH`.                                  |
| `prob_low` / `prob_medium` / `prob_high` | The probability the client belongs to each tier (based on the 3-month model). These sum to 1.0.           |
| `pred_risk_score_1m/2m/3m`               | Continuous risk severity score (0–1) at each horizon. Higher = more at risk. Enables trajectory analysis. |

---

## Performance Metrics

The risk pipeline is evaluated with classification and calibration metrics computed on held-out test data **for each horizon** (1m, 2m, 3m):

| Metric                             | What It Measures                                                                                                                             | How to Interpret                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **AUC (macro)**                    | How well the model distinguishes between all three risk tiers, averaged across classes.                                                      | > 0.90 Excellent · > 0.80 Good · > 0.70 Fair                     |
| **Quadratic Weighted Kappa (QWK)** | Agreement between predicted and actual tiers, penalising distant misclassifications more heavily (e.g., predicting LOW when actual is HIGH). | > 0.80 Excellent · > 0.60 Good · > 0.40 Fair                     |
| **Brier Score (High-Risk)**        | Calibration of the high-risk probability — how close the predicted "chance of HIGH risk" is to reality.                                      | < 0.10 Excellent · < 0.20 Good · < 0.30 Fair _(lower is better)_ |

Metrics are reported separately per horizon on the **Model Cards** tab, so you can compare how prediction quality changes across forecast distances (shorter horizons typically have lower error).

---

## Feature Engineering

Before the model pipeline's built-in preprocessing (imputation + encoding + scaling), the app computes several derived features:

| Feature                      | Formula / Description                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `repayment_ratio`            | `amount_paid / loan_amount` — How much of the loan has been repaid.                 |
| `principal_completion_ratio` | `amount_paid / principal_amount` — Progress toward principal repayment.             |
| `utilization_ratio`          | `outstanding_balance / loan_amount` — How much of the credit is still in use.       |
| `past_due_ratio`             | `arrears_amount / outstanding_balance` — Proportion of the balance that is overdue. |
| `arrears_trend_delta`        | Change in arrears across rolling windows — is the client getting better or worse?   |
| `payment_volatility_3`       | Standard deviation of recent payments — stability of repayment behaviour.           |
| `revenue_to_expense_ratio`   | `monthly_revenue / monthly_expenses` — Basic profitability indicator.               |
| `nps_net`                    | Net Promoter Score indicator derived from survey data.                              |
| `jobs_net_3m`                | `jobs_created_3m - jobs_lost_3m` — Net employment direction.                        |

The model also receives raw fields like loan term, client type, geographic region, and demographic attributes. In total, the pipeline typically uses **~103 features**.

---

## Data Leakage Controls

- **Time-based split**: Training uses data up to a cutoff date; testing uses data after. No future data leaks into training.
- **Leakage column exclusion**: Target variables, prediction columns, and key identifiers are explicitly stripped before the feature matrix is assembled.
- **Feature timestamp alignment**: Loan snapshots are joined to survey records using the most recent state available _at or before_ the survey date.

---

## Interpreting Results

### For Advisors

With monthly predictions, focus on **trajectory direction** as much as the raw values:

- **HIGH tier + high score (> 0.8) at all horizons**: Immediate intervention recommended — review loan terms, schedule a business health check.
- **Score rising across horizons (e.g., 0.4 → 0.6 → 0.8)**: Deteriorating trajectory — act early before 3m prediction materialises.
- **Score declining across horizons (e.g., 0.7 → 0.5 → 0.3)**: Improving trajectory — current interventions may be working. Monitor.
- **MEDIUM tier, stable scores**: Watch list — no immediate alarm, but flag for follow-up if the trajectory shifts upward.
- **LOW tier at all horizons**: Healthy — continue standard engagement cadence.

> The Demo UI displays trajectory sparklines for each client, making rising/falling patterns immediately visible at a glance.

### Probability Outputs

The three class probabilities (`prob_low`, `prob_medium`, `prob_high`) are especially useful for clients near tier boundaries. A client predicted as MEDIUM with `prob_high = 0.38` is closer to the danger zone than one with `prob_high = 0.05`.
