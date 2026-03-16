"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { DonorScorecard, JobsFlow, RevenueTrend, RiskDistribution } from "@/components/overview/Charts";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  Sparkles, TrendingUp, AlertTriangle, ShieldCheck,
  CreditCard, Wallet, Clock, UserCheck, UserMinus, BarChart3,
  ThumbsUp, ThumbsDown, AlertCircle, DollarSign,
  Users, PieChart, RefreshCw,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ErrorCard } from "@/components/ui/ErrorCard";

type OverviewData = {
  total_loans: number;
  total_disbursed: number;
  total_outstanding: number;
  avg_days_in_arrears: number;
  par30_amount: number;
  jobs_created_3m: number;
  jobs_lost_3m: number;
  avg_revenue_3m: number;
  nps_promoter_pct: number;
  nps_detractor_pct: number;
};

export default function OverviewPage() {
  const { session } = useAuth();

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const loadOverview = async () => {
    try {
      setLoading(true);
      setApiError(null);
      const res = await apiFetch<OverviewData>("/portfolio/overview", { method: "GET" }, true);
      setOverview(res);
    } catch (e: any) {
      setApiError(e?.message ?? "Failed to load overview data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const exportImpactOverview = () => {
    if (!overview) return;
    const rows = [
      { Metric: "Total Loans", Value: overview.total_loans },
      { Metric: "Total Disbursed", Value: overview.total_disbursed },
      { Metric: "Total Outstanding", Value: overview.total_outstanding },
      { Metric: "Average Days in Arrears", Value: overview.avg_days_in_arrears },
      { Metric: "PAR30 Amount", Value: overview.par30_amount },
      { Metric: "Jobs Created (3M)", Value: overview.jobs_created_3m },
      { Metric: "Jobs Lost (3M)", Value: overview.jobs_lost_3m },
      { Metric: "Average Revenue (3M)", Value: overview.avg_revenue_3m },
      { Metric: "NPS Promoters", Value: overview.nps_promoter_pct },
      { Metric: "NPS Detractors", Value: overview.nps_detractor_pct },
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
      { KPI: "Jobs Created (3M)", Value: overview.jobs_created_3m },
      { KPI: "Jobs Lost (3M)", Value: overview.jobs_lost_3m },
      { KPI: "Avg Revenue (3M)", Value: formatMoney(overview.avg_revenue_3m) },
      { KPI: "NPS Promoters", Value: overview.nps_promoter_pct },
      { KPI: "NPS Detractors", Value: overview.nps_detractor_pct },
    ];
    if (format === "csv") exportCSV("KPI_Snapshot", rows);
    if (format === "xlsx") exportExcel("KPI_Snapshot", rows, "KPIs");
    if (format === "pdf") exportPDF("KPI_Snapshot", "KPI Snapshot", rows);
  };

  return (
    <div className="space-y-8">

      {/* ── Hero banner ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-br from-inkomoko-blue via-inkomoko-blueSoft to-inkomoko-blue text-white p-8 relative overflow-hidden">
        {/* decorative circles */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-start gap-6">
          {/* Left: title + badges */}
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-2">
              Inkomoko Early Warning System
            </p>
            <h1 className="text-3xl font-bold mb-2 tracking-tight">Impact Overview</h1>
            <p className="text-blue-100 text-sm max-w-xl leading-relaxed">
              Unified portfolio visibility with forecasts, stress tests, and explainable decision support.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: <ShieldCheck size={12} />, label: "Role-based governance" },
                { icon: <Sparkles size={12} />, label: "Advisory-ready insights" },
                { icon: <TrendingUp size={12} />, label: "3-month forecasts" },
                { icon: <AlertTriangle size={12} />, label: "Early warning tiers" },
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

          {/* Right: export actions */}
          <div className="flex flex-col gap-3 xl:items-end">
            <p className="text-xs text-blue-300">
              Signed in as{" "}
              <span className="font-semibold text-white">{session?.role}</span>
            </p>
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
                onClick={loadOverview}
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

      {/* ── Portfolio Health ─────────────────────────────────────────── */}
      <div>
        <SectionLabel title="Portfolio Health" accent="bg-inkomoko-blue" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Total Loans"          value={overview?.total_loans?.toLocaleString() ?? "—"} icon={<CreditCard size={16} />}   color="blue"  loading={loading} />
          <StatCard label="Total Disbursed"      value={formatMoney(overview?.total_disbursed)} icon={<DollarSign size={16} />}    color="green" loading={loading} />
          <StatCard label="Total Outstanding"    value={formatMoney(overview?.total_outstanding)} icon={<Wallet size={16} />}      color="amber" loading={loading} />
          <StatCard label="PAR30 Amount"         value={formatMoney(overview?.par30_amount)}    icon={<AlertCircle size={16} />}   color="red"   loading={loading} />
          <StatCard label="Avg Days in Arrears"  value={overview?.avg_days_in_arrears?.toFixed(2) ?? "—"} icon={<Clock size={16} />}      color="amber" loading={loading} />
        </div>
      </div>

      {/* ── Impact Metrics ───────────────────────────────────────────── */}
      <div>
        <SectionLabel title="Impact Metrics" accent="bg-emerald-500" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard label="Jobs Created (3M)"   value={overview?.jobs_created_3m?.toLocaleString() ?? "—"} icon={<UserCheck size={16} />}  color="green" loading={loading} />
          <StatCard label="Jobs Lost (3M)"      value={overview?.jobs_lost_3m?.toLocaleString() ?? "—"}    icon={<UserMinus size={16} />}  color="red"   loading={loading} />
          <StatCard label="Avg Revenue (3M)"    value={formatMoney(overview?.avg_revenue_3m)}      icon={<BarChart3 size={16} />}  color="blue"  loading={loading} />
          <StatCard label="NPS Promoters"       value={overview?.nps_promoter_pct?.toLocaleString() ?? "—"}    icon={<ThumbsUp size={16} />}   color="green" loading={loading} />
          <StatCard label="NPS Detractors"      value={overview?.nps_detractor_pct?.toLocaleString() ?? "—"}   icon={<ThumbsDown size={16} />} color="red"   loading={loading} />
        </div>
      </div>

      {/* ── KPI Grid ─────────────────────────────────────────────────── */}
      <KpiGrid />

      {/* ── Analytics ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel title="Analytics" accent="bg-inkomoko-blue" />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <RiskDistribution />
          <RevenueTrend />
          <JobsFlow />
          <DonorScorecard />
        </div>
      </div>

      {/* ── Decision Narrative ───────────────────────────────────────── */}
      <div>
        <SectionLabel title="What this means" accent="bg-violet-500" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NarrativeCard
            icon={<Users size={20} />}
            accent="border-l-inkomoko-blue bg-blue-50/30"
            iconStyle="bg-blue-50 text-inkomoko-blue"
            title="Safeguard livelihoods"
            body="High-risk enterprises are prioritized for rapid coaching and cashflow review. Targeted interventions are scheduled within 7 days to stabilize employment outcomes."
          />
          <NarrativeCard
            icon={<PieChart size={20} />}
            accent="border-l-emerald-500 bg-emerald-50/30"
            iconStyle="bg-emerald-50 text-emerald-700"
            title="Allocate resources efficiently"
            body="Forecast deltas and tier shifts guide program staffing and budget allocation across countries—reducing reactive response and improving service equity."
          />
          <NarrativeCard
            icon={<ShieldCheck size={20} />}
            accent="border-l-violet-500 bg-violet-50/30"
            iconStyle="bg-violet-50 text-violet-700"
            title="Improve donor transparency"
            body="Every portfolio view and export includes traceable indicators, quality contracts, and a balanced scorecard aligned to resilience and sustainability reporting."
          />
        </div>
      </div>

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