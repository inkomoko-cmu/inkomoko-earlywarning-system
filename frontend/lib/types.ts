export type Role = "Admin" | "Program Manager" | "Advisor" | "Donor";

export type UserSession = {
  user_id: string;
  email: string;
  name: string;
  role: Role;          // active role for UI
  roles: Role[];       // all roles the user has
  access_token: string;
};


export type Country = "Rwanda" | "Kenya" | "Uganda" | "DRC";

export type PortfolioKPI = {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  tone: "blue" | "orange" | "success" | "warning" | "danger";
};

export type RiskTier = "Low" | "Medium" | "High";

export type EnterpriseRow = {
  id: string;
  enterpriseName: string;
  country: Country;
  program: string;
  cohort: string;
  sector: string;
  riskTier: RiskTier;
  riskScore: number; // 0..1
  revenue3mForecastUSD: number;
  jobsCreated3mForecast: number;
  jobsLost3mForecast: number;
  recommendedAction: string;
};

export type Scenario = {
  name: string;
  params: { inflation: number; fxDepreciation: number; fundingCut: number; conflictDisruption: number };
};

export type ScenarioParams = {
  inflation: number;
  fxDepreciation: number;
  fundingCut: number;
  conflictDisruption: number;
};

export type ApiScenario = {
  scenario_id: string;
  scenario_name: string;
  scenario_type: string;
  description: string | null;
  parameters: ScenarioParams;
  created_by: string | null;
  created_at: string;
};

export type ScenarioUpdateRequest = {
  scenario_name?: string;
  scenario_type?: string;
  description?: string | null;
  parameters?: ScenarioParams;
};

export type SimulationScope = {
  country_code?: string;
  program_id?: string;
  cohort_id?: string;
  enterprise_ids?: string[];
};

export type SimulationRunRequest = {
  model_version_id?: string | null;
  as_of_date?: string | null;
  horizon?: "1m" | "3m" | "6m" | "12m";
  target_keys?: string[];
  scope?: SimulationScope;
  notes?: string | null;
};

export type SimulationRunResponse = {
  sim_run_id: string;
  scenario_id: string;
  run_status: string;
  started_at: string;
  finished_at: string | null;
  result_count: number;
  notes: string | null;
};

export type SimulationResultItem = {
  enterprise_id: string | null;
  target_key: string;
  baseline_value: number | null;
  scenario_value: number | null;
  delta_value: number | null;
  baseline_label: string | null;
  scenario_label: string | null;
};

export type RiskDistribution = {
  baseline: Record<string, number>;
  scenario: Record<string, number>;
};

export type SimulationResultResponse = {
  sim_run_id: string;
  scenario_id: string;
  run_status: string;
  started_at: string;
  finished_at: string | null;
  horizon: string;
  result_count: number;
  enterprise_count: number;
  risk_distribution: RiskDistribution | null;
  results: SimulationResultItem[];
};

export type SimulationRunListItem = {
  sim_run_id: string;
  scenario_id: string;
  run_status: string;
  started_at: string;
  finished_at: string | null;
  result_count: number;
  notes: string | null;
  scope: Record<string, unknown>;
};

export type SimulationRunListResponse = {
  scenario_id: string;
  total: number;
  runs: SimulationRunListItem[];
};

export type SimulationRunDeleteResponse = {
  scenario_id: string;
  sim_run_id: string;
  deleted_runs: number;
  deleted_results: number;
};

export type SimulationRunBulkDeleteResponse = {
  scenario_id: string;
  deleted_runs: number;
  deleted_results: number;
};

export type SimulationEnterpriseImpactItem = {
  enterprise_id: string | null;
  baseline_risk_label: string | null;
  scenario_risk_label: string | null;
  baseline_revenue: number;
  scenario_revenue: number;
  revenue_delta: number;
  baseline_jobs_net: number;
  scenario_jobs_net: number;
  jobs_net_delta: number;
};

export type SimulationEnterpriseImpactResponse = {
  sim_run_id: string;
  scenario_id: string;
  total: number;
  impacts: SimulationEnterpriseImpactItem[];
};

export type SimulationComparisonSummary = {
  high_risk_count: number;
  total_revenue: number;
  total_jobs_net: number;
};

export type SimulationComparisonTopMover = {
  enterprise_id: string;
  revenue_delta_change: number;
  jobs_net_delta_change: number;
  run_a_risk_label: string | null;
  run_b_risk_label: string | null;
};

export type SimulationComparisonResponse = {
  scenario_id: string;
  run_a_id: string;
  run_b_id: string;
  run_a: SimulationComparisonSummary;
  run_b: SimulationComparisonSummary;
  delta: SimulationComparisonSummary;
  top_movers: SimulationComparisonTopMover[];
};

export type ModelCard = {
  key: string;
  name: string;
  version: string;
  horizon: string;
  algorithm: string;
  metrics: Record<string, string>;
  fairnessSlices: { slice: string; value: string }[];
  notes: string[];
};

export type DataQualityContract = {
  name: string;
  dataset: string;
  scope: string;
  sla: { completeness: string; timeliness: string; lineage: string };
  status: "Pass" | "Warn" | "Fail";
  lastRun: string;
};

export type AuditEvent = {
  time: string;
  actor: string;
  role: Role;
  action: string;
  resource: string;
  outcome: "Success" | "Denied" | "Error";
};
