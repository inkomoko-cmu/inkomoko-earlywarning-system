"use client";

import { AUDIT_LOG } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { exportPDF } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { ScrollText, Download } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function AuditPage() {
  const exportAudit = () => {
    const rows = AUDIT_LOG.map((a) => ({
      Time: a.time,
      Actor: a.actor,
      Role: a.role,
      Action: a.action,
      Resource: a.resource,
      Outcome: a.outcome,
    }));
    exportPDF("Audit_Log", "Audit Log", rows);
  };

  return (
    <RequireRole allow={["Admin"]}>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-inkomoko-blue flex items-center gap-2">
              <ScrollText size={20} /> Audit Log
            </h1>
            <p className="text-sm text-inkomoko-muted mt-1">
              Traceability of key actions across governance, reporting, and advisory workflows.
            </p>
          </div>
          <Button className="gap-2" onClick={exportAudit}>
            <Download size={16} /> Export PDF
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent events</CardTitle>
            <CardDescription>
              Role-scoped actions and outcomes for compliance and donor transparency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[920px] w-full text-sm">
                <thead className="bg-inkomoko-bg">
                  <tr className="text-left">
                    <Th>Time</Th>
                    <Th>Actor</Th>
                    <Th>Role</Th>
                    <Th>Action</Th>
                    <Th>Resource</Th>
                    <Th>Outcome</Th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_LOG.map((a, i) => (
                    <tr key={i} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60">
                      <Td>{a.time}</Td>
                      <Td className="font-semibold">{a.actor}</Td>
                      <Td>
                        <Badge tone="blue">{a.role}</Badge>
                      </Td>
                      <Td>{a.action}</Td>
                      <Td>{a.resource}</Td>
                      <Td>
                        <Badge
                          tone={
                            a.outcome === "Success"
                              ? "success"
                              : a.outcome === "Denied"
                              ? "warning"
                              : "danger"
                          }
                        >
                          {a.outcome}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 rounded-2xl border border-inkomoko-border bg-inkomoko-bg p-4">
              <div className="text-sm font-semibold">Policy</div>
              <p className="mt-1 text-sm text-inkomoko-muted leading-relaxed">
                Exports and sensitive actions are evaluated against role-based governance rules,
                consent flags, and masking policies. All outcomes are recorded for audit.
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

function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}
