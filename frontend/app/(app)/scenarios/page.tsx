"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { InsightPanel } from "@/components/ui/InsightPanel";
import { SCENARIOS } from "@/lib/data";
import { exportPDF } from "@/lib/export";
import { apiFetch } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { type AiInsight, clampConfidence } from "@/lib/insights";
import { useLiveAiInsights } from "@/lib/useLiveAiInsights";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, BarChart, Bar } from "recharts";
import { Gauge, Zap } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

function applyScenario(base: number, inflation: number, fx: number, fundingCut: number, conflict: number) {
  // Simple stress transform for demo: compounding multipliers
  const shock = 1 + inflation * 0.9 + fx * 0.7 + fundingCut * 0.6 + conflict * 0.8;
  return base * shock;
}

type EnterpriseProfile = {
  unique_id: string;
  risk_tier_3m?: string;
  revenue_3m?: number;
  jobs_created_3m?: number;
  jobs_lost_3m?: number;
};

export default function ScenariosPage() {
  const [idx, setIdx] = useState(0);
  const [enterprises, setEnterprises] = useState<EnterpriseProfile[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const s = SCENARIOS[idx];

  useEffect(() => {
    const loadEnterprises = async () => {
      try {
        setApiError(null);
        const rows = await apiFetch<EnterpriseProfile[]>("/portfolio/enterprises", { method: "GET" }, true, { cacheTtlMs: 120000 });
        setEnterprises(Array.isArray(rows) ? rows : []);
      } catch (err: any) {
        setApiError(err?.message ?? "Failed to load enterprise profiles.");
        setEnterprises([]);
      }
    };

    loadEnterprises();
  }, []);

  const summary = useMemo(() => {
    const baseHigh = enterprises.filter((e) => (e.risk_tier_3m || "").toUpperCase() === "HIGH").length;
    const stressedHigh = Math.round(
      baseHigh *
        (1 +
          s.params.inflation * 0.7 +
          s.params.fxDepreciation * 0.5 +
          s.params.fundingCut * 0.6 +
          s.params.conflictDisruption * 0.8)
    );
    const baseRevenue = enterprises.reduce((a, e) => a + (Number(e.revenue_3m) || 0), 0);
    const stressedRevenue = Math.round(
      baseRevenue /
        applyScenario(1, s.params.inflation, s.params.fxDepreciation, s.params.fundingCut, s.params.conflictDisruption)
    );
    const baseJobsNet = enterprises.reduce(
      (a, e) => a + (Number(e.jobs_created_3m) || 0) - (Number(e.jobs_lost_3m) || 0),
      0
    );
    const stressedJobsNet = Math.round(
      baseJobsNet * (1 - (s.params.inflation * 0.35 + s.params.fundingCut * 0.45 + s.params.conflictDisruption * 0.55))
    );
    return { baseHigh, stressedHigh, baseRevenue, stressedRevenue, baseJobsNet, stressedJobsNet };
  }, [enterprises, s]);

  const chart = useMemo(() => {
    const months = ["Now", "+1M", "+2M", "+3M"];
    const baseRevenue = summary.baseRevenue;
    return months.map((m, i) => {
      const t = i / 3;
      const base = baseRevenue * (1 + 0.02 * i);
      const stressed =
        base / applyScenario(1, s.params.inflation * t, s.params.fxDepreciation * t, s.params.fundingCut * t, s.params.conflictDisruption * t);
      return { month: m, baseline: Math.round(base / 1000), scenario: Math.round(stressed / 1000) };
    });
  }, [s, summary.baseRevenue]);

  const sensitivity = useMemo(() => {
    const p = s.params;
    return [
      { driver: "Inflation", impact: Math.round(p.inflation * 100) },
      { driver: "FX", impact: Math.round(p.fxDepreciation * 100) },
      { driver: "Funding", impact: Math.round(p.fundingCut * 100) },
      { driver: "Conflict", impact: Math.round(p.conflictDisruption * 100) },
    ];
  }, [s]);

  const aiInsights = useMemo<AiInsight[]>(() => {
    const highestDriver = sensitivity.slice().sort((a, b) => b.impact - a.impact)[0];
    const revenueDeltaPct = summary.baseRevenue > 0
      ? ((summary.stressedRevenue - summary.baseRevenue) / summary.baseRevenue) * 100
      : 0;
    const highRiskDelta = summary.stressedHigh - summary.baseHigh;
    const confidence = clampConfidence(52 + Math.min(25, enterprises.length / 10));

    return [
      {
        id: "scenario-dominant-driver",
        title: "Dominant stress driver",
        narrative: `${highestDriver?.driver || "Scenario"} is the strongest shock contributor at ${highestDriver?.impact || 0}% under ${s.name}.`,
        confidence,
        tone: (highestDriver?.impact || 0) >= 35 ? "warning" : "neutral",
        evidence: sensitivity.map((item) => `${item.driver}: ${item.impact}%`).slice(0, 3),
        actions: ["Prioritize mitigation actions for the dominant driver first."],
      },
      {
        id: "scenario-risk-shift",
        title: "Risk migration outlook",
        narrative: `High-risk enterprises move from ${summary.baseHigh} to ${summary.stressedHigh} (${highRiskDelta >= 0 ? "+" : ""}${highRiskDelta}) in this simulation.`,
        confidence: clampConfidence(confidence + 5),
        tone: highRiskDelta > 0 ? "danger" : "success",
        evidence: [`Baseline high-risk: ${summary.baseHigh}`, `Scenario high-risk: ${summary.stressedHigh}`],
        actions: ["Allocate advisory capacity to the projected incremental high-risk group."],
      },
      {
        id: "scenario-revenue-impact",
        title: "Revenue impact",
        narrative: `Projected revenue shifts by ${revenueDeltaPct.toFixed(1)}% relative to baseline over the modeled horizon.`,
        confidence: clampConfidence(confidence + 3),
        tone: revenueDeltaPct < -10 ? "warning" : "success",
        evidence: [
          `Baseline revenue: $${summary.baseRevenue.toLocaleString()}`,
          `Scenario revenue: $${summary.stressedRevenue.toLocaleString()}`,
        ],
        actions: ["Use the sensitivity chart to sequence financial protection measures."],
      },
    ];
  }, [s.name, sensitivity, summary, enterprises.length]);

  const aiContext = useMemo(
    () => ({
      scenario: s,
      summary,
      sensitivity,
      trajectory: chart,
      enterpriseCount: enterprises.length,
    }),
    [s, summary, sensitivity, chart, enterprises.length]
  );

  const liveAi = useLiveAiInsights({
    scopeType: "scenarios",
    scopeId: s.name,
    context: aiContext,
    fallbackInsights: aiInsights,
  });

  const exportScenario = () => {
    const rows = [
      { Metric: "High-risk enterprises", Baseline: summary.baseHigh, Scenario: summary.stressedHigh },
      { Metric: "Projected revenue (3M) USD", Baseline: summary.baseRevenue, Scenario: summary.stressedRevenue },
      { Metric: "Net jobs (3M)", Baseline: summary.baseJobsNet, Scenario: summary.stressedJobsNet },
      { Metric: "Inflation", Baseline: "-", Scenario: `${Math.round(s.params.inflation * 100)}%` },
      { Metric: "FX depreciation", Baseline: "-", Scenario: `${Math.round(s.params.fxDepreciation * 100)}%` },
      { Metric: "Funding cut", Baseline: "-", Scenario: `${Math.round(s.params.fundingCut * 100)}%` },
      { Metric: "Conflict disruption", Baseline: "-", Scenario: `${Math.round(s.params.conflictDisruption * 100)}%` },
    ];
    exportPDF(`Scenario_${s.name.replace(/\s+/g, "_")}`, `Scenario Report — ${s.name}`, rows);
  };

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Scenario Simulation</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Stress testing under compounding shocks (inflation, FX, funding, conflict) to support proactive intervention planning.
          </p>
        </div>

        <InsightPanel
          title="AI Insights"
          subtitle="Scenario interpretation generated from active shock settings and simulated outcomes."
          status={liveAi.status}
          lastUpdated={liveAi.lastUpdated}
          insights={liveAi.insights}
        />

        <Card>
          <CardHeader className="flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge size={18} /> Scenario
              </CardTitle>
              <CardDescription>Select a scenario and review portfolio impacts with sensitivity analysis.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="orange" className="gap-1">
                <Zap size={14} /> Multi-shock enabled
              </Badge>
              <Button onClick={exportScenario}>Export Scenario PDF</Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {SCENARIOS.map((sc, i) => (
                <button
                  key={sc.name}
                  onClick={() => setIdx(i)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    i === idx
                      ? "bg-inkomoko-blue text-white border-inkomoko-blue shadow-soft"
                      : "bg-white border-inkomoko-border hover:bg-inkomoko-bg"
                  }`}
                >
                  {sc.name}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Metric label="High-risk enterprises" baseline={summary.baseHigh} scenario={summary.stressedHigh} tone="warning" />
              <Metric
                label="Projected revenue (3M)"
                baseline={`$${summary.baseRevenue.toLocaleString()}`}
                scenario={`$${summary.stressedRevenue.toLocaleString()}`}
                tone="orange"
              />
              <Metric label="Net jobs (3M)" baseline={summary.baseJobsNet} scenario={summary.stressedJobsNet} tone="success" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card className="h-[340px]">
                <CardHeader>
                  <CardTitle>Revenue trajectory</CardTitle>
                  <CardDescription>Baseline vs scenario (USD thousands).</CardDescription>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <RTooltip />
                      <Line type="monotone" dataKey="baseline" stroke="#0B2E5B" strokeWidth={3} dot={false} />
                      <Line type="monotone" dataKey="scenario" stroke="#F05A28" strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="h-[340px]">
                <CardHeader>
                  <CardTitle>Sensitivity profile</CardTitle>
                  <CardDescription>Relative shock strength by driver (percentage points).</CardDescription>
                </CardHeader>
                <CardContent className="h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sensitivity}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="driver" />
                      <YAxis />
                      <RTooltip />
                      <Bar dataKey="impact" fill="#F05A28" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
              <div className="text-sm font-semibold">Recommended operational posture</div>
              <p className="mt-2 text-sm text-inkomoko-muted leading-relaxed">
                Under <span className="font-semibold text-inkomoko-text">{s.name}</span>, prioritize rapid stabilization for high-risk tiers, expand cashflow coaching capacity,
                and intensify market linkage support to offset revenue pressure. Review intervention targeting weekly until shock indicators normalize.
              </p>
              {apiError && <p className="mt-2 text-xs text-red-600">{apiError}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}

function Metric({ label, baseline, scenario, tone }: { label: string; baseline: any; scenario: any; tone: any }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
      <div className="text-sm text-inkomoko-muted">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <div>
          <div className="text-xs text-inkomoko-muted">Baseline</div>
          <div className="text-lg font-semibold">{baseline}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-inkomoko-muted">Scenario</div>
          <div className="text-lg font-semibold">{scenario}</div>
        </div>
      </div>
      <div className="mt-3">
        <Badge tone={tone}>Scenario-adjusted</Badge>
      </div>
    </div>
  );
}
