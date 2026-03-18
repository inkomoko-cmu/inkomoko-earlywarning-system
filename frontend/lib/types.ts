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
