"use client";

import { ENTERPRISES, COUNTRIES, PROGRAMS, COHORTS } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { useMemo, useState } from "react";
import { Filter, Download, Search } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";

export default function PortfolioPage() {
  const [country, setCountry] = useState<string>("All");
  const [program, setProgram] = useState<string>("All");
  const [cohort, setCohort] = useState<string>("All");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return ENTERPRISES.filter((e) => {
      if (country !== "All" && e.country !== country) return false;
      if (program !== "All" && e.program !== program) return false;
      if (cohort !== "All" && e.cohort !== cohort) return false;
      if (q.trim()) {
        const s =
          `${e.country} ${e.program} ${e.cohort} ${e.sector} ${e.riskTier} ${e.recommendedAction}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [country, program, cohort, q]);

  const exportRows = () =>
    rows.map((e) => ({
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

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Portfolio</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Drill down from portfolio → cohort → enterprise. Filter, compare, and export decision-ready datasets.
          </p>
        </div>

        <Card>
          <CardHeader className="flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <CardTitle>Filters</CardTitle>
              <CardDescription>Refine portfolio scope for operational action and reporting.</CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => exportPDF("Portfolio", "Portfolio — Enterprise Forecast Table", exportRows())}
              >
                <Download size={16} /> PDF
              </Button>
              <Button variant="secondary" onClick={() => exportExcel("Portfolio", exportRows(), "Portfolio")}>
                Excel
              </Button>
              <Button variant="secondary" onClick={() => exportCSV("Portfolio", exportRows())}>
                CSV
              </Button>
              <Badge tone="blue" className="gap-1">
                <Filter size={14} /> {rows.length} enterprises
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Select label="Country" value={country} onChange={setCountry} options={["All", ...COUNTRIES]} />
              <Select label="Program" value={program} onChange={setProgram} options={["All", ...PROGRAMS]} />
              <Select label="Cohort" value={cohort} onChange={setCohort} options={["All", ...COHORTS]} />
              <label className="block">
                <div className="text-sm font-medium">Search</div>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-inkomoko-border bg-white px-3 py-2">
                  <Search size={16} className="text-inkomoko-muted" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full text-sm outline-none"
                    placeholder="Sector, tier, recommended action..."
                  />
                </div>
              </label>
            </div>

            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-inkomoko-bg">
                  <tr className="text-left">
                    <Th>Country</Th>
                    <Th>Program</Th>
                    <Th>Cohort</Th>
                    <Th>Sector</Th>
                    <Th>Risk</Th>
                    <Th>Risk Score</Th>
                    <Th>Revenue (3M)</Th>
                    <Th>Jobs + (3M)</Th>
                    <Th>Jobs − (3M)</Th>
                    <Th>Recommended Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60">
                      <Td>{e.country}</Td>
                      <Td>{e.program}</Td>
                      <Td>{e.cohort}</Td>
                      <Td>{e.sector}</Td>
                      <Td>
                        <Badge tone={e.riskTier === "High" ? "danger" : e.riskTier === "Medium" ? "warning" : "success"}>
                          {e.riskTier}
                        </Badge>
                      </Td>
                      <Td>{e.riskScore.toFixed(3)}</Td>
                      <Td>${e.revenue3mForecastUSD.toLocaleString()}</Td>
                      <Td>{e.jobsCreated3mForecast}</Td>
                      <Td>{e.jobsLost3mForecast}</Td>
                      <Td className="min-w-[360px]">{e.recommendedAction}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-inkomoko-muted">
              Tip: export filtered views directly for donor reporting or intervention planning.
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold text-inkomoko-muted uppercase tracking-wide">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className}`}>{children}</td>;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <div className="text-sm font-medium">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-inkomoko-orange/25"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
