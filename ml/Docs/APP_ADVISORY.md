# Advisory Plans Pipeline

## Purpose

The **Advisory** tab generates governance-aware, per-enterprise advisory plans that translate model predictions into actionable intervention recommendations. Each plan is tailored to the enterprise's risk tier, country-specific regulatory environment, and projected financial and employment trajectories.

---

## API Endpoint

```
GET /demo/advisory
```

No query parameters are required. The endpoint uses uploaded (stored) data when available, otherwise falls back to the built-in `test.csv`.

### Response Structure

| Field                  | Description                                              |
| ---------------------- | -------------------------------------------------------- |
| `source`               | Data file used (`test.csv` or uploaded filename)         |
| `total`                | Number of enterprises scored                             |
| `tier_distribution`    | Count of HIGH / MEDIUM / LOW risk enterprises            |
| `total_actions`        | Aggregate number of recommended actions across all plans |
| `governance_summaries` | Per-country regulatory context and high-risk counts      |
| `plans`                | Array of per-enterprise advisory plans (see below)       |

---

## Priority Levels

Each enterprise receives a priority level derived from its risk tier:

| Risk Tier | Priority | Colour    | Timeline                      |
| --------- | -------- | --------- | ----------------------------- |
| HIGH      | CRITICAL | `#dc2626` | Immediate (within 1 week)     |
| MEDIUM    | ELEVATED | `#d97706` | Short-term (within 2–4 weeks) |
| LOW       | ROUTINE  | `#059669` | Standard cycle (next quarter) |

---

## Advisory Domains

Recommendations are grouped into five domains:

### 1. Financial

- **HIGH tier:** Emergency cashflow analysis, expense reduction review, loan restructuring consultation (if the enterprise carries a loan).
- **MEDIUM tier:** Financial health check, revenue diversification (when projected revenue trails recent performance).
- **LOW tier:** Growth investment planning, emergency savings buffer target.

### 2. Governance (Country-Specific)

Regulatory compliance checks are generated using the enterprise's country. The system includes dedicated frameworks for:

| Country     | Framework                                     | Regulator                                    |
| ----------- | --------------------------------------------- | -------------------------------------------- |
| Rwanda      | Rwanda SME Policy & MSME Development Strategy | Rwanda Development Board (RDB)               |
| Kenya       | Kenya Micro and Small Enterprises Act 2012    | Micro and Small Enterprises Authority (MSEA) |
| South Sudan | South Sudan Investment Promotion Act          | South Sudan Investment Authority             |

Each framework contributes:

- **Tax notes** (e.g., Rwanda's 3% turnover tax for micro-enterprises)
- **Labour notes** (e.g., mandatory RSSB/NSSF contributions)
- **Lending notes** (e.g., BNR interest-rate guidelines)
- **Compliance checklist** (registration renewals, tax filings, permits)

Enterprises from unlisted countries receive a general MSME best-practice framework.

### 3. Employment

- **Net job loss > 1:** Workforce retention strategy + skills redeployment assessment.
- **Net job gain > 2:** Hiring readiness plan with social-security registration guidance.
- **Stable workforce:** Team stability check with training recommendation.

### 4. Operational

- **HIGH / MEDIUM tier:** Inventory & supply-chain review, customer retention outreach.
- **All tiers (when sector is known):** Sector benchmarking against peers.

### 5. Growth

- **LOW tier:** Market expansion assessment, digital presence development, advanced program enrollment.
- **MEDIUM tier:** "Stabilise before scaling" guidance.

---

## Governance Summaries

The response includes an aggregated `governance_summaries` array listing each country observed in the data:

```json
{
  "country": "Rwanda",
  "framework": "Rwanda SME Policy & MSME Development Strategy",
  "regulator": "Rwanda Development Board (RDB)",
  "enterprise_count": 45,
  "high_risk_count": 8
}
```

This enables programme managers to see at a glance which regulatory environments are most exposed to risk.

---

## Per-Enterprise Plan Object

Each item in the `plans` array contains:

| Field                    | Type   | Description                                                                      |
| ------------------------ | ------ | -------------------------------------------------------------------------------- |
| `unique_id`              | string | Enterprise identifier                                                            |
| `country`                | string | Operating country                                                                |
| `sector`                 | string | Business sector                                                                  |
| `program`                | string | Enrolled Inkomoko programme                                                      |
| `risk_tier`              | string | HIGH / MEDIUM / LOW                                                              |
| `risk_score`             | float  | Raw risk score (0–1)                                                             |
| `revenue_3m`             | float  | Projected 3-month revenue                                                        |
| `jobs_created_3m`        | float  | Projected jobs created                                                           |
| `jobs_lost_3m`           | float  | Projected jobs lost                                                              |
| `advisory.priority`      | string | CRITICAL / ELEVATED / ROUTINE                                                    |
| `advisory.timeline`      | string | Recommended action window                                                        |
| `advisory.domains`       | object | Grouped recommendations (financial, governance, employment, operational, growth) |
| `advisory.total_actions` | int    | Total number of recommendations for this enterprise                              |

---

## UI Behaviour

The Advisory tab in the demo UI renders:

1. **Summary cards** — total plans, tier distribution, aggregate action count.
2. **Governance panel** — country-level framework table with high-risk counts.
3. **Enterprise table** — sortable list with risk tier badges, priority tags, and expandable recommendation details.
4. **PDF export** — the entire advisory view can be exported to PDF using the built-in export feature.

---

## Audit Trail

Every advisory generation is logged to the audit trail:

```
Action:   Advisory plans generated
Category: advisory
Severity: info
Details:  Generated {N} advisory plans with {M} total actions.
```
