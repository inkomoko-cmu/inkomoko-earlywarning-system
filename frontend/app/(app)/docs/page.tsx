"use client";

import { useState } from "react";
import {
  Printer, Shield, AlertTriangle,
  Info, TrendingUp, Users, BarChart2, Lightbulb, FileBarChart,
  LayoutDashboard, Database, Code2, CheckCircle2, Zap, Activity,
  RefreshCw, ScrollText, GitBranch,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

// ─────────────────────────────────────────────────────────────────────────────
// Prose helpers
// ─────────────────────────────────────────────────────────────────────────────

function H1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-xl font-bold text-inkomoko-blue border-b-2 border-inkomoko-border pb-2 mt-6 mb-3 first:mt-0">
      {children}
    </h1>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-inkomoko-blue border-b border-inkomoko-border pb-1.5 mt-7 mb-2.5">
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.92rem] font-semibold text-inkomoko-text mt-5 mb-1.5">{children}</h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-inkomoko-text mb-2">{children}</p>;
}

function UL({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc list-outside ml-5 mb-2 space-y-0.5 text-sm text-inkomoko-text">{children}</ul>;
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="leading-relaxed">{children}</li>;
}

function OL({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal list-outside ml-5 mb-2 space-y-0.5 text-sm text-inkomoko-text">{children}</ol>;
}

function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#EEF2FF] text-inkomoko-info px-1.5 py-0.5 rounded text-[0.82rem] font-mono">
      {children}
    </code>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-[#1e1e2e] text-[#cdd6f4] rounded-xl px-5 py-4 overflow-x-auto text-[0.79rem] leading-relaxed font-mono my-3 shadow-sm">
      <code>{children.trimStart()}</code>
    </pre>
  );
}

type CalloutVariant = "info" | "tip" | "warning";
function Callout({ variant = "info", children }: { variant?: CalloutVariant; children: React.ReactNode }) {
  const styles: Record<CalloutVariant, { border: string; bg: string; text: string; icon: React.ReactNode }> = {
    info:    { border: "border-inkomoko-info",    bg: "bg-blue-50",   text: "text-inkomoko-info",    icon: <Info size={14} /> },
    tip:     { border: "border-inkomoko-success", bg: "bg-emerald-50",text: "text-emerald-700",       icon: <CheckCircle2 size={14} /> },
    warning: { border: "border-inkomoko-warning", bg: "bg-amber-50",  text: "text-amber-700",         icon: <AlertTriangle size={14} /> },
  };
  const s = styles[variant];
  return (
    <div className={`border-l-4 ${s.border} ${s.bg} px-4 py-3 rounded-r-xl my-3 text-sm leading-relaxed ${s.text} flex gap-2.5 items-start`}>
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <div>{children}</div>
    </div>
  );
}

interface TableRow { [key: string]: React.ReactNode }
function DocTable({ cols, rows }: { cols: string[]; rows: TableRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-inkomoko-border my-3 shadow-sm">
      <table className="w-full text-[0.83rem] border-collapse">
        <thead>
          <tr className="bg-inkomoko-bg">
            {cols.map(c => (
              <th key={c} className="px-3.5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-inkomoko-muted border-b border-inkomoko-border whitespace-nowrap">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-inkomoko-border">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-inkomoko-bg/60 transition-colors">
              {cols.map(c => (
                <td key={c} className="px-3.5 py-2 align-top text-inkomoko-text">
                  {row[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Hr() {
  return <hr className="border-inkomoko-border my-5" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Overview
// ─────────────────────────────────────────────────────────────────────────────
function OverviewContent() {
  return (
    <>
      <H1>Inkomoko Early Warning System</H1>
      <P>
        The Inkomoko Early Warning System is a <strong>machine-learning-powered web application</strong> that
        helps Inkomoko advisors proactively identify clients at risk of financial distress. Instead of
        waiting for problems to surface, the system analyses client financial data and produces
        <strong> month-by-month forecasts</strong> (1-month, 2-month, and 3-month horizons) across three
        key dimensions.
      </P>

      {/* 3 pipeline cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
        {[
          { icon: <Shield size={18} className="text-inkomoko-danger" />, label: "Credit Risk", desc: "How likely is a client to face financial difficulty? Tracked monthly to reveal escalation trajectories.", color: "border-inkomoko-danger/30 bg-red-50/40" },
          { icon: <Users size={18} className="text-inkomoko-info" />, label: "Employment Impact", desc: "Will the client's business create or lose jobs? Monthly granularity shows whether trends are accelerating or stabilising.", color: "border-inkomoko-info/30 bg-blue-50/40" },
          { icon: <TrendingUp size={18} className="text-inkomoko-success" />, label: "Revenue Trajectory", desc: "What revenue can we expect? Month-over-month predictions expose declining or growing revenue paths.", color: "border-inkomoko-success/30 bg-emerald-50/40" },
        ].map(p => (
          <div key={p.label} className={`rounded-xl border ${p.color} p-4`}>
            <div className="flex items-center gap-2 font-semibold text-inkomoko-text mb-1.5">{p.icon}{p.label}</div>
            <p className="text-[0.82rem] text-inkomoko-muted leading-relaxed">{p.desc}</p>
          </div>
        ))}
      </div>

      <H2>How It Works</H2>
      <H3>Architecture at a Glance</H3>
      <P>
        The application is a <strong>FastAPI</strong> service that loads <strong>fifteen
        pre-trained LightGBM models</strong> at startup (five model types × three monthly horizons)
        and exposes them through a REST API.
      </P>
      <Pre>{`┌──────────────────────────────────────────────┐
│             Demo Web Interface               │
│  Risk │ Employment │ Revenue │ Portfolio     │
│  Advisory │ Audit │ Data Quality │ Reports  │
└───────────────────┬──────────────────────────┘
                    │  HTTP / JSON
┌───────────────────▼──────────────────────────┐
│              FastAPI Backend                  │
│  /predict/risk   → Tier + score @ 1m,2m,3m  │
│  /predict/employment → Jobs @ 1m–3m          │
│  /predict/revenue    → Revenue @ 1m–3m       │
│  /demo/* → portfolio, advisory, audit, ...   │
│  /health → Service status                    │
│  ┌────────────────────────────────────────┐  │
│  │   Model Registry (15 LightGBM models)  │  │
│  │  risk_tier_{1,2,3}m  risk_score_{1,2,3}m│ │
│  │  jobs_created_{1,2,3}m  jobs_lost_{1,2,3}m│
│  │  revenue_{1,2,3}m                      │  │
│  └────────────────────────────────────────┘  │
└───────────────────────────────────────────────┘`}
      </Pre>

      <H3>Monthly Horizons</H3>
      <P>Every prediction pipeline produces outputs at three horizons, enabling trajectory analysis:</P>
      <DocTable
        cols={["Horizon", "Meaning"]}
        rows={[
          { Horizon: <C>1m</C>, Meaning: "Forecast for the next 1 month" },
          { Horizon: <C>2m</C>, Meaning: "Forecast for the next 2 months" },
          { Horizon: <C>3m</C>, Meaning: "Forecast for the next 3 months" },
        ]}
      />
      <Callout variant="tip">
        If risk is LOW at 1m but HIGH at 3m, the client may be on a deteriorating path that isn't yet urgent
        — a classic early warning signal. Always read trajectories, not just point estimates.
      </Callout>

      <H3>Prediction Flow</H3>
      <OL>
        <Li><strong>Submit data</strong> — Client records are sent as JSON (manually entered, pasted, or uploaded from Excel/CSV).</Li>
        <Li><strong>Feature alignment</strong> — The app reindexes each record to the exact feature columns models were trained on. Missing columns are filled with null; extras are dropped.</Li>
        <Li><strong>Model inference</strong> — For each pipeline, models at all three horizons run in parallel. Each model's scikit-learn pipeline transforms features (imputation, encoding, scaling) and generates predictions.</Li>
        <Li><strong>Response</strong> — Results returned as structured JSON, rendered in the UI with sparkline trajectory charts.</Li>
      </OL>

      <Hr />
      <H2>Interface Tabs</H2>
      <DocTable
        cols={["Tab", "Purpose"]}
        rows={[
          { Tab: <strong>Dashboard</strong>, Purpose: "6 hero KPI snapshot cards (risk distribution, total revenue, employment impact) + 6 interactive charts (risk by horizon, revenue, employment trends, sector breakdown)." },
          { Tab: <strong>Data Entry</strong>, Purpose: "Single point for providing client data: paste JSON or upload Excel/CSV. Running predictions triggers all three pipelines at once across all horizons." },
          { Tab: <strong>Portfolio</strong>, Purpose: "All enterprises ranked by risk — filterable columns, search, pagination, click-to-view client profile modals showing full predictions + AI summary." },
          { Tab: <strong>Risk</strong>, Purpose: "Risk prediction results with month-by-month trajectory sparklines — tier (LOW/MEDIUM/HIGH) and continuous risk score at each horizon, plus per-class probabilities." },
          { Tab: <strong>Employment</strong>, Purpose: "Employment predictions with trajectory sparklines — forecasted jobs created and jobs lost at 1m, 2m, and 3m per client." },
          { Tab: <strong>Revenue</strong>, Purpose: "Revenue predictions with trajectory sparklines — forecasted revenue at 1m, 2m, and 3m per client." },
          { Tab: <strong>Advisory</strong>, Purpose: "Governance-aware advisory plans — country-specific regulatory recommendations, per-tier intervention strategies, escalation protocols." },
          { Tab: <strong>Audit Log</strong>, Purpose: "Immutable event trail with severity-based colour coding, category/severity filters, pagination. Tracks data uploads, predictions, retraining events, advisory generation." },
          { Tab: <strong>Data Quality</strong>, Purpose: "28 automated validation checks across all columns. Column-level profiling (completeness, uniqueness, type distribution), contract violations, overall quality score." },
          { Tab: <strong>Retrain Models</strong>, Purpose: "Upload new labelled training data to retrain any pipeline on the fly. Models are retrained at all three horizons and replace the live models immediately." },
          { Tab: <strong>Model Cards</strong>, Purpose: "Transparency summaries for all 15 models — algorithm, performance metrics, feature importance rankings, and hyperparameters." },
          { Tab: <strong>Reports</strong>, Purpose: "Publication-ready report generation: Donor Pack (comprehensive impact report) or Program Brief (concise executive summary). Both exportable as PDF." },
          { Tab: <strong>Documentation</strong>, Purpose: "This documentation section — navigable sub-sections for system overview, each prediction pipeline, portfolio & advisory features, and report generation." },
        ]}
      />

      <Hr />
      <H2>API Endpoints — Prediction</H2>
      <DocTable
        cols={["Method", "Path", "Description"]}
        rows={[
          { Method: <Badge tone="blue">POST</Badge>, Path: <C>/predict/risk</C>, Description: "Score a batch of records through the risk pipeline. Returns tier, class probabilities, and risk score at each horizon (1m, 2m, 3m)." },
          { Method: <Badge tone="blue">POST</Badge>, Path: <C>/predict/employment</C>, Description: "Score records through the employment pipeline. Returns predicted jobs created and jobs lost at each horizon." },
          { Method: <Badge tone="blue">POST</Badge>, Path: <C>/predict/revenue</C>, Description: "Score records through the revenue pipeline. Returns predicted revenue at each horizon." },
        ]}
      />

      <H2>API Endpoints — Demo / UI</H2>
      <DocTable
        cols={["Method", "Path", "Description"]}
        rows={[
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo</C>, Description: "Serve the Demo UI web page." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/sample-data</C>, Description: "Return n random sample records for testing inputs." },
          { Method: <Badge tone="blue">POST</Badge>, Path: <C>/demo/upload-excel</C>, Description: "Upload a CSV or Excel file; records are parsed and stored in memory." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/portfolio</C>, Description: "Score all enterprises through all pipelines and return a ranked portfolio table." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/advisory</C>, Description: "Generate governance-aware advisory plans with country-specific recommendations." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/audit-log</C>, Description: "Retrieve the immutable audit trail with optional filters and pagination." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/data-quality</C>, Description: "Run 28 data quality contracts against the dataset." },
          { Method: <Badge tone="blue">POST</Badge>, Path: <C>/demo/retrain</C>, Description: "Retrain a specified pipeline with uploaded labelled data." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/model-cards</C>, Description: "Get comprehensive model card metadata for all 15 models." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/demo/reports</C>, Description: "Generate structured reports — Donor Pack or Program Brief." },
          { Method: <Badge tone="success">GET</Badge>, Path: <C>/health</C>, Description: "Returns service status and version." },
        ]}
      />

      <Hr />
      <H2>Data Requirements</H2>
      <P>The models expect client records containing financial, demographic, and loan-related attributes:</P>
      <UL>
        <Li><strong>Identifiers</strong> — <C>unique_id</C>, <C>survey_date</C></Li>
        <Li><strong>Demographics</strong> — <C>age</C>, <C>gender</C>, <C>client_type</C>, <C>geographic_region</C></Li>
        <Li><strong>Loan info</strong> — <C>loan_amount</C>, <C>principal_amount</C>, <C>amount_paid</C>, <C>outstanding_balance</C>, <C>arrears_amount</C>, <C>loan_status</C>, <C>loan_term_months</C></Li>
        <Li><strong>Business metrics</strong> — <C>monthly_revenue</C>, <C>monthly_expenses</C>, <C>number_of_employees</C></Li>
        <Li><strong>Survey / impact</strong> — <C>nps_score</C>, <C>satisfaction_rating</C></Li>
      </UL>
      <Callout variant="tip">
        Use the <strong>Sample Data</strong> button on the Data Entry tab to see a complete example record with all expected fields. The pipelines include built-in imputation, so partial records still produce predictions — but quality improves with more complete data.
      </Callout>

      <Hr />
      <H2>AI-Powered Insights</H2>
      <P>
        Throughout the interface an <strong>AI icon</strong> (sparkle/brain) appears on tabs and cards. Clicking it
        triggers the <strong>RAG Agent</strong> to provide contextual AI insights — explaining trends, anomalies,
        and recommendations in natural language. Coverage includes: risk analysis, employment trends, revenue
        patterns, portfolio overview, advisory guidance, and data quality interpretation.
      </P>
      <Callout variant="info">
        The RAG Agent is powered by retrieval-augmented generation backed by the system's own documentation and
        the current dataset context. Insights are generated on demand and are not cached.
      </Callout>

      <Hr />
      <H2>PDF Export</H2>
      <P>
        Every tab includes a <strong>PDF export button</strong> that generates a downloadable PDF of the current
        view using client-side rendering (<C>html2pdf.js</C>). Exports include branded headers, footers, and all
        visible charts and tables.
      </P>

      <Hr />
      <H2>Model Retraining</H2>
      <P>
        The <strong>Retrain Models</strong> tab allows live model replacement. Upload a labelled CSV or Excel file,
        select the pipeline, and the app trains new models at all three horizons — replacing the live models in
        memory and on disk immediately. An 80/20 time-based train/test split is used automatically.
      </P>
      <DocTable
        cols={["Pipeline", "Required Target Columns"]}
        rows={[
          { Pipeline: "Risk", "Required Target Columns": "risk_tier_1m, risk_tier_2m, risk_tier_3m, risk_score_1m, risk_score_2m, risk_score_3m" },
          { Pipeline: "Employment", "Required Target Columns": "jobs_created_1m/2m/3m, jobs_lost_1m/2m/3m" },
          { Pipeline: "Revenue", "Required Target Columns": "revenue_1m, revenue_2m, revenue_3m" },
        ]}
      />
      <Callout variant="info">
        All retraining events are recorded in the Audit Log. The Model Cards tab reflects updated metadata
        (timestamp, row counts, feature count) after a successful retrain.
      </Callout>

      <Hr />
      <H2>Technology Stack</H2>
      <DocTable
        cols={["Component", "Technology"]}
        rows={[
          { Component: "Backend framework", Technology: "FastAPI (Python 3.10+)" },
          { Component: "ML framework", Technology: "scikit-learn pipelines (.joblib)" },
          { Component: "Model algorithms", Technology: "LightGBM — all 15 models (classifiers and regressors)" },
          { Component: "Server", Technology: "Uvicorn (ASGI)" },
          { Component: "Data handling", Technology: "pandas, NumPy" },
          { Component: "PDF export", Technology: "html2pdf.js (client-side)" },
          { Component: "AI insights", Technology: "RAG Agent (retrieval-augmented generation)" },
          { Component: "Configuration", Technology: <><C>Pydantic Settings</C> (env prefix <C>EWS_</C>)</> },
        ]}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Risk Pipeline
// ─────────────────────────────────────────────────────────────────────────────
function RiskContent() {
  return (
    <>
      <H1>Risk Prediction Pipeline</H1>
      <H2>Purpose</H2>
      <P>
        The risk pipeline is the core of the early warning system. It answers two questions for every client
        <strong> at each of three monthly horizons</strong> (1-month, 2-month, and 3-month ahead):
      </P>
      <OL>
        <Li><strong>What risk tier will this client fall into?</strong> — A categorical classification: <strong>LOW</strong>, <strong>MEDIUM</strong>, or <strong>HIGH</strong> risk.</Li>
        <Li><strong>How severe is the predicted risk?</strong> — A continuous score from <strong>0</strong> (lowest risk) to <strong>1</strong> (highest risk).</Li>
      </OL>

      <H2>Models</H2>
      <P>The pipeline runs <strong>six models</strong> — a tier classifier and a score regressor at each of the three horizons:</P>
      <DocTable
        cols={["Model", "Horizon", "Type", "Target", "Algorithm"]}
        rows={[
          { Model: "Risk Tier Classifier (1m)", Horizon: "1 month", Type: "Multi-class classification", Target: <C>risk_tier_1m</C>, Algorithm: "LightGBM" },
          { Model: "Risk Tier Classifier (2m)", Horizon: "2 month", Type: "Multi-class classification", Target: <C>risk_tier_2m</C>, Algorithm: "LightGBM" },
          { Model: "Risk Tier Classifier (3m)", Horizon: "3 month", Type: "Multi-class classification", Target: <C>risk_tier_3m</C>, Algorithm: "LightGBM" },
          { Model: "Risk Score Regressor (1m)", Horizon: "1 month", Type: "Regression", Target: <C>risk_score_1m</C>, Algorithm: "LightGBM" },
          { Model: "Risk Score Regressor (2m)", Horizon: "2 month", Type: "Regression", Target: <C>risk_score_2m</C>, Algorithm: "LightGBM" },
          { Model: "Risk Score Regressor (3m)", Horizon: "3 month", Type: "Regression", Target: <C>risk_score_3m</C>, Algorithm: "LightGBM" },
        ]}
      />
      <Callout variant="info">
        <strong>Why two model types?</strong> Tier classifiers optimise for correctly separating the three risk
        categories. Score regressors capture finer-grained magnitude — two clients both classified as HIGH
        might have scores of 0.71 vs 0.95, helping prioritise within a tier.
      </Callout>

      <H2>API Usage</H2>
      <P><strong>Endpoint:</strong> <C>POST /predict/risk</C></P>
      <Pre>{`// Request — array of client records
[
  {
    "unique_id": "CLI-00123",
    "age": 34,
    "gender": "Female",
    "loan_amount": 500000,
    "outstanding_balance": 125000,
    "arrears_amount": 15000,
    "monthly_revenue": 80000
  }
]`}</Pre>
      <Pre>{`// Response
{
  "meta": { "model_pipeline": "risk", "record_count": 1 },
  "predictions": [
    {
      "unique_id": "CLI-00123",
      "pred_risk_tier_1m": "MEDIUM",
      "pred_risk_tier_2m": "MEDIUM",
      "pred_risk_tier_3m": "HIGH",
      "prob_low": 0.08,
      "prob_medium": 0.20,
      "prob_high": 0.72,
      "pred_risk_score_1m": 0.45,
      "pred_risk_score_2m": 0.62,
      "pred_risk_score_3m": 0.81
    }
  ]
}`}</Pre>

      <H2>Performance Metrics</H2>
      <DocTable
        cols={["Metric", "What it measures", "How to interpret"]}
        rows={[
          { Metric: <strong>AUC (macro)</strong>, "What it measures": "How well the model distinguishes between all three risk tiers, averaged across classes.", "How to interpret": "> 0.90 Excellent · > 0.80 Good · > 0.70 Fair" },
          { Metric: <strong>Quadratic Weighted Kappa (QWK)</strong>, "What it measures": "Agreement between predicted and actual tiers, penalising distant misclassifications more heavily.", "How to interpret": "> 0.80 Excellent · > 0.60 Good · > 0.40 Fair" },
          { Metric: <strong>Brier Score (High-Risk)</strong>, "What it measures": "Calibration of the high-risk probability — how close the predicted 'chance of HIGH risk' is to reality.", "How to interpret": "< 0.10 Excellent · < 0.20 Good · < 0.30 Fair (lower is better)" },
        ]}
      />

      <H2>Feature Engineering</H2>
      <DocTable
        cols={["Feature", "Formula / Description"]}
        rows={[
          { Feature: <C>repayment_ratio</C>, "Formula / Description": <><C>amount_paid / loan_amount</C> — How much of the loan has been repaid.</> },
          { Feature: <C>principal_completion_ratio</C>, "Formula / Description": <><C>amount_paid / principal_amount</C> — Progress toward principal repayment.</> },
          { Feature: <C>utilization_ratio</C>, "Formula / Description": <><C>outstanding_balance / loan_amount</C> — How much of the credit is still in use.</> },
          { Feature: <C>past_due_ratio</C>, "Formula / Description": <><C>arrears_amount / outstanding_balance</C> — Proportion of the balance that is overdue.</> },
          { Feature: <C>arrears_trend_delta</C>, "Formula / Description": "Change in arrears across rolling windows — is the client getting better or worse?" },
          { Feature: <C>payment_volatility_3</C>, "Formula / Description": "Standard deviation of recent payments — stability of repayment behaviour." },
          { Feature: <C>revenue_to_expense_ratio</C>, "Formula / Description": <><C>monthly_revenue / monthly_expenses</C> — Basic profitability indicator.</> },
        ]}
      />

      <H2>Interpreting Results</H2>
      <DocTable
        cols={["Scenario", "Interpretation"]}
        rows={[
          { Scenario: "HIGH tier + score > 0.8 at all horizons", Interpretation: "Immediate intervention recommended — review loan terms, schedule a business health check." },
          { Scenario: "Score rising across horizons (0.4 → 0.6 → 0.8)", Interpretation: "Deteriorating trajectory — act early before the 3m prediction materialises." },
          { Scenario: "Score declining (0.7 → 0.5 → 0.3)", Interpretation: "Improving trajectory — current interventions may be working. Monitor." },
          { Scenario: "MEDIUM tier, stable scores", Interpretation: "Watch list — no immediate alarm, but flag for follow-up if the trajectory shifts upward." },
          { Scenario: "LOW tier at all horizons", Interpretation: "Healthy — continue standard engagement cadence." },
        ]}
      />
      <Callout variant="tip">
        The probability outputs (<C>prob_low</C>, <C>prob_medium</C>, <C>prob_high</C>) are especially useful for clients near tier
        boundaries. A client predicted as MEDIUM with <C>prob_high = 0.38</C> is closer to the danger zone than one with <C>prob_high = 0.05</C>.
      </Callout>

      <Hr />
      <H2>Training Workflow</H2>
      <P>The risk pipeline is built through the following stages inside the training notebook:</P>
      <OL>
        <Li><strong>Data loading</strong> — Merges core banking loans with impact survey data; validates schema against expected column lists.</Li>
        <Li><strong>Cleaning</strong> — Datetime coercion, identifier normalization, numeric median imputation, IQR clipping for high-variance columns.</Li>
        <Li><strong>Feature engineering</strong> — Builds repayment/utilization ratios, rolling means/std (3-obs windows), arrears trend deltas, payment volatility, sector-relative arrears deviation, revenue/expense ratio, NPS transformation.</Li>
        <Li><strong>Time-based split</strong> — First 80% of records (by <C>survey_date</C>) for training; last 20% for out-of-time testing.</Li>
        <Li><strong>Advanced models &amp; tuning</strong> — LightGBM preferred; XGBoost as alternative; RandomForest as fallback. <C>RandomizedSearchCV</C> with <C>TimeSeriesSplit</C> CV.</Li>
        <Li><strong>Calibration</strong> — Platt scaling and isotonic regression applied to improve probability reliability for high-risk detection.</Li>
        <Li><strong>Explainability</strong> — SHAP summary plots, partial dependence plots, and combined feature importance rankings produced as governance artifacts.</Li>
      </OL>

      <H2>Data Leakage Controls</H2>
      <UL>
        <Li><strong>Time-based split:</strong> Training uses data up to a cutoff date; testing uses data after. No future data leaks into training.</Li>
        <Li><strong>Leakage column exclusion:</strong> Target variables, prediction columns, and key identifiers are explicitly stripped before the feature matrix is assembled.</Li>
        <Li><strong>Feature timestamp alignment:</strong> Loan snapshots are joined to survey records using the most recent state available at or before the survey date.</Li>
        <Li><strong>Ordinal encoding:</strong> Uses <C>OrdinalEncoder</C> with unknown-value handling so unseen categories in inference don't crash the pipeline.</Li>
      </UL>

      <H2>Assumptions &amp; Caveats</H2>
      <UL>
        <Li><C>risk_tier</C> values are normalized to <C>LOW</C>, <C>MEDIUM</C>, <C>HIGH</C> — the mapping <C>MID → MEDIUM</C> is applied automatically.</Li>
        <Li>Shorter horizons (1m) typically show lower error than longer-horizon (3m) forecasts. Check the Model Cards tab per-horizon for current metric values.</Li>
        <Li>Predictions are clipped to <C>[0, 1]</C> for scores — the raw regressor output is bounded as a post-processing step.</Li>
        <Li>The pipeline was trained on synthetic data modelled after Inkomoko's client base. Production accuracy depends on how closely real data matches the training distribution.</Li>
      </UL>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Employment Pipeline
// ─────────────────────────────────────────────────────────────────────────────
function EmploymentContent() {
  return (
    <>
      <H1>Employment Prediction Pipeline</H1>
      <H2>Purpose</H2>
      <P>
        The employment pipeline forecasts the <strong>job-creation and job-loss impact</strong> of
        Inkomoko-supported businesses at three monthly horizons, helping the organisation:
      </P>
      <UL>
        <Li><strong>Track impact goals</strong> — Inkomoko's mission includes measurable job creation; monthly trajectory predictions show whether impact is accelerating or stalling.</Li>
        <Li><strong>Flag shrinking businesses</strong> — A spike in predicted job losses, especially one that grows across horizons, can signal deeper operational trouble before it appears in revenue or loan data.</Li>
        <Li><strong>Prioritise support</strong> — Businesses predicted to lose jobs may benefit from targeted capacity-building or market linkage interventions.</Li>
      </UL>

      <H2>Models</H2>
      <DocTable
        cols={["Model", "Horizon", "Target", "Output"]}
        rows={[
          { Model: "Jobs Created Regressor (1m)", Horizon: "1 month", Target: <C>jobs_created_1m</C>, Output: "Predicted new jobs in 1 month (floored at 0)." },
          { Model: "Jobs Created Regressor (2m)", Horizon: "2 month", Target: <C>jobs_created_2m</C>, Output: "Predicted new jobs in 2 months (floored at 0)." },
          { Model: "Jobs Created Regressor (3m)", Horizon: "3 month", Target: <C>jobs_created_3m</C>, Output: "Predicted new jobs in 3 months (floored at 0)." },
          { Model: "Jobs Lost Regressor (1m)", Horizon: "1 month", Target: <C>jobs_lost_1m</C>, Output: "Predicted jobs lost in 1 month (floored at 0)." },
          { Model: "Jobs Lost Regressor (2m)", Horizon: "2 month", Target: <C>jobs_lost_2m</C>, Output: "Predicted jobs lost in 2 months (floored at 0)." },
          { Model: "Jobs Lost Regressor (3m)", Horizon: "3 month", Target: <C>jobs_lost_3m</C>, Output: "Predicted jobs lost in 3 months (floored at 0)." },
        ]}
      />

      <H2>API Usage</H2>
      <Pre>{`POST /predict/employment
Content-Type: application/json

// Response
{
  "meta": { "model_pipeline": "employment", "record_count": 1 },
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
}`}</Pre>

      <H2>Performance Metrics</H2>
      <DocTable
        cols={["Metric", "What it measures", "How to interpret"]}
        rows={[
          { Metric: <strong>RMSE</strong>, "What it measures": "Average magnitude of prediction errors, in the same units as the target (number of jobs). Penalises large errors heavily.", "How to interpret": "Lower is better. An RMSE of 0.5 means predictions are typically off by about half a job." },
          { Metric: <strong>MAE</strong>, "What it measures": "Average of absolute differences between predicted and actual values. Less sensitive to outliers than RMSE.", "How to interpret": "Lower is better. Directly interpretable as 'on average, how many jobs is the prediction off by?'" },
        ]}
      />
      <Callout variant="info">
        If RMSE is much larger than MAE, the model occasionally makes big mistakes even though it's usually close.
        If RMSE ≈ MAE, errors are consistently small.
      </Callout>

      <H2>Net Employment Direction</H2>
      <P>A useful derived insight is the net jobs figure at each horizon:</P>
      <Pre>{`net_jobs_{h}m = pred_jobs_created_{h}m − pred_jobs_lost_{h}m`}</Pre>
      <DocTable
        cols={["Net Jobs Trajectory", "Interpretation"]}
        rows={[
          { "Net Jobs Trajectory": "Positive and growing (1m→3m)", Interpretation: "Business is expected to accelerate workforce growth — strong positive impact signal." },
          { "Net Jobs Trajectory": "Positive but shrinking", Interpretation: "Growth is decelerating — may still be healthy, but monitor for a trend reversal." },
          { "Net Jobs Trajectory": "Approximately zero at all horizons", Interpretation: "Stable employment — no significant change expected." },
          { "Net Jobs Trajectory": "Negative and worsening (1m→3m)", Interpretation: "Business may be shrinking with acceleration — consider proactive support immediately." },
        ]}
      />

      <H2>Practical Thresholds</H2>
      <UL>
        <Li><strong>jobs_created &gt; 3 at any horizon</strong>: High-growth prediction — good candidate for success-story identification.</Li>
        <Li><strong>jobs_lost &gt; 1 at any horizon</strong>: Potential concern — even 1–2 predicted lost jobs in a small business may indicate operational stress.</Li>
        <Li><strong>Rising jobs_lost across horizons</strong>: Accelerating workforce decline — a stronger warning signal than a single high value.</Li>
        <Li><strong>Both near 0 at all horizons</strong>: Stable/micro business — typical for sole proprietors or very small operations.</Li>
      </UL>

      <Hr />
      <H2>Training Pipeline Steps</H2>
      <OL>
        <Li><strong>Environment setup</strong> — Fixed random seed, output directories created.</Li>
        <Li><strong>Data loading &amp; cleaning</strong> — Both source CSVs are read; date columns coerced; identifiers normalized; invalid rows excluded.</Li>
        <Li><strong>Feature engineering</strong> — Derived signals: <C>repayment_ratio</C>, <C>utilization_ratio</C>, <C>past_due_ratio</C>, <C>arrears_trend_delta</C>.</Li>
        <Li><strong>Record consolidation &amp; merge</strong> — Latest core record per client kept; left-joined to impact records on ID; sorted by <C>survey_date</C>.</Li>
        <Li><strong>Time-based split</strong> — First 80% (earlier dates) for training; final 20% for test/backtest.</Li>
        <Li><strong>Preprocessing</strong> — Numeric: median imputation + standard scaling. Categorical: most-frequent imputation + ordinal encoding with unknown handling.</Li>
        <Li><strong>Modelling</strong> — One independent pipeline per target; predictions clipped at zero.</Li>
        <Li><strong>Evaluation</strong> — RMSE and MAE on the held-out test set per target.</Li>
        <Li><strong>Artifact export</strong> — Model binaries (<C>.joblib</C>), metrics CSV, predictions CSV, and backtest chart saved.</Li>
      </OL>

      <H2>Artifacts Produced</H2>
      <UL>
        <Li><C>ml/artifacts/employment_jobs_created_3m_model.joblib</C></Li>
        <Li><C>ml/artifacts/employment_jobs_lost_3m_model.joblib</C></Li>
        <Li><C>ml/artifacts/employment_model_metrics.csv</C> — target, RMSE, MAE per horizon</Li>
        <Li><C>ml/artifacts/employment_predictions_test.csv</C> — unique_id, survey_date, actuals, pred_ columns</Li>
        <Li><C>ml/charts/employment_backtest.png</C> — two-panel actual vs predicted chart</Li>
      </UL>

      <H2>Monitoring Recommendations</H2>
      <P>Track these signals over time to detect model degradation:</P>
      <UL>
        <Li>RMSE/MAE drift by cohort and period.</Li>
        <Li>Missingness and schema changes in incoming data.</Li>
        <Li>Distribution shifts in key ratios (<C>repayment_ratio</C>, <C>utilization_ratio</C>).</Li>
        <Li>Prediction bias across segments (client type, geography, loan profile).</Li>
      </UL>

      <H2>Known Risks &amp; Caveats</H2>
      <UL>
        <Li><strong>Temporal mismatch:</strong> The latest core snapshot may not align exactly with survey timing.</Li>
        <Li><strong>Category drift:</strong> New categorical values in production can degrade ordinal-encoded performance over time.</Li>
        <Li><strong>Scale imbalance:</strong> <C>jobs_lost_3m</C> may underperform if that outcome is sparse in training data.</Li>
        <Li><strong>Extrapolation limits:</strong> Tree-based models can underperform for extreme unseen value ranges.</Li>
        <Li>External shocks (policy changes, natural disasters) not present in historical data are not captured.</Li>
      </UL>
      <Callout variant="warning">
        Set alerts for significant metric degradation and trigger retraining when thresholds are crossed.
        Use the <strong>Retrain Models</strong> tab to replace live models without restarting the service.
      </Callout>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Revenue Pipeline
// ─────────────────────────────────────────────────────────────────────────────
function RevenueContent() {
  return (
    <>
      <H1>Revenue Prediction Pipeline</H1>
      <H2>Purpose</H2>
      <P>
        The revenue pipeline forecasts the <strong>total revenue</strong> a client's business is expected to
        generate at three monthly horizons. This enables:
      </P>
      <UL>
        <Li><strong>Early decline detection</strong> — A falling revenue trajectory across horizons, paired with rising risk, confirms a deteriorating situation before it becomes critical.</Li>
        <Li><strong>Portfolio segmentation</strong> — Group clients by revenue trajectory shape (growing, flat, declining) to allocate advisory resources where they'll have the most impact.</Li>
        <Li><strong>Financial planning support</strong> — Monthly revenue projections help advisors have informed conversations about cash-flow management and loan repayment capacity.</Li>
      </UL>

      <H2>Models</H2>
      <DocTable
        cols={["Model", "Horizon", "Target", "Output"]}
        rows={[
          { Model: "Revenue Regressor (1m)", Horizon: "1 month", Target: <C>revenue_1m</C>, Output: "Predicted revenue in 1 month (floored at 0)." },
          { Model: "Revenue Regressor (2m)", Horizon: "2 month", Target: <C>revenue_2m</C>, Output: "Predicted revenue in 2 months (floored at 0)." },
          { Model: "Revenue Regressor (3m)", Horizon: "3 month", Target: <C>revenue_3m</C>, Output: "Predicted revenue in 3 months (floored at 0)." },
        ]}
      />

      <H2>API Usage</H2>
      <Pre>{`POST /predict/revenue
Content-Type: application/json

// Response
{
  "meta": { "model_pipeline": "revenue", "record_count": 1 },
  "predictions": [
    {
      "unique_id": "CLI-00789",
      "pred_revenue_1m": 112500.25,
      "pred_revenue_2m": 228300.50,
      "pred_revenue_3m": 342150.75
    }
  ]
}`}</Pre>

      <H2>Revenue Trajectory Analysis</H2>
      <DocTable
        cols={["Trajectory Shape", "Interpretation"]}
        rows={[
          { "Trajectory Shape": "Rising (1m < 2m < 3m)", Interpretation: "Business appears healthy and growing — maintain current advisory approach." },
          { "Trajectory Shape": "Declining (1m > 2m > 3m)", Interpretation: "Potential concern — cross-reference with risk score. If both are worsening, escalate to proactive intervention." },
          { "Trajectory Shape": "Flat (similar across horizons)", Interpretation: "Stable business — consistent revenue expected." },
          { "Trajectory Shape": "Volatile (up then down, or vice versa)", Interpretation: "May indicate seasonal business or model uncertainty. Investigate further before acting." },
        ]}
      />

      <H2>Cross-Pipeline Insights</H2>
      <P>Revenue predictions are most powerful in combination with the other pipelines:</P>
      <DocTable
        cols={["Combined Signal", "Recommended Action"]}
        rows={[
          { "Combined Signal": "Rising risk + declining revenue trajectory", "Recommended Action": "Strongest early warning signal. Prioritise immediate advisory contact." },
          { "Combined Signal": "Low risk at all horizons + strong/rising revenue", "Recommended Action": "Healthy client. Good candidate for expanded services or success-story documentation." },
          { "Combined Signal": "Growing employment + flat revenue", "Recommended Action": "Business may be investing and expanding — revenue could follow. Monitor, don't alarm." },
          { "Combined Signal": "Declining revenue + rising job losses across horizons", "Recommended Action": "Compounding signals of distress accelerating over time. Consider comprehensive business health assessment." },
        ]}
      />
      <Callout variant="warning">
        Predictions are point estimates with no built-in confidence interval. Treat them as <strong>directional
        guidance</strong>, not exact forecasts. The model was trained on synthetic data — production accuracy will
        depend on how closely real data matches the training distribution.
      </Callout>

      <Hr />
      <H2>Model Configuration</H2>
      <DocTable
        cols={["Parameter", "Value"]}
        rows={[
          { Parameter: "Algorithm (notebook)", Value: "RandomForestRegressor" },
          { Parameter: "Algorithm (production)", Value: "LightGBM Regressor" },
          { Parameter: "Estimators (RF)", Value: "300" },
          { Parameter: "Random seed", Value: "42 (fixed for reproducibility)" },
          { Parameter: "Train split", Value: "First 80% chronologically (time-based)" },
          { Parameter: "Post-processing", Value: "Predictions clipped at 0 (non-negative)" },
          { Parameter: "Numeric pipeline", Value: "Median imputation → Standard scaling" },
          { Parameter: "Categorical pipeline", Value: "Most-frequent imputation → OrdinalEncoder (unknown_value = –1)" },
        ]}
      />

      <H2>Performance Metrics</H2>
      <DocTable
        cols={["Metric", "What it measures", "How to interpret"]}
        rows={[
          { Metric: <strong>RMSE</strong>, "What it measures": "Average magnitude of prediction errors in the same currency units as revenue. Heavily penalises large errors.", "How to interpret": "Lower is better. Read as 'on average, the prediction is off by roughly this amount.'" },
          { Metric: <strong>MAE</strong>, "What it measures": "Average absolute difference between predicted and actual revenue. More robust to outliers.", "How to interpret": "Lower is better. Directly interpretable in business terms." },
        ]}
      />
      <Callout variant="info">
        Contextual reading: an RMSE of 68 on a dataset where average revenue is 500 means the model is typically
        off by about 14% — reasonable for a forward forecast. Always compare error magnitudes to the scale of the
        target. Metrics are reported per horizon on the Model Cards tab.
      </Callout>

      <H2>Artifacts Produced</H2>
      <UL>
        <Li><C>ml/artifacts/revenue_3m_model.joblib</C> — Trained model binary</Li>
        <Li><C>ml/artifacts/revenue_model_metrics.csv</C> — RMSE / MAE per horizon</Li>
        <Li><C>ml/artifacts/revenue_predictions_test.csv</C> — <C>unique_id</C>, <C>survey_date</C>, actual and <C>pred_revenue_3m</C></Li>
        <Li><C>ml/charts/revenue_backtest.png</C> — Temporal actual vs predicted visualization</Li>
      </UL>

      <H2>Known Limitations</H2>
      <UL>
        <Li>No hyperparameter optimization or cross-validation in the base notebook — single model family only.</Li>
        <Li>No interval estimates or uncertainty quantification; outputs are point estimates only.</Li>
        <Li>Merge uses the latest core snapshot per client — no richer longitudinal aggregation window.</Li>
        <Li>Potentially sensitive to temporal drift and feature distribution shifts over time.</Li>
        <Li>Extremely high or low revenue values are harder to predict accurately due to rarity in training data.</Li>
      </UL>
      <Callout variant="tip">
        Recommended improvements: walk-forward validation, LightGBM/XGBoost comparison, SHAP diagnostics,
        log-transform options for skewed revenue, and MLflow experiment tracking.
      </Callout>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Portfolio
// ─────────────────────────────────────────────────────────────────────────────
function PortfolioContent() {
  return (
    <>
      <H1>Portfolio &amp; Client Profiles</H1>
      <H2>Purpose</H2>
      <P>
        The Portfolio view provides a <strong>bird's-eye view of the entire enterprise base</strong>, scoring
        every client through all three prediction pipelines and presenting results in a single, sortable,
        filterable table. It answers: <em>"Across all our clients, who needs attention and why?"</em>
      </P>

      <H2>How It Works</H2>
      <OL>
        <Li>Loads either the uploaded dataset or the built-in test data.</Li>
        <Li>Runs <strong>all 15 models</strong> (risk tier, risk score, jobs created, jobs lost, revenue — each at the 3-month horizon) on every enterprise.</Li>
        <Li>Derives a <strong>recommended action</strong> based on the risk tier.</Li>
        <Li>Returns a flat, sortable table with one row per enterprise.</Li>
      </OL>

      <H2>Table Columns</H2>
      <DocTable
        cols={["Column", "Description"]}
        rows={[
          { Column: <strong>Enterprise ID</strong>, Description: "The unique identifier for each client (unique_id)." },
          { Column: <strong>Country</strong>, Description: "Operating country — used for governance-aware recommendations." },
          { Column: <strong>Program</strong>, Description: "Inkomoko program the client is enrolled in." },
          { Column: <strong>Sector</strong>, Description: "Business sector classification." },
          { Column: <strong>Risk Tier</strong>, Description: "Predicted risk category at 3-month horizon: LOW, MEDIUM, or HIGH. Colour-coded badges." },
          { Column: <strong>Risk Score</strong>, Description: "Continuous risk severity score (0–1) at 3m. Higher = more at risk." },
          { Column: <strong>Revenue (3m)</strong>, Description: "Predicted revenue at the 3-month horizon." },
          { Column: <strong>Jobs Created (3m)</strong>, Description: "Predicted new jobs at the 3-month horizon." },
          { Column: <strong>Jobs Lost (3m)</strong>, Description: "Predicted jobs lost at the 3-month horizon." },
          { Column: <strong>Action</strong>, Description: "Recommended action derived from the risk tier." },
        ]}
      />

      <H2>Filtering &amp; Search</H2>
      <P>The Portfolio table supports multiple simultaneous filters:</P>
      <DocTable
        cols={["Filter", "Description"]}
        rows={[
          { Filter: "Text search", Description: "Filter by enterprise ID, country, or sector keywords." },
          { Filter: "Risk tier filter", Description: "Show only HIGH / MEDIUM / LOW enterprises." },
          { Filter: "Country filter", Description: "Narrow to a specific operating country." },
          { Filter: "Sector filter", Description: "Focus on a particular business sector." },
          { Filter: "Program filter", Description: "Filter by Inkomoko program enrollment." },
          { Filter: "Pagination", Description: "Navigate through large portfolios with page controls." },
        ]}
      />
      <Callout variant="tip">
        Click any column header to sort ascending/descending. Default sort is by risk score (highest first) to
        surface the most at-risk enterprises immediately.
      </Callout>

      <H2>Recommended Actions</H2>
      <DocTable
        cols={["Risk Tier", "Action", "Meaning"]}
        rows={[
          { "Risk Tier": <Badge tone="danger">HIGH</Badge>, Action: "Immediate Review", Meaning: "Schedule urgent advisor contact within 1 week. Review loan terms and business health." },
          { "Risk Tier": <Badge tone="warning">MEDIUM</Badge>, Action: "Monitor", Meaning: "Flag for follow-up within 2–4 weeks. Watch trajectory direction." },
          { "Risk Tier": <Badge tone="success">LOW</Badge>, Action: "Standard", Meaning: "Continue standard engagement cadence. No immediate concern." },
        ]}
      />

      <H2>Client Profile Modal</H2>
      <P>Clicking any enterprise row opens a comprehensive single-client deep dive that shows:</P>
      <UL>
        <Li><strong>Risk Assessment</strong> — Risk tier and score at all three horizons with trajectory sparkline. Per-class probabilities (LOW/MEDIUM/HIGH).</Li>
        <Li><strong>Employment Forecast</strong> — Jobs created and jobs lost at all three horizons with trajectory sparklines. Net employment direction.</Li>
        <Li><strong>Revenue Projection</strong> — Revenue forecast at all three horizons with trajectory sparkline.</Li>
        <Li><strong>AI Profile Summary</strong> — An AI-generated natural language summary of the client's situation, powered by the RAG Agent. Highlights key risks, opportunities, and recommended interventions.</Li>
        <Li><strong>Key Indicators</strong> — Client demographics, loan details, and financial ratios at a glance.</Li>
      </UL>

      <H2>API Usage</H2>
      <Pre>{`// Portfolio
GET /demo/portfolio

// Response
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
      "revenue_3m": 125000.50,
      "jobs_created_3m": 1.2,
      "jobs_lost_3m": 0.8,
      "recommended_action": "Immediate Review"
    }
  ]
}

// Client Profile
POST /demo/client-profile
// Body: a single client record object
// Returns: combined predictions from all 3 pipelines at all horizons + AI summary`}</Pre>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Advisory
// ─────────────────────────────────────────────────────────────────────────────
function AdvisoryContent() {
  return (
    <>
      <H1>Advisory Plans Pipeline</H1>
      <H2>Purpose</H2>
      <P>
        The Advisory tab generates <strong>governance-aware, per-enterprise advisory plans</strong> that
        translate model predictions into actionable intervention recommendations. Each plan is tailored to the
        enterprise's risk tier, country-specific regulatory environment, and projected financial and
        employment trajectories.
      </P>

      <H2>Priority Levels</H2>
      <DocTable
        cols={["Risk Tier", "Priority", "Timeline"]}
        rows={[
          { "Risk Tier": <Badge tone="danger">HIGH</Badge>, Priority: "CRITICAL", Timeline: "Immediate (within 1 week)" },
          { "Risk Tier": <Badge tone="warning">MEDIUM</Badge>, Priority: "ELEVATED", Timeline: "Short-term (within 2–4 weeks)" },
          { "Risk Tier": <Badge tone="success">LOW</Badge>, Priority: "ROUTINE", Timeline: "Standard cycle (next quarter)" },
        ]}
      />

      <H2>Advisory Domains</H2>

      <H3>1. Financial</H3>
      <UL>
        <Li><strong>HIGH tier:</strong> Emergency cashflow analysis, expense reduction review, loan restructuring consultation.</Li>
        <Li><strong>MEDIUM tier:</strong> Financial health check, revenue diversification when projected revenue trails recent performance.</Li>
        <Li><strong>LOW tier:</strong> Growth investment planning, emergency savings buffer target.</Li>
      </UL>

      <H3>2. Governance (Country-Specific)</H3>
      <P>Regulatory compliance checks are generated using the enterprise's country. The system includes dedicated frameworks for:</P>
      <DocTable
        cols={["Country", "Framework", "Regulator"]}
        rows={[
          { Country: "Rwanda", Framework: "Rwanda SME Policy & MSME Development Strategy", Regulator: "Rwanda Development Board (RDB)" },
          { Country: "Kenya", Framework: "Kenya Micro and Small Enterprises Act 2012", Regulator: "Micro and Small Enterprises Authority (MSEA)" },
          { Country: "South Sudan", Framework: "South Sudan Investment Promotion Act", Regulator: "South Sudan Investment Authority" },
        ]}
      />
      <Callout variant="info">
        Each country framework contributes tax notes, labour notes, lending notes, and a compliance checklist.
        Enterprises from unlisted countries receive a general MSME best-practice framework.
      </Callout>

      <H3>3. Employment</H3>
      <UL>
        <Li><strong>Net job loss &gt; 1:</strong> Workforce retention strategy + skills redeployment assessment.</Li>
        <Li><strong>Net job gain &gt; 2:</strong> Hiring readiness plan with social-security registration guidance.</Li>
        <Li><strong>Stable workforce:</strong> Team stability check with training recommendation.</Li>
      </UL>

      <H3>4. Operational</H3>
      <UL>
        <Li><strong>HIGH / MEDIUM tier:</strong> Inventory &amp; supply-chain review, customer retention outreach.</Li>
        <Li><strong>All tiers (when sector is known):</strong> Sector benchmarking against peers.</Li>
      </UL>

      <H3>5. Growth</H3>
      <UL>
        <Li><strong>LOW tier:</strong> Market expansion assessment, digital presence development, advanced program enrollment.</Li>
        <Li><strong>MEDIUM tier:</strong> "Stabilise before scaling" guidance.</Li>
      </UL>

      <H2>API Usage</H2>
      <Pre>{`GET /demo/advisory

// Response shape
{
  "source": "...",
  "total": 200,
  "tier_distribution": { "HIGH": 42, "MEDIUM": 88, "LOW": 70 },
  "total_actions": 1240,
  "governance_summaries": [
    {
      "country": "Rwanda",
      "framework": "Rwanda SME Policy & MSME Development Strategy",
      "regulator": "Rwanda Development Board (RDB)",
      "enterprise_count": 45,
      "high_risk_count": 8
    }
  ],
  "plans": [
    {
      "unique_id": "CLI-00123",
      "country": "Rwanda",
      "risk_tier": "HIGH",
      "advisory": {
        "priority": "CRITICAL",
        "timeline": "Immediate (within 1 week)",
        "domains": { "financial": [...], "governance": [...], ... },
        "total_actions": 7
      }
    }
  ]
}`}</Pre>

      <H2>Per-Enterprise Plan Object</H2>
      <P>Each item in the <C>plans</C> array contains:</P>
      <DocTable
        cols={["Field", "Type", "Description"]}
        rows={[
          { Field: <C>unique_id</C>, Type: "string", Description: "Enterprise identifier." },
          { Field: <C>country</C>, Type: "string", Description: "Operating country." },
          { Field: <C>sector</C>, Type: "string", Description: "Business sector." },
          { Field: <C>program</C>, Type: "string", Description: "Enrolled Inkomoko programme." },
          { Field: <C>risk_tier</C>, Type: "string", Description: "HIGH / MEDIUM / LOW." },
          { Field: <C>risk_score</C>, Type: "float", Description: "Raw risk score (0–1)." },
          { Field: <C>revenue_3m</C>, Type: "float", Description: "Projected 3-month revenue." },
          { Field: <C>jobs_created_3m</C>, Type: "float", Description: "Projected jobs created." },
          { Field: <C>jobs_lost_3m</C>, Type: "float", Description: "Projected jobs lost." },
          { Field: <C>advisory.priority</C>, Type: "string", Description: "CRITICAL / ELEVATED / ROUTINE." },
          { Field: <C>advisory.timeline</C>, Type: "string", Description: "Recommended action window." },
          { Field: <C>advisory.domains</C>, Type: "object", Description: "Grouped recommendations: financial, governance, employment, operational, growth." },
          { Field: <C>advisory.total_actions</C>, Type: "int", Description: "Total number of recommendations for this enterprise." },
        ]}
      />

      <H2>Audit Trail</H2>
      <P>Every advisory generation is logged automatically:</P>
      <Pre>{`Action:   Advisory plans generated
Category: advisory
Severity: info
Details:  Generated {N} advisory plans with {M} total actions.`}</Pre>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Reports
// ─────────────────────────────────────────────────────────────────────────────
function ReportsContent() {
  return (
    <>
      <H1>Reports Pipeline</H1>
      <H2>Purpose</H2>
      <P>
        The Reports tab produces <strong>publication-ready report payloads</strong> that aggregate
        portfolio-wide predictions into structured documents suitable for external stakeholders.
        Two report formats are available:
      </P>
      <DocTable
        cols={["Report Type", "Audience", "Depth"]}
        rows={[
          { "Report Type": <strong>Donor Pack</strong>, Audience: "Donors & investors", Depth: "Comprehensive impact report" },
          { "Report Type": <strong>Program Brief</strong>, Audience: "Programme managers", Depth: "Concise executive summary" },
        ]}
      />

      <H2>API Usage</H2>
      <Pre>{`GET /demo/reports?report_type=donor_pack&source=stored

// Parameters:
//   report_type  donor_pack | program_brief  (default: donor_pack)
//   source       stored | test               (default: stored)`}</Pre>

      <H2>Headline KPIs</H2>
      <Pre>{`{
  "total_enterprises": 200,
  "avg_risk_score": 0.4321,
  "high_risk_count": 42,
  "medium_risk_count": 88,
  "low_risk_count": 70,
  "total_projected_revenue": 125000000,
  "avg_projected_revenue": 625000,
  "total_jobs_created": 350,
  "total_jobs_lost": 120,
  "net_jobs": 230
}`}</Pre>

      <H2>Multi-Horizon Projections</H2>
      <P>The <C>horizon_summary</C> provides trend data across all three model horizons (3, 6, and 12 months), allowing donors and programme managers to see projected trajectory shifts over time.</P>
      <DocTable
        cols={["Horizon", "avg_risk_score", "total_revenue", "net_jobs"]}
        rows={[
          { Horizon: "3 months", "avg_risk_score": "0.43", "total_revenue": "125,000,000", "net_jobs": "230" },
          { Horizon: "6 months", "avg_risk_score": "0.45", "total_revenue": "260,000,000", "net_jobs": "450" },
          { Horizon: "12 months", "avg_risk_score": "0.48", "total_revenue": "540,000,000", "net_jobs": "880" },
        ]}
      />

      <H2>Donor Pack — 12 Sections</H2>
      <OL>
        <Li>Executive Summary</Li>
        <Li>KPI Dashboard</Li>
        <Li>Risk Distribution</Li>
        <Li>Revenue Projections</Li>
        <Li>Employment Impact</Li>
        <Li>Sector Analysis</Li>
        <Li>Country Analysis</Li>
        <Li>Gender Lens</Li>
        <Li>Programme Performance</Li>
        <Li>Success Spotlight (top 5 lowest-risk enterprises)</Li>
        <Li>Risk Watchlist (top 10 highest-risk enterprises)</Li>
        <Li>Methodology</Li>
      </OL>

      <H2>Program Brief — 6 Sections</H2>
      <OL>
        <Li>Executive Summary</Li>
        <Li>KPI Summary</Li>
        <Li>Risk Overview</Li>
        <Li>Action Items (auto-generated prioritised list)</Li>
        <Li>Sector Snapshot</Li>
        <Li>Horizon Trends</Li>
      </OL>
      <Callout variant="tip">
        Auto-generated action items in the Program Brief include priority levels (CRITICAL / HIGH / MEDIUM) and
        deadlines derived directly from the data — e.g., if any high-risk enterprises exist, a CRITICAL item
        is generated with a 2-week deadline.
      </Callout>

      <H2>Auto-Generated Action Items (Program Brief)</H2>
      <DocTable
        cols={["Trigger Condition", "Priority", "Action", "Deadline"]}
        rows={[
          { "Trigger Condition": "Any high-risk enterprises exist", Priority: "CRITICAL", Action: "Schedule intervention reviews", Deadline: "Within 2 weeks" },
          { "Trigger Condition": "Net jobs projection is negative", Priority: "HIGH", Action: "Investigate layoff risk", Deadline: "Within 1 month" },
          { "Trigger Condition": "High-risk percentage exceeds 30%", Priority: "HIGH", Action: "Review admission criteria", Deadline: "Within 1 month" },
          { "Trigger Condition": "Medium-risk count exceeds low-risk count", Priority: "MEDIUM", Action: "Increase mentoring frequency", Deadline: "Ongoing" },
          { "Trigger Condition": "Always included", Priority: "LOW", Action: "Run updated projections after next data refresh", Deadline: "Next quarter" },
        ]}
      />

      <H2>Shared Response Fields</H2>
      <P>Both report types return these top-level fields:</P>
      <DocTable
        cols={["Field", "Type", "Description"]}
        rows={[
          { Field: <C>report_type</C>, Type: "string", Description: "donor_pack or program_brief." },
          { Field: <C>generated_at</C>, Type: "string", Description: "ISO 8601 UTC timestamp." },
          { Field: <C>executive_summary</C>, Type: "string", Description: "Auto-generated narrative summary citing aggregate revenue, jobs, high-risk counts, and resilience indicators." },
          { Field: <C>kpis</C>, Type: "object", Description: "Headline KPIs: enterprise counts, avg/total risk scores, revenue and employment totals." },
          { Field: <C>horizon_summary</C>, Type: "object", Description: "Multi-horizon projections keyed by horizon (3, 6, 12 months)." },
          { Field: <C>sector_breakdown</C>, Type: "array", Description: "Per-sector aggregated metrics sorted by total revenue." },
          { Field: <C>country_breakdown</C>, Type: "array", Description: "Per-country aggregated metrics." },
          { Field: <C>gender_breakdown</C>, Type: "object", Description: "Gender-disaggregated metrics (Male/Female)." },
          { Field: <C>program_breakdown</C>, Type: "array", Description: "Per-programme aggregated metrics." },
          { Field: <C>top_risk_enterprises</C>, Type: "array", Description: "Top 10 highest-risk enterprises." },
          { Field: <C>success_stories</C>, Type: "array", Description: "Top 5 lowest-risk enterprises for success spotlights." },
        ]}
      />

      <H2>Breakdowns Available</H2>
      <DocTable
        cols={["Breakdown", "Grouped by", "Metrics included"]}
        rows={[
          { Breakdown: "Sector", "Grouped by": "Business sector", "Metrics included": "count, avg_risk, high_risk, total_revenue, total_jobs_created" },
          { Breakdown: "Country", "Grouped by": "Operating country", "Metrics included": "count, avg_risk, high_risk, total_revenue, total_jobs_created" },
          { Breakdown: "Gender", "Grouped by": "Gender value (Male/Female)", "Metrics included": "count, avg_risk, total_revenue, total_jobs" },
          { Breakdown: "Programme", "Grouped by": "program_enrolled", "Metrics included": "count, avg_risk, high_risk, total_revenue, total_jobs_created" },
        ]}
      />

      <H2>Audit Trail</H2>
      <P>Every report generation is logged automatically:</P>
      <Pre>{`Action:   Report generated: donor_pack
Category: system
Severity: info
Details:  Generated report for {N} enterprises.`}</Pre>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section registry
// ─────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "overview",    label: "Overview",             icon: <LayoutDashboard size={15} />,  content: <OverviewContent /> },
  { id: "risk",        label: "Risk Pipeline",        icon: <Shield size={15} />,           content: <RiskContent /> },
  { id: "employment",  label: "Employment Pipeline",  icon: <Users size={15} />,            content: <EmploymentContent /> },
  { id: "revenue",     label: "Revenue Pipeline",     icon: <TrendingUp size={15} />,       content: <RevenueContent /> },
  { id: "portfolio",   label: "Portfolio",            icon: <BarChart2 size={15} />,        content: <PortfolioContent /> },
  { id: "advisory",    label: "Advisory Plans",       icon: <Lightbulb size={15} />,        content: <AdvisoryContent /> },
  { id: "reports",     label: "Reports",              icon: <FileBarChart size={15} />,     content: <ReportsContent /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function DocsPage() {
  const [activeId, setActiveId] = useState("overview");
  const current = SECTIONS.find(s => s.id === activeId) ?? SECTIONS[0];

  return (
    <RequireRole allow={["Admin"]}>
      <div className="space-y-5">

        {/* ── Tab nav + Print ── */}
        <div className="rounded-2xl border border-inkomoko-border bg-white shadow-sm overflow-hidden">
          <div className="flex items-center p-1.5 gap-1">
            <nav className="flex flex-1 gap-1">
              {SECTIONS.map(s => {
                const active = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveId(s.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-[0.82rem] font-medium transition-all whitespace-nowrap
                      ${active
                        ? "bg-inkomoko-blue text-white shadow-sm"
                        : "text-inkomoko-muted hover:bg-inkomoko-bg hover:text-inkomoko-text"
                      }`}
                  >
                    <span className={active ? "text-white/80" : "text-inkomoko-muted"}>{s.icon}</span>
                    {s.label}
                  </button>
                );
              })}
            </nav>
            <div className="w-px h-6 bg-inkomoko-border mx-1 shrink-0" />
            <Button
              variant="secondary"
              className="gap-1.5 text-sm shrink-0"
              onClick={() => window.print()}
            >
              <Printer size={14} /> Print
            </Button>
          </div>
        </div>

        {/* ── Content area ── */}
        <main className="rounded-2xl border border-inkomoko-border bg-white shadow-sm px-8 py-7 print:shadow-none print:border-none">
          {current.content}
        </main>
      </div>
    </RequireRole>
  );
}
