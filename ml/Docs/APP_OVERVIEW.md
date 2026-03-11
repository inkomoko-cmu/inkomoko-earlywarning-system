# Inkomoko Early Warning System

## What Is This Application?

The Inkomoko Early Warning System is a **machine-learning-powered web application** that helps Inkomoko advisors proactively identify clients at risk of financial distress. Instead of waiting for problems to surface, the system analyses client financial data and produces **month-by-month forecasts (1-month, 2-month, and 3-month horizons)** across three key dimensions:

1. **Credit Risk** — How likely is a client to face financial difficulty? Tracked monthly to reveal escalation trajectories.
2. **Employment Impact** — Will the client's business create or lose jobs? Monthly granularity shows whether trends are accelerating or stabilising.
3. **Revenue Trajectory** — What revenue can we expect? Month-over-month predictions expose declining or growing revenue paths.

Beyond predictions, the application provides a **full operational toolkit**: portfolio-wide scoring, governance-aware advisory plans, data quality monitoring, an audit trail, AI-powered insights, publication-ready report generation, and PDF export — all accessible through a glass-morphism-styled web interface.

---

## How It Works

### Architecture at a Glance

The application is a **FastAPI** service that loads **fifteen pre-trained LightGBM models** at startup (five model types × three monthly horizons) and exposes them through a REST API. A built-in web interface (the Demo UI) lets users interact with all features without writing any code.

```
┌──────────────────────────────────────────────────────────────────┐
│                       Demo Web Interface                         │
│  Dashboard │ Data Entry │ Portfolio │ Risk │ Employment │ Revenue│
│  Advisory │ Audit Log │ Data Quality │ Retrain │ Model Cards     │
│  Reports │ Documentation                                         │
└───────────────────────┬──────────────────────────────────────────┘
                        │  HTTP / JSON
┌───────────────────────▼──────────────────────────────────────────┐
│                     FastAPI Backend                               │
│                                                                   │
│  /predict/risk           → Tier + score @ 1m, 2m, 3m            │
│  /predict/employment     → Jobs created & lost @ 1m–3m          │
│  /predict/revenue        → Revenue forecast @ 1m–3m             │
│  /demo/portfolio         → Portfolio-wide scoring & ranking      │
│  /demo/advisory          → Governance advisory plans             │
│  /demo/data-quality      → Data quality contracts & profiling    │
│  /demo/audit-log         → Immutable audit trail                 │
│  /demo/reports           → Donor Pack & Program Brief reports    │
│  /demo/ai-insights       → RAG Agent pre-configured insights    │
│  /demo/*                 → UI, analytics, retrain, model-cards   │
│  /health                 → Service status                        │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │            Model Registry (15 models)                    │      │
│  │  risk_tier_{1,2,3}m · risk_score_{1,2,3}m               │      │
│  │  jobs_created_{1,2,3}m · jobs_lost_{1,2,3}m             │      │
│  │  revenue_{1,2,3}m                                        │      │
│  └─────────────────────────────────────────────────────────┘      │
│  ┌─────────────────────────────────────────────────────────┐      │
│  │           Preprocessing & Feature Alignment              │      │
│  └─────────────────────────────────────────────────────────┘      │
└───────────────────────────────────────────────────────────────────┘
```

### Monthly Horizons

Every prediction pipeline produces outputs at **three horizons**:

| Horizon | Meaning                        |
| ------- | ------------------------------ |
| **1m**  | Forecast for the next 1 month  |
| **2m**  | Forecast for the next 2 months |
| **3m**  | Forecast for the next 3 months |

This enables **trajectory analysis**: if risk is LOW at 1m but HIGH at 3m, the client may be on a deteriorating path that isn't yet urgent but will become so — a classic early warning signal.

### Prediction Flow

1. **Submit data** — Client records are sent as JSON (manually entered, pasted, or uploaded from Excel/CSV).
2. **Feature alignment** — The app reindexes each record to match the exact feature columns the models were trained on. Missing columns are filled with null; extra columns are dropped.
3. **Model inference** — For each pipeline, models at all three horizons run in parallel on the same feature set. Each model's scikit-learn pipeline transforms the features (imputation, encoding, scaling) and generates predictions.
4. **Response** — Results are returned as structured JSON with per-month fields, rendered in the Demo UI with sparkline trajectory charts, and available for download.

---

## Demo UI Tabs

The interface contains **13 tabs** arranged in a horizontally scrollable tab bar (drag-to-scroll and mousewheel-scroll supported):

| Tab                | Purpose |
| ------------------ | ------- |
| **Dashboard**      | Impact overview with 6 hero KPI snapshot cards (risk distribution, total revenue, employment impact), 6 interactive charts (risk by horizon, revenue by horizon, employment trends, sector breakdown), plus visual analytics across the loaded dataset. |
| **Data Entry**     | The single point for providing client data: paste JSON or upload Excel/CSV. Running predictions triggers all three pipelines at once across all horizons. |
| **Portfolio**      | Portfolio-wide scoring table — all enterprises ranked by risk with filterable columns (risk tier, country, sector, program), search, pagination, and click-to-view client profile modals. Shows risk score, predicted revenue, and employment impact per enterprise. |
| **Risk**           | View risk prediction results with **month-by-month trajectory sparklines** — tier classification (LOW / MEDIUM / HIGH) and continuous risk score at each horizon (1m, 2m, 3m), plus per-class probabilities. |
| **Employment**     | View employment predictions with **trajectory sparklines** — forecasted jobs created and jobs lost at 1m, 2m, and 3m per client. |
| **Revenue**        | View revenue predictions with **trajectory sparklines** — forecasted revenue at 1m, 2m, and 3m per client. |
| **Advisory**       | Governance-aware advisory plans for all enterprises — country-specific regulatory recommendations, per-tier intervention strategies, escalation protocols, and compliance guidance. Aggregated statistics by risk tier. |
| **Audit Log**      | Immutable event trail with severity-based colour coding, category/severity filters, pagination, and summary statistics. Tracks all significant actions: data uploads, predictions, retraining events, advisory generation, report generation, and data quality audits. |
| **Data Quality**   | Data quality contracts dashboard — 28 automated validation checks across all columns. Shows column-level profiling (completeness, uniqueness, type distribution), contract violations with severity levels, and an overall quality score. |
| **Retrain Models** | Upload new labelled training data to retrain any pipeline on the fly. Models are retrained at all three horizons; the retrained models replace the live models immediately. |
| **Model Cards**    | Transparency summaries for all **15 models** — what each model predicts, its algorithm, performance metrics with plain-English explanations, feature importance rankings, and hyperparameters. |
| **Reports**        | Publication-ready report generation: **Donor Pack** (comprehensive impact report with KPIs, sector/country/gender breakdowns, success stories, financial projections, and methodology) or **Program Brief** (concise executive summary with action items, priority badges, and risk overview). Both types exportable as PDF. |
| **Documentation**  | This documentation section — navigable sub-sections for system overview, each prediction pipeline, portfolio & advisory features, and report generation. |

### Client Profile Modal

Clicking any enterprise row in the Portfolio tab opens a **Client Profile Modal** — a comprehensive single-client view that runs all three pipelines and displays:

- Combined risk, employment, and revenue predictions across all horizons
- An AI-generated profile summary powered by the RAG Agent
- Trajectory sparklines and key financial indicators

### AI-Powered Insights

Throughout the interface, an **AI icon** (sparkle/brain icon) appears on tabs and cards. Clicking it triggers the **RAG Agent** to provide contextual AI insights for that section — explaining trends, anomalies, and recommendations in natural language. The AI insights system covers: risk analysis, employment trends, revenue patterns, portfolio overview, advisory guidance, and data quality interpretation.

### PDF Export

Every tab includes a **PDF export button** that generates a downloadable PDF of the current view using client-side rendering (html2pdf.js). Export includes headers, footers, and all visible charts/tables.

---

## API Endpoints

### Prediction Endpoints

| Method | Path                  | Description |
| ------ | --------------------- | ----------- |
| `POST` | `/predict/risk`       | Score a batch of client records through the risk pipeline. Returns tier, class probabilities, and risk score **at each horizon** (1m, 2m, 3m) for each record. |
| `POST` | `/predict/employment` | Score records through the employment pipeline. Returns predicted jobs created and jobs lost **at each horizon** (1m, 2m, 3m). |
| `POST` | `/predict/revenue`    | Score records through the revenue pipeline. Returns predicted revenue **at each horizon** (1m, 2m, 3m). |

All prediction endpoints accept a JSON array of client record objects and return structured results per record.

### Demo / UI Endpoints

| Method   | Path                    | Description |
| -------- | ----------------------- | ----------- |
| `GET`    | `/demo`                 | Serve the Demo UI web page. |
| `GET`    | `/demo/sample-data?n=3` | Return `n` random sample records for testing inputs. |
| `POST`   | `/demo/upload-excel`    | Upload a CSV or Excel file; records are parsed and stored in memory for use across the UI. |
| `GET`    | `/demo/stored-data`     | Retrieve the currently loaded dataset. |
| `DELETE` | `/demo/stored-data`     | Clear the in-memory dataset. |
| `POST`   | `/demo/predict-all`     | Run all 3 pipelines on a batch of records at once. |
| `POST`   | `/demo/client-profile`  | Run all 3 pipelines on a single client and return a combined profile with AI summary. |
| `GET`    | `/demo/analytics`       | Compute analytics dashboard data including Impact Overview KPIs, distributions, and per-pipeline charts. |
| `GET`    | `/demo/portfolio`       | Score all enterprises through all pipelines and return a ranked portfolio table. |
| `GET`    | `/demo/advisory`        | Generate governance-aware advisory plans with country-specific recommendations for all enterprises. |
| `GET`    | `/demo/audit-log`       | Retrieve the immutable audit trail with optional category/severity filters and pagination. |
| `GET`    | `/demo/data-quality`    | Run 28 data quality contracts against the dataset — profiling, validation, and quality scoring. |
| `POST`   | `/demo/retrain`         | Retrain a specified pipeline with uploaded labelled data. |
| `GET`    | `/demo/model-cards`     | Get comprehensive model card metadata for all 15 models. |
| `GET`    | `/demo/reports`         | Generate structured reports — Donor Pack or Program Brief — with full KPIs and breakdowns. |
| `GET`    | `/demo/ai-insights`     | RAG Agent AI insights — pre-configured contextual analysis per section or all sections at once. |
| `GET`    | `/demo/documentation`   | Get raw documentation content (Markdown). |

### Meta Endpoints

| Method | Path                      | Description |
| ------ | ------------------------- | ----------- |
| `GET`  | `/health`                 | Returns service status and version. |
| `GET`  | `/models/risk/info`       | Feature list and count for the risk pipeline. |
| `GET`  | `/models/employment/info` | Feature list and count for the employment pipeline. |
| `GET`  | `/models/revenue/info`    | Feature list and count for the revenue pipeline. |
| `GET`  | `/docs`                   | Interactive Swagger / OpenAPI documentation. |

---

## Data Requirements

### Input Record Fields

The models expect client records containing financial, demographic, and loan-related attributes. Key field categories include:

- **Identifiers** — `unique_id`, `survey_date`
- **Demographics** — `age`, `gender`, `client_type`, `geographic_region`
- **Loan information** — `loan_amount`, `principal_amount`, `amount_paid`, `outstanding_balance`, `arrears_amount`, `loan_status`, `loan_term_months`
- **Financial ratios** (computed during preprocessing) — `repayment_ratio`, `utilization_ratio`, `past_due_ratio`, `principal_completion_ratio`
- **Business metrics** — `monthly_revenue`, `monthly_expenses`, `number_of_employees`
- **Survey / impact data** — `nps_score`, `satisfaction_rating`

> **Tip:** Use the _Sample Data_ button on the Data Entry tab to see a complete example record with all expected fields.

### Missing Values

The model pipelines include built-in imputation (most-frequent for categoricals, median for numerics), so records with some missing fields will still produce predictions. However, prediction quality improves with more complete data.

---

## Model Retraining

The **Retrain Models** tab allows live model replacement:

1. Select which pipeline to retrain (Risk, Employment, or Revenue).
2. Upload a CSV or Excel file containing both input features **and** labelled target columns.
3. The app trains a new model **at each of the three horizons** (1m, 2m, 3m), performs an 80/20 time-based train/test split, evaluates each model, and replaces the live models in memory and on disk.

**Required target columns by pipeline:**

| Pipeline   | Required Targets (all three horizons) |
| ---------- | ------------------------------------- |
| Risk       | `risk_tier_1m`, `risk_tier_2m`, `risk_tier_3m`, `risk_score_1m`, `risk_score_2m`, `risk_score_3m` |
| Employment | `jobs_created_1m`, `jobs_created_2m`, `jobs_created_3m`, `jobs_lost_1m`, `jobs_lost_2m`, `jobs_lost_3m` |
| Revenue    | `revenue_1m`, `revenue_2m`, `revenue_3m` |

After retraining, the Model Cards tab will show updated retrain metadata (timestamp, row counts, and feature count). All retraining events are recorded in the **Audit Log**.

---

## Audit & Governance

### Audit Log

The application maintains an **immutable in-memory audit trail** that records every significant action:

| Event Category | Examples |
| -------------- | -------- |
| `data`         | Data uploads, stored data clears, data quality audits |
| `prediction`   | Batch predictions, client profile scoring |
| `model`        | Model retraining events (with row counts and metrics) |
| `advisory`     | Advisory plan generation |
| `system`       | Report generation, AI insight requests |

Each event includes: timestamp, action description, category, severity level (info / warning / error / critical), actor, details text, and optional metadata.

### Data Quality Contracts

The **Data Quality** tab runs **28 automated validation contracts** against the loaded dataset:

- **Completeness checks** — Required columns must have low missing-value rates
- **Uniqueness checks** — Identifier columns should have high cardinality
- **Type checks** — Numeric columns should not contain string values
- **Range checks** — Values should fall within expected business ranges
- **Distribution checks** — Detect extreme skew or unexpected patterns

Results include column-level profiling, violation details with severity ratings, and an aggregate **quality score** (0–100%).

---

## Technology Stack

| Component         | Technology |
| ----------------- | ---------- |
| Backend framework | FastAPI (Python 3.10+) |
| ML framework      | scikit-learn pipelines (`.joblib`) |
| Model algorithms  | LightGBM (all 15 models — classifiers and regressors) |
| Server            | Uvicorn (ASGI) |
| Frontend          | Vanilla HTML/CSS/JS, Chart.js, marked.js, html2pdf.js |
| UI design         | Glass-morphism theme with CSS custom properties |
| Data handling     | pandas, NumPy |
| Configuration     | Pydantic Settings (env prefix `EWS_`) |
