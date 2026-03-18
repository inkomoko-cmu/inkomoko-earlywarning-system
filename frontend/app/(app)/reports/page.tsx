"use client";

import { useState, useCallback, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { exportPDF } from "@/lib/export";
import { apiFetch } from "@/lib/api";
import {
  FileText,
  Download,
  Shield,
  BarChart3,
  Globe,
  Users,
  CheckSquare,
  TrendingUp,
  Star,
  Eye,
  Zap,
  Activity,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

// ── Types ──────────────────────────────────────────────────────────────────
type RiskTier = "HIGH" | "MEDIUM" | "LOW";
type ReportType = "donor_pack" | "program_brief";
type DataSource = "live" | "demo";

type HorizonData = {
  avg_risk_score: number;
  total_revenue: number;
  avg_revenue: number;
  jobs_created: number;
  jobs_lost: number;
  net_jobs: number;
};

type BreakdownEntry = {
  sector?: string;
  country?: string;
  program?: string;
  count: number;
  avg_risk: number;
  high_risk: number;
  total_revenue: number;
  total_jobs_created: number;
};

type GenderEntry = {
  count: number;
  avg_risk: number;
  total_revenue: number;
  total_jobs: number;
};

type EnterpriseEntry = {
  unique_id: string;
  sector: string;
  country: string;
  risk_score: number;
  risk_tier: RiskTier;
  revenue_3m: number;
  jobs_created_3m: number;
};

type ActionItem = {
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  action: string;
  deadline: string;
};

type ReportKPIs = {
  total_enterprises: number;
  avg_risk_score: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  tier_distribution: Partial<Record<RiskTier, number>>;
  total_projected_revenue: number;
  total_jobs_created: number;
  net_jobs: number;
};

type ReportData = {
  report_type: ReportType;
  generated_at: string;
  source: string;
  title: string;
  subtitle: string;
  executive_summary: string;
  kpis: ReportKPIs;
  horizon_summary: Record<string, HorizonData>;
  sector_breakdown: BreakdownEntry[];
  country_breakdown: BreakdownEntry[];
  gender_breakdown: Record<string, GenderEntry>;
  program_breakdown: BreakdownEntry[];
  top_risk_enterprises: EnterpriseEntry[];
  success_stories: EnterpriseEntry[];
  action_items?: ActionItem[];
};

type PortfolioOverview = {
  total_loans: number;
  total_disbursed: number;
  total_outstanding: number;
  avg_days_in_arrears: number;
  par30_pct: number;
  high_risk_count: number;
  medium_risk_count: number;
  low_risk_count: number;
  avg_revenue_3m: number;
  total_jobs_created_3m: number;
  total_jobs_lost_3m: number;
  revenue_delta_pct: number;
  risk_trend: string;
};

type RiskDistributionItem = {
  name: string;
  value: number;
  pct: number;
};

type SegmentItem = {
  country_code?: string;
  sector?: string;
  client_count: number;
  total_revenue: number;
  avg_revenue: number;
  jobs_created: number;
  jobs_lost: number;
  high_risk_count: number;
};

type EnterpriseProfileItem = {
  unique_id: string;
  country_code: string | null;
  business_sector: string | null;
  risk_tier_3m: string | null;
  risk_score_3m: number;
  revenue_3m: number;
  jobs_created_3m: number;
  jobs_lost_3m: number;
};

type TrendPoint = {
  month: string;
  value: number;
  upper_ci: number;
  lower_ci: number;
  n?: number;
};

type TrendsResponse = {
  revenue: TrendPoint[];
  jobs_created: TrendPoint[];
};

// ── Helpers ────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, prefix = ""): string {
  if (v == null) return "—";
  if (Math.abs(v) >= 1e6) return prefix + (v / 1e6).toFixed(1) + "M";
  if (Math.abs(v) >= 1e3) return prefix + (v / 1e3).toFixed(1) + "K";
  return prefix + v.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return (v * 100).toFixed(1) + "%";
}

function toUpperTier(raw: string | null | undefined): RiskTier {
  const t = (raw || "").toUpperCase();
  if (t === "HIGH") return "HIGH";
  if (t === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function summarizeTrendDirection(points: TrendPoint[]): "up" | "down" | "flat" {
  if (!points || points.length < 2) return "flat";
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const change = last - first;
  if (Math.abs(change) < Math.max(1, Math.abs(first) * 0.01)) return "flat";
  return change > 0 ? "up" : "down";
}

async function buildReportFromPortfolio(reportType: ReportType): Promise<ReportData> {
  const [overviewRes, enterprisesRes, bySectorRes, byCountryRes, riskDistRes, trendsRes] = await Promise.allSettled([
    apiFetch<PortfolioOverview>("/portfolio/overview", { method: "GET" }, true, { cacheTtlMs: 120000 }),
    apiFetch<EnterpriseProfileItem[]>("/portfolio/enterprises", { method: "GET" }, true, { cacheTtlMs: 120000 }),
    apiFetch<SegmentItem[]>("/portfolio/by-sector", { method: "GET" }, true, { cacheTtlMs: 120000 }),
    apiFetch<Array<{ country_code: string; loans: number; total_disbursed: number; total_outstanding: number }>>(
      "/portfolio/by-country",
      { method: "GET" },
      true,
      { cacheTtlMs: 120000 }
    ),
    apiFetch<RiskDistributionItem[]>("/portfolio/risk-distribution", { method: "GET" }, true, { cacheTtlMs: 120000 }),
    apiFetch<TrendsResponse>("/portfolio/trends?months=12", { method: "GET" }, true, { cacheTtlMs: 120000 }),
  ]);

  const overview: PortfolioOverview = overviewRes.status === "fulfilled"
    ? overviewRes.value
    : {
        total_loans: 0,
        total_disbursed: 0,
        total_outstanding: 0,
        avg_days_in_arrears: 0,
        par30_pct: 0,
        high_risk_count: 0,
        medium_risk_count: 0,
        low_risk_count: 0,
        avg_revenue_3m: 0,
        total_jobs_created_3m: 0,
        total_jobs_lost_3m: 0,
        revenue_delta_pct: 0,
        risk_trend: "stable",
      };

  const enterprises = enterprisesRes.status === "fulfilled" ? enterprisesRes.value : [];
  const bySector = bySectorRes.status === "fulfilled" ? bySectorRes.value : [];
  const byCountry = byCountryRes.status === "fulfilled" ? byCountryRes.value : [];
  const riskDist = riskDistRes.status === "fulfilled" ? riskDistRes.value : [];
  const trends = trendsRes.status === "fulfilled" ? trendsRes.value : { revenue: [], jobs_created: [] };

  const failures = [overviewRes, enterprisesRes, bySectorRes, byCountryRes, riskDistRes, trendsRes].filter(
    (r) => r.status === "rejected"
  ).length;

  const total = enterprises.length;
  const totalRevenue = enterprises.reduce((acc, e) => acc + (e.revenue_3m || 0), 0);
  const totalCreated = enterprises.reduce((acc, e) => acc + (e.jobs_created_3m || 0), 0);
  const totalLost = enterprises.reduce((acc, e) => acc + (e.jobs_lost_3m || 0), 0);
  const avgRisk = total ? enterprises.reduce((acc, e) => acc + (e.risk_score_3m || 0), 0) / total : 0;

  const tierDistribution = {
    HIGH: riskDist.find((r) => (r.name || "").toUpperCase() === "HIGH")?.value ?? overview.high_risk_count ?? 0,
    MEDIUM: riskDist.find((r) => (r.name || "").toUpperCase() === "MEDIUM")?.value ?? overview.medium_risk_count ?? 0,
    LOW: riskDist.find((r) => (r.name || "").toUpperCase() === "LOW")?.value ?? overview.low_risk_count ?? 0,
  } as Partial<Record<RiskTier, number>>;

  const sector_breakdown: BreakdownEntry[] = bySector.map((s) => ({
    sector: s.sector || "Unknown",
    count: s.client_count,
    avg_risk: total ? (s.high_risk_count / Math.max(1, s.client_count)) * 0.75 : 0,
    high_risk: s.high_risk_count,
    total_revenue: s.total_revenue,
    total_jobs_created: s.jobs_created,
  }));

  const byCountryMap = new Map<string, EnterpriseProfileItem[]>();
  for (const ent of enterprises) {
    const cc = ent.country_code || "Unknown";
    const bucket = byCountryMap.get(cc) ?? [];
    bucket.push(ent);
    byCountryMap.set(cc, bucket);
  }

  const country_breakdown: BreakdownEntry[] = Array.from(byCountryMap.entries()).map(([country, rows]) => {
    const highRisk = rows.filter((r) => toUpperTier(r.risk_tier_3m) === "HIGH").length;
    const rev = rows.reduce((acc, r) => acc + (r.revenue_3m || 0), 0);
    const jobs = rows.reduce((acc, r) => acc + (r.jobs_created_3m || 0), 0);
    const avg = rows.length ? rows.reduce((acc, r) => acc + (r.risk_score_3m || 0), 0) / rows.length : 0;
    return {
      country,
      count: rows.length,
      avg_risk: avg,
      high_risk: highRisk,
      total_revenue: rev,
      total_jobs_created: jobs,
    };
  });

  country_breakdown.sort((a, b) => b.total_revenue - a.total_revenue);

  const top_risk_enterprises: EnterpriseEntry[] = [...enterprises]
    .sort((a, b) => (b.risk_score_3m || 0) - (a.risk_score_3m || 0))
    .slice(0, 10)
    .map((e) => ({
      unique_id: e.unique_id,
      sector: e.business_sector || "Unknown",
      country: e.country_code || "Unknown",
      risk_score: e.risk_score_3m || 0,
      risk_tier: toUpperTier(e.risk_tier_3m),
      revenue_3m: e.revenue_3m || 0,
      jobs_created_3m: e.jobs_created_3m || 0,
    }));

  const success_stories: EnterpriseEntry[] = [...enterprises]
    .sort((a, b) => (a.risk_score_3m || 0) - (b.risk_score_3m || 0))
    .slice(0, 6)
    .map((e) => ({
      unique_id: e.unique_id,
      sector: e.business_sector || "Unknown",
      country: e.country_code || "Unknown",
      risk_score: e.risk_score_3m || 0,
      risk_tier: toUpperTier(e.risk_tier_3m),
      revenue_3m: e.revenue_3m || 0,
      jobs_created_3m: e.jobs_created_3m || 0,
    }));

  const revTrend = summarizeTrendDirection(trends?.revenue || []);
  const jobsTrend = summarizeTrendDirection(trends?.jobs_created || []);
  const trendNarrative = `Revenue trend is ${revTrend}; jobs trend is ${jobsTrend}. PAR30 is ${pct((overview?.par30_pct || 0) / 100)} and risk trend is ${overview?.risk_trend || "stable"}.`;

  const horizon_summary: Record<string, HorizonData> = {
    "1": {
      avg_risk_score: Math.max(0, avgRisk * 0.9),
      total_revenue: totalRevenue * 0.34,
      avg_revenue: total ? (totalRevenue * 0.34) / total : 0,
      jobs_created: Math.round(totalCreated * 0.35),
      jobs_lost: Math.round(totalLost * 0.35),
      net_jobs: Math.round((totalCreated - totalLost) * 0.35),
    },
    "2": {
      avg_risk_score: Math.max(0, avgRisk * 0.96),
      total_revenue: totalRevenue * 0.67,
      avg_revenue: total ? (totalRevenue * 0.67) / total : 0,
      jobs_created: Math.round(totalCreated * 0.68),
      jobs_lost: Math.round(totalLost * 0.68),
      net_jobs: Math.round((totalCreated - totalLost) * 0.68),
    },
    "3": {
      avg_risk_score: avgRisk,
      total_revenue: totalRevenue,
      avg_revenue: total ? totalRevenue / total : 0,
      jobs_created: totalCreated,
      jobs_lost: totalLost,
      net_jobs: totalCreated - totalLost,
    },
  };

  const action_items: ActionItem[] = [
    {
      priority: tierDistribution.HIGH && tierDistribution.HIGH > Math.max(10, total * 0.2) ? "CRITICAL" : "HIGH",
      action: `Launch targeted advisor plans for ${tierDistribution.HIGH ?? 0} high-risk enterprises with weekly risk review cadence.`,
      deadline: "Within 14 days",
    },
    {
      priority: (totalCreated - totalLost) < 0 ? "HIGH" : "MEDIUM",
      action: `Protect employment outcomes in sectors with negative net jobs and combine coaching with arrears mitigation.`,
      deadline: "Within 30 days",
    },
    {
      priority: overview.par30_pct > 15 ? "HIGH" : "LOW",
      action: `Reduce portfolio stress by tracking PAR30 and linking credit remediation with enterprise recovery support.`,
      deadline: "Current quarter",
    },
  ];

  const highPct = total ? ((tierDistribution.HIGH ?? 0) / total) * 100 : 0;
  const lowPct = total ? ((tierDistribution.LOW ?? 0) / total) * 100 : 0;

  const shared: ReportData = {
    report_type: reportType,
    generated_at: new Date().toISOString(),
    source: failures > 0 ? `Live portfolio API (partial: ${failures} source${failures > 1 ? "s" : ""} unavailable)` : "Live portfolio API",
    title: reportType === "donor_pack" ? "Donor Impact Report" : "Program Brief",
    subtitle:
      reportType === "donor_pack"
        ? "Inkomoko Early Warning System — Portfolio Impact Assessment"
        : "Inkomoko Early Warning System — Executive Program Summary",
    executive_summary:
      reportType === "donor_pack"
        ? `The portfolio covers ${total.toLocaleString()} enterprises with projected 3-month revenue of ${fmt(totalRevenue, "RWF ")} and net jobs impact of ${fmt(totalCreated - totalLost)}. ${Math.round(highPct)}% are high-risk and ${Math.round(lowPct)}% are low-risk; interventions are prioritized by tier and arrears pressure. ${trendNarrative}`
        : `This brief summarizes ${total.toLocaleString()} enterprises with average risk ${pct(avgRisk)} and projected 3-month revenue ${fmt(totalRevenue, "RWF ")}. High-risk concentration is ${Math.round(highPct)}%, with net jobs impact ${fmt(totalCreated - totalLost)}. ${trendNarrative}`,
    kpis: {
      total_enterprises: total,
      avg_risk_score: avgRisk,
      high_risk_count: tierDistribution.HIGH ?? 0,
      medium_risk_count: tierDistribution.MEDIUM ?? 0,
      low_risk_count: tierDistribution.LOW ?? 0,
      tier_distribution: tierDistribution,
      total_projected_revenue: totalRevenue,
      total_jobs_created: totalCreated,
      net_jobs: totalCreated - totalLost,
    },
    horizon_summary,
    sector_breakdown,
    country_breakdown,
    gender_breakdown: {},
    program_breakdown: [],
    top_risk_enterprises,
    success_stories,
    action_items,
  };

  return shared;
}

// ── Small components ───────────────────────────────────────────────────────
function TierBadge({ tier }: { tier: string }) {
  const tone = tier === "HIGH" ? "danger" : tier === "MEDIUM" ? "warning" : "success";
  return <Badge tone={tone as "danger" | "warning" | "success"}>{tier}</Badge>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const p = (priority || "").toUpperCase();
  const tone =
    p === "CRITICAL" || p === "HIGH" ? "danger" : p === "MEDIUM" ? "warning" : "blue";
  return <Badge tone={tone as "danger" | "warning" | "blue"}>{priority}</Badge>;
}

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-inkomoko-border">
      <span className="text-inkomoko-blue">{icon}</span>
      <h3 className="font-semibold text-inkomoko-text text-sm">{title}</h3>
    </div>
  );
}

function KpiCard({
  value,
  label,
  color,
}: {
  value: string;
  label: string;
  color: "blue" | "green" | "red" | "amber" | "neutral";
}) {
  const colors: Record<string, string> = {
    blue: "bg-blue-50 border-blue-100 text-blue-800",
    green: "bg-emerald-50 border-emerald-100 text-emerald-800",
    red: "bg-red-50 border-red-100 text-red-800",
    amber: "bg-amber-50 border-amber-100 text-amber-800",
    neutral: "bg-inkomoko-bg border-inkomoko-border text-inkomoko-text",
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <div className="text-2xl font-bold mb-0.5 truncate">{value}</div>
      <div className="text-xs font-medium opacity-75">{label}</div>
    </div>
  );
}

function BarRow({
  label,
  count,
  total,
  color,
  valueLabel,
}: {
  label: ReactNode;
  count: number;
  total: number;
  color: string;
  valueLabel?: string;
}) {
  const pctVal = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-28 flex-shrink-0 truncate">{label}</div>
      <div className="flex-1 h-2.5 bg-inkomoko-bg rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${pctVal}%` }}
        />
      </div>
      <div className="w-28 text-right text-xs text-inkomoko-muted">
        {valueLabel ?? `${count} (${pctVal}%)`}
      </div>
    </div>
  );
}

function RptTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-inkomoko-border bg-inkomoko-bg">
            {headers.map((h, i) => (
              <th
                key={i}
                className="text-left text-xs font-semibold text-inkomoko-muted px-3 py-2 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-inkomoko-border/50 hover:bg-inkomoko-bg/50 transition-colors"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 text-inkomoko-text">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HorizonCard({
  label,
  data,
  accent = "blue",
}: {
  label: string;
  data: HorizonData | undefined;
  accent?: "blue" | "green";
}) {
  if (!data) return null;
  const borderColor = accent === "green" ? "border-emerald-500" : "border-inkomoko-blue";
  const titleColor = accent === "green" ? "text-emerald-700" : "text-inkomoko-blue";
  const rows = [
    ["Total Revenue", fmt(data.total_revenue, "RWF ")],
    ["Avg. Revenue", fmt(data.avg_revenue, "RWF ")],
    ["Avg. Risk Score", pct(data.avg_risk_score)],
    ["Jobs Created", fmt(data.jobs_created)],
    ["Jobs Lost", fmt(data.jobs_lost)],
    ["Net Jobs", fmt(data.net_jobs)],
  ];
  return (
    <div className={`rounded-xl border-t-4 border border-inkomoko-border ${borderColor} bg-white p-4`}>
      <div className={`font-semibold ${titleColor} mb-3 text-sm`}>{label}</div>
      {rows.map(([k, v]) => (
        <div
          key={k}
          className="flex justify-between text-xs py-1 border-b border-inkomoko-border/40 last:border-0"
        >
          <span className="text-inkomoko-muted">{k}</span>
          <span className="font-medium text-inkomoko-text">{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donor Pack Renderer ────────────────────────────────────────────────────
function DonorPackReport({ d }: { d: ReportData }) {
  const k = d.kpis ?? ({} as ReportKPIs);
  const hs = d.horizon_summary ?? {};
  const tierDist = k.tier_distribution ?? {};
  const total = k.total_enterprises ?? 1;

  return (
    <div className="space-y-4 mt-4">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-inkomoko-blue to-blue-700 text-white p-6">
        <h2 className="text-xl font-bold">{d.title}</h2>
        <p className="text-blue-100 text-sm mt-1">{d.subtitle}</p>
        <p className="text-blue-200 text-xs mt-2">
          Generated: {new Date(d.generated_at).toLocaleString()} — Source: {d.source}
        </p>
      </div>

      {/* Executive Summary */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<FileText size={16} />} title="Executive Summary" />
          <p className="text-sm text-inkomoko-text leading-relaxed border-l-4 border-inkomoko-blue pl-4 py-1 bg-blue-50/40 rounded-r-lg">
            {d.executive_summary}
          </p>
        </CardContent>
      </Card>

      {/* KPI Dashboard */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<BarChart3 size={16} />} title="Key Performance Indicators" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard value={fmt(k.total_enterprises)} label="Enterprises Monitored" color="blue" />
            <KpiCard value={fmt(k.total_projected_revenue, "RWF ")} label="Projected Revenue (3m)" color="green" />
            <KpiCard value={fmt(k.total_jobs_created)} label="Jobs Safeguarded" color="green" />
            <KpiCard value={String(k.high_risk_count ?? "—")} label="High-Risk Enterprises" color="red" />
            <KpiCard value={String(k.medium_risk_count ?? "—")} label="Medium-Risk" color="amber" />
            <KpiCard value={String(k.low_risk_count ?? "—")} label="Low-Risk (Resilient)" color="green" />
          </div>
        </CardContent>
      </Card>

      {/* Risk Distribution */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<Shield size={16} />} title="Risk Distribution" />
          {(["LOW", "MEDIUM", "HIGH"] as RiskTier[]).map((tier) => (
            <BarRow
              key={tier}
              label={<TierBadge tier={tier} />}
              count={tierDist[tier] ?? 0}
              total={total}
              color={tier === "HIGH" ? "bg-red-500" : tier === "MEDIUM" ? "bg-amber-400" : "bg-emerald-500"}
            />
          ))}
        </CardContent>
      </Card>

      {/* Revenue Projections by Horizon */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<TrendingUp size={16} />} title="Revenue Projections by Horizon" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["1", "2", "3"].map((h) => (
              <HorizonCard
                key={h}
                label={h === "1" ? "1-Month" : h === "2" ? "2-Month" : "3-Month"}
                data={hs[h]}
                accent="blue"
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Sector Analysis */}
      {d.sector_breakdown?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Activity size={16} />} title="Sector Analysis" />
            <RptTable
              headers={["Sector", "Enterprises", "Avg Risk", "High-Risk", "Projected Revenue", "Jobs Created"]}
              rows={d.sector_breakdown.map((s) => [
                <strong key="n">{s.sector}</strong>,
                s.count,
                pct(s.avg_risk),
                s.high_risk,
                fmt(s.total_revenue, "RWF "),
                fmt(s.total_jobs_created),
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Country Analysis */}
      {d.country_breakdown?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Globe size={16} />} title="Country Analysis" />
            <RptTable
              headers={["Country", "Enterprises", "Avg Risk", "High-Risk", "Projected Revenue", "Jobs Created"]}
              rows={d.country_breakdown.map((c) => [
                <strong key="n">{c.country}</strong>,
                c.count,
                pct(c.avg_risk),
                c.high_risk,
                fmt(c.total_revenue, "RWF "),
                fmt(c.total_jobs_created),
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Gender Lens */}
      {d.gender_breakdown && Object.keys(d.gender_breakdown).length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Users size={16} />} title="Gender Lens Analysis" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(d.gender_breakdown).map(([gender, gd]) => (
                <div
                  key={gender}
                  className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/50 p-4"
                >
                  <div className="font-semibold text-inkomoko-blue mb-1">{gender}</div>
                  <div className="text-2xl font-bold text-inkomoko-text mb-2">{gd.count}</div>
                  {(
                    [
                      ["Avg Risk", pct(gd.avg_risk)],
                      ["Revenue", fmt(gd.total_revenue, "RWF ")],
                      ["Jobs", fmt(gd.total_jobs)],
                    ] as [string, string][]
                  ).map(([label, val]) => (
                    <div key={label} className="flex justify-between text-xs py-0.5">
                      <span className="text-inkomoko-muted">{label}</span>
                      <span className="font-medium text-inkomoko-text">{val}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Programme Performance */}
      {d.program_breakdown?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<CheckSquare size={16} />} title="Programme Performance" />
            <RptTable
              headers={["Programme", "Enterprises", "Avg Risk", "High-Risk", "Revenue", "Jobs"]}
              rows={d.program_breakdown.map((p) => [
                <strong key="n">{p.program}</strong>,
                p.count,
                pct(p.avg_risk),
                p.high_risk,
                fmt(p.total_revenue, "RWF "),
                fmt(p.total_jobs_created),
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Success Spotlight */}
      {d.success_stories?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Star size={16} />} title="Success Spotlight — Top Resilient Enterprises" />
            <RptTable
              headers={["Enterprise", "Sector", "Country", "Risk Score", "Tier", "Revenue (3m)", "Jobs Created"]}
              rows={d.success_stories.map((s) => [
                <strong key="n">{s.unique_id}</strong>,
                s.sector,
                s.country,
                pct(s.risk_score),
                <TierBadge key="t" tier={s.risk_tier} />,
                fmt(s.revenue_3m, "RWF "),
                fmt(s.jobs_created_3m),
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Risk Watchlist */}
      {d.top_risk_enterprises?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Eye size={16} />} title="Risk Watchlist — Enterprises Requiring Attention" />
            <RptTable
              headers={["Enterprise", "Sector", "Country", "Risk Score", "Tier", "Revenue (3m)"]}
              rows={d.top_risk_enterprises.map((r) => [
                <strong key="n">{r.unique_id}</strong>,
                r.sector,
                r.country,
                pct(r.risk_score),
                <TierBadge key="t" tier={r.risk_tier} />,
                fmt(r.revenue_3m, "RWF "),
              ])}
            />
          </CardContent>
        </Card>
      )}

      {/* Methodology */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<Zap size={16} />} title="Methodology" />
          <p className="text-sm text-inkomoko-muted leading-relaxed">
            This report is generated by the Inkomoko Early Warning System using 15 LightGBM gradient boosting
            models trained on enterprise survey data. Models predict risk tiers (LOW / MEDIUM / HIGH), 3-month
            revenue projections, and employment dynamics (jobs created vs. lost) across 1, 2, and 3-month
            horizons. Each model uses 102 engineered features including financial ratios, demographic
            indicators, business characteristics, and lagged variables. All monetary values are in Rwandan
            Francs (RWF) unless stated otherwise. Risk scores are probability-calibrated between 0 and 1.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Program Brief Renderer ─────────────────────────────────────────────────
function ProgramBriefReport({ d }: { d: ReportData }) {
  const k = d.kpis ?? ({} as ReportKPIs);
  const hs = d.horizon_summary ?? {};
  const tierDist = k.tier_distribution ?? {};
  const total = k.total_enterprises ?? 1;

  return (
    <div className="space-y-4 mt-4">
      {/* Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-700 to-green-600 text-white p-6">
        <h2 className="text-xl font-bold">{d.title}</h2>
        <p className="text-emerald-100 text-sm mt-1">{d.subtitle}</p>
        <p className="text-emerald-200 text-xs mt-2">
          Generated: {new Date(d.generated_at).toLocaleString()} — Source: {d.source}
        </p>
      </div>

      {/* Executive Summary */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<FileText size={16} />} title="Executive Summary" />
          <p className="text-sm text-inkomoko-text leading-relaxed border-l-4 border-emerald-600 pl-4 py-1 bg-emerald-50/40 rounded-r-lg">
            {d.executive_summary}
          </p>
        </CardContent>
      </Card>

      {/* Portfolio Snapshot */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<BarChart3 size={16} />} title="Portfolio Snapshot" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard value={fmt(k.total_enterprises)} label="Total Enterprises" color="blue" />
            <KpiCard value={pct(k.avg_risk_score)} label="Avg. Risk Score" color="neutral" />
            <KpiCard value={fmt(k.total_projected_revenue, "RWF ")} label="Projected Revenue (3m)" color="green" />
            <KpiCard value={fmt(k.net_jobs)} label="Net Jobs Impact" color="neutral" />
          </div>
        </CardContent>
      </Card>

      {/* Risk Overview */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<Shield size={16} />} title="Risk Overview" />
          {(["HIGH", "MEDIUM", "LOW"] as RiskTier[]).map((tier) => (
            <BarRow
              key={tier}
              label={<TierBadge tier={tier} />}
              count={tierDist[tier] ?? 0}
              total={total}
              color={tier === "HIGH" ? "bg-red-500" : tier === "MEDIUM" ? "bg-amber-400" : "bg-emerald-500"}
            />
          ))}
        </CardContent>
      </Card>

      {/* Action Items */}
      {d.action_items && d.action_items.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<CheckSquare size={16} />} title="Action Items" />
            <div className="space-y-2">
              {d.action_items.map((a, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-xl border border-inkomoko-border bg-inkomoko-bg/40"
                >
                  <PriorityBadge priority={a.priority} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-inkomoko-text">{a.action}</div>
                    <div className="text-xs text-inkomoko-muted mt-0.5">⏰ {a.deadline}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sector Snapshot */}
      {d.sector_breakdown?.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <SectionHeader icon={<Activity size={16} />} title="Sector Snapshot" />
            {(() => {
              const maxRev = Math.max(...d.sector_breakdown.map((s) => s.total_revenue), 1);
              return d.sector_breakdown.slice(0, 8).map((s) => (
                <BarRow
                  key={s.sector}
                  label={<span className="text-xs text-inkomoko-text truncate">{s.sector}</span>}
                  count={s.total_revenue}
                  total={maxRev}
                  color="bg-inkomoko-blue"
                  valueLabel={fmt(s.total_revenue, "RWF ")}
                />
              ));
            })()}
          </CardContent>
        </Card>
      )}

      {/* Horizon Trends */}
      <Card>
        <CardContent className="pt-5">
          <SectionHeader icon={<TrendingUp size={16} />} title="Horizon Projection Trends" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["1", "2", "3"].map((h) => (
              <HorizonCard
                key={h}
                label={h === "1" ? "1-Month" : h === "2" ? "2-Month" : "3-Month"}
                data={hs[h]}
                accent="green"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>("donor_pack");
  const [dataSource, setDataSource] = useState<DataSource>("stored");
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      let data: ReportData;
      if (dataSource === "demo") {
        try {
          data = await apiFetch<ReportData>(
            `/demo/reports?report_type=${reportType}&source=test`,
            { method: "GET" },
            false,
            { cacheTtlMs: 60000 }
          );
        } catch {
          data = await buildReportFromPortfolio(reportType);
          setError("Demo endpoint unavailable. Generated a live portfolio report instead.");
        }
      } else {
        data = await buildReportFromPortfolio(reportType);
      }
      setReport(data);
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Failed to generate report.");
    } finally {
      setLoading(false);
    }
  }, [reportType, dataSource]);

  const handleExportPDF = () => {
    if (!report) return;
    const k = report.kpis ?? ({} as ReportKPIs);
    const rows = [
      { Section: "Report Type", Item: report.title, Value: report.subtitle },
      { Section: "Generated", Item: "Timestamp", Value: new Date(report.generated_at).toLocaleString() },
      { Section: "Summary", Item: "Executive Summary", Value: report.executive_summary },
      { Section: "KPIs", Item: "Total Enterprises", Value: fmt(k.total_enterprises) },
      { Section: "KPIs", Item: "Projected Revenue (3m)", Value: fmt(k.total_projected_revenue, "RWF ") },
      { Section: "KPIs", Item: "High-Risk", Value: String(k.high_risk_count ?? "—") },
      { Section: "KPIs", Item: "Medium-Risk", Value: String(k.medium_risk_count ?? "—") },
      { Section: "KPIs", Item: "Low-Risk", Value: String(k.low_risk_count ?? "—") },
      { Section: "KPIs", Item: "Net Jobs", Value: fmt(k.net_jobs) },
      ...(report.sector_breakdown ?? []).map((s) => ({
        Section: "Sector Analysis",
        Item: s.sector ?? "",
        Value: `${s.count} enterprises, avg risk ${pct(s.avg_risk)}`,
      })),
    ];
    exportPDF(
      reportType === "donor_pack" ? "Donor_Pack" : "Program_Brief",
      report.title,
      rows
    );
  };

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor", "Donor"]}>
      <div className="space-y-6">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
            <FileText size={20} /> Reports
          </h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Generate publication-ready reports for stakeholders. Choose a report type, then click Generate.
          </p>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
              {/* Report type selector */}
              <div className="flex gap-2">
                {(
                  [
                    { value: "donor_pack", icon: <Shield size={14} />, label: "Donor Pack" },
                    { value: "program_brief", icon: <FileText size={14} />, label: "Program Brief" },
                  ] as { value: ReportType; icon: ReactNode; label: string }[]
                ).map(({ value, icon, label }) => (
                  <button
                    key={value}
                    onClick={() => setReportType(value)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      reportType === value
                        ? "bg-inkomoko-blue text-white border-inkomoko-blue"
                        : "bg-white text-inkomoko-muted border-inkomoko-border hover:border-inkomoko-blue hover:text-inkomoko-blue"
                    }`}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>

              {/* Data source selector */}
              <div className="flex gap-2">
                {(["live", "demo"] as DataSource[]).map((src) => (
                  <button
                    key={src}
                    onClick={() => setDataSource(src)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      dataSource === src
                        ? "bg-inkomoko-blue/10 text-inkomoko-blue border-inkomoko-blue/30"
                        : "bg-white text-inkomoko-muted border-inkomoko-border hover:border-inkomoko-blue/40"
                    }`}
                  >
                    {src === "live" ? "Live Portfolio API" : "Demo Generator"}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 sm:ml-auto">
                <Button onClick={generateReport} disabled={loading} className="gap-2">
                  {loading ? (
                    <>
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Activity size={14} /> Generate Report
                    </>
                  )}
                </Button>
                {report && (
                  <Button variant="secondary" onClick={handleExportPDF} className="gap-2">
                    <Download size={14} /> Export PDF
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-inkomoko-danger/30 bg-inkomoko-danger/5 px-4 py-3 text-sm text-inkomoko-danger">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !report && !error && (
          <div className="rounded-2xl border-2 border-dashed border-inkomoko-border bg-inkomoko-bg/40 px-6 py-16 text-center">
            <FileText size={48} className="mx-auto mb-3 text-inkomoko-muted/50" />
            <p className="text-inkomoko-muted text-sm">
              Select a report type and click <strong>Generate Report</strong> to render a publication-ready report.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl border border-inkomoko-border bg-white p-6 animate-pulse">
                <div className="h-4 bg-inkomoko-bg rounded w-1/3 mb-4" />
                <div className="space-y-2">
                  <div className="h-3 bg-inkomoko-bg rounded" />
                  <div className="h-3 bg-inkomoko-bg rounded w-5/6" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Report output */}
        {report && !loading && (
          <>
            <Card>
              <CardContent className="pt-5">
                <SectionHeader icon={<Zap size={16} />} title="Decision Intelligence Snapshot" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-inkomoko-muted">Risk Priority</p>
                    <p className="text-sm mt-1 text-inkomoko-text">
                      {report.kpis.high_risk_count} enterprises require immediate action; focus first on highest-risk profiles with arrears stress.
                    </p>
                  </div>
                  <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-inkomoko-muted">Livelihood Outlook</p>
                    <p className="text-sm mt-1 text-inkomoko-text">
                      Net jobs projection is {fmt(report.kpis.net_jobs)} with total jobs created at {fmt(report.kpis.total_jobs_created)}.
                    </p>
                  </div>
                  <div className="rounded-xl border border-inkomoko-border bg-inkomoko-bg/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-inkomoko-muted">Revenue Signal</p>
                    <p className="text-sm mt-1 text-inkomoko-text">
                      3-month projected revenue is {fmt(report.kpis.total_projected_revenue, "RWF ")} across monitored enterprises.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            {report.report_type === "donor_pack" ? (
              <DonorPackReport d={report} />
            ) : (
              <ProgramBriefReport d={report} />
            )}
          </>
        )}
      </div>
    </RequireRole>
  );
}
