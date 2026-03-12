"use client";

import { useEffect, useMemo, useState } from "react";
import { COUNTRIES } from "@/lib/data";
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import { Filter, Download, Search } from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { apiFetch } from "@/lib/api";

type PortfolioSummary = {
  total_loans: number;
  total_disbursed: number;
  total_outstanding: number;
  avg_days_in_arrears: number;
  par30_amount: number;
};

type PortfolioByCountry = {
  country_code: string;
  loans: number;
  total_disbursed: number;
  total_outstanding: number;
};

type PortfolioLoan = {
  loannumber: string;
  country_code: string;
  industrysectorofactivity: string | null;
  loanstatus: string | null;
  disbursedamount: number | null;
  currentbalance: number | null;
  daysinarrears: number | null;
  installmentinarrears: number | null;
};

export default function PortfolioPage() {
  const [country, setCountry] = useState<string>("All");
  const [q, setQ] = useState("");

  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [byCountry, setByCountry] = useState<PortfolioByCountry[]>([]);
  const [loans, setLoans] = useState<PortfolioLoan[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    const loadPortfolio = async () => {
      try {
        setLoading(true);
        setApiError(null);

        const [summaryRes, byCountryRes, loansRes] = await Promise.all([
          apiFetch<PortfolioSummary>("/portfolio/summary", { method: "GET" }, true),
          apiFetch<PortfolioByCountry[]>("/portfolio/by-country", { method: "GET" }, true),
          apiFetch<PortfolioLoan[]>("/portfolio/loans", { method: "GET" }, true),
        ]);

        setSummary(summaryRes);
        setByCountry(byCountryRes);
        setLoans(loansRes);
      } catch (e: any) {
        setApiError(e?.message ?? "Failed to load portfolio data.");
      } finally {
        setLoading(false);
      }
    };

    loadPortfolio();
  }, []);

  const rows = useMemo(() => {
    return loans.filter((loan) => {
      if (country !== "All" && loan.country_code !== country) return false;

      if (q.trim()) {
        const s =
          `${loan.loannumber} ${loan.country_code} ${loan.industrysectorofactivity ?? ""} ${loan.loanstatus ?? ""}`.toLowerCase();
        if (!s.includes(q.toLowerCase())) return false;
      }

      return true;
    });
  }, [loans, country, q]);

  const exportRows = () =>
    rows.map((loan) => ({
      LoanNumber: loan.loannumber,
      Country: loan.country_code,
      Sector: loan.industrysectorofactivity ?? "—",
      LoanStatus: loan.loanstatus ?? "—",
      DisbursedAmount: loan.disbursedamount ?? 0,
      CurrentBalance: loan.currentbalance ?? 0,
      DaysInArrears: loan.daysinarrears ?? 0,
      InstallmentsInArrears: loan.installmentinarrears ?? 0,
    }));

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-inkomoko-blue">Portfolio</h1>
          <p className="text-sm text-inkomoko-muted mt-1">
            Portfolio metrics and loan rows now come from the database-backed API.
          </p>
        </div>

        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
          <MetricCard
            label="Total Loans"
            value={loading ? "Loading..." : summary?.total_loans?.toLocaleString() ?? "—"}
          />
          <MetricCard
            label="Total Disbursed"
            value={loading ? "Loading..." : formatMoney(summary?.total_disbursed)}
          />
          <MetricCard
            label="Outstanding Balance"
            value={loading ? "Loading..." : formatMoney(summary?.total_outstanding)}
          />
          <MetricCard
            label="Avg Days in Arrears"
            value={loading ? "Loading..." : summary?.avg_days_in_arrears?.toFixed(2) ?? "—"}
          />
          <MetricCard
            label="PAR30 Amount"
            value={loading ? "Loading..." : formatMoney(summary?.par30_amount)}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Portfolio by Country</CardTitle>
            <CardDescription>Live data loaded from PostgreSQL through FastAPI.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="bg-inkomoko-bg">
                  <tr className="text-left">
                    <Th>Country</Th>
                    <Th>Loans</Th>
                    <Th>Total Disbursed</Th>
                    <Th>Total Outstanding</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={4}>Loading...</Td>
                    </tr>
                  ) : byCountry.length === 0 ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={4}>No data found.</Td>
                    </tr>
                  ) : (
                    byCountry.map((row) => (
                      <tr key={row.country_code} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60">
                        <Td>{row.country_code}</Td>
                        <Td>{row.loans.toLocaleString()}</Td>
                        <Td>{formatMoney(row.total_disbursed)}</Td>
                        <Td>{formatMoney(row.total_outstanding)}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <CardTitle>Loan Portfolio Table</CardTitle>
              <CardDescription>
                Live loan rows loaded from PostgreSQL through the backend API.
              </CardDescription>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                className="gap-2"
                onClick={() => exportPDF("Portfolio", "Portfolio — Loan Portfolio Table", exportRows())}
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
                <Filter size={14} /> {rows.length} loans
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Select label="Country" value={country} onChange={setCountry} options={["All", ...COUNTRIES]} />
              <label className="block">
                <div className="text-sm font-medium">Search</div>
                <div className="mt-2 flex items-center gap-2 rounded-xl border border-inkomoko-border bg-white px-3 py-2">
                  <Search size={16} className="text-inkomoko-muted" />
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    className="w-full text-sm outline-none"
                    placeholder="Loan number, sector, status..."
                  />
                </div>
              </label>
            </div>

            <div className="overflow-auto rounded-2xl border border-inkomoko-border bg-white">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-inkomoko-bg">
                  <tr className="text-left">
                    <Th>Loan Number</Th>
                    <Th>Country</Th>
                    <Th>Sector</Th>
                    <Th>Status</Th>
                    <Th>Disbursed</Th>
                    <Th>Current Balance</Th>
                    <Th>Days in Arrears</Th>
                    <Th>Installments in Arrears</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={8}>Loading...</Td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={8}>No loans found.</Td>
                    </tr>
                  ) : (
                    rows.map((loan) => (
                      <tr key={`${loan.loannumber}-${loan.country_code}-${loan.disbursedamount}`} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60">
                        <Td>{loan.loannumber}</Td>
                        <Td>{loan.country_code}</Td>
                        <Td>{loan.industrysectorofactivity ?? "—"}</Td>
                        <Td>{loan.loanstatus ?? "—"}</Td>
                        <Td>{formatMoney(loan.disbursedamount)}</Td>
                        <Td>{formatMoney(loan.currentbalance)}</Td>
                        <Td>{loan.daysinarrears ?? 0}</Td>
                        <Td>{loan.installmentinarrears ?? 0}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-inkomoko-muted">
              Live loan portfolio rows loaded from the database. Next step: add backend filtering and pagination.
            </div>
          </CardContent>
        </Card>
      </div>
    </RequireRole>
  );
}

function formatMoney(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
        <div className="mt-2 text-xl font-semibold text-inkomoko-text">{value}</div>
      </CardContent>
    </Card>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-xs font-semibold text-inkomoko-muted uppercase tracking-wide">{children}</th>;
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 ${className}`}>
      {children}
    </td>
  );
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

// Debug code - run in browser console on the portfolio page if needed
// const session = JSON.parse(localStorage.getItem("session") ?? "{}");
// console.log("Token:", session?.access_token);
// console.log("Role:", session?.role);