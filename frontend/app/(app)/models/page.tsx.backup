"use client";

import { MODEL_CARDS } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { exportPDF } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { BrainCircuit, Download } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function ModelsPage() {
  const exportAll = () => {
    const rows = MODEL_CARDS.map((m) => ({
      Model: m.name,
      Version: m.version,
      Horizon: m.horizon,
      Algorithm: m.algorithm,
      Metrics: Object.entries(m.metrics)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | "),
      Fairness: m.fairnessSlices.map((s) => `${s.slice}: ${s.value}`).join(" | "),
      Notes: m.notes.join(" | "),
    }));
    exportPDF("Model_Cards", "Model Cards — Forecasting Suite", rows);
  };

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
              <BrainCircuit size={20} /> Model Cards
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Transparent documentation of models, data assumptions, evaluation, and governance readiness.
            </p>
          </div>
          <Button className="gap-2" onClick={exportAll}>
            <Download size={16} /> Export PDF
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {MODEL_CARDS.map((m) => (
            <Card key={m.key}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>{m.name}</CardTitle>
                    <CardDescription>
                      {m.key} · {m.horizon}
                    </CardDescription>
                  </div>
                  <Badge tone="blue">{m.version}</Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
                  <div className="text-sm font-semibold">Algorithm</div>
                  <div className="mt-2 text-sm text-inkomoko-muted">{m.algorithm}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                    <div className="text-sm font-semibold">Key metrics</div>
                    <div className="mt-2 space-y-1 text-sm text-inkomoko-muted">
                      {Object.entries(m.metrics).map(([k, v]) => (
                        <div key={k} className="flex justify-between gap-2">
                          <span>{k}</span>
                          <span className="font-medium text-inkomoko-text">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-inkomoko-border bg-white p-4">
                    <div className="text-sm font-semibold">Slices</div>
                    <div className="mt-2 space-y-1 text-sm text-inkomoko-muted">
                      {m.fairnessSlices.map((s) => (
                        <div key={s.slice} className="flex justify-between gap-2">
                          <span>{s.slice}</span>
                          <span className="font-medium text-inkomoko-text">{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-inkomoko-border bg-inkomoko-blue/5 p-4">
                  <div className="text-sm font-semibold text-inkomoko-blue">Notes</div>
                  <ul className="mt-2 list-disc pl-5 space-y-1 text-sm text-inkomoko-muted">
                    {m.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </RequireRole>
  );
}
