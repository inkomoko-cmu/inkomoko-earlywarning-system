"use client";

import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { exportPDF } from "@/lib/export";
import { ENTERPRISES, KPIS } from "@/lib/data";
import { FileText, Download } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function ReportsPage() {
  const exportDonorPack = () => {
    const rows = [
      ...KPIS.map((k) => ({ Section: "KPI Snapshot", Item: k.label, Value: `${k.value} (${k.delta})` })),
      ...ENTERPRISES.slice(0, 12).map((e, i) => ({
        Section: "Top Priority Enterprises",
        Item: `Case ${i + 1}: ${e.country} · ${e.program}`,
        Value: `Risk ${e.riskTier} (${e.riskScore.toFixed(3)}), Revenue 3M $${e.revenue3mForecastUSD.toLocaleString()}, Net Jobs ${
          e.jobsCreated3mForecast - e.jobsLost3mForecast
        }`,
      })),
    ];
    exportPDF("Donor_Pack", "Donor Reporting Pack — Portfolio Summary", rows);
  };

  const exportProgramBrief = () => {
    const rows = ENTERPRISES.map((e) => ({
      Country: e.country,
      Program: e.program,
      Cohort: e.cohort,
      RiskTier: e.riskTier,
      RecommendedAction: e.recommendedAction,
    }));
    exportPDF("Program_Brief", "Program Brief — Intervention Priorities", rows);
  };

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor", "Donor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
            <FileText size={20} /> Reports
          </h1>
          <p className="text-sm text-inkomoko-muted mt-1">Generate stakeholder-ready reporting packs with one click.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Donor reporting pack</CardTitle>
              <CardDescription>Impact snapshot, scorecard, and top priority cases.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-sm text-inkomoko-muted">
                Includes KPI snapshot, balanced scorecard narrative, and prioritized case summaries for transparency.
              </div>
              <Button className="gap-2" onClick={exportDonorPack}>
                <Download size={16} /> Export PDF
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Program brief</CardTitle>
              <CardDescription>Operational priorities for program managers and advisors.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="text-sm text-inkomoko-muted">
                Lists recommended actions by enterprise segment to drive coaching, market linkages, and follow-up cadence.
              </div>
              <Button variant="secondary" className="gap-2" onClick={exportProgramBrief}>
                <Download size={16} /> Export PDF
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Export formats</CardTitle>
            <CardDescription>All tables support CSV / Excel / PDF exports directly from their respective views.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-inkomoko-muted">
              Exports preserve filters and support stakeholder-specific requirements (donor, leadership, program, advisory).
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}
