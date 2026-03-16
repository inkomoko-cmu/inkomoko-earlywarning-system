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
type DataSource = "stored" | "test";

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
      const data = await apiFetch<ReportData>(
        `/demo/reports?report_type=${reportType}&source=${dataSource}`,
        { method: "GET" },
        false
      );
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
                {(["stored", "test"] as DataSource[]).map((src) => (
                  <button
                    key={src}
                    onClick={() => setDataSource(src)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      dataSource === src
                        ? "bg-inkomoko-blue/10 text-inkomoko-blue border-inkomoko-blue/30"
                        : "bg-white text-inkomoko-muted border-inkomoko-border hover:border-inkomoko-blue/40"
                    }`}
                  >
                    {src === "stored" ? "Stored Data" : "Demo Data"}
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
