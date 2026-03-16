"use client";

import { DQ_CONTRACTS } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { exportPDF } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { ShieldCheck, Download } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function DataQualityPage() {
  const exportContracts = () => {
    const rows = DQ_CONTRACTS.map((c) => ({
      Contract: c.name,
      Dataset: c.dataset,
      Scope: c.scope,
      Completeness: c.sla.completeness,
      Timeliness: c.sla.timeliness,
      Lineage: c.sla.lineage,
      Status: c.status,
      LastRun: c.lastRun,
    }));
    exportPDF("Data_Quality_Contracts", "Data Quality Contracts", rows);
  };

  return (
    <RequireRole allow={["Admin", "Program Manager"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
              <ShieldCheck size={20} /> Data Quality
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Data quality contracts define SLAs for completeness, timeliness, and lineage to ensure defensible reporting.
            </p>
          </div>
          <Button className="gap-2" onClick={exportContracts}>
            <Download size={16} /> Export PDF
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contracts</CardTitle>
            <CardDescription>Quality SLAs and compliance status per dataset.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[980px] w-full text-sm">
                <thead className="bg-inkomoko-bg">
                  <tr className="text-left">
                    <Th>Contract</Th>
                    <Th>Dataset</Th>
                    <Th>Scope</Th>
                    <Th>Completeness</Th>
                    <Th>Timeliness</Th>
                    <Th>Lineage</Th>
                    <Th>Status</Th>
                    <Th>Last Run</Th>
                  </tr>
                </thead>
                <tbody>
                  {DQ_CONTRACTS.map((c) => (
                    <tr key={c.dataset} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60">
                      <Td className="font-semibold">{c.name}</Td>
                      <Td>{c.dataset}</Td>
                      <Td className="min-w-[260px]">{c.scope}</Td>
                      <Td>{c.sla.completeness}</Td>
                      <Td>{c.sla.timeliness}</Td>
                      <Td>{c.sla.lineage}</Td>
                      <Td>
                        <Badge tone={c.status === "Pass" ? "success" : c.status === "Warn" ? "warning" : "danger"}>
                          {c.status}
                        </Badge>
                      </Td>
                      <Td>{c.lastRun}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
              <div className="text-sm font-semibold">Action</div>
              <p className="mt-1 text-sm text-inkomoko-muted leading-relaxed">
                When a contract fails, the platform flags impacted KPIs and forecasts, highlights missingness drivers, and triggers remediation tasks for the data owner.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold text-inkomoko-muted uppercase tracking-wide">
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
