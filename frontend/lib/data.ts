import { AuditEvent, Country, DataQualityContract, EnterpriseRow, ModelCard, PortfolioKPI, Scenario } from "./types";
import { v4 as uuid } from "uuid";

export const COUNTRIES: Country[] = ["Rwanda", "Kenya", "Uganda", "DRC"];

export const PROGRAMS = ["Business Accelerator", "SME Resilience", "Youth Livelihoods", "Agri-Trade Support"];

export const COHORTS = ["2025 Q3", "2025 Q4", "2026 Q1"];

export const KPIS: PortfolioKPI[] = [
  { label: "Enterprises Monitored", value: "12,480", delta: "+6.2% MoM", trend: "up", tone: "blue" },
  { label: "Jobs Safeguarded (3M)", value: "3,210", delta: "+410 vs last quarter", trend: "up", tone: "success" },
  { label: "Enterprises at High Risk", value: "742", delta: "-3.8% MoM", trend: "down", tone: "warning" },
  { label: "Projected Revenue (3M)", value: "$18.9M", delta: "+$1.1M vs baseline", trend: "up", tone: "orange" },
];

export const ENTERPRISES: EnterpriseRow[] = Array.from({ length: 36 }).map((_, i) => {
  const country = COUNTRIES[i % COUNTRIES.length];
  const program = PROGRAMS[i % PROGRAMS.length];
  const cohort = COHORTS[i % COHORTS.length];
  const sector = ["Retail", "Services", "Agribusiness", "Manufacturing"][i % 4];
  const riskScore = Math.max(0.08, Math.min(0.92, (Math.sin(i * 1.7) + 1) / 2));
  const riskTier = riskScore > 0.7 ? "High" : riskScore > 0.4 ? "Medium" : "Low";
  const revenue = Math.round((8500 + i * 320 + (riskTier === "High" ? -1800 : 1200)) * 10) / 10;
  const jobsC = Math.max(0, Math.round(2 + (1 - riskScore) * 6 + (i % 3)));
  const jobsL = Math.max(0, Math.round(riskScore * 4 + (i % 2)));
  const action =
    riskTier === "High"
      ? "Immediate coaching + cashflow review + weekly follow-up"
      : riskTier === "Medium"
      ? "Targeted mentoring + inventory optimization + monthly check-in"
      : "Growth planning + market linkage support";

  return {
    id: uuid(),
    country,
    program,
    cohort,
    sector,
    riskTier,
    riskScore: Math.round(riskScore * 1000) / 1000,
    revenue3mForecastUSD: revenue,
    jobsCreated3mForecast: jobsC,
    jobsLost3mForecast: jobsL,
    recommendedAction: action,
  };
});

export const SCENARIOS: Scenario[] = [
  { name: "Baseline", params: { inflation: 0.06, fxDepreciation: 0.04, fundingCut: 0.0, conflictDisruption: 0.0 } },
  { name: "Inflation + FX Shock", params: { inflation: 0.18, fxDepreciation: 0.14, fundingCut: 0.0, conflictDisruption: 0.0 } },
  { name: "Aid Reduction", params: { inflation: 0.09, fxDepreciation: 0.06, fundingCut: 0.25, conflictDisruption: 0.0 } },
  { name: "Compound Crisis", params: { inflation: 0.22, fxDepreciation: 0.16, fundingCut: 0.30, conflictDisruption: 0.15 } },
];

export const MODEL_CARDS: ModelCard[] = [
  {
    key: "M1_RISK",
    name: "Enterprise Risk Tier (Low/Medium/High)",
    version: "v1.3.0",
    horizon: "3 months",
    algorithm: "Calibrated Gradient-Boosted Trees (CPU)",
    metrics: { AUC: "0.86", F1: "0.74", Calibration: "Good", Drift: "Low" },
    fairnessSlices: [
      { slice: "Rwanda", value: "F1 0.76" },
      { slice: "Kenya", value: "F1 0.73" },
      { slice: "Uganda", value: "F1 0.71" },
      { slice: "DRC", value: "F1 0.69" },
    ],
    notes: [
      "Outputs are tiered using operational thresholds validated with program leadership.",
      "Top drivers are provided per enterprise with traceable evidence links for governance review."
    ],
  },
  {
    key: "M2_JOBS_CREATED",
    name: "Jobs Created Forecast",
    version: "v1.1.0",
    horizon: "3 months",
    algorithm: "Negative Binomial Regression + Feature Interactions",
    metrics: { MAE: "1.2 jobs", RMSE: "2.1 jobs", Coverage: "92%" },
    fairnessSlices: [
      { slice: "Female-led", value: "MAE 1.3" },
      { slice: "Male-led", value: "MAE 1.1" },
      { slice: "Retail", value: "MAE 1.0" },
      { slice: "Services", value: "MAE 1.4" },
    ],
    notes: [
      "Count-based modeling improves stability in sparse job creation regimes.",
      "Uncertainty bounds are available for decision risk management."
    ],
  },
  {
    key: "M3_JOBS_LOST",
    name: "Jobs Lost Forecast",
    version: "v1.1.0",
    horizon: "3 months",
    algorithm: "Poisson Regression + Monotonic Constraints",
    metrics: { MAE: "0.9 jobs", RMSE: "1.8 jobs", Coverage: "90%" },
    fairnessSlices: [
      { slice: "High-risk tier", value: "MAE 1.2" },
      { slice: "Medium-risk tier", value: "MAE 0.9" },
      { slice: "Low-risk tier", value: "MAE 0.6" },
    ],
    notes: [
      "Monotonic constraints ensure risk increases never reduce expected losses.",
      "Designed for interpretability and operational review."
    ],
  },
  {
    key: "M4_REVENUE",
    name: "Revenue Forecast (USD)",
    version: "v1.2.0",
    horizon: "3 months",
    algorithm: "Gradient-Boosted Regression Trees + Lag Features",
    metrics: { MAPE: "12.8%", MAE: "$580", Stability: "High" },
    fairnessSlices: [
      { slice: "Agribusiness", value: "MAPE 14.1%" },
      { slice: "Retail", value: "MAPE 12.2%" },
      { slice: "Manufacturing", value: "MAPE 11.7%" },
    ],
    notes: [
      "Lagged revenue and seasonality proxies improve short-horizon accuracy.",
      "Dashboard provides a 'so what' narrative tied to projected jobs safeguarded."
    ],
  },
];

export const DQ_CONTRACTS: DataQualityContract[] = [
  {
    name: "KPI Snapshot SLA",
    dataset: "fact_kpi_snapshot",
    scope: "All countries · 2025 Q3 → 2026 Q1",
    sla: { completeness: "≥ 95%", timeliness: "≤ 7 days", lineage: "100% traceable" },
    status: "Pass",
    lastRun: "2026-02-07 08:40 CAT",
  },
  {
    name: "Enterprise Event Feed SLA",
    dataset: "fact_enterprise_event",
    scope: "Rwanda + Kenya",
    sla: { completeness: "≥ 92%", timeliness: "≤ 10 days", lineage: "≥ 99%" },
    status: "Warn",
    lastRun: "2026-02-07 08:40 CAT",
  },
  {
    name: "Advisor Notes Coverage",
    dataset: "advisor_notes",
    scope: "Uganda + DRC",
    sla: { completeness: "≥ 88%", timeliness: "≤ 14 days", lineage: "≥ 98%" },
    status: "Fail",
    lastRun: "2026-02-07 08:40 CAT",
  },
];

export const AUDIT_LOG: AuditEvent[] = [
  { time: "2026-02-07 09:12", actor: "A. N.", role: "Program Manager", action: "Export KPI Report (PDF)", resource: "Impact Overview", outcome: "Success" },
  { time: "2026-02-07 09:06", actor: "S. W.", role: "Admin", action: "Update Access Policy", resource: "RBAC Masking Rules", outcome: "Success" },
  { time: "2026-02-07 08:55", actor: "V. U.", role: "Advisor", action: "Generate Advisory Plan", resource: "Enterprise 8f2…", outcome: "Success" },
  { time: "2026-02-07 08:41", actor: "D. R.", role: "Donor", action: "View Donor Lens", resource: "Resilience Scorecard", outcome: "Success" },
  { time: "2026-02-07 08:22", actor: "M. M.", role: "Admin", action: "Attempt Restricted Export", resource: "Enterprise-level Identifiers", outcome: "Denied" },
];
