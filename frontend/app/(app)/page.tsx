"use client";

import { KpiGrid } from "@/components/overview/KpiGrid";
import { DonorScorecard, JobsFlow, RevenueTrend, RiskDistribution } from "@/components/overview/Charts";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { ENTERPRISES, KPIS } from "@/lib/data";
import { useAuth } from "@/components/auth/AuthProvider";
import { Sparkles, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

export default function OverviewPage() {
  const { session } = useAuth();

  const exportImpactOverview = () => {
    const rows = ENTERPRISES.map((e) => ({
      Country: e.country,
      Program: e.program,
      Cohort: e.cohort,
      Sector: e.sector,
      RiskTier: e.riskTier,
      RiskScore: e.riskScore,
      Revenue3M_USD: e.revenue3mForecastUSD,
      JobsCreated3M: e.jobsCreated3mForecast,
      JobsLost3M: e.jobsLost3mForecast,
      RecommendedAction: e.recommendedAction,
    }));
    exportPDF("Impact_Overview", "Impact & Early Warning — Portfolio Summary", rows);
  };

  const exportKpis = (format: "csv" | "xlsx" | "pdf") => {
    const rows = KPIS.map((k) => ({ KPI: k.label, Value: k.value, Change: k.delta }));
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
              <CardDescription>Download stakeholder-ready reports from any view.</CardDescription>
            </div>
            <div className="text-xs text-inkomoko-muted text-right">
              Signed in as <span className="font-semibold text-inkomoko-text">{session?.role}</span>
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => exportKpis("pdf")}>Export KPI PDF</Button>
            <Button variant="secondary" onClick={() => exportKpis("xlsx")}>Export KPI Excel</Button>
            <Button variant="secondary" onClick={() => exportKpis("csv")}>Export KPI CSV</Button>
            <Button onClick={exportImpactOverview}>Export Portfolio PDF</Button>
          </CardContent>
        </Card>
      </div>

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
            body="High‑risk enterprises are prioritized for rapid coaching and cashflow review. Targeted interventions are scheduled within 7 days to stabilize employment outcomes."
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

function NarrativeCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 text-sm text-inkomoko-muted leading-relaxed">{body}</div>
    </div>
  );
}
