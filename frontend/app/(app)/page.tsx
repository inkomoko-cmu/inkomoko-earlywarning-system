"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Sparkles, TrendingUp, AlertTriangle, ShieldCheck, RefreshCw,
  Globe2, Building2, CircleAlert, ArrowDownRight, ArrowUpRight,
  Sigma, Target, Radar, Layers3, Activity,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ErrorCard } from "@/components/ui/ErrorCard";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { type AiInsight, clampConfidence, trendDirection } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import {
  normalizePortfolioOverview,
  type PortfolioOverview,
  type RiskDistributionItem,
  type TrendsResponse,
  type CountryComparisonItem,
  type SectorRiskSummaryItem,
  type AnomalySignalItem,
  type EnterpriseProfileItem,
  type PortfolioCompositionResponse,
  type RiskMigrationItem,
  type PerformanceDistributionItem,
  type CorrelationDriverItem,
  type QualityOpsItem,
} from "@/lib/portfolio";
import {
  ResponsiveContainer,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
  AreaChart,
  Area,
  LineChart,
  Line,
} from "recharts";

type DashboardData = {
  overview: PortfolioOverview;
  risk: RiskDistributionItem[];
  trends: TrendsResponse;
  countries: CountryComparisonItem[];
  sectors: SectorRiskSummaryItem[];
  anomalies: AnomalySignalItem[];
  enterprises: EnterpriseProfileItem[];
  composition: PortfolioCompositionResponse;
  migration: RiskMigrationItem[];
  performance: PerformanceDistributionItem[];
  correlations: CorrelationDriverItem[];
  quality: QualityOpsItem[];
};

type TabKey = "summary" | "risk" | "performance" | "quality";

const TABS: Array<{ key: TabKey; label: string; description: string }> = [
  { key: "summary", label: "Summary", description: "Executive panorama" },
  { key: "risk", label: "Risk", description: "Migration and concentration" },
  { key: "performance", label: "Performance", description: "Distribution and drivers" },
  { key: "quality", label: "Quality", description: "Data and operations health" },
];

const RISK_COLORS: Record<string, string> = {
  LOW: "#1f8f5a",
  MEDIUM: "#e0911a",
  HIGH: "#cd3b3b",
  Unknown: "#6b7280",
};

const MONTH_OPTIONS = [3, 6, 12, 24];

export default function OverviewPage() {
  const { session } = useAuth();

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [months, setMonths] = useState(12);
  const [activeTab, setActiveTab] = useState<TabKey>("summary");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadOverview = async (monthsBack = months) => {
    try {
      setLoading(true);
      setApiError(null);

      const [overviewRaw, risk, trends, countries, sectors, anomalies, enterprises, composition, migration, performance, correlations, quality] = await Promise.all([
        apiFetch<PortfolioOverview>("/portfolio/overview", { method: "GET" }, true),
        apiFetch<RiskDistributionItem[]>("/portfolio/risk-distribution", { method: "GET" }, true),
        apiFetch<TrendsResponse>(`/portfolio/trends?months=${monthsBack}`, { method: "GET" }, true),
        apiFetch<CountryComparisonItem[]>("/portfolio/country-comparison", { method: "GET" }, true),
        apiFetch<SectorRiskSummaryItem[]>("/portfolio/sector-risk-summary?limit=12", { method: "GET" }, true),
        apiFetch<AnomalySignalItem[]>("/portfolio/anomaly-signals", { method: "GET" }, true),
        apiFetch<EnterpriseProfileItem[]>("/portfolio/enterprises", { method: "GET" }, true),
        apiFetch<PortfolioCompositionResponse>("/portfolio/composition", { method: "GET" }, true),
        apiFetch<RiskMigrationItem[]>("/portfolio/risk-migration", { method: "GET" }, true),
        apiFetch<PerformanceDistributionItem[]>("/portfolio/performance-distribution", { method: "GET" }, true),
        apiFetch<CorrelationDriverItem[]>("/portfolio/correlation-drivers", { method: "GET" }, true),
        apiFetch<QualityOpsItem[]>("/portfolio/quality-ops", { method: "GET" }, true),
      ]);

      setDashboard({
        overview: normalizePortfolioOverview(overviewRaw),
        risk: risk || [],
        trends: trends || { revenue: [], jobs_created: [] },
        countries: countries || [],
        sectors: sectors || [],
        anomalies: anomalies || [],
        enterprises: enterprises || [],
        composition: composition || { sectors: [], countries: [], risk_tiers: [] },
        migration: migration || [],
        performance: performance || [],
        correlations: correlations || [],
        quality: quality || [],
      });
    } catch (e: any) {
      setApiError(e?.message ?? "Failed to load overview data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview(months);
  }, [months]);

  const overview = dashboard?.overview;

  const concentration = useMemo(() => {
    const sectors = dashboard?.sectors || [];
    const total = sectors.reduce((acc, s) => acc + (s.enterprise_count || 0), 0);
    if (!total) return { hhi: 0, top3: 0 };

    const shares = sectors.map((s) => (s.enterprise_count || 0) / total);
    const hhi = shares.reduce((acc, share) => acc + share * share, 0) * 10000;
    const top3 = sectors
      .slice()
      .sort((a, b) => b.enterprise_count - a.enterprise_count)
      .slice(0, 3)
      .reduce((acc, s) => acc + s.enterprise_count, 0) / total * 100;
    return { hhi, top3 };
  }, [dashboard?.sectors]);

  const scatterData = useMemo(() => {
    return (dashboard?.enterprises || []).slice(0, 700).map((e) => ({
      id: e.unique_id,
      x: Number(e.risk_score_3m || 0),
      y: Number(e.revenue_3m || 0),
      z: Math.max(1, Number(e.jobs_created_3m || 0) + Number(e.jobs_lost_3m || 0)),
      sector: e.business_sector || "Unknown",
      tier: e.risk_tier_3m || "Unknown",
    }));
  }, [dashboard?.enterprises]);

  const topCountries = (dashboard?.countries || []).slice(0, 8);
  const topSectors = (dashboard?.sectors || []).slice(0, 8);
  const qualityMax = useMemo(() => {
    const values = dashboard?.quality || [];
    if (!values.length) return 0;
    return Math.max(...values.map((row) => Math.max(row.value, row.threshold)));
  }, [dashboard?.quality]);

  const aiInsights = useMemo<AiInsight[]>(() => {
    const anomalyCount = dashboard?.anomalies?.length || 0;
    const highRiskShare = overview
      ? (overview.high_risk_count / Math.max(1, overview.high_risk_count + overview.medium_risk_count + overview.low_risk_count)) * 100
      : 0;
    const direction = trendDirection(overview?.revenue_delta_pct || 0);
    const coverageConfidence = clampConfidence(
      45 +
      Math.min(20, (dashboard?.countries?.length || 0) * 3) +
      Math.min(20, (dashboard?.sectors?.length || 0) * 2) +
      Math.min(10, (dashboard?.trends?.revenue?.length || 0))
    );

    return [
      {
        id: "portfolio-posture",
        title: "Portfolio posture",
        narrative: `High-risk share is ${highRiskShare.toFixed(1)}% with concentration index ${concentration.hhi.toFixed(0)} and top-3 exposure ${concentration.top3.toFixed(1)}%.`,
        confidence: coverageConfidence,
        tone: highRiskShare >= 35 || concentration.top3 >= 55 ? "warning" : "success",
        evidence: [
          `High risk enterprises: ${overview?.high_risk_count ?? 0}`,
          `Top-3 sector exposure: ${concentration.top3.toFixed(1)}%`,
        ],
        actions: ["Review country and sector outliers in Risk tab."],
      },
      {
        id: "momentum-signal",
        title: "Momentum signal",
        narrative: `Revenue trend is ${direction} with delta ${overview?.revenue_delta_pct?.toFixed(1) ?? "0.0"}% versus prior month, while net jobs are ${((overview?.total_jobs_created_3m || 0) - (overview?.total_jobs_lost_3m || 0)).toLocaleString()}.`,
        confidence: clampConfidence(55 + Math.min(30, (dashboard?.trends?.revenue?.length || 0) * 2)),
        tone: direction === "down" ? "warning" : "success",
        evidence: [
          `Revenue points: ${dashboard?.trends?.revenue?.length || 0}`,
          `Jobs trend points: ${dashboard?.trends?.jobs_created?.length || 0}`,
        ],
        actions: ["Prioritize support for segments with falling revenue and elevated risk."],
      },
      {
        id: "anomaly-watch",
        title: "Anomaly watch",
        narrative: anomalyCount > 0
          ? `${anomalyCount} active anomaly signals detected across threshold monitors.`
          : "No active anomaly thresholds breached for the selected window.",
        confidence: clampConfidence(65 + Math.min(20, anomalyCount * 3)),
        tone: anomalyCount >= 4 ? "danger" : anomalyCount > 0 ? "warning" : "success",
        evidence: [
          `Anomaly count: ${anomalyCount}`,
          `PAR30: ${overview?.par30_pct?.toFixed(1) ?? "0.0"}%`,
        ],
        actions: ["Use the anomaly rail to inspect highest-severity signals first."],
      },
    ];
  }, [dashboard, overview, concentration.hhi, concentration.top3]);

  const aiContext = useMemo(
    () => ({
      months,
      overview,
      concentration,
      anomalies: dashboard?.anomalies || [],
      trends: dashboard?.trends || { revenue: [], jobs_created: [] },
    }),
    [months, overview, concentration, dashboard?.anomalies, dashboard?.trends]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "overview",
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  const exportImpactOverview = () => {
    if (!overview || !dashboard) return;
    const rows = [
      { Metric: "Total Loans", Value: overview.total_loans },
      { Metric: "Total Disbursed", Value: overview.total_disbursed },
      { Metric: "Total Outstanding", Value: overview.total_outstanding },
      { Metric: "Average Days in Arrears", Value: overview.avg_days_in_arrears },
      { Metric: "PAR30 Amount", Value: overview.par30_amount },
      { Metric: "Jobs Created (3M)", Value: overview.total_jobs_created_3m },
      { Metric: "Jobs Lost (3M)", Value: overview.total_jobs_lost_3m },
      { Metric: "Average Revenue (3M)", Value: overview.avg_revenue_3m },
      { Metric: "NPS Promoters", Value: overview.nps_promoter_pct },
      { Metric: "NPS Detractors", Value: overview.nps_detractor_pct },
      { Metric: "Concentration HHI", Value: concentration.hhi.toFixed(0) },
      { Metric: "Top-3 Sector Exposure", Value: `${concentration.top3.toFixed(1)}%` },
      { Metric: "Anomaly Signals", Value: dashboard.anomalies.length },
    ];
    exportPDF("Impact_Overview", "Impact & Early Warning — Overview Summary", rows);
  };

  const exportKpis = (format: "csv" | "xlsx" | "pdf") => {
    if (!overview) return;
    const rows = [
      { KPI: "Total Loans", Value: overview.total_loans },
      { KPI: "Total Disbursed", Value: formatMoney(overview.total_disbursed) },
      { KPI: "Total Outstanding", Value: formatMoney(overview.total_outstanding) },
      { KPI: "PAR30 Amount", Value: formatMoney(overview.par30_amount) },
      { KPI: "Avg Days in Arrears", Value: overview.avg_days_in_arrears?.toFixed(2) ?? "—" },
      { KPI: "Jobs Created (3M)", Value: overview.total_jobs_created_3m },
      { KPI: "Jobs Lost (3M)", Value: overview.total_jobs_lost_3m },
      { KPI: "Avg Revenue (3M)", Value: formatMoney(overview.avg_revenue_3m) },
      { KPI: "NPS Promoters", Value: overview.nps_promoter_pct },
      { KPI: "NPS Detractors", Value: overview.nps_detractor_pct },
      { KPI: "Concentration HHI", Value: concentration.hhi.toFixed(0) },
      { KPI: "Top-3 Sector Exposure", Value: `${concentration.top3.toFixed(1)}%` },
    ];
    if (format === "csv") exportCSV("KPI_Snapshot", rows);
    if (format === "xlsx") exportExcel("KPI_Snapshot", rows, "KPIs");
    if (format === "pdf") exportPDF("KPI_Snapshot", "KPI Snapshot", rows);
  };

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-gradient-to-br from-inkomoko-blue via-[#1d4a83] to-[#062748] text-white p-8 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-start gap-6">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-2">
              Executive Intelligence Console
            </p>
            <h1 className="text-3xl font-bold mb-2 tracking-tight">Portfolio Overview</h1>
            <p className="text-blue-100 text-sm max-w-xl leading-relaxed">
              High-density analytics across risk, exposure, concentration, and forecast uncertainty to support weekly steering decisions.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: <ShieldCheck size={12} />, label: "Role-scoped intelligence" },
                { icon: <Sparkles size={12} />, label: "Anomaly-first triage" },
                { icon: <TrendingUp size={12} />, label: "Confidence-aware trends" },
                { icon: <AlertTriangle size={12} />, label: "Sector concentration" },
              ].map(({ icon, label }) => (
                <span
                  key={label}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                >
                  {icon} {label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <p className="text-xs text-blue-300">
              Signed in as{" "}
              <span className="font-semibold text-white">{session?.role}</span>
            </p>
            <div className="flex gap-2 flex-wrap xl:justify-end">
              {MONTH_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMonths(m)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    months === m
                      ? "border-white/30 bg-white text-inkomoko-blue"
                      : "border-white/20 bg-white/10 text-white hover:bg-white/20"
                  }`}
                >
                  {m}M Window
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {([
                { label: "KPI PDF",   fn: () => exportKpis("pdf") },
                { label: "KPI Excel", fn: () => exportKpis("xlsx") },
                { label: "KPI CSV",   fn: () => exportKpis("csv") },
              ] as { label: string; fn: () => void }[]).map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={fn}
                  disabled={!overview}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 xl:justify-end">
              <button
                onClick={() => loadOverview(months)}
                disabled={loading}
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40 flex items-center gap-1"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={exportImpactOverview}
                disabled={!overview}
                className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-inkomoko-blue shadow-sm transition-colors hover:bg-blue-50 disabled:opacity-40"
              >
                Export Overview PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ────────────────────────────────────────────────────── */}
      {apiError && (
        <ErrorCard
          title="Failed to load overview"
          message={apiError}
          variant="error"
          onDismiss={() => setApiError(null)}
          onRetry={loadOverview}
        />
      )}

      <InsightPanel
        title="AI Insights"
        subtitle="Executive narrative generated from currently visible portfolio analytics."
        status={liveAi.status}
        lastUpdated={liveAi.lastUpdated}
        insights={liveAi.insights}
      />

      <div>
        <SectionLabel title="KPI Command Strip" accent="bg-inkomoko-blue" />
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <KpiCommandCard label="Loans" value={overview?.total_loans?.toLocaleString() ?? "—"} sub="Active credit lines" loading={loading} />
          <KpiCommandCard label="Outstanding" value={compactMoney(Number(overview?.total_outstanding || 0))} sub="Current exposure" loading={loading} />
          <KpiCommandCard label="PAR30" value={`${overview?.par30_pct?.toFixed(1) ?? "0.0"}%`} sub="Portfolio at risk" loading={loading} tone="warning" />
          <KpiCommandCard label="Revenue 3M" value={compactMoney(Number(overview?.avg_revenue_3m || 0))} sub={trendText(overview?.revenue_delta_pct)} loading={loading} tone={overview && overview.revenue_delta_pct >= 0 ? "success" : "danger"} />
          <KpiCommandCard label="Net Jobs" value={(((overview?.total_jobs_created_3m || 0) - (overview?.total_jobs_lost_3m || 0)).toLocaleString())} sub="Created - lost" loading={loading} />
          <KpiCommandCard label="High Risk" value={overview?.high_risk_count?.toLocaleString() ?? "—"} sub={`Trend ${overview?.risk_trend ?? "stable"}`} loading={loading} tone={overview?.risk_trend === "degrading" ? "danger" : "neutral"} />
          <KpiCommandCard label="HHI" value={concentration.hhi.toFixed(0)} sub="Sector concentration" loading={loading} tone={concentration.hhi > 1800 ? "warning" : "success"} />
          <KpiCommandCard label="Top-3 Exposure" value={`${concentration.top3.toFixed(1)}%`} sub="Largest sectors" loading={loading} tone={concentration.top3 > 55 ? "warning" : "neutral"} />
        </div>
      </div>

      <div className="rounded-2xl border border-inkomoko-border bg-white p-2">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                activeTab === tab.key
                  ? "border-inkomoko-blue bg-blue-50 text-inkomoko-blue"
                  : "border-inkomoko-border bg-white text-inkomoko-muted hover:bg-inkomoko-bg"
              }`}
            >
              <div className="text-sm font-semibold">{tab.label}</div>
              <div className="text-[11px] leading-tight">{tab.description}</div>
            </button>
          ))}
        </div>
      </div>

      {activeTab === "summary" && (
      <>
      <div>
        <SectionLabel title="Anomaly Rail" accent="bg-red-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
          {(dashboard?.anomalies || []).slice(0, 6).map((signal) => (
            <Card key={signal.id} className="border-l-4 border-l-red-500/70">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{signal.title}</CardTitle>
                  <Badge tone={signal.severity === "high" ? "danger" : signal.severity === "medium" ? "warning" : "neutral"}>
                    {signal.severity}
                  </Badge>
                </div>
                <CardDescription className="text-xs">{signal.detail}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex items-center justify-between text-xs text-inkomoko-muted">
                <span>{signal.metric}</span>
                <span>{signal.value.toFixed(1)} / {signal.threshold.toFixed(1)}</span>
              </CardContent>
            </Card>
          ))}
          {!loading && (dashboard?.anomalies || []).length === 0 && (
            <Card className="xl:col-span-3">
              <CardContent className="py-8 text-sm text-inkomoko-muted flex items-center gap-2">
                <CircleAlert size={16} /> No active anomaly signals for the selected window.
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div>
        <SectionLabel title="Segment Intelligence" accent="bg-emerald-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Globe2 size={16} /> Country Leaderboard</CardTitle>
              <CardDescription>Risk and exposure comparison across scoped countries.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topCountries.map((c) => (
                  <div key={c.country_code} className="rounded-xl border border-inkomoko-border p-3">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{c.country_code}</div>
                      <Badge tone={c.high_risk_pct >= 35 ? "danger" : c.high_risk_pct >= 20 ? "warning" : "success"}>
                        Risk {c.high_risk_pct.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-inkomoko-muted grid grid-cols-2 gap-2">
                      <span>Outstanding: {formatMoney(c.total_outstanding)}</span>
                      <span>PAR30: {c.par30_pct.toFixed(1)}%</span>
                      <span>Loans: {c.loans.toLocaleString()}</span>
                      <span>Net jobs: {c.net_jobs_3m.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Target size={16} /> Risk-to-Revenue Quadrant</CardTitle>
              <CardDescription>Each point is an enterprise: x = risk score, y = revenue 3M, bubble = jobs activity.</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              {loading ? (
                <div className="text-sm text-inkomoko-muted">Loading scatter...</div>
              ) : scatterData.length === 0 ? (
                <div className="text-sm text-inkomoko-muted">No enterprise points available.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 12, right: 16, bottom: 24, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" dataKey="x" name="Risk" domain={[0, 1]} tickFormatter={(v) => Number(v).toFixed(2)} />
                    <YAxis type="number" dataKey="y" name="Revenue" tickFormatter={(v) => compactMoney(Number(v))} />
                    <ZAxis type="number" dataKey="z" range={[40, 360]} />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(value: any, key) => {
                      if (key === "y") return formatMoney(Number(value));
                      if (key === "x") return Number(value).toFixed(3);
                      return value;
                    }} />
                    {Object.keys(RISK_COLORS).map((tier) => (
                      <Scatter
                        key={tier}
                        name={tier}
                        data={scatterData.filter((p) => p.tier === tier)}
                        fill={RISK_COLORS[tier]}
                        fillOpacity={0.72}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <SectionLabel title="Momentum" accent="bg-cyan-500" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity size={16} /> Jobs Trajectory</CardTitle>
            <CardDescription>Jobs created trajectory with a light confidence envelope.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dashboard?.trends?.jobs_created || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="upper_ci" stroke="#6eaad9" strokeOpacity={0.4} dot={false} />
                <Line type="monotone" dataKey="value" stroke="#1f77b4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="lower_ci" stroke="#6eaad9" strokeOpacity={0.4} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div>
        <SectionLabel title="Forecast & Uncertainty" accent="bg-orange-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Radar size={16} /> Revenue Confidence Envelope</CardTitle>
              <CardDescription>Mean revenue trend with confidence envelope over the selected window.</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              {loading ? (
                <div className="text-sm text-inkomoko-muted">Loading trend...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dashboard?.trends?.revenue || []}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis tickFormatter={(v) => compactMoney(Number(v))} />
                    <Tooltip formatter={(v: any) => formatMoney(Number(v))} />
                    <Area type="monotone" dataKey="upper_ci" stroke="#e0911a" fill="#f5d59c" fillOpacity={0.45} isAnimationActive={false} />
                    <Area type="monotone" dataKey="value" stroke="#d97706" fill="#f59e0b" fillOpacity={0.2} />
                    <Area type="monotone" dataKey="lower_ci" stroke="#e0911a" fill="#f5d59c" fillOpacity={0.45} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Sigma size={16} /> Sector Risk Matrix</CardTitle>
              <CardDescription>Top sectors by enterprise volume with risk splits.</CardDescription>
            </CardHeader>
            <CardContent className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSectors.slice(0, 6)} layout="vertical" margin={{ left: 10, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="sector" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="high_risk_count" stackId="risk" fill="#cd3b3b" />
                  <Bar dataKey="medium_risk_count" stackId="risk" fill="#e0911a" />
                  <Bar dataKey="low_risk_count" stackId="risk" fill="#1f8f5a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <SectionLabel title="Executive Brief" accent="bg-violet-500" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NarrativeCard
            icon={<Building2 size={20} />}
            accent="border-l-inkomoko-blue bg-blue-50/30"
            iconStyle="bg-blue-50 text-inkomoko-blue"
            title="Concentration posture"
            body={`Portfolio concentration index is ${concentration.hhi.toFixed(0)} with top-3 sector exposure at ${concentration.top3.toFixed(1)}%. Prioritize diversification where exposure exceeds internal risk appetite.`}
          />
          <NarrativeCard
            icon={<ArrowUpRight size={20} />}
            accent="border-l-emerald-500 bg-emerald-50/30"
            iconStyle="bg-emerald-50 text-emerald-700"
            title="Risk-return frontier"
            body="Quadrant analysis highlights enterprises with high revenue and elevated risk scores. Focus advisory cycles on the upper-right quadrant to protect both growth and repayment quality."
          />
          <NarrativeCard
            icon={<ArrowDownRight size={20} />}
            accent="border-l-amber-500 bg-amber-50/30"
            iconStyle="bg-amber-50 text-amber-700"
            title="Confidence and caution"
            body="Uncertainty bands are included for every trend line. Low-sample months should be interpreted cautiously and paired with country-level operational context before decisions."
          />
        </div>
      </div>
      </>
      )}

      {activeTab === "risk" && (
      <>
      <div>
        <SectionLabel title="Risk Composition" accent="bg-red-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers3 size={16} /> Risk Tier Share</CardTitle>
              <CardDescription>Portfolio distribution across latest risk tiers.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dashboard?.composition?.risk_tiers || []}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={(entry) => `${entry.label}: ${entry.pct.toFixed(1)}%`}
                  >
                    {(dashboard?.composition?.risk_tiers || []).map((item) => (
                      <Cell key={item.label} fill={RISK_COLORS[item.label] || RISK_COLORS.Unknown} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><TrendingUp size={16} /> Risk Migration</CardTitle>
              <CardDescription>Latest vs previous survey movement by country.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(dashboard?.migration || []).slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="country_code" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="upshift_count" stackId="migration" fill="#cd3b3b" />
                  <Bar dataKey="stable_count" stackId="migration" fill="#6b7280" />
                  <Bar dataKey="downshift_count" stackId="migration" fill="#1f8f5a" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <SectionLabel title="Risk Alerts" accent="bg-orange-500" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>High-Risk Share by Country</CardTitle>
              <CardDescription>Countries with elevated share of high-risk enterprises.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={(dashboard?.migration || []).slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis type="category" dataKey="country_code" width={70} />
                  <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                  <Bar dataKey="high_risk_share_pct" fill="#d97706" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Signal Feed</CardTitle>
              <CardDescription>Anomaly rail focused on active risk thresholds.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
                {(dashboard?.anomalies || []).map((signal) => (
                  <div key={signal.id} className="rounded-lg border border-inkomoko-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold leading-snug">{signal.title}</p>
                      <Badge tone={signal.severity === "high" ? "danger" : signal.severity === "medium" ? "warning" : "neutral"}>
                        {signal.severity}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-inkomoko-muted">{signal.detail}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      </>
      )}

      {activeTab === "performance" && (
      <>
      <div>
        <SectionLabel title="Performance Distribution" accent="bg-emerald-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 size={16} /> Revenue Bucket Dynamics</CardTitle>
              <CardDescription>Enterprise volume and net jobs by revenue segment.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboard?.performance || []}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="bucket" />
                  <YAxis yAxisId="left" />
                  <YAxis yAxisId="right" orientation="right" />
                  <Tooltip />
                  <Bar yAxisId="left" dataKey="count" fill="#1f77b4" />
                  <Bar yAxisId="right" dataKey="net_jobs_3m" fill="#2ca02c" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers3 size={16} /> Sector Share</CardTitle>
              <CardDescription>Top sector concentration by enterprise count.</CardDescription>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={(dashboard?.composition?.sectors || []).slice(0, 8)}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={92}
                    label={(entry) => `${entry.pct.toFixed(1)}%`}
                  >
                    {(dashboard?.composition?.sectors || []).slice(0, 8).map((item, idx) => (
                      <Cell key={item.label} fill={["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#17becf", "#8c564b", "#bcbd22", "#7f7f7f"][idx % 8]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <SectionLabel title="Correlation Drivers" accent="bg-cyan-600" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sigma size={16} /> Correlation Driver Matrix</CardTitle>
            <CardDescription>Strength and direction of key statistical relationships.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard?.correlations || []} layout="vertical" margin={{ left: 120, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[-1, 1]} />
                <YAxis type="category" dataKey="driver" width={150} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => Number(v).toFixed(3)} />
                <Bar
                  dataKey="correlation"
                  fill="#1d4a83"
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      </>
      )}

      {activeTab === "quality" && (
      <>
      <div>
        <SectionLabel title="Quality Operations" accent="bg-violet-500" />
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {(dashboard?.quality || []).map((metric) => (
            <Card key={metric.metric} className="xl:col-span-1">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm leading-snug">{metric.metric}</CardTitle>
                  <Badge tone={qualityTone(metric.status)}>{metric.status}</Badge>
                </div>
                <CardDescription className="text-xs">{metric.note}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-inkomoko-text">{metric.value.toFixed(1)}%</div>
                <div className="mt-1 text-xs text-inkomoko-muted">Threshold {metric.threshold.toFixed(1)}%</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel title="Threshold Comparison" accent="bg-amber-500" />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle size={16} /> Value vs Threshold</CardTitle>
            <CardDescription>Metric values benchmarked against configured thresholds.</CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dashboard?.quality || []} margin={{ left: 120, right: 18, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="metric" hide />
                <YAxis domain={[0, Math.max(10, Math.ceil(qualityMax / 5) * 5)]} />
                <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="value" fill="#1f77b4" />
                <Bar dataKey="threshold" fill="#d97706" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      </>
      )}
    </div>
  );
}

function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Section label ──────────────────────────────────────────────────────────
function SectionLabel({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`h-4 w-1 rounded-full ${accent}`} />
      <h2 className="text-xs font-bold uppercase tracking-widest text-inkomoko-muted">{title}</h2>
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────
type StatColor = "blue" | "green" | "red" | "amber";

function KpiCommandCard({
  label,
  value,
  sub,
  loading,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
  tone?: "neutral" | "warning" | "success" | "danger";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wider">{label}</CardDescription>
        <CardTitle className="text-xl leading-tight break-words">
          {loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-inkomoko-bg" /> : value}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Badge tone={tone} className="text-[11px]">{sub}</Badge>
      </CardContent>
    </Card>
  );
}

function StatCard({
  label, value, icon, color, loading,
}: {
  label: string;
  value: string | undefined;
  icon: ReactNode;
  color: StatColor;
  loading?: boolean;
}) {
  const iconStyle: Record<StatColor, string> = {
    blue:  "bg-blue-50 text-inkomoko-blue",
    green: "bg-emerald-50 text-emerald-700",
    red:   "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4 transition-shadow hover:shadow-card">
      <div className={`mb-3 w-fit rounded-lg p-2 ${iconStyle[color]}`}>{icon}</div>
      {loading ? (
        <div className="mb-1 h-6 w-2/3 animate-pulse rounded bg-inkomoko-bg" />
      ) : (
        <div className="text-xl font-bold text-inkomoko-text">{value ?? "—"}</div>
      )}
      <div className="mt-1 text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
    </div>
  );
}

function trendText(value?: number) {
  const delta = Number(value || 0);
  const prefix = delta >= 0 ? "+" : "";
  return `${prefix}${delta.toFixed(1)}% vs prior month`;
}

function compactMoney(value: number) {
  if (!Number.isFinite(value)) return "$0";
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function qualityTone(status: string): "danger" | "warning" | "success" | "neutral" {
  if (status === "breach") return "danger";
  if (status === "watch") return "warning";
  if (status === "ok") return "success";
  return "neutral";
}

// ── Narrative card ─────────────────────────────────────────────────────────
function NarrativeCard({
  icon, title, body, accent, iconStyle,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  accent: string;
  iconStyle: string;
}) {
  return (
    <div className={`rounded-2xl border border-l-4 border-inkomoko-border bg-white p-5 ${accent}`}>
      <div className={`mb-3 w-fit rounded-lg p-2 ${iconStyle}`}>{icon}</div>
      <div className="mb-2 text-sm font-semibold text-inkomoko-text">{title}</div>
      <div className="text-sm leading-relaxed text-inkomoko-muted">{body}</div>
    </div>
  );
}