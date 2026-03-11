"use client";

import { KPIS } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

export function KpiGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {KPIS.map((k) => {
        const icon = k.trend === "up" ? <ArrowUpRight size={14} /> : k.trend === "down" ? <ArrowDownRight size={14} /> : <ArrowRight size={14} />;
        return (
          <Card key={k.label}>
            <CardHeader>
              <CardDescription>{k.label}</CardDescription>
              <div className="mt-1 flex items-end justify-between">
                <CardTitle className="text-2xl">{k.value}</CardTitle>
                <Badge tone={k.tone} className="gap-1">{icon}{k.delta}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-inkomoko-muted">
                Updated hourly · aligned across programs and countries.
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


// "use client";

// import { useEffect, useState } from "react";
// import { Card, CardContent } from "@/components/ui/Card";
// import { apiFetch } from "@/lib/api";

// type OverviewData = {
//   total_loans: number;
//   total_disbursed: number;
//   total_outstanding: number;
//   avg_days_in_arrears: number;
//   par30_amount: number;
//   jobs_created_3m: number;
//   jobs_lost_3m: number;
//   avg_revenue_3m: number;
//   nps_promoter: number;
//   nps_detractor: number;
// };

// export function KpiGrid() {
//   const [overview, setOverview] = useState<OverviewData | null>(null);
//   const [loading, setLoading] = useState(true);
//   const [apiError, setApiError] = useState<string | null>(null);

//   useEffect(() => {
//     const load = async () => {
//       try {
//         setLoading(true);
//         setApiError(null);
//         const res = await apiFetch<OverviewData>("/portfolio/overview", { method: "GET" }, true);
//         setOverview(res);
//       } catch (e: any) {
//         setApiError(e?.message ?? "Failed to load KPI data.");
//       } finally {
//         setLoading(false);
//       }
//     };

//     load();
//   }, []);

//   if (loading) {
//     return (
//       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
//         {Array.from({ length: 5 }).map((_, i) => (
//           <KpiCard key={i} label="Loading..." value="..." />
//         ))}
//       </div>
//     );
//   }

//   if (apiError || !overview) {
//     return (
//       <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
//         {apiError ?? "No KPI data found."}
//       </div>
//     );
//   }

//   const kpis = [
//     { label: "Total Loans", value: overview.total_loans.toLocaleString() },
//     { label: "Total Disbursed", value: formatMoney(overview.total_disbursed) },
//     { label: "Outstanding", value: formatMoney(overview.total_outstanding) },
//     { label: "PAR30", value: formatMoney(overview.par30_amount) },
//     { label: "Avg Arrears Days", value: overview.avg_days_in_arrears.toFixed(2) },
//     { label: "Jobs Created (3M)", value: overview.jobs_created_3m.toLocaleString() },
//     { label: "Jobs Lost (3M)", value: overview.jobs_lost_3m.toLocaleString() },
//     { label: "Avg Revenue (3M)", value: formatMoney(overview.avg_revenue_3m) },
//     { label: "NPS Promoters", value: overview.nps_promoter.toLocaleString() },
//     { label: "NPS Detractors", value: overview.nps_detractor.toLocaleString() },
//   ];

//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
//       {kpis.map((kpi) => (
//         <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />
//       ))}
//     </div>
//   );
// }

// function KpiCard({ label, value }: { label: string; value: string }) {
//   return (
//     <Card>
//       <CardContent className="p-4">
//         <div className="text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
//         <div className="mt-2 text-xl font-semibold text-inkomoko-text">{value}</div>
//       </CardContent>
//     </Card>
//   );
// }

// function formatMoney(value?: number | null) {
//   if (value === null || value === undefined) return "—";
//   return `$${Number(value).toLocaleString(undefined, {
//     minimumFractionDigits: 2,
//     maximumFractionDigits: 2,
//   })}`;
// }