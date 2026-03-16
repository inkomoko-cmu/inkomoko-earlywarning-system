# Reports Pipeline

## Purpose

The **Reports** tab produces publication-ready report payloads that aggregate portfolio-wide predictions into structured documents suitable for external stakeholders. Two report formats are available:

| Report Type       | Audience           | Depth                       |
| ----------------- | ------------------ | --------------------------- |
| **Donor Pack**    | Donors & investors | Comprehensive impact report |
| **Program Brief** | Programme managers | Concise executive summary   |

---

## API Endpoint

```
GET /demo/reports?report_type=donor_pack|program_brief&source=stored|test
```

### Query Parameters

| Parameter     | Default      | Options                       | Description                             |
| ------------- | ------------ | ----------------------------- | --------------------------------------- |
| `report_type` | `donor_pack` | `donor_pack`, `program_brief` | Selects the report format               |
| `source`      | `stored`     | `stored`, `test`              | Data source (uploaded data or test CSV) |

---

## Shared Response Fields

Both report types return the following top-level fields:

| Field                  | Type   | Description                                        |
| ---------------------- | ------ | -------------------------------------------------- |
| `report_type`          | string | `donor_pack` or `program_brief`                    |
| `generated_at`         | string | ISO 8601 UTC timestamp                             |
| `source`               | string | Data filename used                                 |
| `title`                | string | Human-readable report title                        |
| `subtitle`             | string | Secondary title line                               |
| `executive_summary`    | string | Auto-generated narrative summary                   |
| `sections`             | array  | Ordered list of section keys the UI should render  |
| `kpis`                 | object | Headline key performance indicators                |
| `horizon_summary`      | object | Multi-horizon projections (3, 6, 12 months)        |
| `sector_breakdown`     | array  | Per-sector aggregated metrics                      |
| `country_breakdown`    | array  | Per-country aggregated metrics                     |
| `gender_breakdown`     | object | Gender-disaggregated metrics                       |
| `program_breakdown`    | array  | Per-programme aggregated metrics                   |
| `top_risk_enterprises` | array  | Top 10 highest-risk enterprises                    |
| `success_stories`      | array  | Top 5 lowest-risk enterprises (success spotlights) |

---

## Headline KPIs

The `kpis` object contains:

```json
{
  "total_enterprises": 200,
  "unique_clients": 200,
  "avg_risk_score": 0.4321,
  "high_risk_count": 42,
  "medium_risk_count": 88,
  "low_risk_count": 70,
  "tier_distribution": { "HIGH": 42, "MEDIUM": 88, "LOW": 70 },
  "total_projected_revenue": 125000000,
  "avg_projected_revenue": 625000,
  "median_projected_revenue": 580000,
  "total_jobs_created": 350,
  "total_jobs_lost": 120,
  "net_jobs": 230
}
```

---

## Multi-Horizon Projections

The `horizon_summary` provides trend data across all three model horizons (3, 6, and 12 months):

```json
{
  "3": {
    "avg_risk_score": 0.43,
    "total_revenue": 125000000,
    "avg_revenue": 625000,
    "jobs_created": 350,
    "jobs_lost": 120,
    "net_jobs": 230
  },
  "6": {
    "avg_risk_score": 0.45,
    "total_revenue": 260000000,
    "avg_revenue": 1300000,
    "jobs_created": 700,
    "jobs_lost": 250,
    "net_jobs": 450
  },
  "12": {
    "avg_risk_score": 0.48,
    "total_revenue": 540000000,
    "avg_revenue": 2700000,
    "jobs_created": 1400,
    "jobs_lost": 520,
    "net_jobs": 880
  }
}
```

This enables donors and programme managers to see projected trajectory shifts over time.

---

## Breakdowns

### Sector Breakdown

Each record includes: `sector`, `count`, `avg_risk`, `high_risk` count, `total_revenue`, `total_jobs_created`. Sorted by total revenue (descending).

### Country Breakdown

Same structure as sector breakdown, grouped by country.

### Gender Breakdown

Keyed by gender value (e.g., `"Male"`, `"Female"`), each entry includes `count`, `avg_risk`, `total_revenue`, `total_jobs`.

### Programme Breakdown

Grouped by `program_enrolled`, with the same metric structure.

---

## Donor Pack Report

**Title:** "Donor Impact Report"

Includes 12 sections:

1. Executive Summary
2. KPI Dashboard
3. Risk Distribution
4. Revenue Projections
5. Employment Impact
6. Sector Analysis
7. Country Analysis
8. Gender Lens
9. Programme Performance
10. Success Spotlight (top 5 lowest-risk enterprises)
11. Risk Watchlist (top 10 highest-risk enterprises)
12. Methodology

The executive summary auto-generates a narrative paragraph citing aggregate revenue projections, jobs safeguarded, high-risk counts, and resilience indicators.

---

## Program Brief Report

**Title:** "Program Brief"

Includes 6 sections:

1. Executive Summary
2. KPI Summary
3. Risk Overview
4. Action Items
5. Sector Snapshot
6. Horizon Trends

### Auto-Generated Action Items

The Program Brief includes prioritised action items generated from the data:

| Trigger Condition                        | Priority | Action                                          | Deadline       |
| ---------------------------------------- | -------- | ----------------------------------------------- | -------------- |
| Any high-risk enterprises exist          | CRITICAL | Schedule intervention reviews                   | Within 2 weeks |
| Net jobs projection is negative          | HIGH     | Investigate layoff risk                         | Within 1 month |
| High-risk percentage exceeds 30%         | HIGH     | Review admission criteria                       | Within 1 month |
| Medium-risk count exceeds low-risk count | MEDIUM   | Increase mentoring frequency                    | Ongoing        |
| Always included                          | LOW      | Run updated projections after next data refresh | Next quarter   |

---

## UI Behaviour

The Reports tab in the demo UI allows the user to:

1. **Select report type** via a dropdown (Donor Pack / Program Brief).
2. **Generate** the report, which renders headline KPIs, charts, breakdowns, and narrative sections.
3. **Export to PDF** using the built-in html2pdf.js integration — produces a branded, publication-ready document.

---

## Audit Trail

Every report generation is logged:

```
Action:   Report generated: donor_pack
Category: system
Severity: info
Details:  Generated donor_pack report for {N} enterprises.
```
