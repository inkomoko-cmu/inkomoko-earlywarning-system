# Reports Page Documentation

## Purpose

The Reports page produces publication-ready, stakeholder-oriented report views from portfolio analytics and early-warning signals. The current implementation supports four report modes:

| Report Type       | Primary Audience                | Primary Focus                                               |
| ----------------- | ------------------------------- | ----------------------------------------------------------- |
| Donor Pack        | Donors and funding partners     | Impact narrative, risk transparency, graphics-rich overview |
| Program Brief     | Program leadership              | Concise operational summary and action items                |
| Risk Intervention | Advisors and portfolio managers | Prioritized risk hotspots and mitigation queue              |
| Livelihood Impact | Impact and MEL teams            | Jobs and income protection outlook                          |

## Current Frontend Generation Flow

The current Reports page generates report data from live portfolio endpoints and composes report payloads in the frontend. It does not expose a live/demo source toggle in the UI.

### Data Inputs

- `GET /portfolio/overview`
- `GET /portfolio/enterprises`
- `GET /portfolio/by-sector`
- `GET /portfolio/by-country`
- `GET /portfolio/risk-distribution`
- `GET /portfolio/trends?months=12`

These are combined into a single report object used by all report renderers.

## Shared Report Object

All report types use a shared object shape:

- `report_type`
- `generated_at`
- `source`
- `title`
- `subtitle`
- `executive_summary`
- `kpis`
- `horizon_summary`
- `sector_breakdown`
- `country_breakdown`
- `gender_breakdown`
- `program_breakdown`
- `top_risk_enterprises`
- `success_stories`
- `action_items`

## KPI Fields

`kpis` includes:

- `total_enterprises`
- `avg_risk_score`
- `high_risk_count`
- `medium_risk_count`
- `low_risk_count`
- `tier_distribution` (`HIGH`, `MEDIUM`, `LOW`)
- `total_projected_revenue`
- `total_jobs_created`
- `net_jobs`

## Horizon Summary

`horizon_summary` currently contains synthetic 1, 2, and 3 month views:

- `"1"`
- `"2"`
- `"3"`

Each horizon contains:

- `avg_risk_score`
- `total_revenue`
- `avg_revenue`
- `jobs_created`
- `jobs_lost`
- `net_jobs`

## Report Type Details

### Donor Pack

Design: impact-forward with richer visuals.

Sections include:

1. Executive summary and donor takeaways
2. Donor KPI dashboard
3. Risk and horizon graphics
4. Sector and country opportunity charts
5. Detailed horizon snapshots
6. Gender lens and programme sections (with explicit unavailable-state messaging where data is missing)
7. Success spotlight
8. Risk watchlist
9. Methodology and donor caveats

### Program Brief

Sections include:

1. Executive summary
2. Portfolio snapshot
3. Risk overview
4. Action items
5. Sector snapshot
6. Horizon projection trends

### Risk Intervention

Sections include:

1. Risk escalation snapshot
2. Sector and country risk hotspot charts
3. Intervention watchlist
4. Recommended risk actions

### Livelihood Impact

Sections include:

1. Livelihood outcome snapshot
2. Revenue/jobs trajectory chart
3. Sector livelihood contribution chart
4. Livelihood resilience spotlight

## Export Behavior

- Donor Pack uses a dedicated donor PDF export format with branded pages, visual stat cards, risk distribution graphics, horizon table, and action items.
- Other report types currently use the generic table-based PDF export path.

## UI Behavior

The Reports page currently allows users to:

1. Select one of four report types via toggle buttons.
2. Generate the selected report.
3. Export the generated report to PDF.
4. View an AI insights panel summarizing risk, livelihood, and revenue signals for the active report.

## Notes on Data Completeness

Some segment views can be empty in live portfolio mode, especially:

- `gender_breakdown`
- `program_breakdown`

When unavailable, the report now surfaces explicit messaging rather than silent omission.
