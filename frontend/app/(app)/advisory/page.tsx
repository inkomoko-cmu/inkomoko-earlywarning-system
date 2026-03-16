"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ENTERPRISES } from "@/lib/data";
import { exportPDF } from "@/lib/export";
import { useMemo, useState } from "react";
import { BookOpenCheck, Sparkles, ShieldCheck } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

type Advice = {
  title: string;
  steps: string[];
  citations: { doc: string; section: string }[];
  governance: string[];
};

function buildAdvice(riskTier: string): Advice {
  if (riskTier === "High") {
    return {
      title: "Stabilization Pathway (High Risk)",
      steps: [
        "Run a cashflow and inventory audit; identify immediate leakage and working-capital gaps.",
        "Deploy weekly coaching for 4 weeks with a structured action checklist; document outcomes.",
        "Re-negotiate supplier terms and optimize pricing; introduce low-risk demand channels.",
        "Activate safeguarding plan for jobs at risk; coordinate referrals where applicable.",
      ],
      citations: [
        { doc: "SME Resilience Playbook", section: "Chapter 3: Cashflow Stabilization" },
        { doc: "Advisor SOP", section: "Section 5: High-risk escalation and follow-up cadence" },
      ],
      governance: [
        "Recommendations exclude any restricted personal attributes.",
        "All steps require supervisor approval for escalation actions.",
        "Evidence links are logged for audit traceability.",
      ],
    };
  }
  if (riskTier === "Medium") {
    return {
      title: "Targeted Improvement Pathway (Medium Risk)",
      steps: [
        "Prioritize margin improvements and working-capital efficiency over expansion.",
        "Implement monthly check-ins with a leading-indicator checklist (sales volatility, debt servicing, stock-outs).",
        "Strengthen supplier diversification and build a 2-week liquidity buffer plan.",
      ],
      citations: [
        { doc: "Operations Manual", section: "Section 2: Risk-informed mentoring" },
        { doc: "Market Linkages Guide", section: "Annex A: Channel assessment rubric" },
      ],
      governance: [
        "Policies on lending or restructuring are applied per country rules.",
        "Advisor outputs include rationale and evidence citations.",
      ],
    };
  }
  return {
    title: "Growth Pathway (Low Risk)",
    steps: [
      "Set growth milestones and track them weekly using the KPI checklist.",
      "Introduce market linkage support and product differentiation planning.",
      "Prepare for seasonal volatility with a lightweight demand forecast and safety stock policy.",
    ],
    citations: [
      { doc: "Growth Toolkit", section: "Module 1: Growth planning" },
      { doc: "Advisor SOP", section: "Section 2: Growth monitoring checklist" },
    ],
    governance: ["Recommendations remain within approved program interventions.", "All advisory actions are captured in the audit log."],
  };
}

export default function AdvisoryPage() {
  const [idx, setIdx] = useState(0);
  const enterprise = ENTERPRISES[idx];
  const advice = useMemo(() => buildAdvice(enterprise.riskTier), [enterprise.riskTier]);

  const exportAdvice = () => {
    const rows = [
      { Field: "Country", Value: enterprise.country },
      { Field: "Program", Value: enterprise.program },
      { Field: "Cohort", Value: enterprise.cohort },
      { Field: "Sector", Value: enterprise.sector },
      { Field: "Risk tier", Value: enterprise.riskTier },
      { Field: "Risk score", Value: enterprise.riskScore },
      { Field: "3M revenue forecast (USD)", Value: enterprise.revenue3mForecastUSD },
      { Field: "3M jobs created forecast", Value: enterprise.jobsCreated3mForecast },
      { Field: "3M jobs lost forecast", Value: enterprise.jobsLost3mForecast },
      { Field: "Advisory pathway", Value: advice.title },
      { Field: "Steps", Value: advice.steps.join(" | ") },
      { Field: "Citations", Value: advice.citations.map((c) => `${c.doc} — ${c.section}`).join(" | ") },
      { Field: "Governance", Value: advice.governance.join(" | ") },
    ];
    exportPDF("Advisory_Plan", "Advisory Plan — Governance-aware Recommendations", rows);
  };

  return (
    <RequireRole allow={["Admin", "Advisor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Advisory Assistant</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Structured recommendations grounded in approved playbooks with traceable citations and governance controls.
          </p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card className="xl:col-span-1">
            <CardHeader>
              <CardTitle>Enterprise selection</CardTitle>
              <CardDescription>Pick an enterprise profile to generate an advisory plan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {ENTERPRISES.slice(0, 10).map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setIdx(i)}
                  className={`w-full text-left rounded-2xl border px-4 py-3 transition ${
                    i === idx
                      ? "bg-inkomoko-blue text-white border-inkomoko-blue shadow-soft"
                      : "bg-white border-inkomoko-border hover:bg-inkomoko-bg"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">
                      {e.country} · {e.program}
                    </div>
                    <span className={`text-xs ${i === idx ? "text-white/80" : "text-inkomoko-muted"}`}>{e.cohort}</span>
                  </div>
                  <div className={`mt-2 text-sm ${i === idx ? "text-white/90" : "text-inkomoko-muted"}`}>
                    {e.sector} · Risk {e.riskTier} ({e.riskScore.toFixed(3)})
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className="xl:col-span-2">
            <CardHeader className="flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles size={18} /> {advice.title}
                </CardTitle>
                <CardDescription>Actionable pathway with evidence and governance checks.</CardDescription>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge tone={enterprise.riskTier === "High" ? "danger" : enterprise.riskTier === "Medium" ? "warning" : "success"}>
                    Risk {enterprise.riskTier}
                  </Badge>
                  <Badge tone="blue" className="gap-1">
                    <ShieldCheck size={14} /> Policy filters
                  </Badge>
                  <Badge tone="orange" className="gap-1">
                    <BookOpenCheck size={14} /> Citations
                  </Badge>
                </div>
              </div>
              <Button onClick={exportAdvice}>Export Advisory PDF</Button>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Info label="Country" value={enterprise.country} />
                <Info label="Program" value={enterprise.program} />
                <Info label="Revenue (3M)" value={`$${enterprise.revenue3mForecastUSD.toLocaleString()}`} />
                <Info label="Net Jobs (3M)" value={`${enterprise.jobsCreated3mForecast - enterprise.jobsLost3mForecast}`} />
              </div>

              <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
                <div className="text-sm font-semibold">Recommended steps</div>
                <ol className="mt-2 list-decimal pl-5 space-y-2 text-sm text-inkomoko-muted">
                  {advice.steps.map((s, i) => (
                    <li key={i} className="leading-relaxed">
                      {s}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                  <div className="text-sm font-semibold">Evidence citations</div>
                  <div className="mt-3 space-y-2">
                    {advice.citations.map((c, i) => (
                      <div key={i} className="flex items-start justify-between gap-3 rounded-xl bg-inkomoko-bg p-3">
                        <div>
                          <div className="text-sm font-medium">{c.doc}</div>
                          <div className="text-xs text-inkomoko-muted mt-0.5">{c.section}</div>
                        </div>
                        <Badge tone="blue">Verified</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                  <div className="text-sm font-semibold">Governance checks</div>
                  <ul className="mt-3 space-y-2 text-sm text-inkomoko-muted">
                    {advice.governance.map((g, i) => (
                      <li key={i} className="rounded-xl bg-inkomoko-bg p-3 leading-relaxed">
                        {g}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-blue/5 p-4">
                <div className="text-sm font-semibold text-inkomoko-blue">Intervention trigger</div>
                <p className="mt-2 text-sm text-inkomoko-muted leading-relaxed">
                  If tier escalates above the operational threshold, the system initiates an intervention workflow: assign advisor → schedule follow-up → log outcomes →
                  re-score after 14 days.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RequireRole>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
      <div className="text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
      <div className="mt-2 text-sm font-semibold">{value}</div>
    </div>
  );
}
