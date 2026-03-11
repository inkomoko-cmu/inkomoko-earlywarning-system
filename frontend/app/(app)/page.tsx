"use client";

import { useEffect, useState } from "react";
import { KpiGrid } from "@/components/overview/KpiGrid";
import { DonorScorecard, JobsFlow, RevenueTrend, RiskDistribution } from "@/components/overview/Charts";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { useAuth } from "@/components/auth/AuthProvider";
import { Sparkles, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
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
  nps_promoter: number;
  nps_detractor: number;
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
      { Metric: "NPS Promoters", Value: overview.nps_promoter },
      { Metric: "NPS Detractors", Value: overview.nps_detractor },
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
      { KPI: "Avg Days in Arrears", Value: overview.avg_days_in_arrears.toFixed(2) },
      { KPI: "Jobs Created (3M)", Value: overview.jobs_created_3m },
      { KPI: "Jobs Lost (3M)", Value: overview.jobs_lost_3m },
      { KPI: "Avg Revenue (3M)", Value: formatMoney(overview.avg_revenue_3m) },
      { KPI: "NPS Promoters", Value: overview.nps_promoter },
      { KPI: "NPS Detractors", Value: overview.nps_detractor },
    ];
    if (format === "csv") exportCSV("KPI_Snapshot", rows);
    if (format === "xlsx") exportExcel("KPI_Snapshot", rows, "KPIs");
    if (format === "pdf") exportPDF("KPI_Snapshot", "KPI Snapshot", rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Impact Overview</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Unified portfolio visibility with forecasts, stress tests, and explainable decision support.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="blue"><ShieldCheck size={14} /> Role-based governance</Badge>
            <Badge tone="orange"><Sparkles size={14} /> Advisory-ready insights</Badge>
            <Badge tone="success"><TrendingUp size={14} /> 3‑month forecasts</Badge>
            <Badge tone="warning"><AlertTriangle size={14} /> Early warning tiers</Badge>
          </div>
        </div>

        <Card className="xl:w-[520px]">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Exports</CardTitle>
              <CardDescription>Download stakeholder-ready reports from live overview data.</CardDescription>
            </div>
            <div className="text-xs text-inkomoko-muted text-right">
              Signed in as <span className="font-semibold text-inkomoko-text">{session?.role}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => exportKpis("pdf")} disabled={!overview}>Export KPI PDF</Button>
            <Button variant="secondary" onClick={() => exportKpis("xlsx")} disabled={!overview}>Export KPI Excel</Button>
            <Button variant="secondary" onClick={() => exportKpis("csv")} disabled={!overview}>Export KPI CSV</Button>
            <Button onClick={exportImpactOverview} disabled={!overview}>Export Overview PDF</Button>
          </CardContent>
        </Card>
      </div>

      {apiError && (
        <ErrorCard
          title="Failed to load overview"
          message={apiError}
          variant="error"
          onDismiss={() => setApiError(null)}
          onRetry={loadOverview}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Live Overview Metrics</CardTitle>
          <CardDescription>These top-level numbers now come directly from PostgreSQL through FastAPI.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-inkomoko-muted">Loading overview metrics...</div>
          ) : !overview ? (
            <div className="text-sm text-inkomoko-muted">No overview data found.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
              <MetricCard label="Total Loans" value={overview.total_loans.toLocaleString()} />
              <MetricCard label="Total Disbursed" value={formatMoney(overview.total_disbursed)} />
              <MetricCard label="Total Outstanding" value={formatMoney(overview.total_outstanding)} />
              <MetricCard label="PAR30 Amount" value={formatMoney(overview.par30_amount)} />
              <MetricCard label="Avg Days in Arrears" value={overview.avg_days_in_arrears.toFixed(2)} />
              <MetricCard label="Jobs Created (3M)" value={overview.jobs_created_3m.toLocaleString()} />
              <MetricCard label="Jobs Lost (3M)" value={overview.jobs_lost_3m.toLocaleString()} />
              <MetricCard label="Avg Revenue (3M)" value={formatMoney(overview.avg_revenue_3m)} />
              <MetricCard label="NPS Promoters" value={overview.nps_promoter.toLocaleString()} />
              <MetricCard label="NPS Detractors" value={overview.nps_detractor.toLocaleString()} />
            </div>
          )}
        </CardContent>
      </Card>

      <KpiGrid />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RiskDistribution />
        <RevenueTrend />
        <JobsFlow />
        <DonorScorecard />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>So what</CardTitle>
          <CardDescription>Decision narrative translated into operational priorities.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <NarrativeCard
            title="Safeguard livelihoods"
            body="High-risk enterprises are prioritized for rapid coaching and cashflow review. Targeted interventions are scheduled within 7 days to stabilize employment outcomes."
          />
          <NarrativeCard
            title="Allocate resources efficiently"
            body="Forecast deltas and tier shifts guide program staffing and budget allocation across countries—reducing reactive response and improving service equity."
          />
          <NarrativeCard
            title="Improve donor transparency"
            body="Every portfolio view and export includes traceable indicators, quality contracts, and a balanced scorecard aligned to resilience and sustainability reporting."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
      <div className="mt-2 text-lg font-semibold text-inkomoko-text">{value}</div>
    </div>
  );
}

function NarrativeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-inkomoko-muted leading-relaxed">{body}</div>
    </div>
  );
}