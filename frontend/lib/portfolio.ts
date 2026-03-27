export type PortfolioOverview = {
  total_loans: number;
  total_disbursed: number;
  total_outstanding: number;
  avg_days_in_arrears: number;
  par30_pct: number;
  par30_amount: number;
  defaulted_count: number;
  closed_count: number;
  active_count: number;
  avg_revenue_3m: number;
  total_jobs_created_3m: number;
  total_jobs_lost_3m: number;
  nps_promoter_pct: number;
  nps_detractor_pct: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  revenue_delta_pct: number;
  risk_trend: string;
};

export type RiskDistributionItem = {
  label?: string;
  name?: string;
  count?: number;
  value: number;
  pct: number;
};

export type TrendPoint = {
  month: string;
  value: number;
  upper_ci: number;
  lower_ci: number;
  n?: number;
};

export type TrendsResponse = {
  revenue: TrendPoint[];
  jobs_created: TrendPoint[];
};

export type CountryComparisonItem = {
  country_code: string;
  high_risk_pct: number;
  total_outstanding: number;
  par30_pct: number;
  loans: number;
  net_jobs_3m: number;
};

export type SectorRiskSummaryItem = {
  sector: string;
  enterprise_count: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
};

export type AnomalySignalItem = {
  id: string;
  title: string;
  detail: string;
  metric: string;
  value: number;
  threshold: number;
  severity: "low" | "medium" | "high";
};

export type EnterpriseProfileItem = {
  unique_id: string;
  country_code: string | null;
  business_sector: string | null;
  risk_tier_3m: string | null;
  risk_score_3m: number;
  revenue_3m: number;
  jobs_created_3m: number;
  jobs_lost_3m: number;
};

export type CompositionSlice = {
  label: string;
  count: number;
  pct: number;
};

export type PortfolioCompositionResponse = {
  sectors: CompositionSlice[];
  countries: CompositionSlice[];
  risk_tiers: CompositionSlice[];
};

export type RiskMigrationItem = {
  country_code: string;
  upshift_count: number;
  stable_count: number;
  downshift_count: number;
  high_risk_share_pct: number;
};

export type PerformanceDistributionItem = {
  bucket: string;
  count: number;
  net_jobs_3m: number;
};

export type CorrelationDriverItem = {
  driver: string;
  correlation: number;
};

export type QualityOpsItem = {
  metric: string;
  value: number;
  threshold: number;
  status: string;
  note: string;
};

type LegacyOverview = Partial<PortfolioOverview> & {
  jobs_created_3m?: number;
  jobs_lost_3m?: number;
  total_active_enterprises?: number;
  total_revenue_forecasted_3m?: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function normalizePortfolioOverview(raw: LegacyOverview | null | undefined): PortfolioOverview {
  const base = raw ?? {};

  const totalJobsCreated = num(base.total_jobs_created_3m ?? base.jobs_created_3m);
  const totalJobsLost = num(base.total_jobs_lost_3m ?? base.jobs_lost_3m);

  return {
    total_loans: num(base.total_loans),
    total_disbursed: num(base.total_disbursed),
    total_outstanding: num(base.total_outstanding),
    avg_days_in_arrears: num(base.avg_days_in_arrears),
    par30_pct: num(base.par30_pct),
    par30_amount: num(base.par30_amount),
    defaulted_count: num(base.defaulted_count),
    closed_count: num(base.closed_count),
    active_count: num(base.active_count),
    avg_revenue_3m: num(base.avg_revenue_3m ?? base.total_revenue_forecasted_3m),
    total_jobs_created_3m: totalJobsCreated,
    total_jobs_lost_3m: totalJobsLost,
    nps_promoter_pct: num(base.nps_promoter_pct),
    nps_detractor_pct: num(base.nps_detractor_pct),
    high_risk_count: num(base.high_risk_count),
    medium_risk_count: num(base.medium_risk_count),
    low_risk_count: num(base.low_risk_count),
    revenue_delta_pct: num(base.revenue_delta_pct),
    risk_trend: String(base.risk_trend ?? "stable"),
  };
}
