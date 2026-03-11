# Portfolio & Client Profiles

## Purpose

The Portfolio view provides a **bird's-eye view of the entire enterprise base**, scoring every client through all three prediction pipelines and presenting results in a single, sortable, filterable table. It answers the question: _"Across all our clients, who needs attention and why?"_

Combined with the **Client Profile Modal**, the Portfolio enables both macro-level portfolio monitoring and micro-level client investigation — all from a single interface.

---

## Portfolio View

### How It Works

When you open the Portfolio tab, the application:

1. Loads either the uploaded dataset or the built-in test data.
2. Runs **all 15 models** (risk tier, risk score, jobs created, jobs lost, revenue — each at the 3-month horizon) on every enterprise.
3. Derives a **recommended action** based on the risk tier.
4. Returns a flat, sortable table with one row per enterprise.

### Table Columns

| Column               | Description |
| -------------------- | ----------- |
| **Enterprise ID**    | The unique identifier for each client (`unique_id`). |
| **Country**          | Operating country — used for governance-aware recommendations. |
| **Program**          | Inkomoko program the client is enrolled in. |
| **Sector**           | Business sector classification. |
| **Risk Tier**        | Predicted risk category at 3-month horizon: `LOW`, `MEDIUM`, or `HIGH`. Colour-coded badges. |
| **Risk Score**       | Continuous risk severity score (0–1) at 3m. Higher = more at risk. |
| **Revenue (3m)**     | Predicted revenue at the 3-month horizon. |
| **Jobs Created (3m)**| Predicted new jobs at the 3-month horizon. |
| **Jobs Lost (3m)**   | Predicted jobs lost at the 3-month horizon. |
| **Action**           | Recommended action derived from the risk tier (e.g., "Immediate Review", "Monitor", "Standard"). |

### Filtering & Search

The Portfolio table supports:

- **Text search** — Filter by enterprise ID, country, or sector keywords.
- **Risk tier filter** — Show only HIGH / MEDIUM / LOW enterprises.
- **Country filter** — Narrow to a specific operating country.
- **Sector filter** — Focus on a particular business sector.
- **Program filter** — Filter by Inkomoko program enrollment.
- **Pagination** — Navigate through large portfolios with page controls.

### Sorting

Click any column header to sort ascending/descending. Default sort is by risk score (highest first) to surface the most at-risk enterprises immediately.

---

## Client Profile Modal

Clicking any enterprise row in the Portfolio table opens the **Client Profile Modal** — a comprehensive single-client deep dive.

### What It Shows

The modal runs all three pipelines on the selected client and displays:

| Section              | Details |
| -------------------- | ------- |
| **Risk Assessment**  | Risk tier and score at all three horizons (1m, 2m, 3m) with trajectory sparkline. Per-class probabilities (LOW / MEDIUM / HIGH). |
| **Employment Forecast** | Jobs created and jobs lost at all three horizons with trajectory sparklines. Net employment direction. |
| **Revenue Projection**  | Revenue forecast at all three horizons with trajectory sparkline. |
| **AI Profile Summary**  | An AI-generated natural language summary of the client's situation, powered by the RAG Agent. Highlights key risks, opportunities, and recommended interventions. |
| **Key Indicators**   | Client demographics, loan details, and financial ratios at a glance. |

### How to Use

1. Open the **Portfolio** tab.
2. Use filters to narrow the list (optional).
3. Click on any enterprise row to open the profile modal.
4. Review predictions, trajectories, and the AI summary.
5. Close the modal to return to the portfolio view.

---

## API Endpoint

### Portfolio

```
GET /demo/portfolio
```

**Response** — A JSON object with:

```json
{
  "source": "test.csv (built-in)",
  "total": 2000,
  "enterprises": [
    {
      "unique_id": "CLI-00123",
      "country": "Rwanda",
      "program": "Business Growth",
      "sector": "Agriculture",
      "risk_tier": "HIGH",
      "risk_score": 0.82,
      "revenue_3m": 125000.5,
      "jobs_created_3m": 1.2,
      "jobs_lost_3m": 0.8,
      "recommended_action": "Immediate Review"
    }
  ]
}
```

### Client Profile

```
POST /demo/client-profile
Content-Type: application/json
```

**Request body** — A single client record object.

**Response** — Combined predictions from all three pipelines at all horizons, plus per-class probabilities and an AI-generated profile summary.

---

## Recommended Actions

The Portfolio assigns recommended actions based on the predicted risk tier:

| Risk Tier  | Action              | Meaning |
| ---------- | ------------------- | ------- |
| **HIGH**   | Immediate Review    | Schedule urgent advisor contact within 1 week. Review loan terms, business health. |
| **MEDIUM** | Monitor             | Flag for follow-up within 2–4 weeks. Watch trajectory direction. |
| **LOW**    | Standard            | Continue standard engagement cadence. No immediate concern. |

These actions serve as initial triage guidance. The **Advisory** tab provides more detailed, governance-aware intervention plans.
