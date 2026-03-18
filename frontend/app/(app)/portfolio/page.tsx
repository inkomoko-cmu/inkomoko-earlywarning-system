"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { COUNTRIES } from "@/lib/data";
import { Badge } from "@/components/ui/Badge";
import { exportCSV, exportExcel, exportPDF } from "@/lib/export";
import {
  Filter, Download, Search, CreditCard, DollarSign,
  Wallet, Clock, AlertCircle, Globe, Briefcase, ChevronUp, ChevronDown, RefreshCw,
  TrendingUp, TrendingDown, Users, Zap, Target,
} from "lucide-react";
import { RequireRole } from "@/components/auth/RequireRole";
import { apiFetch } from "@/lib/api";
import { normalizePortfolioOverview, type PortfolioOverview } from "@/lib/portfolio";

// ──────────────────────────────────────── TYPES ──────────────────────────────────────────

type RiskDistribution = {
  name: string;
  value: number;
  pct: number;
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

type SortKey = "loannumber" | "country_code" | "disbursedamount" | "daysinarrears" | "industrysectorofactivity" | "loanstatus";
type SortDir = "asc" | "desc";

export default function PortfolioPage() {
  // ──────── State: Data ────────────
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [riskDistribution, setRiskDistribution] = useState<RiskDistribution[]>([]);
  const [byCountry, setByCountry] = useState<PortfolioByCountry[]>([]);
  const [allLoans, setAllLoans] = useState<PortfolioLoan[]>([]);

  // ──────── State: Filters ────────────
  const [country, setCountry] = useState<string>("All");
  const [sector, setSector] = useState<string>("All");
  const [status, setStatus] = useState<string>("All");
  const [search, setSearch] = useState("");

  // ──────── State: Sorting & Pagination ────────────
  const [sortKey, setSortKey] = useState<SortKey>("loannumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  // ──────── State: Loading ────────────
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // ──────── Extract unique sectors & statuses ────────────
  const sectors = useMemo(() => {
    const s = new Set(allLoans.map(l => l.industrysectorofactivity).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allLoans]);

  const statuses = useMemo(() => {
    const s = new Set(allLoans.map(l => l.loanstatus).filter(Boolean) as string[]);
    return Array.from(s).sort();
  }, [allLoans]);

  // ──────── Load all data ────────────
  const loadData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setApiError(null);
      const [overviewRes, riskRes, countriesRes, loansRes] = await Promise.allSettled([
        apiFetch<PortfolioOverview>("/portfolio/overview", { method: "GET" }, true, { cacheTtlMs: 120000, forceRefresh }),
        apiFetch<RiskDistribution[]>("/portfolio/risk-distribution", { method: "GET" }, true, { cacheTtlMs: 120000, forceRefresh }),
        apiFetch<PortfolioByCountry[]>("/portfolio/by-country", { method: "GET" }, true, { cacheTtlMs: 120000, forceRefresh }),
        apiFetch<PortfolioLoan[]>("/portfolio/loans", { method: "GET" }, true, { cacheTtlMs: 120000, forceRefresh }),
      ]);

      if (overviewRes.status === "fulfilled") setOverview(normalizePortfolioOverview(overviewRes.value));
      else setOverview(null);

      if (riskRes.status === "fulfilled") setRiskDistribution(riskRes.value || []);
      else setRiskDistribution([]);

      if (countriesRes.status === "fulfilled") setByCountry(countriesRes.value || []);
      else setByCountry([]);

      if (loansRes.status === "fulfilled") setAllLoans(loansRes.value || []);
      else setAllLoans([]);

      const failed = [overviewRes, riskRes, countriesRes, loansRes].filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        setApiError(`Loaded with partial data (${failed} source${failed > 1 ? "s" : ""} unavailable).`);
      }
      setPage(0); // Reset to first page
    } catch (e: any) {
      setApiError(e?.message ?? "Failed to load portfolio data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // ──────── Filter & sort loans ────────────
  const filteredLoans = useMemo(() => {
    return allLoans.filter((loan) => {
      if (country !== "All" && loan.country_code !== country) return false;
      if (sector !== "All" && loan.industrysectorofactivity !== sector) return false;
      if (status !== "All" && loan.loanstatus !== status) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const text = `${loan.loannumber} ${loan.country_code} ${loan.industrysectorofactivity ?? ""} ${loan.loanstatus ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];
      
      // Handle null values
      if (aVal == null) aVal = sortKey.includes("amount") || sortKey.includes("days") ? 0 : "";
      if (bVal == null) bVal = sortKey.includes("amount") || sortKey.includes("days") ? 0 : "";
      
      // Numeric comparison
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      
      // String comparison
      const aCmp = String(aVal).toLowerCase();
      const bCmp = String(bVal).toLowerCase();
      return sortDir === "asc" ? aCmp.localeCompare(bCmp) : bCmp.localeCompare(aCmp);
    });
  }, [allLoans, country, sector, status, search, sortKey, sortDir]);

  const paginatedLoans = useMemo(() => {
    return filteredLoans.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  }, [filteredLoans, page]);

  const totalPages = Math.ceil(filteredLoans.length / PAGE_SIZE);

  // ──────── Export ────────────
  const exportRows = () =>
    filteredLoans.map((loan) => ({
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

  // ──────── Risk tier distribution ────────────
  const riskStats = useMemo(() => {
    const map: Record<string, RiskDistribution | undefined> = {};
    riskDistribution.forEach(r => { map[(r.name || "").toUpperCase()] = r; });
    return {
      high: map['HIGH'],
      medium: map['MEDIUM'],
      low: map['LOW'],
    };
  }, [riskDistribution]);

  return (
    <RequireRole allow={["Admin", "Program Manager", "Advisor"]}>
      <div className="space-y-8">

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* HERO BANNER                                                      */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl bg-gradient-to-br from-inkomoko-blue via-inkomoko-blueSoft to-inkomoko-blue text-white p-8 relative overflow-hidden">
          <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute bottom-0 right-40 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5" />

          <div className="relative z-10 flex flex-col xl:flex-row xl:items-start justify-between gap-6">
            <div className="flex-1">
              <p className="text-xs font-bold uppercase tracking-widest text-blue-300 mb-2">
                Inkomoko Early Warning System
              </p>
              <h1 className="text-4xl font-bold mb-2 tracking-tight">Loan Portfolio</h1>
              <p className="text-blue-100 text-sm max-w-xl leading-relaxed mb-5">
                Real-time portfolio analytics and loan-level intelligence. Explore borrower performance, risk metrics, and operational insights across all markets.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { icon: <CreditCard size={12} />, label: `${overview?.total_loans.toLocaleString() ?? "—"} loans` },
                  { icon: <Globe size={12} />, label: "Multi-country" },
                  { icon: <Zap size={12} />, label: "Live data" },
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

            {/* Action buttons */}
            <div className="flex flex-col gap-3 xl:items-end">
              <div className="flex flex-wrap gap-2 xl:justify-end">
                <button
                  onClick={() => loadData(true)}
                  disabled={loading}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40 flex items-center gap-1.5"
                >
                  <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  Refresh
                </button>
                {([
                  { label: "PDF",   fn: () => exportPDF("Portfolio", "Portfolio — Loan Data Export", exportRows()) },
                  { label: "Excel", fn: () => exportExcel("Portfolio", exportRows(), "Loans") },
                  { label: "CSV",   fn: () => exportCSV("Portfolio", exportRows()) },
                ] as { label: string; fn: () => void }[]).map(({ label, fn }) => (
                  <button
                    key={label}
                    onClick={fn}
                    disabled={loading || filteredLoans.length === 0}
                    className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-40"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ERROR BANNER                                                     */}
        {/* ════════════════════════════════════════════════════════════════ */}
        {apiError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
            <span>{apiError}</span>
            <div className="flex gap-2">
              <button onClick={() => setApiError(null)} className="text-xs underline">Dismiss</button>
              <button onClick={loadData} className="text-xs underline">Retry</button>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* KPI CARDS                                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionLabel title="Key Performance Indicators" accent="bg-inkomoko-blue" />
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <KpiCard label="Total Loans"          value={overview?.total_loans.toLocaleString()}      icon={<CreditCard size={16} />}  color="blue"   loading={loading} />
            <KpiCard label="Total Disbursed"      value={formatMoney(overview?.total_disbursed)}      icon={<DollarSign size={16} />}  color="green"  loading={loading} />
            <KpiCard label="Outstanding"          value={formatMoney(overview?.total_outstanding)}    icon={<Wallet size={16} />}      color="amber"  loading={loading} />
            <KpiCard label="Avg Days in Arrears"  value={overview?.avg_days_in_arrears.toFixed(1)}    icon={<Clock size={16} />}       color="red"    loading={loading} />
            <KpiCard label="PAR30 Amount"          value={formatMoney(overview?.par30_amount)}         icon={<AlertCircle size={16} />} color="orange" loading={loading} />
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* RISK & EMPLOYMENT METRICS                                        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Risk Distribution */}
          <div>
            <SectionLabel title="Risk Distribution" accent="bg-red-500" />
            <div className="rounded-2xl border border-inkomoko-border bg-white p-6 shadow-card space-y-4">
              {loading ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 animate-pulse rounded bg-inkomoko-bg" />
                  ))}
                </div>
              ) : (
                <>
                  {riskStats.high && (
                    <RiskBar tier="High Risk" count={riskStats.high.value} pct={riskStats.high.pct} color="bg-red-600" />
                  )}
                  {riskStats.medium && (
                    <RiskBar tier="Medium Risk" count={riskStats.medium.value} pct={riskStats.medium.pct} color="bg-amber-500" />
                  )}
                  {riskStats.low && (
                    <RiskBar tier="Low Risk" count={riskStats.low.value} pct={riskStats.low.pct} color="bg-emerald-600" />
                  )}
                  {riskDistribution.length === 0 && (
                    <p className="text-sm text-inkomoko-muted text-center py-4">No risk data available</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Employment & Impact */}
          <div>
            <SectionLabel title="Impact Metrics (3-Month)" accent="bg-emerald-500" />
            <div className="rounded-2xl border border-inkomoko-border bg-white p-6 shadow-card space-y-4">
              {loading ? (
                <div className="space-y-4">
                  {[1,2,3].map(i => (
                    <div key={i} className="h-12 animate-pulse rounded bg-inkomoko-bg" />
                  ))}
                </div>
              ) : (
                <>
                  <MetricRow
                    label="Jobs Created"
                    value={overview?.total_jobs_created_3m.toLocaleString() ?? "—"}
                    icon={<Users size={16} className="text-emerald-600" />}
                    trend={overview && overview.total_jobs_created_3m > 0 ? "positive" : "neutral"}
                  />
                  <MetricRow
                    label="Jobs Lost"
                    value={overview?.total_jobs_lost_3m.toLocaleString() ?? "—"}
                    icon={<TrendingDown size={16} className="text-red-600" />}
                    trend={overview && overview.total_jobs_lost_3m > 0 ? "negative" : "neutral"}
                  />
                  <MetricRow
                    label="NPS Promoters"
                    value={`${(overview?.nps_promoter_pct ?? 0).toFixed(1)}%`}
                    icon={<Target size={16} className="text-blue-600" />}
                    trend="neutral"
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* PERFORMANCE BY COUNTRY                                           */}
        {/* ════════════════════════════════════════════════════════════════ */}
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

        {/* ════════════════════════════════════════════════════════════════ */}
        {/* ADVANCED LOAN TABLE WITH FILTERING, SORTING, & PAGINATION        */}
        {/* ════════════════════════════════════════════════════════════════ */}
        <div>
          <SectionLabel title="Loan Portfolio" accent="bg-inkomoko-blue" />

          {/* Filters bar */}
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <FilterSelect
              label="Country"
              value={country}
              onChange={(v) => { setCountry(v); setPage(0); }}
              options={["All", ...COUNTRIES]}
            />
            <FilterSelect
              label="Sector"
              value={sector}
              onChange={(v) => { setSector(v); setPage(0); }}
              options={["All", ...sectors]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={(v) => { setStatus(v); setPage(0); }}
              options={["All", ...statuses]}
            />
            <div className="flex items-center gap-2 rounded-xl border border-inkomoko-border bg-white px-3 py-2.5">
              <Search size={15} className="text-inkomoko-muted flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="w-full text-sm outline-none bg-transparent"
                placeholder="Loan number, sector…"
              />
            </div>
          </div>

          {/* Results info */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-inkomoko-muted">
              <Filter size={13} className="inline mr-1.5 opacity-60" />
              Showing {paginatedLoans.length} of {filteredLoans.length} loans
            </span>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-inkomoko-border bg-white overflow-hidden shadow-card">
            <div className="overflow-x-auto">
              <table className="min-w-[1200px] w-full text-sm">
                <thead>
                  <tr className="border-b border-inkomoko-border bg-inkomoko-bg">
                    <SortableHeader label="Loan Number" col="loannumber" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} icon={<Briefcase size={13} />} />
                    <SortableHeader label="Country" col="country_code" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <SortableHeader label="Sector" col="industrysectorofactivity" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <SortableHeader label="Status" col="loanstatus" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <SortableHeader label="Disbursed" col="disbursedamount" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <SortableHeader label="Current Balance" col="currentbalance" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
                    <SortableHeader label="Days in Arrears" col="daysinarrears" current={sortKey} dir={sortDir} onSort={(col) => { setSortKey(col as SortKey); setSortDir(sortDir === "asc" ? "desc" : "asc"); }} />
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
                  ) : paginatedLoans.length === 0 ? (
                    <tr className="border-t border-inkomoko-border">
                      <Td colSpan={8} className="text-center text-inkomoko-muted py-10">No loans match the current filters.</Td>
                    </tr>
                  ) : (
                    paginatedLoans.map((loan) => (
                      <tr
                        key={`${loan.loannumber}-${loan.country_code}`}
                        className="border-t border-inkomoko-border hover:bg-inkomoko-bg/60 transition-colors"
                      >
                        <Td><span className="font-mono font-medium text-inkomoko-blue">{loan.loannumber}</span></Td>
                        <Td>{loan.country_code}</Td>
                        <Td className="text-xs">{loan.industrysectorofactivity ?? "—"}</Td>
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
                          <span className={`font-medium text-xs ${
                            (loan.daysinarrears ?? 0) > 30 ? "text-red-600" :
                            (loan.daysinarrears ?? 0) > 0 ? "text-amber-600" :
                            "text-inkomoko-text"
                          }`}>
                            {loan.daysinarrears ?? 0}
                          </span>
                        </Td>
                        <Td className="font-medium">{loan.installmentinarrears ?? 0}</Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-inkomoko-border bg-inkomoko-bg/50 px-4 py-3 flex items-center justify-between text-xs text-inkomoko-muted">
              <span>Live data from PostgreSQL via FastAPI</span>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage(Math.max(0, page - 1))}
                    disabled={page === 0}
                    className="p-1.5 rounded border border-inkomoko-border hover:bg-white disabled:opacity-40"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <span className="text-xs font-medium px-2">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                    disabled={page === totalPages - 1}
                    className="p-1.5 rounded border border-inkomoko-border hover:bg-white disabled:opacity-40"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </RequireRole>
  );
}

// ──────────────────────────────────────── HELPER COMPONENTS ──────────────────────────────────────────

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

type KpiColor = "blue" | "green" | "red" | "amber" | "orange";

function KpiCard({ label, value, icon, color, loading }: {
  label: string; value: string | undefined; icon: ReactNode; color: KpiColor; loading?: boolean;
}) {
  const styles: Record<KpiColor, string> = {
    blue:   "bg-blue-50 text-inkomoko-blue",
    green:  "bg-emerald-50 text-emerald-700",
    red:    "bg-red-50 text-red-600",
    amber:  "bg-amber-50 text-amber-600",
    orange: "bg-orange-50 text-orange-600",
  };
  return (
    <div className="rounded-2xl border border-inkomoko-border bg-white p-4 transition-shadow hover:shadow-card">
      <div className={`mb-3 w-fit rounded-lg p-2 ${styles[color]}`}>{icon}</div>
      {loading ? (
        <div className="mb-1 h-6 w-2/3 animate-pulse rounded bg-inkomoko-bg" />
      ) : (
        <div className="text-xl font-bold text-inkomoko-text">{value ?? "—"}</div>
      )}
      <div className="mt-1 text-xs uppercase tracking-wide text-inkomoko-muted">{label}</div>
    </div>
  );
}

function RiskBar({ tier, count, pct, color }: {
  tier: string; count: number; pct: number; color: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-inkomoko-text">{tier}</span>
        <span className="text-xs font-bold text-inkomoko-muted">{count} loans ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-3 rounded-full bg-inkomoko-bg overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function MetricRow({ label, value, icon, trend }: {
  label: string; value: string; icon: ReactNode; trend: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-inkomoko-bg/50">
      <div className="flex items-center gap-3">
        {icon}
        <span className="text-sm font-medium text-inkomoko-text">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold text-inkomoko-text">{value}</span>
        {trend === "positive" && <TrendingUp size={16} className="text-emerald-600" />}
        {trend === "negative" && <TrendingDown size={16} className="text-red-600" />}
      </div>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border border-inkomoko-border bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-inkomoko-blue/20 w-full"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt === "All" ? `All ${label}` : opt}
        </option>
      ))}
    </select>
  );
}

function SortableHeader({ label, col, current, dir, onSort, icon }: {
  label: string; col: string; current: SortKey; dir: SortDir; onSort: (col: string) => void; icon?: ReactNode;
}) {
  const isActive = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-inkomoko-muted uppercase tracking-wide whitespace-nowrap cursor-pointer hover:bg-inkomoko-bg/50 transition-colors"
    >
      <div className="flex items-center gap-1.5">
        {icon}
        {label}
        {isActive && (
          <span className="ml-1">
            {dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        )}
      </div>
    </th>
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
