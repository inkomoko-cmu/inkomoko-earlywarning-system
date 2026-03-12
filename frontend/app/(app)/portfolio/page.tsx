"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { COUNTRIES } from "@/lib/data";
import { Badge } from "@/components/ui/Badge";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import {
  Filter, Download, Search, CreditCard, DollarSign,
  Wallet, Clock, AlertCircle, Globe, Briefcase,
} from "lucide-react";
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

  useEffect(() => { loadPortfolio(); }, []);

  const rows = useMemo(() => {
    return loans.filter((loan) => {
      if (country !== "All" && loan.country_code !== country) return false;
      if (q.trim()) {
        const s = `${loan.loannumber} ${loan.country_code} ${loan.industrysectorofactivity ?? ""} ${loan.loanstatus ?? ""}`.toLowerCase();
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

  const loanStatusColor = (status: string | null) => {
    const s = (status ?? "").toLowerCase();
    if (s.includes("active")) return "success";
    if (s.includes("arrear") || s.includes("default")) return "danger";
    if (s.includes("closed") || s.includes("written")) return "neutral";
    return "blue";
  };

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-8">

        {/* ── Hero banner ────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-br from-inkomoko-blue via-inkomoko-blueSoft to-inkomoko-blue text-white p-8 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

          <div className="relative z-10 flex flex-col xl:flex-row xl:items-start gap-6">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-2">
                Inkomoko Early Warning System
              </p>
              <h1 className="text-3xl font-bold mb-2 tracking-tight">Loan Portfolio</h1>
              <p className="text-blue-100 text-sm max-w-xl leading-relaxed">
                Live portfolio metrics and loan records from PostgreSQL — filter, explore, and export for stakeholder reporting.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { icon: <CreditCard size={12} />, label: "Live loan data" },
                  { icon: <Globe size={12} />, label: "Multi-country view" },
                  { icon: <AlertCircle size={12} />, label: "Arrears tracking" },
                ].map(({ icon, label }) => (
                  <span
                    key={label}
                    className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm"
                  >
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex flex-col gap-2 xl:items-end">
              <p className="text-xs text-blue-300">Export loan table</p>
              <div className="flex flex-wrap gap-2 xl:justify-end">
                {([
                  { label: "PDF",   fn: () => exportPDF("Portfolio", "Portfolio — Loan Portfolio Table", exportRows()) },
                  { label: "Excel", fn: () => exportExcel("Portfolio", exportRows(), "Portfolio") },
                  { label: "CSV",   fn: () => exportCSV("Portfolio", exportRows()) },
                ] as { label: string; fn: () => void }[]).map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    disabled={loading || rows.length === 0}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Error ──────────────────────────────────────────────── */}
        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{apiError}</span>
            <div className="flex gap-2">
              <button onClick={() => setApiError(null)} className="text-xs underline">Dismiss</button>
              <button onClick={loadPortfolio} className="text-xs underline">Retry</button>
            </div>
          </div>
        )}

        {/* ── Summary stats ──────────────────────────────────────── */}
        <div>
          <SectionLabel title="Portfolio Summary" accent="bg-inkomoko-blue" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <StatCard label="Total Loans"          value={summary?.total_loans.toLocaleString()}           icon={<CreditCard size={16} />}  color="blue"  loading={loading} />
            <StatCard label="Total Disbursed"       value={formatMoney(summary?.total_disbursed)}           icon={<DollarSign size={16} />}  color="green" loading={loading} />
            <StatCard label="Outstanding Balance"   value={formatMoney(summary?.total_outstanding)}        icon={<Wallet size={16} />}      color="amber" loading={loading} />
            <StatCard label="Avg Days in Arrears"   value={summary?.avg_days_in_arrears.toFixed(2)}        icon={<Clock size={16} />}       color="amber" loading={loading} />
            <StatCard label="PAR30 Amount"          value={formatMoney(summary?.par30_amount)}             icon={<AlertCircle size={16} />} color="red"   loading={loading} />
          </div>
        </div>

        {/* ── By country ─────────────────────────────────────────── */}
        <div>
          <SectionLabel title="Performance by Country" accent="bg-emerald-500" />
          <div className="rounded-2xl border border-inkomoko-border bg-white overflow-hidden shadow-card">
            <table className="min-w-[580px] w-full text-sm">
              <thead>
                <tr className="border-b border-inkomoko-border bg-inkomoko-bg">
                  <Th><Globe size={13} className="inline mr-1.5 opacity-60" />Country</Th>
                  <Th>Loans</Th>
                  <Th>Total Disbursed</Th>
                  <Th>Total Outstanding</Th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <tr key={i} className="border-t border-inkomoko-border">
                      {[1,2,3,4].map((j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 w-full animate-pulse rounded bg-inkomoko-bg" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : byCountry.length === 0 ? (
                  <tr className="border-t border-inkomoko-border">
                    <Td colSpan={4} className="text-center text-inkomoko-muted">No country data found.</Td>
                  </tr>
                ) : (
                  byCountry.map((row) => (
                    <tr key={row.country_code} className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60 transition-colors">
                      <Td><span className="font-semibold text-inkomoko-blue">{row.country_code}</span></Td>
                      <Td>{row.loans.toLocaleString()}</Td>
                      <Td>{formatMoney(row.total_disbursed)}</Td>
                      <Td>{formatMoney(row.total_outstanding)}</Td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Loan table ─────────────────────────────────────────── */}
        <div>
          <SectionLabel title="Loan Portfolio" accent="bg-inkomoko-blue" />

          {/* Filters bar */}
          <div className="mb-3 flex flex-col md:flex-row gap-3 items-stretch">
            <div className="flex items-center gap-2 rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 flex-1 max-w-sm">
              <Search size={15} className="text-inkomoko-muted flex-shrink-0" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full text-sm outline-none bg-transparent"
                placeholder="Loan number, sector, status…"
              />
            </div>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-inkomoko-blue/20"
            >
              {["All", ...COUNTRIES].map((o) => (
                <option key={o} value={o}>{o === "All" ? "All Countries" : o}</option>
              ))}
            </select>
            <span className="flex items-center gap-1.5 rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-xs font-medium text-inkomoko-muted">
              <Filter size={13} /> {rows.length} loans
            </span>
          </div>

          <div className="rounded-2xl border border-inkomoko-border bg-white overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead>
                  <tr className="border-b border-inkomoko-border bg-inkomoko-bg">
                    <Th><Briefcase size={13} className="inline mr-1.5 opacity-60" />Loan Number</Th>
                    <Th>Country</Th>
                    <Th>Sector</Th>
                    <Th>Status</Th>
                    <Th>Disbursed</Th>
                    <Th>Current Balance</Th>
                    <Th>Days in Arrears</Th>
                    <Th>Installments Overdue</Th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    [1,2,3,4,5].map((i) => (
                      <tr key={i} className="border-t border-inkomoko-border">
                        {[1,2,3,4,5,6,7,8].map((j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 w-full animate-pulse rounded bg-inkomoko-bg" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : rows.length === 0 ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={8} className="text-center text-inkomoko-muted py-10">No loans match the current filters.</Td>
                    </tr>
                  ) : (
                    rows.map((loan) => (
                      <tr
                        key={`${loan.loannumber}-${loan.country_code}-${loan.disbursedamount}`}
                        className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60 transition-colors"
                      >
                        <Td><span className="font-mono font-medium text-inkomoko-blue">{loan.loannumber}</span></Td>
                        <Td>{loan.country_code}</Td>
                        <Td>{loan.industrysectorofactivity ?? "—"}</Td>
                        <Td>
                          {loan.loanstatus ? (
                            <Badge tone={loanStatusColor(loan.loanstatus) as "success" | "danger" | "neutral" | "blue"}>
                              {loan.loanstatus}
                            </Badge>
                          ) : "—"}
                        </Td>
                        <Td>{formatMoney(loan.disbursedamount)}</Td>
                        <Td>{formatMoney(loan.currentbalance)}</Td>
                        <Td>
                          <span className={`font-medium ${(loan.daysinarrears ?? 0) > 30 ? "text-red-600" : (loan.daysinarrears ?? 0) > 0 ? "text-amber-600" : "text-inkomoko-text"}`}>
                            {loan.daysinarrears ?? 0}
                          </span>
                        </Td>
                        <Td>{loan.installmentinarrears ?? 0}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-inkomoko-border bg-inkomoko-bg/50 px-4 py-2 text-xs text-inkomoko-muted">
              Showing {rows.length} of {loans.length} loans · Live data from PostgreSQL via FastAPI
            </div>
          </div>
        </div>

      </div>
    </RequireRole>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function SectionLabel({ title, accent }: { title: string; accent: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`h-4 w-1 rounded-full ${accent}`} />
      <h2 className="text-xs font-bold uppercase tracking-widest text-inkomoko-muted">{title}</h2>
    </div>
  );
}

type StatColor = "blue" | "green" | "red" | "amber";

function StatCard({ label, value, icon, color, loading }: {
  label: string; value: string | undefined; icon: ReactNode; color: StatColor; loading?: boolean;
}) {
  const iconStyle: Record<StatColor, string> = {
    blue:  "bg-blue-50 text-inkomoko-blue",
    green: "bg-emerald-50 text-emerald-700",
    red:   "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4 transition-shadow hover:shadow-card">
      <div className={`mb-3 w-fit rounded-lg p-2 ${iconStyle[color]}`}>{icon}</div>
      {loading ? (
        <div className="mb-1 h-6 w-2/3 animate-pulse rounded bg-inkomoko-bg" />
      ) : (
        <div className="text-xl font-bold text-inkomoko-text">{value ?? "—"}</div>
      )}
      <div className="mt-1 text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-inkomoko-muted uppercase tracking-wide whitespace-nowrap">
      {children}
    </th>
  );
}

function Td({ children, className = "", colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 ${className}`}>
      {children}
    </td>
  );
}
